# ADR-005: Event Delivery — Transactional Outbox + SQS vs Alternatives

**Date:** 2026-10-05  
**Status:** Accepted

---

## Context

After the Payment Service confirms a payment, two downstream services must react:
- **Order Service:** transition order `PAYMENT_PENDING → CONFIRMED`.
- **Notification Service:** send payment receipt to the buyer.

Order Service may be temporarily unavailable (e.g., ECS task restart takes 30 seconds). The system must guarantee the event is eventually delivered and processed without data loss or double-charge.

Three approaches exist for cross-service event delivery.

---

## Options Considered

### Option A — Direct HTTP Calls from Payment Service

Payment Service calls `POST order-service/confirm` and `POST notification-service/send` synchronously after confirming payment.

**Pros:** Simple; no additional infrastructure.  
**Cons:**
- **Tight coupling:** Payment Service must know Order Service's address and API contract.
- **Cascade failure:** If Order Service is down, Payment Service call fails. Payment Service must retry (blocking the response to the buyer) or give up (event lost).
- **Partial failure:** If `payment` is committed but `POST order-service/confirm` fails → payment confirmed, order not created. Inconsistency with no recovery path.
- **Dual write problem:** Payment write and HTTP call are not atomic.

---

### Option B — Shared Database Polling

Payment Service writes a `payment_events` table row. Order Service polls this table every second.

**Pros:** No message broker; events stored in the same DB.  
**Cons:**
- Every service must poll, adding DB load (SELECT on `payment_events` every second × number of services).
- Tight coupling to DB schema: Order Service depends on Payment Service's DB tables.
- Polling interval introduces latency; reducing it increases DB load.
- Not suitable for multi-service fan-out (each service polls separately).

---

### Option C — Transactional Outbox + SQS ✅ Chosen

Payment Service writes `payment` row + `outbox_event` row **in one DB transaction**. Outbox Worker polls `outbox_event` and publishes to SQS. Order Service and Notification Service consume from SQS.

```sql
BEGIN;
  INSERT INTO payment    (status=CONFIRMED, gateway_ref=...);
  INSERT INTO outbox_event (event_type='PaymentSucceeded', payload=...);
COMMIT;
-- Either both succeed or neither does. Event is never lost.
```

**Pros:**
- **Atomic:** Payment and event creation commit together. No "paid but event lost" scenario.
- **Durability:** SQS retains messages for 4 days. Order Service can restart and recover all missed events.
- **Decoupling:** Payment Service does not know about Order Service. New consumers added without changing Payment Service.
- **Fan-out:** SQS can deliver to multiple consumers from a single publish.

**Cons:**
- **At-least-once delivery:** SQS may deliver the same message more than once. Consumers must be idempotent.
- **Lag:** ~1-second delay between payment commit and SQS delivery (outbox polling interval).
- **Infrastructure:** Requires SQS, Outbox Worker, DLQ per queue.

---

## Decision

**Option C.** Transactional outbox + SQS. Atomic event creation; durable, decoupled delivery.

---

## Consequences

| Aspect | Result |
|--------|--------|
| Atomicity | Payment + event in one commit → no dual-write gap |
| Durability | SQS retains messages during Order Service outage |
| Decoupling | Payment Service has no direct dependency on Order Service |
| Delivery | At-least-once; consumers implement idempotency guard |
| Latency | ~1 s from payment commit to Order Service processing |
| Infrastructure | SQS queue + DLQ + Outbox Worker per domain |

## What This Decision Sacrifices

**Exactly-once delivery.** SQS standard queues deliver at least once; a message may arrive twice during a transient consumer failure. Every consumer must check whether the event was already processed before acting. This is an acceptable trade-off because: (1) idempotency guards are simple to implement, (2) the alternative (exactly-once via SQS FIFO with deduplication IDs) adds ordering constraints and reduces throughput. We accept at-least-once and invest the complexity budget in consumer idempotency instead.
