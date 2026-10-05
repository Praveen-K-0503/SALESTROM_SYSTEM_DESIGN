# API Specification — SALESTORM

All endpoints require `Authorization: Bearer <JWT>` unless marked public.  
Base URL: `https://api.salestorm.io/v1`

---

## Sale Service

### GET /sales/{sale_id}
> Public — Returns sale details.

**Response 200**
```json
{
  "id": "uuid",
  "product_id": "uuid",
  "sale_price": 499.00,
  "total_units": 100,
  "available": 43,
  "starts_at": "2026-10-05T10:00:00Z",
  "ends_at": "2026-10-05T11:00:00Z",
  "status": "ACTIVE"
}
```

---

## Inventory / Reservation Service

### POST /sales/{sale_id}/reserve
> Reserve one unit. Idempotent via `X-Idempotency-Key` header.

**Request Headers**
```
X-Idempotency-Key: <SHA256(customer_id+sale_id+product_id)>
```

**Response 201**
```json
{
  "reservation_id": "uuid",
  "expires_at": "2026-10-05T10:10:00Z",
  "status": "RESERVED"
}
```

**Response 409** — Already reserved or sold out
```json
{ "error": "SOLD_OUT" }
```

**Response 429** — Rate limited
```json
{ "error": "RATE_LIMITED", "retry_after": 5 }
```

---

### DELETE /reservations/{reservation_id}
> Cancel a reservation and release stock.

**Response 204** — No content

---

## Checkout Service

### POST /checkout
> Orchestrates payment and order creation.

**Request Body**
```json
{
  "reservation_id": "uuid",
  "payment_token": "tok_xyz"
}
```

**Response 200**
```json
{
  "order_id": "uuid",
  "status": "CONFIRMED",
  "total": 499.00
}
```

**Response 202** — Payment pending reconciliation
```json
{
  "order_id": "uuid",
  "status": "PAYMENT_PENDING",
  "message": "Payment is being verified. You will be notified."
}
```

---

## Payment Service

### POST /payments
> Internal — Called by Checkout Service.

**Request Body**
```json
{
  "order_id": "uuid",
  "amount": 499.00,
  "payment_token": "tok_xyz",
  "idempotency_key": "sha256_key"
}
```

**Response 200**
```json
{
  "payment_id": "uuid",
  "gateway_ref": "pi_xxx",
  "status": "CONFIRMED"
}
```

---

## Order Service

### GET /orders/{order_id}
> Get order status.

**Response 200**
```json
{
  "id": "uuid",
  "status": "CONFIRMED",
  "total": 499.00,
  "created_at": "2026-10-05T10:05:00Z",
  "shipment": {
    "tracking_number": "TRK123",
    "carrier": "BlueDart",
    "status": "SHIPPED"
  }
}
```

---

## Common Error Responses

| Code | Meaning |
|------|---------|
| 400 | Bad request / validation error |
| 401 | Missing or invalid JWT |
| 404 | Resource not found |
| 409 | Conflict (duplicate / sold out) |
| 429 | Rate limit exceeded |
| 503 | Circuit breaker open (payment gateway) |

---

## Idempotency Contract
- Header: `X-Idempotency-Key: <key>`
- Duplicate requests within 24 h return the **original cached response** with `X-Idempotent-Replayed: true`.
- Key must be client-generated and unique per logical operation.
