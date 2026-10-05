# High-Level Design — SALESTORM

Diagrams (open in any Mermaid renderer):

| File | Diagram |
|------|---------|
| [01_context.mmd](./01_context.mmd) | System context (C4 L1) |
| [02_container.mmd](./02_container.mmd) | Container / service architecture (C4 L2) |
| [03_component.mmd](./03_component.mmd) | Component internals — Inventory, Payment, Order (C4 L3) |
| [04_deployment.mmd](./04_deployment.mmd) | AWS deployment topology |

---

## 1. Why Each Component Exists

### CDN / WAF (Cloudflare)
Absorbs up to 500,000 req/sec at the edge — orders of magnitude more than the origin can serve.  
The **waiting room** queues buyers and admits them in batches, so every downstream service sees bounded, controlled traffic.  
The **WAF** drops malicious requests before they touch the VPC.

### Load Balancer (AWS ALB)
Distributes admitted requests across API Gateway instances across two Availability Zones.  
Performs health checks; removes unhealthy tasks from rotation within seconds.

### API Gateway (Kong)
Single entry point for all service calls. Responsibilities:
- Validates JWT signature and expiry → rejects unauthenticated requests before they cost CPU in services.
- Per-user rate limiting (5 reserve attempts/min) as a second line of defence after the CDN.
- Routes to the correct downstream service.

Keeps all services free of auth / routing concerns (separation of responsibility).

### Inventory Service
Houses the two-phase stock gate — the most critical correctness invariant in the system.

1. **Redis Lua gate** — atomic, sub-millisecond decrement. Rejects the overwhelming majority of requests (e.g., 9,900 out of 10,000) without touching SQL.
2. **SQL conditional update** — `UPDATE inventory SET available = available - 1 WHERE available >= 1`. If 0 rows affected, Redis is rolled back (`INCR`). SQL is the authoritative source of truth; Redis may drift on crash/restart and is re-warmed from SQL.

Without the Redis gate, 10,000 writers would hammer the DB simultaneously under a flash-sale burst.

### Reservation Service
Writes and manages reservation records. Owns the **TTL contract**: each reservation has an `expires_at = now() + 10 min`.  
The **expiry sweeper** (every 30 s) queries for `RESERVED` rows past their `expires_at`, marks them `RELEASED`, and calls Inventory Service to restore stock (SQL increment + Redis INCR).

Keeps abandoned cart stock hostage for at most ~40 s after TTL expiry.

### Checkout Service
Thin orchestrator only. Calls Inventory → Payment → Order in sequence. Owns no state of its own. If any step fails, it calls the appropriate compensating action (release reservation). Delegates all business logic to the specialist services.

### Payment Service
Wraps the external payment gateway with three resilience mechanisms:
- **Idempotency key** (`SHA256(customer_id + sale_id + product_id)`) passed as `X-Idempotency-Key` to the gateway and stored in DB. Retries return the original result; no double charge.
- **Retry with exponential backoff** (max 3 attempts, jitter) for transient gateway errors.
- **Circuit breaker** — after 5 failures in 10 s, opens for 30 s (fail-fast). Prevents a struggling gateway from exhausting connection pools across the fleet.

On completion (success or failure), writes both the `payment` record and an `outbox_event` row **in the same DB transaction**.

### Outbox Worker
Polls `outbox_event WHERE status = 'PENDING'` every second. Publishes to SQS, then marks rows `PUBLISHED`. This is the only writer to SQS, so the boundary between synchronous and asynchronous processing is clean and auditable.

Guarantees at-least-once delivery even if the worker crashes between publish and mark.

### Message Queue + DLQ (SQS)
Decouples payment outcomes from Order, Shipment, and Notification services. Each consumer processes events independently and at its own pace.  
Messages that fail processing 3 times are routed to the **Dead-Letter Queue** — they are never silently dropped. Ops can inspect and replay from the DLQ.

### Order / Shipment / Notification Services
Pure event consumers. They react to queue messages and advance their own state. No direct calls from upstream synchronous services (except the initial order creation by Checkout on the happy path).

### PostgreSQL (RDS Multi-AZ)
Source of truth for inventory counts, reservations, payments, orders, and the outbox. Multi-AZ gives synchronous standby replication with ~30–60 s automatic failover. A read replica offloads non-critical reads (order status, sale info).

### Redis (ElastiCache Cluster)
Three roles:
1. **Inventory counter** — the fast gate.
2. **Idempotency cache** — stores seen keys and their responses (TTL 24 h).
3. **Waiting room state** — sorted set of queued buyer sessions (managed by Cloudflare Workers via API).

---

## 2. Synchronous vs Asynchronous Calls

| Call | Mode | Reason |
|------|------|--------|
| Buyer → CDN → LB → API GW | Sync | User is waiting for a response |
| API GW → Sale Service | Sync | Read; immediate response expected |
| API GW → Inventory Service (reserve) | Sync | Buyer waits for confirmation |
| Inventory Service → Redis | Sync | Must know immediately if stock is available |
| Inventory Service → PostgreSQL | Sync | Must confirm before responding to buyer |
| Checkout → Payment Service | Sync | Buyer waits for payment outcome |
| Payment Service → Payment Gateway | Sync (with retry) | Must know charge result before writing order |
| Payment Service → Outbox (DB write) | Sync | Part of the same DB transaction |
| Outbox Worker → SQS | Async | Fire-and-forget after sync payment completes |
| SQS → Order Service | Async | Order update does not need to block buyer |
| SQS → Shipment Service | Async | Fulfilment is inherently asynchronous |
| SQS → Notification Service | Async | Notification can lag by seconds |

**Invariant:** Everything that controls whether a buyer gets a unit (reserve, pay) is **synchronous**. Everything that happens after the buyer has a confirmed order (fulfilment, notifications) is **asynchronous**.

---

## 3. Bottleneck Analysis

### Primary Bottleneck — PostgreSQL Write Throughput

At flash-sale burst, the Inventory Service executes:
```sql
UPDATE inventory
SET available = available - 1
WHERE product_id = ? AND available >= 1;
```
All 10,000 concurrent users who pass the Redis gate hit this one row (same `product_id`). PostgreSQL serialises row-level locks — this becomes a hot-row bottleneck.

**Why it is tolerable here:**  
The Redis Lua gate eliminates ~99% of requests before they reach SQL. With 100 units, at most 100–200 requests pass the Redis gate during the burst window; the rest are rejected in microseconds. The SQL update sees only a small number of writers.

**If stock were 10,000 units** (same product, larger sale), the gate pressure would be much higher. Mitigations:
- Shard the counter by product variant or batch.
- Use `SKIP LOCKED` + a reservation queue pattern.
- Pre-generate and pool reservation tokens before sale start.

### Secondary Bottleneck — Redis Single Key

All reservation attempts hit the same Redis key `inv:{sale_id}:{product_id}`. In Redis single-threaded command processing, this is safe but throughput is capped at ~100k–200k ops/sec per key on a single shard.

At 500,000 req/sec edge throughput, the waiting room must ensure the origin never sees more than ~10,000–20,000 simultaneous reservation requests, keeping Redis well within capacity.

### Tertiary Bottleneck — Payment Gateway

The gateway is external and shared. Under a sale burst, all successful reservations immediately attempt payment. Gateway rate limits and latency spikes are expected.

**Mitigation:** Circuit breaker (fail-fast under failure), retry with backoff (avoid amplification), and async reconciliation for timeouts — buyer is notified asynchronously rather than waiting on a stalled sync call.
