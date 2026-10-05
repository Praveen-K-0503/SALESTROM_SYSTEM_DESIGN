# ADR-003: Synchronous vs Asynchronous Processing

**Date:** 2026-10-05  
**Status:** Accepted

---

## Context

The checkout flow spans multiple services: Inventory → Payment → Order → Shipment → Notification. A buyer submits one HTTP request and expects a clear result: "Did I get the item? Was I charged?" The system must decide which steps block the buyer's response and which run in the background.

There are two failure dimensions to manage:
1. **Upstream failure** (buyer's request fails midway) — needs compensation.
2. **Downstream failure** (post-confirmation service fails) — must not affect the buyer's confirmed purchase.

---

## Options Considered

### Option A — All Synchronous

Checkout blocks until shipment is created and notification is sent before returning 200.

**Pros:** Simple linear flow; easy to reason about.  
**Cons:**
- A notification provider outage would fail the buyer's checkout — unacceptable coupling.
- A shipment service restart would block all checkouts for 30 seconds.
- p99 latency becomes the sum of all service latencies (reserve + pay + order + ship + notify) — easily > 10 seconds.
- Not viable.

---

### Option B — All Asynchronous

Buyer submits checkout; system queues everything and buyer polls for result.

**Pros:** Maximum decoupling; each service fails independently.  
**Cons:**
- Buyer cannot know immediately whether their payment was accepted or declined.
- Polling UI is poor UX for a time-critical flash sale.
- Reservation TTL is 10 minutes; if async queue backs up, payment may be attempted after TTL.
- Not viable for the critical path.

---

### Option C — Hybrid: Synchronous Critical Path, Async Post-Confirmation ✅ Chosen

**Synchronous (blocks buyer response):**
1. Inventory reserve (Redis + SQL) — buyer must know immediately if they got a slot.
2. Payment charge — buyer must know immediately if their card was accepted.
3. Order creation — buyer needs an `order_id` in the response.

**Asynchronous (via outbox → SQS, after buyer response is sent):**
4. Shipment record creation — warehouse can process within minutes.
5. Email / SMS notification — can lag seconds without UX impact.
6. Order status advances (PROCESSING → SHIPPED → DELIVERED) — driven by events over hours/days.

---

## Decision

**Option C.** Hybrid processing. The buyer's HTTP response covers reserve + pay + order create. All downstream fulfilment and notification is asynchronous.

---

## Consequences

| Step | Mode | Why |
|------|------|-----|
| Reserve | Sync | Must tell buyer immediately: got stock or sold out |
| Pay | Sync | Must tell buyer: charged or declined (or 202 pending) |
| Order create | Sync | Buyer needs order_id; needed before response |
| Shipment | Async | Warehouse processes later; does not affect purchase confirmation |
| Notification | Async | Email/SMS can lag; failure must not block checkout |
| Order status updates | Async | Time-scales of hours; event-driven is natural |

**Failure isolation:** If the notification service is down for hours, zero checkouts are affected. The NotificationService retries from its SQS queue when it recovers.

**Eventual consistency:** A buyer checking their order status page immediately after checkout may see `PAYMENT_PENDING` for 1–2 seconds before the async event is consumed by OrderService and status advances to `CONFIRMED`. This is acceptable and communicated in the UI.

## What This Decision Sacrifices

**Strong consistency in downstream views.** The buyer's order status is eventually consistent after the checkout response. A buyer who immediately checks `GET /orders/{id}` may briefly see a stale status. If strong consistency is required end-to-end (e.g., regulatory), the order-creation step would need to wait for a synchronous `OrderConfirmed` acknowledgement — at the cost of coupling OrderService into the checkout latency.
