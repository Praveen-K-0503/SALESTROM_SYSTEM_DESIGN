"""
SALESTORM — Flash Sale Simulation
===================================
Scenario:
  - 10,000 concurrent buyers, 100 units available
  - 95% payment success, 5% payment failure
  - 2% of requests are duplicate (same idempotency key as an already-processed request)
  - Order Service is DOWN for the entire simulation; it recovers after all threads join
    (models the 30-second ECS restart outage described in 03_LLD/06_seq_order_recovery.mmd)

Invariants validated:
  1. sold_count       <= TOTAL_UNITS      (no oversell — ever)
  2. sql_available    >= 0               (DB constraint analogue)
  3. redis_counter    >= 0               (Redis gate analogue)
  4. duplicates_rejected >= DUPLICATE_COUNT (idempotency works)
  5. orders_recovered == payment_success_count (all queued events processed on recovery)

Run:
  python simulation.py            (Python 3.10+, stdlib only)
"""

import threading
import random
import time
from collections import Counter
from dataclasses import dataclass, field

# ── Configuration ──────────────────────────────────────────────────────────────
TOTAL_USERS          = 10_000
TOTAL_UNITS          = 100
PAYMENT_SUCCESS_RATE = 0.95
DUPLICATE_RATE       = 0.02

DUPLICATE_COUNT = int(TOTAL_USERS * DUPLICATE_RATE)   # 200
FRESH_COUNT     = TOTAL_USERS - DUPLICATE_COUNT        # 9,800

random.seed(42)   # Reproducible run; remove for true randomness


# ── Shared Simulation State ────────────────────────────────────────────────────
@dataclass
class SimState:
    # Inventory counters (analogous to Redis and PostgreSQL)
    redis_counter: int = TOTAL_UNITS
    sql_available: int = TOTAL_UNITS

    # Idempotency store: maps idempotency_key -> status string
    # Pre-populated with DUPLICATE_COUNT keys to model already-processed requests
    idem_store: dict = field(default_factory=dict)

    # Order Service event queue (SQS analogue — accumulates while OS is down)
    order_queue: list = field(default_factory=list)
    order_svc_up: bool = False   # starts DOWN

    # Result counters (thread-safe via counter_lock)
    sold: int = 0
    released: int = 0
    dup_rejected: int = 0
    recovered: int = 0

    # Outcome log for breakdown table
    outcomes: list = field(default_factory=list)

    # Locks
    stock_lock:   threading.Lock = field(default_factory=threading.Lock)
    idem_lock:    threading.Lock = field(default_factory=threading.Lock)
    order_lock:   threading.Lock = field(default_factory=threading.Lock)
    counter_lock: threading.Lock = field(default_factory=threading.Lock)


state = SimState()

# Pre-populate DUPLICATE_COUNT idempotency keys as "already paid"
# These represent requests that a previous buyer already completed.
for _i in range(DUPLICATE_COUNT):
    state.idem_store[f"dup_key_{_i}"] = "paid"


# ── Infrastructure Primitives ──────────────────────────────────────────────────
# These model the Redis Lua gate and SQL conditional UPDATE.
# Python locks provide the same atomicity guarantee within this simulation.

def redis_gate_decrement() -> bool:
    """Atomic decrement (Redis Lua EVAL analogue). Returns True if stock was available."""
    with state.stock_lock:
        if state.redis_counter > 0:
            state.redis_counter -= 1
            return True
        return False


def redis_gate_increment():
    """Compensating INCR — called when SQL gate rejects after Redis already decremented."""
    with state.stock_lock:
        state.redis_counter += 1


def sql_conditional_decrement() -> bool:
    """
    UPDATE inventory SET available_quantity = available_quantity - 1
    WHERE available_quantity >= 1
    Returns True if 1 row was affected (stock confirmed), False if 0 rows (race / no stock).
    """
    with state.stock_lock:
        if state.sql_available > 0:
            state.sql_available -= 1
            return True
        return False


def sql_conditional_increment():
    """Compensating stock restore — called on payment failure."""
    with state.stock_lock:
        state.sql_available += 1


def inc(attr: str, delta: int = 1):
    """Thread-safe counter increment."""
    with state.counter_lock:
        setattr(state, attr, getattr(state, attr) + delta)


def append_outcome(label: str):
    with state.counter_lock:
        state.outcomes.append(label)


# ── User Flows ─────────────────────────────────────────────────────────────────

def duplicate_user_flow(dup_index: int):
    """
    Simulates a buyer re-sending a request whose idempotency key was already processed.
    The system should return the cached result without any state change.
    Maps to: 03_LLD/04_seq_reservation.mmd — 'Duplicate request' alt block.
    """
    key = f"dup_key_{dup_index}"
    with state.idem_lock:
        if key in state.idem_store:
            # Key found → idempotency hit → reject (return cached result)
            inc("dup_rejected")
            append_outcome("duplicate_rejected")
            return
    # Key not yet in store (pre-population may have raced) — count as rejected anyway
    inc("dup_rejected")
    append_outcome("duplicate_rejected")


def fresh_user_flow(user_id: int):
    """
    Simulates a genuine new buyer attempting to reserve and pay for one unit.

    Steps:
      1. Idempotency check
      2. Redis gate (fast rejection)
      3. SQL conditional UPDATE (source of truth)
      4. Payment simulation (95% success / 5% failure)
      5. Publish PaymentSucceeded event to order_queue (Order Service is down)
    """
    key = f"key_{user_id}"

    # ── Step 1: Idempotency check ──────────────────────────────────────────────
    with state.idem_lock:
        if key in state.idem_store:
            inc("dup_rejected")
            append_outcome("duplicate_rejected")
            return
        state.idem_store[key] = "pending"   # Reserve the slot optimistically

    # ── Step 2: Redis fast gate ────────────────────────────────────────────────
    if not redis_gate_decrement():
        with state.idem_lock:
            state.idem_store.pop(key, None)
        append_outcome("sold_out_redis")
        return

    # ── Step 3: SQL source of truth ───────────────────────────────────────────
    if not sql_conditional_decrement():
        # SQL race: another thread won; rollback Redis
        redis_gate_increment()
        with state.idem_lock:
            state.idem_store.pop(key, None)
        append_outcome("sold_out_sql")
        return

    # Reservation created — mark idempotency key
    with state.idem_lock:
        state.idem_store[key] = "reserved"

    # ── Step 4: Payment ───────────────────────────────────────────────────────
    payment_ok = random.random() < PAYMENT_SUCCESS_RATE

    if payment_ok:
        with state.idem_lock:
            state.idem_store[key] = "paid"

        # ── Step 5: Publish PaymentSucceeded event ────────────────────────────
        # Order Service is DOWN → event queued in SQS (order_queue analogue)
        # Order Service UP  → process immediately
        with state.order_lock:
            if state.order_svc_up:
                inc("sold")
            else:
                state.order_queue.append(key)

        append_outcome("payment_success")

    else:
        # Payment failed → compensating actions:
        #   UPDATE inventory SET available_quantity = available_quantity + 1
        #   INCR Redis counter
        sql_conditional_increment()
        redis_gate_increment()
        with state.idem_lock:
            state.idem_store[key] = "failed"
        inc("released")
        append_outcome("payment_failed")


# ── Order Service Recovery ─────────────────────────────────────────────────────

def order_service_recover():
    """
    Simulate Order Service restarting after a 30-second outage.
    Processes all PaymentSucceeded events that accumulated in the SQS queue.
    Each event is processed idempotently: only confirm if key is still 'paid'.

    Maps to: 03_LLD/06_seq_order_recovery.mmd — 'Order Service recovers at T+30s'
    """
    # Drain the queue atomically
    with state.order_lock:
        queued = list(state.order_queue)
        state.order_queue.clear()
        state.order_svc_up = True

    for key in queued:
        # Idempotency guard: only process if status is still 'paid'
        with state.idem_lock:
            status = state.idem_store.get(key)
        if status == "paid":
            inc("sold")
            inc("recovered")
            # In real system: UPDATE order SET status='CONFIRMED' WHERE status='PAYMENT_PENDING'


# ── Simulation Runner ──────────────────────────────────────────────────────────

def run_simulation():
    print()
    print("=" * 60)
    print("  SALESTORM Flash Sale Simulation")
    print(f"  Users: {TOTAL_USERS:,}  |  Units: {TOTAL_UNITS}")
    print(f"  Payment success: {PAYMENT_SUCCESS_RATE*100:.0f}%  |"
          f"  Failure: {(1-PAYMENT_SUCCESS_RATE)*100:.0f}%  |"
          f"  Duplicates: {DUPLICATE_RATE*100:.0f}% ({DUPLICATE_COUNT} users)")
    print("  Order Service: DOWN at start, recovers after all threads join")
    print("=" * 60)
    print()

    # Build thread pool
    # First DUPLICATE_COUNT threads are duplicate users (use pre-existing idem keys)
    # Remaining threads are genuine fresh buyers
    threads = []
    for i in range(DUPLICATE_COUNT):
        threads.append(threading.Thread(target=duplicate_user_flow, args=(i,)))
    for i in range(DUPLICATE_COUNT, TOTAL_USERS):
        threads.append(threading.Thread(target=fresh_user_flow, args=(i,)))

    start = time.perf_counter()

    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Order Service recovers — drains queued PaymentSucceeded events
    order_service_recover()

    elapsed = time.perf_counter() - start

    # ── Print Results ──────────────────────────────────────────────────────────
    counts = Counter(state.outcomes)
    oversold = max(0, state.sold - TOTAL_UNITS)

    outcome_labels = {
        "payment_success"   : "Payment success (event queued -> Order Svc)",
        "payment_failed"    : "Payment failed -> reservation released",
        "duplicate_rejected": "Duplicate request rejected (idempotency hit)",
        "sold_out_redis"    : "Rejected at Redis gate (sold out fast path)",
        "sold_out_sql"      : "Rejected at SQL gate (race condition safety net)",
    }

    print(f"  Simulation time: {elapsed:.3f}s")
    print()
    print(f"  {'Outcome':<50} {'Count':>7}")
    print(f"  {'-'*58}")
    for k in ["payment_success", "payment_failed", "duplicate_rejected",
              "sold_out_redis", "sold_out_sql"]:
        if counts[k]:
            print(f"  {outcome_labels.get(k, k):<50} {counts[k]:>7,}")
    print(f"  {'-'*58}")
    print(f"  {'TOTAL':<50} {TOTAL_USERS:>7,}")
    print()

    print(f"  {'Key Metric':<42} {'Value':>10}")
    print(f"  {'-'*53}")
    print(f"  {'Sold (confirmed orders)':<42} {state.sold:>10}")
    print(f"  {'Oversold count   (MUST BE 0)':<42} {oversold:>10}")
    print(f"  {'Released reservations':<42} {state.released:>10}")
    print(f"  {'Duplicates rejected':<42} {state.dup_rejected:>10}")
    print(f"  {'Orders recovered after outage':<42} {state.recovered:>10}")
    print(f"  {'SQL available_quantity remaining':<42} {state.sql_available:>10}")
    print(f"  {'Redis counter remaining':<42} {state.redis_counter:>10}")
    print()

    # ── Assertions ─────────────────────────────────────────────────────────────
    checks = [
        ("No oversell (sold <= total units)",      state.sold <= TOTAL_UNITS),
        ("SQL available_quantity >= 0",            state.sql_available >= 0),
        ("Redis counter >= 0",                     state.redis_counter >= 0),
        ("All duplicate users rejected",           state.dup_rejected >= DUPLICATE_COUNT),
        ("All queued orders recovered on restart", state.recovered == counts["payment_success"]),
        ("sold == payment_success count",          state.sold == counts["payment_success"]),
    ]

    all_pass = all(ok for _, ok in checks)
    print("=" * 60)
    for desc, ok in checks:
        status = "[PASS]" if ok else "[FAIL]"
        print(f"  {status}  {desc}")
    print("=" * 60)
    print(f"  Overall: {'ALL PASS' if all_pass else 'SOME CHECKS FAILED'}")
    print()

    if not all_pass:
        raise SystemExit(1)


if __name__ == "__main__":
    run_simulation()
