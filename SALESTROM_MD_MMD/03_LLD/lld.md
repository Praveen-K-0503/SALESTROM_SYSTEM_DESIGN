# Low-Level Design — SALESTORM

## Diagram Index

| File | Diagram |
|------|---------|
| [01_class_inventory.mmd](./01_class_inventory.mmd) | Inventory module classes |
| [02_class_payment.mmd](./02_class_payment.mmd) | Payment module classes |
| [03_class_order.mmd](./03_class_order.mmd) | Order module classes |
| [04_seq_reservation.mmd](./04_seq_reservation.mmd) | Reservation: happy path, duplicate, sold-out |
| [05_seq_payment.mmd](./05_seq_payment.mmd) | Payment: success, failure, timeout, reconcile, circuit open |
| [06_seq_order_recovery.mmd](./06_seq_order_recovery.mmd) | Order creation + recovery (Service down 30 s) |
| [07_state_reservation.mmd](./07_state_reservation.mmd) | Reservation state machine |
| [08_state_order.mmd](./08_state_order.mmd) | Order state machine |

---

## 1. Where Validation Lives

| Layer | What is validated | How |
|-------|-------------------|-----|
| **CDN / WAF** | Malformed HTTP, oversized payloads, known attack signatures | Cloudflare rules |
| **API Gateway** | JWT signature, expiry, required headers (`Idempotency-Key`) | Kong plugins |
| **FastAPI route** | Request body schema (required fields, types, value ranges) | Pydantic model; returns 422 on failure |
| **Service layer** | Business rules: sale must be ACTIVE, buyer has not already reserved, order state is legal | Python in `InventoryService`, `OrderStateMachine` |
| **Database** | Structural invariants: `available_quantity >= 0`, status in allowed set, amounts > 0, foreign keys | `CHECK` / `FOREIGN KEY` constraints in schema |

Validation is **layered**: cheap checks early (JWT at gateway) prevent expensive checks later (DB query in service).

---

## 2. Where Idempotency Lives

### Reservation idempotency
| Layer | Mechanism |
|-------|-----------|
| Service entry | `InventoryService.reserve()` queries `inventory_reservation` by `idempotency_key` before touching Redis |
| Database | `UNIQUE (idempotency_key)` on `inventory_reservation` — concurrent duplicates raise a unique violation |
| Response | If key found, returns the existing row with `X-Idempotent-Replayed: true` |

### Payment idempotency
| Layer | Mechanism |
|-------|-----------|
| Service entry | `PaymentService.process()` queries `payment` by `idempotency_key` before calling the gateway |
| Gateway call | `X-Idempotency-Key` header passed to Stripe/Razorpay — gateway deduplicates on its side |
| Database | `UNIQUE (idempotency_key)` on `payment` — prevents duplicate row on race |
| Response | If key found, returns existing payment row with `X-Idempotent-Replayed: true` |

### Order event idempotency (SQS consumer)
`OrderEventConsumer` queries the order by `reservation_id` before transitioning. If already `CONFIRMED`, it ACKs the SQS message without re-processing (safe under at-least-once delivery).

---

## 3. Where Error Handling Lives

| Error type | Where handled | Action |
|-----------|---------------|--------|
| Sold-out (Redis gate) | `InventoryService.reserve()` | Return 409; no DB write |
| Sold-out (SQL race) | `InventoryService.reserve()` | Redis rollback (`INCR`); return 409 |
| Invalid state transition | `OrderStateMachine.transition()` | Raise `InvalidTransitionError`; service returns 409 |
| Payment failure | `PaymentService.process()` | Write `FAILED` payment + outbox event (same txn); service returns 422; Checkout releases reservation |
| Payment timeout | `PaymentService.process()` | Write `PENDING_RECONCILE` + outbox event; return 202 |
| Gateway unavailable (circuit OPEN) | `CircuitBreakerDecorator.charge()` | Fail-fast; service returns 503 with `retry_after` |
| Reconciler: still pending after 3 cycles | `ReconcilerJob.run()` | Mark `FAILED`; write outbox event; release reservation |
| Outbox publish failure | `OutboxWorker` | Increment `retry_count`; retry next poll; after max retries mark `FAILED` |
| SQS consumer failure | SQS | Message returned to queue; after `maxReceiveCount` moved to DLQ |
| DB constraint violation | SQLAlchemy exception handler in service | Catch `UniqueViolation` → treat as duplicate (idempotency path) |

---

## 4. Key Invariants Enforced at Each Layer

```
Buyer request
  └── API Gateway   : JWT valid? Idempotency-Key present?
        └── Service : Business rules (sale active, state valid)
              └── Redis : available_quantity > 0? (fast gate)
                    └── SQL : available_quantity >= 1? (truth gate)
                          └── DB constraints : CHECK, UNIQUE, FK
```

No single layer is relied upon alone. Each layer is a defence in depth.
