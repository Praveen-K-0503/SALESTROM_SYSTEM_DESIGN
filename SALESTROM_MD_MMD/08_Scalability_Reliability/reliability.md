# Reliability — SALESTORM

---

## 1. Failure Scenarios and Recovery

### 1a. Redis Fails (shard unavailable or full restart)

**Impact:** The fast gate is unavailable. The Redis counter cannot be read or written.

**Detection:** ElastiCache CloudWatch alarm on `CacheNodeStatus != available`; health check from Inventory Service fails.

**Recovery path:**

```
Redis unavailable
  │
  ├─ ElastiCache: replica promoted automatically (< 30 s)
  │
  └─ If cold restart (data lost):
       1. Warm-up job runs at startup:
          SET inv:{sale_id}:{product_id} = (
            SELECT available_quantity FROM inventory
            WHERE sale_id = ? AND product_id = ?
          )
       2. Inventory Service switches to SQL-only mode during warm-up:
          Skip Redis gate; use SQL conditional UPDATE as sole gate
          (slower but correct; no oversell possible)
       3. Warm-up completes → Redis re-enabled as fast gate
```

**Consequence:** During warm-up (< 5 s), all reservation requests fall through to SQL. At sale burst, SQL may see more than 100-200 concurrent writers. Waiting room throttle limits this to the SQL's sustainable rate.

---

### 1b. Database Fails (RDS primary unavailable)

**Impact:** All write operations (reserve, pay, order create) fail. Read replicas still serve status reads.

**Detection:** RDS CloudWatch `DatabaseConnections` drops; services throw connection errors; ALB health check demotes tasks.

**Recovery path:**

```
RDS primary fails
  │
  ├─ AWS Multi-AZ automatic failover (30–60 s):
  │    Standby promoted to primary
  │    CNAME updated to new primary endpoint
  │
  ├─ Services reconnect via connection pool retry (exponential backoff)
  │    Pool timeout: 5 s; max retries: 5 (gives 60 s window)
  │
  └─ In-flight requests during failover:
       → Reservation requests fail with 503 → buyer sees error
       → Outbox Worker stops publishing (no new events lost; outbox rows safe on new primary)
       → SQS buffers downstream events
       → After reconnect: Outbox Worker resumes; all backlogged events delivered
```

**Data durability:** RDS Multi-AZ uses synchronous replication. RPO ≈ 0 committed transactions. No data loss for committed rows.

---

### 1c. Payment Gateway Fails

**Impact:** Payment service calls time out or return errors. Buyers cannot complete checkout.

**Recovery path:**

```
Gateway errors / timeouts
  │
  ├─ Retry with exponential backoff + jitter:
  │    Attempt 1: immediate
  │    Attempt 2: wait 1 s + rand(0..0.5 s)
  │    Attempt 3: wait 2 s + rand(0..1 s)
  │    After 3 attempts: → PENDING_RECONCILE path
  │
  ├─ Circuit breaker (CircuitBreakerDecorator):
  │    Threshold: 5 failures in 10 s → OPEN
  │    OPEN duration: 30 s → probe (HALF-OPEN) → CLOSED on success
  │    While OPEN: fail-fast 503 to buyer (no retry storm)
  │
  └─ PENDING_RECONCILE path:
       Payment written as PENDING_RECONCILE + outbox_event(PaymentPending)
       Reconciler Job (every 5 min) queries gateway status:
         → CONFIRMED → UPDATE payment, INSERT outbox_event(PaymentSucceeded)
         → FAILED    → UPDATE payment, release reservation
         → Still pending after 3 cycles → mark FAILED, release
```

**Buyer experience during OPEN:** Immediate 503 with `retry_after: 30`. Reservation is still held. Buyer can retry after 30 s.

---

## 2. Timeout and Retry Policy

| Operation | Timeout | Max Retries | Backoff |
|-----------|---------|-------------|---------|
| Payment gateway `charge()` | 5 s/attempt | 3 | Exponential + jitter |
| Payment gateway `query_status()` | 3 s/attempt | 2 | Linear (1 s) |
| DB connection acquire | 5 s | 5 | Linear (1 s) |
| Redis command | 500 ms | 2 | None (fast fail) |
| SQS publish (Outbox Worker) | 3 s | 3 | Exponential |
| SQS consumer processing | 30 s visibility timeout | — | SQS redelivers on timeout |

**Jitter formula:** `wait = base * 2^attempt + random(0, base)`  
Jitter prevents multiple retrying services from synchronising and creating a new burst.

---

## 3. Dead-Letter Queue Handling

| Queue | `maxReceiveCount` | DLQ retention | On DLQ arrival |
|-------|-------------------|---------------|----------------|
| All service queues | 3 | 14 days | CloudWatch alarm fires |

**Ops procedure for DLQ:**
1. Alert fires: CloudWatch DLQ `ApproximateNumberOfMessagesVisible > 0`.
2. Inspect message payload: identify `event_type`, `aggregate_id`, `failure_reason`.
3. Fix root cause (e.g., OrderService bug, schema mismatch).
4. Replay: use AWS console or Lambda to move messages back to the main queue.
5. Monitor that the message is processed and does not re-enter DLQ.

Messages in the DLQ are **never auto-deleted** until explicitly actioned by ops.

---

## 4. Idempotent Consumers

All SQS consumers implement the following guard before processing:

```python
def handle_payment_succeeded(event: dict):
    order = order_repo.get_by_reservation(event["reservation_id"])
    if order and order.status != OrderStatus.PAYMENT_PENDING:
        # Already processed (duplicate delivery)
        return  # ACK the message; no state change
    order_service.confirm(order.id)
```

This means a message delivered twice (SQS at-least-once) is processed only once. The second delivery returns immediately with no side effects.

---

## 5. Compensation and Refund Flow

### Payment failure (before order confirmed)

```
PaymentFailed event consumed by:
  → InventoryService: UPDATE reservation status=PAYMENT_FAILED
  → InventoryService: UPDATE inventory available_quantity +1 (SQL)
  → InventoryService: INCR Redis counter
  → NotificationService: send "Payment failed" email
```
No money was charged; no refund is needed.

### Order cancelled (after confirmation, before dispatch)

```
POST /orders/{id}/cancel
  → OrderService: transition order → CANCELLED
  → PaymentService: issue refund via gateway (idempotent refund call)
  → InventoryService: reservation remains SOLD (unit is not returned to stock)
  → NotificationService: send "Order cancelled, refund issued" email
```

### Order cancelled after dispatch

Not permitted via API (`409 INVALID_STATE_TRANSITION`). Requires manual ops intervention and carrier return process.
