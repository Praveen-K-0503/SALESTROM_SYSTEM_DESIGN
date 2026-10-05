# Security & Observability — SALESTORM

## 1. Security

### Authentication & Authorization
| Mechanism | Detail |
|-----------|--------|
| JWT (RS256) | Issued by Auth Service; 15-min expiry; refreshed via refresh token |
| API Gateway validation | Validates JWT signature + claims before forwarding |
| Role-based | `buyer`, `admin` roles; admin endpoints blocked for `buyer` |

### Edge Security (Cloudflare)
- **WAF rules:** Block SQLi, XSS, known CVE exploits
- **Rate limiting:** 100 req/min/IP globally; 5 req/min/user on reserve
- **DDoS protection:** L3/L4 volumetric + L7 application DDoS
- **Waiting room:** Queues excess users; prevents thundering herd

### API Security
```
- HTTPS only (TLS 1.3); HSTS header
- Input validation on all endpoints (Pydantic models)
- Idempotency keys prevent replay attacks
- CORS: restricted origins only
- Sensitive fields (card data) never stored; PCI-DSS scope excluded via tokenization
```

### Data Security
| Concern | Measure |
|---------|---------|
| PII at rest | AES-256 encryption (RDS Transparent Data Encryption) |
| PII in transit | TLS 1.3 everywhere |
| Payment data | Tokenized; card numbers never hit our servers |
| Secrets | AWS Secrets Manager; injected at runtime |
| Audit logs | All admin actions logged with actor + timestamp |

---

## 2. Observability

### Metrics (CloudWatch / Prometheus + Grafana)

| Metric | Alert Threshold |
|--------|----------------|
| `reservation.success.rate` | < 95% → PagerDuty |
| `inventory.redis.hit.rate` | < 99% → warning |
| `payment.circuit_breaker.state` | OPEN → critical |
| `payment.timeout.count` | > 10/min → warning |
| `dlq.message.count` | > 0 → warning |
| `db.connection.pool.wait` | > 100ms p99 → scale |
| `api.p99.latency` | > 500ms → investigate |

### Distributed Tracing (AWS X-Ray / OpenTelemetry)
- Every request tagged with `trace_id`, `sale_id`, `customer_id`
- Spans captured across: CDN → GW → Inventory → Payment → Order
- Trace sampling: 100% during sale window; 10% otherwise

### Structured Logging (JSON)
```json
{
  "timestamp": "2026-10-05T10:00:01Z",
  "level": "INFO",
  "service": "inventory-service",
  "trace_id": "abc123",
  "customer_id": "uuid",
  "sale_id": "uuid",
  "event": "reservation_created",
  "duration_ms": 42
}
```

### Dashboards
1. **Sale Dashboard:** Available stock countdown, reservation rate, conversion rate
2. **Payment Dashboard:** Success/fail/timeout rates, circuit breaker state, DLQ depth
3. **Infrastructure Dashboard:** CPU, memory, DB connections, Redis memory

### Alerting Runbook
```
ALERT: circuit_breaker OPEN
  1. Check payment gateway status page
  2. Review recent error logs in X-Ray
  3. If gateway recovering → wait for HALF-OPEN probe
  4. If not → escalate to payment team
  5. Notify customers of delay via status page
```
