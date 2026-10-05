# Security — SALESTORM

---

## 1. Authentication

**Mechanism:** JWT (RS256), issued by a dedicated Auth Service.

| Property | Value |
|----------|-------|
| Algorithm | RS256 (asymmetric; private key signs, public key verifies) |
| Access token expiry | 15 minutes |
| Refresh token expiry | 7 days (stored as HttpOnly cookie) |
| Claims | `sub` (customer_id), `role` (buyer \| admin), `iat`, `exp` |
| Validation | API Gateway (Kong) validates signature + expiry before forwarding |

**On expiry:** Client uses refresh token to obtain a new access token. API Gateway rejects expired JWTs with 401 before they reach any service.

---

## 2. Authorization (RBAC)

| Role | Permitted endpoints |
|------|---------------------|
| `buyer` | POST /reservations, POST /payments, GET /orders/{id}, POST /orders/{id}/cancel, GET /sales/{id}/status |
| `admin` | All buyer endpoints + sale management, inventory management |

**Enforcement:** API Gateway Kong plugin enforces role claim. Services additionally verify `customer_id` from JWT matches the resource owner (e.g., order.customer_id == JWT.sub).

---

## 3. HTTPS / TLS

- TLS 1.3 enforced everywhere (CDN → LB, LB → API GW, all internal VPC calls).
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- TLS certificates: AWS ACM (auto-renewed). Cloudflare handles edge TLS termination.
- Internal VPC traffic: private subnets; TLS between services enforced by service mesh policy.

---

## 4. Rate Limiting

| Limit | Scope | Enforcement |
|-------|-------|-------------|
| 100 req/min | Per IP | Cloudflare (edge) |
| 5 reserve/min | Per user JWT | API Gateway Kong |
| 1 reservation per sale | Per customer per sale | Business rule in InventoryService + DB unique constraint |

Rate limit response: `429 Too Many Requests` with `Retry-After` header.

---

## 5. Input Validation

| Layer | Tool | What is validated |
|-------|------|-------------------|
| API Gateway | Kong schema validation | Required headers (Idempotency-Key), Content-Type |
| FastAPI route | Pydantic models | Field types, required fields, value ranges (amount > 0) |
| Service layer | Python assertions | Business invariants (sale is ACTIVE, state transition is valid) |
| Database | CHECK constraints | `available_quantity >= 0`, `status IN (...)`, `amount > 0` |

**Principle:** Every layer validates what it can. DB constraints are the last line of defence, never the only line.

---

## 6. Secure Payment Handling

| Requirement | Implementation |
|-------------|----------------|
| No card data stored | Card details collected by gateway's front-end SDK; we receive a `payment_token` (opaque reference) |
| PCI-DSS scope | Reduced to SAQ-A; card data never touches SALESTORM servers |
| Tokenized charges | `payment_token` + `X-Idempotency-Key` sent to gateway; we store only `gateway_ref` |
| No logging of tokens | `payment_token` explicitly excluded from structured log output |
| Refunds | Issued via `gateway_ref` only; no card data required |

---

## 7. Audit Logs

Every write operation logs a structured audit record:

```json
{
  "timestamp":   "2026-10-05T10:00:01Z",
  "event":       "reservation_created",
  "actor_id":    "customer-uuid",
  "actor_role":  "buyer",
  "resource_id": "reservation-uuid",
  "ip":          "1.2.3.4",
  "trace_id":    "abc123",
  "outcome":     "success"
}
```

Audit logs are:
- Written to a separate, append-only CloudWatch Log Group.
- Retained for 90 days (compliance).
- Never modified or deleted by application code.
- Admin actions (`create_sale`, `close_sale`) always logged, regardless of outcome.

---

## 8. Secrets Management

| Secret | Storage | Access |
|--------|---------|--------|
| DB credentials | AWS Secrets Manager | Injected at ECS task start; rotated every 30 days |
| Redis auth token | AWS Secrets Manager | Same |
| JWT private key (RS256) | AWS Secrets Manager | Auth Service only |
| Payment gateway API key | AWS Secrets Manager | Payment Service only |
| SQS queue URLs | ECS environment variables | Non-sensitive; not a secret |

**Principle:** No secrets in code, config files, or environment variable literals. All retrieved from Secrets Manager at runtime with caching (TTL 5 min).
