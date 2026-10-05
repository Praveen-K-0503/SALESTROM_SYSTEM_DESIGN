# Events & Commands — SALESTORM

Async communication uses the **Transactional Outbox → SQS** pipeline.  
Events are published by the Outbox Worker after the owning service commits.  
All consumers must be **idempotent** (at-least-once delivery).

---

## Commands (synchronous — REST calls)

| Command | Caller → Receiver | Trigger | Notes |
|---------|-------------------|---------|-------|
| `CreateReservation` | Buyer → Inventory Service | POST /reservations | Carries idempotency key |
| `ProcessPayment` | Checkout Service → Payment Service | POST /payments | Carries idempotency key; wraps gateway |
| `CreateOrder` | Checkout Service → Order Service | Internal sync call | After payment initiated |
| `CancelOrder` | Buyer → Order Service | POST /orders/{id}/cancel | Allowed in CREATED, PAYMENT_PENDING, CONFIRMED only |
| `ReleaseReservation` | Checkout / Sweeper → Inventory Service | On payment failure or TTL expiry | Restores stock |
| `ReconcilePayment` | Reconciler Job → Payment Service | Scheduled, every 5 min | Resolves PENDING_RECONCILE payments |

---

## Domain Events (asynchronous — SQS)

### ReservationCreated
| Field | Value |
|-------|-------|
| **Owner / Publisher** | Inventory Service (via outbox) |
| **Consumers** | Notification Service |
| **Trigger** | `inventory_reservation` row inserted with `status=RESERVED` |
| **Payload** | `{ reservation_id, customer_id, sale_id, product_id, expires_at }` |
| **Consumer action** | Notification: send "Your spot is reserved — complete checkout within 10 minutes" |

---

### ReservationExpired
| Field | Value |
|-------|-------|
| **Owner / Publisher** | Inventory Service / Expiry Sweeper (via outbox) |
| **Consumers** | Notification Service |
| **Trigger** | Sweeper transitions `status → RELEASED` |
| **Payload** | `{ reservation_id, customer_id, sale_id, expired_at }` |
| **Consumer action** | Notification: send "Your reservation expired" |

---

### PaymentSucceeded
| Field | Value |
|-------|-------|
| **Owner / Publisher** | Payment Service (via outbox) |
| **Consumers** | Order Service, Notification Service |
| **Trigger** | `payment` row inserted with `status=CONFIRMED` |
| **Payload** | `{ payment_id, order_id, customer_id, amount, gateway_ref, confirmed_at }` |
| **Consumer actions** | Order Service: transition order `PAYMENT_PENDING → CONFIRMED`; Notification: send receipt |

---

### PaymentFailed
| Field | Value |
|-------|-------|
| **Owner / Publisher** | Payment Service (via outbox) |
| **Consumers** | Order Service, Inventory Service, Notification Service |
| **Trigger** | `payment` row inserted with `status=FAILED` |
| **Payload** | `{ payment_id, order_id, customer_id, failure_reason, failed_at }` |
| **Consumer actions** | Order Service: keep order `PAYMENT_PENDING` (buyer may retry); Inventory Service: release reservation; Notification: send "Payment failed" |

---

### OrderCreated
| Field | Value |
|-------|-------|
| **Owner / Publisher** | Order Service (via outbox) |
| **Consumers** | Shipment Service, Notification Service |
| **Trigger** | Order transitions to `CONFIRMED` |
| **Payload** | `{ order_id, customer_id, items, total, reservation_id, confirmed_at }` |
| **Consumer actions** | Shipment: create shipment record; Notification: send order confirmation |

---

### OrderShipped
| Field | Value |
|-------|-------|
| **Owner / Publisher** | Shipment Service (via outbox) |
| **Consumers** | Order Service, Notification Service |
| **Trigger** | `shipment.status` set to `DISPATCHED` |
| **Payload** | `{ shipment_id, order_id, customer_id, tracking_number, carrier, shipped_at }` |
| **Consumer actions** | Order Service: transition `PROCESSING → SHIPPED`; Notification: send tracking info |

---

## Event Envelope Format (SQS message body)

```json
{
  "event_id":      "uuid",
  "event_type":    "PaymentSucceeded",
  "aggregate_type": "payment",
  "aggregate_id":  "uuid",
  "version":       1,
  "published_at":  "2026-10-05T10:05:00Z",
  "payload": { }
}
```

Consumers check `event_id` against a processed-events store to deduplicate.

---

## DLQ Policy

| Queue | `maxReceiveCount` | DLQ retention |
|-------|-------------------|---------------|
| All SQS queues | 3 | 14 days |

Messages in the DLQ are **never auto-deleted** until ops team inspects and either replays or discards them.
