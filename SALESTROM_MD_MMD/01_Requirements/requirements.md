# Requirements — SALESTORM Flash Sale Platform

---

## 1. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-01 | Admin can create a flash sale specifying: product, sale price, unit count, start time, end time. |
| FR-02 | The sale becomes purchasable only within its configured time window. |
| FR-03 | A buyer can view current sale details including live available stock. |
| FR-04 | A buyer can attempt to reserve exactly one unit per sale. The system atomically decrements available stock. |
| FR-05 | A reservation expires after **10 minutes** if the buyer does not complete checkout. |
| FR-06 | An expiry sweeper periodically finds and releases expired reservations, returning stock. |
| FR-07 | A buyer must complete checkout (submit payment) within their reservation window. |
| FR-08 | Every checkout attempt carries an idempotency key derived from `customer_id + sale_id + product_id`. Retries return the original result. |
| FR-09 | On payment success, an order is created and the reservation is marked sold. |
| FR-10 | On payment failure or cancellation, the reservation is released and stock is restored. |
| FR-11 | Order status transitions: `CREATED → PAYMENT_PENDING → CONFIRMED → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`. |
| FR-12 | Buyers receive a notification at each major order status change (confirmation, shipped, delivered). |
| FR-13 | Excess traffic at sale launch is queued in a waiting room; buyers are admitted in order. |

---

## 2. Non-Functional Requirements

### 2.1 Throughput

| ID | Metric | Value | Type |
|----|--------|-------|------|
| NFR-T1 | Sustained read throughput (normal traffic) | 10,000 req/sec | **Target** |
| NFR-T2 | Peak write throughput (flash-sale burst) | 500,000 req/sec at the edge | **Target** |
| NFR-T3 | Inventory reservation throughput (post-gate) | ≥ 5,000 reserve attempts/sec | **Guarantee** |
| NFR-T4 | Redis inventory gate throughput | ≥ 200,000 ops/sec | **Target** |

### 2.2 Latency

| ID | Metric | Value | Type |
|----|--------|-------|------|
| NFR-L1 | Reserve endpoint p99 latency (gate only) | < 50 ms | **Target** |
| NFR-L2 | Reserve endpoint p99 latency (end-to-end) | < 200 ms | **Target** |
| NFR-L3 | Checkout endpoint p99 latency | < 500 ms | **Target** |
| NFR-L4 | Order status read p99 latency | < 100 ms | **Target** |

### 2.3 Availability

| ID | Metric | Value | Type |
|----|--------|-------|------|
| NFR-A1 | Platform availability (monthly) | ≥ 99.9% (≤ 43.8 min downtime/month) | **Guarantee** |
| NFR-A2 | Payment service availability | ≥ 99.5% (circuit breaker may degrade gracefully) | **Guarantee** |
| NFR-A3 | RDS failover time (Multi-AZ) | < 60 sec | **Target** |

### 2.4 Consistency

| ID | Metric | Value | Type |
|----|--------|-------|------|
| NFR-C1 | Inventory accuracy — no oversell | Zero units sold beyond stock count | **Guarantee** |
| NFR-C2 | Payment idempotency — no double charge | One charge per successful order | **Guarantee** |
| NFR-C3 | Async event delivery | At-least-once (consumers must deduplicate) | **Guarantee** |
| NFR-C4 | Stock recovery after reservation expiry | Within 40 seconds of TTL expiry | **Target** |

### 2.5 Security

| ID | Requirement | Type |
|----|-------------|------|
| NFR-S1 | All traffic encrypted in transit (TLS 1.3) | **Guarantee** |
| NFR-S2 | All API calls authenticated via JWT (RS256, 15-min expiry) | **Guarantee** |
| NFR-S3 | Rate limit: 100 req/min/IP globally; 5 reserve attempts/min/user | **Guarantee** |
| NFR-S4 | Payment card data never stored; tokenised by gateway | **Guarantee** |
| NFR-S5 | WAF blocks SQLi, XSS, and known CVE patterns | **Target** |

### 2.6 Recovery (RTO / RPO)

| ID | Scenario | RTO | RPO | Type |
|----|----------|-----|-----|------|
| NFR-R1 | Primary DB failure (Multi-AZ failover) | < 60 s | ~0 | **Target** |
| NFR-R2 | Redis node failure (replica promotion) | < 30 s | seconds | **Target** |
| NFR-R3 | Service task crash (ECS restart) | < 10 s | N/A | **Target** |
| NFR-R4 | Undeliverable async event (DLQ) | Manual replay within 24 h | 0 events lost | **Guarantee** |

---

## 3. Assumptions

| ID | Assumption |
|----|------------|
| A-01 | Each buyer may purchase at most **1 unit** per flash sale. |
| A-02 | Flash sales last ≤ 60 minutes and have ≤ 10,000 units of stock. |
| A-03 | The external payment gateway is reachable but may be unreliable (≤ 5% error rate, ≤ 2% timeout rate). |
| A-04 | Redis is used as an approximate fast gate only; SQL is the definitive record of available stock. |
| A-05 | The waiting room is handled at the CDN/edge layer (Cloudflare); SALESTORM services see ≤ normalised traffic. |
| A-06 | Buyers have already authenticated (JWT present) before entering the reservation flow. |
| A-07 | Notification delivery (email/SMS) is best-effort; a missed notification does not constitute a system failure. |

---

## 4. Constraints

| ID | Constraint |
|----|------------|
| C-01 | Must use Redis Lua atomic decrement as the first inventory gate — no alternative cache strategies. |
| C-02 | SQL `UPDATE … WHERE available >= 1` is the final arbiter of stock; Redis may drift temporarily. |
| C-03 | Reservation TTL is fixed at **10 minutes**; it is not configurable per buyer or per sale. |
| C-04 | Idempotency key format is `SHA256(customer_id ‖ sale_id ‖ product_id)` with a database unique constraint. |
| C-05 | All async events must go through the transactional outbox → message queue → DLQ pipeline; no direct service-to-service async calls. |
| C-06 | Payment gateway calls must use idempotent retry with exponential backoff and a circuit breaker. |

---

## 5. Strict Guarantees vs Targets — Summary

| Guarantee (must never be violated) | Target (best-effort, measurable goal) |
|------------------------------------|---------------------------------------|
| Zero oversell (NFR-C1) | Reserve p99 < 200 ms (NFR-L2) |
| No double charge (NFR-C2) | Peak throughput 500k req/sec at edge (NFR-T2) |
| No event loss — DLQ captures all (NFR-R4) | RDS failover < 60 s (NFR-R1) |
| TLS 1.3 everywhere (NFR-S1) | Checkout p99 < 500 ms (NFR-L3) |
| JWT auth on all write endpoints (NFR-S2) | Stock recovery within 40 s (NFR-C4) |
| Card data never stored (NFR-S4) | WAF CVE blocking (NFR-S5) |
| Platform ≥ 99.9% availability (NFR-A1) | Redis gate ≥ 200k ops/sec (NFR-T4) |
