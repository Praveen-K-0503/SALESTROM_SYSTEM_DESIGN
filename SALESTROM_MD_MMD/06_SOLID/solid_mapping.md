# SOLID Principles — SALESTORM Mapping

## S — Single Responsibility Principle
> *Each class/service has one reason to change.*

| Component | Responsibility | Violation Avoided |
|-----------|---------------|-------------------|
| `InventoryService` | Only manages stock decrement/increment | Does NOT handle payment or orders |
| `ExpirySweeper` | Only sweeps expired reservations | Separate from reservation creation logic |
| `PaymentGatewayClient` | Only wraps external gateway HTTP calls | Business logic stays in `PaymentService` |
| `OutboxWorker` | Only polls and publishes outbox rows | Does not own event schema or consumers |
| `OrderEventConsumer` | Only maps SQS events to order state changes | Does not own payment logic |

---

## O — Open/Closed Principle
> *Open for extension, closed for modification.*

| Component | How it's OCP |
|-----------|-------------|
| `PaymentGatewayClient` | Abstract base class; swap Stripe → Razorpay by adding a subclass, not modifying core |
| `NotificationService` | Strategy interface; add WhatsApp channel without touching Email/SMS logic |
| `CircuitBreaker` | State machine with pluggable callbacks; new states added without changing call sites |

```python
# OCP Example — Payment Gateway
class BaseGatewayClient(ABC):
    @abstractmethod
    def charge(self, key: str, amount: Decimal, token: str) -> GatewayResponse: ...

class StripeClient(BaseGatewayClient):
    def charge(self, key, amount, token): ...   # Stripe-specific

class RazorpayClient(BaseGatewayClient):
    def charge(self, key, amount, token): ...   # Razorpay-specific
```

---

## L — Liskov Substitution Principle
> *Subtypes must be substitutable for their base types.*

| Scenario | Application |
|----------|-------------|
| `StripeClient` / `RazorpayClient` both extend `BaseGatewayClient` | `PaymentService` uses `BaseGatewayClient`; swapping providers requires zero changes |
| `InMemoryReservationRepo` (test) extends `ReservationRepository` | Unit tests swap real DB repo without breaking service logic |

---

## I — Interface Segregation Principle
> *Clients should not depend on interfaces they don't use.*

| Split | Instead of... |
|-------|--------------|
| `IInventoryReader` (get, count) vs `IInventoryWriter` (decrement, increment) | One fat `IInventory` interface |
| `IOrderQuery` (get, list) vs `IOrderCommand` (create, advance) | One fat `IOrder` |

Services that only read inventory depend on `IInventoryReader`; sweeper depends on `IInventoryWriter`.

---

## D — Dependency Inversion Principle
> *High-level modules depend on abstractions, not concretions.*

```python
# PaymentService depends on abstractions
class PaymentService:
    def __init__(
        self,
        gateway: BaseGatewayClient,      # abstraction
        repo: PaymentRepository,          # abstraction
        circuit_breaker: CircuitBreaker,  # abstraction
    ): ...
```

- `PaymentService` never imports `StripeClient` directly.
- All dependencies injected at startup (DI container / FastAPI `Depends()`).
