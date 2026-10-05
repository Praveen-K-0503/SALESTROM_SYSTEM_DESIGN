# Observability — SALESTORM

Three pillars: **Metrics**, **Structured Logs**, **Distributed Tracing**.

---

## 1. Metrics

### Business Metrics (CloudWatch / Grafana)

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `sale.reservation.attempt.rate` | Reserve attempts/sec | > 5,000/sec → scale warning |
| `sale.reservation.success.rate` | Successful reservations/sec | — |
| `sale.reservation.sold_out.rate` | Rejected-at-gate rate | — |
| `sale.payment.success.rate` | Payments confirmed/min | < 90% of attempts → warning |
| `sale.payment.failure.rate` | Payment failures/min | > 10% → PagerDuty |
| `sale.payment.timeout.rate` | PENDING_RECONCILE count | > 5/min → warning |
| `sale.order.conversion.rate` | Orders confirmed / reservations created | < 80% → investigate |
| `sale.dlq.depth` | Messages in any DLQ | > 0 → warning |
| `sale.inventory.redis_sql_drift` | Redis counter vs SQL available_quantity | Any drift > 5 → critical |

### Infrastructure Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| API p99 latency | > 500 ms → warning; > 1 s → critical |
| Reserve endpoint p99 | > 200 ms → warning |
| ECS CPU utilization | > 80% → scale out |
| RDS connection pool saturation | > 90% max connections → critical |
| Redis memory usage | > 80% → expand cluster |
| Circuit breaker state | = OPEN → critical |

---

## 2. Structured Log Format

All services emit JSON logs to CloudWatch Logs. Standard fields on every log line:

```json
{
  "timestamp":    "2026-10-05T10:00:01.234Z",
  "level":        "INFO",
  "service":      "inventory-service",
  "trace_id":     "abc123def456",
  "span_id":      "7890abcd",
  "customer_id":  "uuid",
  "sale_id":      "uuid",
  "event":        "reservation_created",
  "reservation_id": "uuid",
  "duration_ms":  42,
  "outcome":      "success"
}
```

**Business event examples:**

| `event` value | When logged |
|---------------|-------------|
| `redis_gate_rejected` | Redis decrement returns 0 (sold out) |
| `sql_gate_rejected` | SQL UPDATE returns 0 rows (race condition) |
| `redis_rollback` | INCR after SQL failure |
| `reservation_created` | Reservation row inserted |
| `reservation_expired` | Sweeper marks RELEASED |
| `payment_succeeded` | Payment row inserted as CONFIRMED |
| `payment_failed` | Payment row inserted as FAILED |
| `payment_timeout` | Payment row inserted as PENDING_RECONCILE |
| `circuit_breaker_open` | Circuit transitions CLOSED → OPEN |
| `circuit_breaker_closed` | Circuit transitions HALF-OPEN → CLOSED |
| `outbox_published` | Outbox Worker published event to SQS |
| `dlq_message_received` | Consumer received message from DLQ |
| `order_confirmed` | Order status → CONFIRMED |
| `order_shipped` | Order status → SHIPPED |

**Sensitive fields never logged:** `payment_token`, card numbers, raw JWT.

---

## 3. Distributed Tracing

**Tool:** OpenTelemetry SDK (Python) → AWS X-Ray (or Jaeger in staging).

**Sampling rate:**
- During sale window (starts_at ± 10 min): **100%**
- Outside sale window: **10%**

**Trace propagation:**
```
POST /reservations
  └── span: inventory-service.reserve
        ├── span: redis.eval lua_decrement
        ├── span: postgres.update inventory
        └── span: postgres.insert reservation

POST /checkout
  └── span: checkout-service.checkout
        ├── span: inventory-service.reserve         (child)
        ├── span: payment-service.process           (child)
        │     ├── span: redis.get idempotency_key
        │     ├── span: circuit-breaker.charge
        │     │     └── span: http.post stripe/charge
        │     └── span: postgres.insert payment+outbox
        └── span: order-service.create              (child)
```

Every span carries: `trace_id`, `span_id`, `customer_id`, `sale_id`, `duration_ms`, `status` (ok/error).

Traces are searchable by `customer_id` and `trace_id`. A support engineer can retrieve the full checkout trace for any buyer using their `trace_id` from the error response.

---

## 4. Dashboards

### Sale Live Dashboard
- Countdown: `available_quantity` (Redis) vs time
- Reservation rate (req/sec, smoothed 10 s)
- Payment success/failure/timeout rates
- Active waiting room queue length

### Payment Health Dashboard
- Circuit breaker state (CLOSED / OPEN / HALF-OPEN) — live indicator
- Gateway p99 latency
- Payment success rate (rolling 5 min)
- PENDING_RECONCILE count
- DLQ depth per queue

### Infrastructure Dashboard
- ECS task count per service
- RDS connections (primary + replicas)
- Redis memory and ops/sec
- ALB request rate and 5xx rate

---

## 5. Key Alerts and Runbooks

### ALERT: `sale.inventory.redis_sql_drift > 5`
**Meaning:** Redis counter is off by more than 5 units compared to SQL `available_quantity`.

**Runbook:**
1. Check `redis_rollback` log events — high count indicates repeated SQL failures.
2. If Redis restarted recently: verify warm-up job ran successfully.
3. Manually reconcile: `SET inv:{sale_id}:{product_id} = (SELECT available_quantity FROM inventory WHERE ...)`.
4. Monitor drift metric for 5 minutes after fix.

---

### ALERT: `sale.payment.failure.rate > 10%`
**Meaning:** More than 1 in 10 payment attempts failing; likely gateway issue.

**Runbook:**
1. Check circuit breaker state dashboard.
2. If OPEN: check gateway status page; wait for HALF-OPEN probe.
3. If CLOSED and high failure rate: check gateway error codes in payment logs (`failure_reason` field).
4. If gateway-side issue confirmed: contact gateway support.
5. Notify users via status page.

---

### ALERT: `sale.dlq.depth > 0`
**Meaning:** At least one message failed all retries and is in the DLQ.

**Runbook:**
1. Inspect DLQ message: `event_type`, `aggregate_id`, `payload`.
2. Determine root cause from service logs using `trace_id` in the payload.
3. Fix root cause; redeploy if needed.
4. Replay message from DLQ → main queue.
5. Verify message is processed successfully (not re-entering DLQ).
