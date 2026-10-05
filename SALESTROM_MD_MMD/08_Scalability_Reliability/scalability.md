# Scalability — SALESTORM

Normal traffic: **10,000 req/sec** | Flash-sale peak: **500,000 req/sec** (50× burst)

---

## 1. Where Traffic Is Absorbed — Layer by Layer

```
500,000 req/sec (buyers at sale T=0)
  │
  ▼ Cloudflare CDN / WAF
  │   • DDoS mitigation: drops volumetric attacks at PoP level
  │   • WAF: drops malformed / malicious requests
  │   • Waiting Room: queues buyers; admits ~10,000/sec to origin
  │   → Origin sees ≤ 10,000 req/sec
  │
  ▼ AWS ALB (Load Balancer)
  │   • Cross-zone, layer-7 routing
  │   • Routes to healthy API Gateway tasks
  │
  ▼ API Gateway (Kong on ECS Fargate)
  │   • JWT validation + per-user rate limit (5 reserve/min)
  │   • Scales horizontally via ECS target-tracking on CPU
  │
  ▼ Inventory Service
  │   • Redis Lua gate: rejects ~99% in < 1ms  ← handles burst
  │   • SQL: receives ≤ 100-200 writers (bounded by unit count)
  │
  ▼ Payment / Order / Shipment / Notification
      • Low throughput post-gate (≤ confirmed unit count)
      • Async via SQS for shipment and notification
```

**Key insight:** The waiting room is the primary traffic shaper. Without it, 500,000 concurrent TLS handshakes + JWT validations would overwhelm every downstream tier.

---

## 2. What Changes at 50× Traffic (500,000 req/sec sustained)

| Layer | At 10k req/sec | At 500k req/sec |
|-------|----------------|-----------------|
| CDN | Same Cloudflare plan | Same (global PoPs absorb) |
| ALB | 2–4 tasks | Same (ALB scales managed) |
| API Gateway | 4–8 ECS tasks | 50–100 ECS tasks (auto-scale on CPU) |
| Microservices | 2–4 tasks each | 20–50 tasks each |
| Redis | Single shard (cache.r6g.large) | Cluster mode: 3–6 shards |
| PostgreSQL | r6g.xlarge primary + 1 replica | r6g.2xlarge primary + 3 replicas |
| SQS | Managed; no change | Managed; no change |
| Waiting room | Threshold: 10k concurrent | Threshold: unchanged (CDN absorbs extra) |

**Stateless services** (all services except Redis and RDS) scale horizontally with no code changes. State lives entirely in Redis and PostgreSQL.

---

## 3. Bottleneck Analysis

### Bottleneck 1 — Hot Inventory Row (PostgreSQL)

**Problem:** All 100-200 writers that pass the Redis gate compete to update the same `inventory` row for `(sale_id, product_id)`.

**PostgreSQL row-level lock** serialises them. At 100 writers, each wait is ~1–5ms. Acceptable.

**Scaling break point:** If stock = 10,000 units and all pass the gate, ~10,000 concurrent writers hit the same row → lock queue explodes.

**Mitigation at break point:**
- Batch the Redis counter into N sub-counters (inventory sharding).
- Use a reservation-token pool pre-generated before sale start.
- For v1 (100 units), current design is sufficient.

---

### Bottleneck 2 — Redis Hot Key

**Problem:** Every reservation attempt reads/writes the same key `inv:{sale_id}:{product_id}`. In Redis, all commands to the same key execute on one thread in one slot.

**Capacity:** Single Redis shard handles ~200,000 simple ops/sec. Lua script is atomic and counted as one op. At 10,000 post-gate req/sec arriving at Redis, we are well within capacity.

**Scaling break point:** If the waiting room admits 200,000 concurrent requests past the CDN, a single Redis key saturates.

**Mitigation:** Split counter into N=10 shards (`inv:{sale_id}:{product_id}:{shard}`); assign each request to a shard by `hash(customer_id) % N`. Sum shards for true count.

---

### Bottleneck 3 — Payment Gateway

**Problem:** External gateway has its own rate limit (e.g., Stripe: ~1,000 charge/sec per account). During sale burst, all 95 successful reservations attempt payment simultaneously.

**At 100 units,** 95 simultaneous charges is within any gateway's rate limit.

**Scaling break point:** 10,000+ units with 95% success = 9,500 simultaneous charges.

**Mitigation:**
- Circuit breaker prevents amplification under failure.
- Retry with backoff (jitter) prevents thundering herd on recovery.
- For large-scale: negotiate higher gateway rate limits; consider multiple gateway accounts.

---

## 4. Autoscaling Policy (ECS Fargate)

| Service | Scale Metric | Target | Min Tasks | Max Tasks |
|---------|-------------|--------|-----------|-----------|
| API Gateway | CPU utilization | 60% | 2 | 100 |
| Inventory Service | CPU utilization | 60% | 2 | 50 |
| Checkout Service | CPU utilization | 60% | 2 | 50 |
| Payment Service | CPU utilization | 60% | 2 | 30 |
| Order Service | SQS queue depth | < 100 msgs | 1 | 20 |
| Notification Service | SQS queue depth | < 200 msgs | 1 | 20 |

Scale-in cooldown: 300 s (prevent thrash). Scale-out cooldown: 60 s.
