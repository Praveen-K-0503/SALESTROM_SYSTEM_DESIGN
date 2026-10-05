# Simulation — SALESTORM

## What This Simulates

A SALESTORM flash sale with:

| Parameter | Value |
|-----------|-------|
| Concurrent buyers | 10,000 |
| Available units | 100 |
| Payment success rate | 95% |
| Payment failure rate | 5% |
| Duplicate requests (idempotency replays) | 2% of users |
| Order Service outage | Down for entire simulation; recovers after all threads join |

The simulation validates four core design invariants:
1. **No oversell** — `sold_count <= 100` always.
2. **Idempotency** — duplicate requests are rejected without consuming stock.
3. **Failure compensation** — failed payments release their reservation back to inventory.
4. **Recovery** — orders queued while Order Service is down are processed on recovery.

---

## How to Run

**Requirements:** Python 3.10+. No third-party packages — uses only the standard library (`threading`, `random`, `time`, `collections`).

```bash
# From the repository root
python 11_AI_Assisted_Validation/simulation.py
```

**Expected output:**

```
==========================================================
  SALESTORM Flash Sale Simulation
  Users: 10,000  |  Units: 100
  Payment success: 95%  |  Failure: 5%  |  Duplicates: 2%
  Order Service starts DOWN, recovers after all threads join
==========================================================

  Simulation time: ~0.1–0.3s

  Outcome                                              Count
  -------------------------------------------------------
  Payment success (event queued -> Order Svc)            ~95
  Payment failed -> reservation released                   ~5
  Duplicate request rejected (idempotency hit)            200
  Rejected at Redis gate (fast path)                   ~9,700
  -------------------------------------------------------
  TOTAL                                               10,000

  Metric                                   Value
  ----------------------------------------------------
  Sold (confirmed orders)                     ~95
  Oversold count (MUST BE 0)                    0
  Released reservations                         ~5
  Duplicates rejected                          200
  Orders recovered after outage                ~95
  SQL available remaining                       ~5

==========================================================
  [PASS] No oversell (sold <= units)
  [PASS] SQL available_quantity >= 0
  [PASS] Redis counter >= 0
  [PASS] All 200 duplicates rejected
  [PASS] All queued orders recovered
  [PASS] sold = successes
==========================================================
  Overall: ALL PASS
```

> Exact numbers vary slightly between runs because payment success/failure is randomised per-run. Oversold count is always 0.

---

## Connection to the Design

| Simulation element | Design decision it validates |
|--------------------|------------------------------|
| Redis gate → SQL gate → reservation | ADR-001: two-phase inventory check |
| `UNIQUE idempotency_key` → duplicate rejected | `inventory_reservation.idempotency_key UNIQUE` constraint |
| Payment failure → `sql_increment` + `redis_increment` | Compensation flow (reliability.md §5) |
| `order_queue` filled while OS down, drained on recovery | Transactional outbox + SQS recovery (ADR-005, seq diagram 06) |
| `sold <= TOTAL_UNITS` always | Core no-oversell invariant (requirements.md NFR-01) |
| All 200 duplicates rejected | Idempotency at every layer (lld.md §2) |

The simulation is intentionally simple — it models the core invariants in-process using Python threads and locks, mirroring the Redis/SQL atomicity guarantees with Python's `threading.Lock`. It does not simulate network latency, Redis Lua scripts, or SQS — those are integration-tested separately.
