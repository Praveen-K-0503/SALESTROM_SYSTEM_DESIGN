# Design Patterns — SALESTORM

Each entry: **Problem → Where used → Trade-off → How to add a new payment provider.**

---

## 1. Strategy
**Problem:** The system must support multiple payment gateways (Stripe, Razorpay) interchangeably without coupling business logic to any specific provider.

**Where used:** `IPaymentGateway` is the strategy interface. `StripeGateway` and `RazorpayGateway` are concrete strategies. `PaymentService` accepts `IPaymentGateway` and calls `charge()` without knowing the implementation.

**Trade-off:** Adds an abstraction layer and interface definition overhead. Worth it because the gateway is the most likely point of change (cost, geography, reliability).

**Adding a new provider:**
1. Create `RazorpayGateway(IPaymentGateway)` implementing `charge()` and `query_status()`.
2. Register `"razorpay"` in `GatewayClientFactory`.
3. Set env var `PAYMENT_PROVIDER=razorpay`.
4. Zero changes to `PaymentService`, `CircuitBreakerDecorator`, `ReconcilerJob`, or any test.

---

## 2. Factory
**Problem:** `PaymentService` should not contain `if provider == "stripe": ... elif provider == "razorpay": ...` construction logic.

**Where used:** `GatewayClientFactory.create(provider: str) -> IPaymentGateway`. Reads config and returns the correct concrete gateway, already wrapped in `CircuitBreakerDecorator`.

**Trade-off:** One extra class to maintain. Centralises all construction logic so adding a provider is a single-file change.

**Adding a new provider:** Add one `elif` branch in `GatewayClientFactory.create()`. No other file changes.

---

## 3. State
**Problem:** Order and reservation status transitions must be enforced — e.g., a `DELIVERED` order cannot go back to `PROCESSING`. Ad-hoc `if current_status == X` checks scattered across the codebase become inconsistent.

**Where used:**
- `OrderStateMachine.ALLOWED_TRANSITIONS: dict[OrderStatus, list[OrderStatus]]` defines the valid directed graph. `transition()` raises `InvalidTransitionError` if the edge does not exist.
- `ReservationStatus` enum defines the valid states; transition logic lives in `InventoryService` and `ExpirySweeper`.

**Trade-off:** Transition map must be kept in sync with the state diagram in `03_LLD`. Adding a new state requires updating the map and the diagram.

**Adding a new provider:** No direct impact — state machines are per-domain, not per-gateway.

---

## 4. Observer
**Problem:** After a payment succeeds, multiple downstream services (Order, Notification) must react — but `PaymentService` should not call them directly, as that creates tight coupling and synchronous blast radius.

**Where used:** `PaymentService` writes a `PaymentSucceeded` event to `outbox_event` (the "subject"). `OrderEventConsumer` and Notification consumer are "observers" that react when SQS delivers the event. Neither knows about the other.

**Trade-off:** Observers are decoupled but the event schema becomes an implicit contract. Changes to the `PaymentSucceeded` payload require coordinating all consumers.

**Adding a new provider:** A new gateway publishing a different event shape requires adding an adapter before publishing to the outbox, not changing consumers.

---

## 5. Adapter
**Problem:** Stripe and Razorpay return completely different JSON response shapes. Internal code should work with a single, normalised `GatewayResponse`.

**Where used:** `StripeGateway.charge()` maps Stripe's `PaymentIntent` response to `GatewayResponse(success, gateway_ref, failure_reason, timed_out)`. `RazorpayGateway.charge()` maps Razorpay's `Order` response to the same shape. `PaymentService` only ever sees `GatewayResponse`.

**Trade-off:** Each adapter must be maintained as the gateway's API evolves. Isolated to one file per gateway.

**Adding a new provider:** Write one adapter class mapping the new gateway's response to `GatewayResponse`. No changes elsewhere.

---

## 6. Repository
**Problem:** Services should not contain raw SQL. Swapping PostgreSQL for another DB or writing unit tests requires mocking at a clean boundary.

**Where used:**
- `IInventoryRepository` / `SqlInventoryRepository`
- `IReservationRepository` / `SqlReservationRepository`
- `IPaymentRepository` / `SqlPaymentRepository`
- `IOrderRepository` / `SqlOrderRepository`

Each interface has an in-memory implementation used in unit tests (not shipped to production).

**Trade-off:** Extra interface and class per domain table. Overhead is low and testability benefit is high.

**Adding a new provider:** Repository is DB-level; no impact on adding a gateway. If migrating from Postgres to another DB, only the `Sql*Repository` classes change.

---

## 7. Facade
**Problem:** A buyer's checkout involves three separate service calls: reserve stock, process payment, create order. The buyer's client should not orchestrate three API calls.

**Where used:** `CheckoutService` is the facade. The buyer calls `POST /checkout` once. `CheckoutService` internally calls `InventoryService.reserve()`, `PaymentService.process()`, and `OrderService.create()` in sequence, handling compensating actions on failure.

**Trade-off:** `CheckoutService` becomes an orchestrator — if requirements change, this is the first place to update. Must not leak internal service errors directly to the buyer without mapping them.

**Adding a new provider:** Checkout calls `PaymentService`, which owns the gateway. `CheckoutService` does not change.

---

## 8. Circuit Breaker
**Problem:** The payment gateway may become slow or error-prone. Without protection, every caller thread blocks on a 30-second timeout × thousands of concurrent requests = thread pool exhaustion and cascade failure.

**Where used:** `CircuitBreakerDecorator` wraps `IPaymentGateway`.

| State | Condition | Behaviour |
|-------|-----------|-----------|
| **CLOSED** | Normal | Calls forwarded; failure count tracked |
| **OPEN** | 5 failures in 10 s | Fail-fast: `CircuitOpenError` with no gateway call; returns 503 |
| **HALF-OPEN** | 30 s after OPEN | One probe call; CLOSED on success, OPEN again on failure |

**Trade-off:** Buyers get an immediate 503 instead of waiting. Some users during the OPEN window cannot complete payment — they see a "try again in 30 s" message. Acceptable: their reservation is still held.

**Adding a new provider:** `CircuitBreakerDecorator` wraps any `IPaymentGateway` implementation. A new gateway is automatically protected — no changes needed to the decorator.
