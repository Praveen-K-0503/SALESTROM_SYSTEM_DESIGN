# SOLID Principles — SALESTORM

All class references map directly to the diagrams in `03_LLD/`.

---

## S — Single Responsibility Principle
> *A class has one reason to change.*

| Class | Its one responsibility | What it does NOT do |
|-------|------------------------|---------------------|
| `RedisInventoryGate` | Atomic Redis check-and-decrement via Lua | Does not know about SQL, reservations, or business rules |
| `ExpirySweeper` | Find expired `RESERVED` rows and release stock | Does not create reservations or process payments |
| `CircuitBreakerDecorator` | Track failure rate and open/close the circuit | Does not build requests or parse gateway responses |
| `SqlOutboxRepository` | Write `outbox_event` rows to the DB | Does not publish to SQS or know what the event means |
| `OrderStateMachine` | Validate and apply order status transitions | Does not persist to DB or publish events |
| `ReconcilerJob` | Resolve `PENDING_RECONCILE` payments by querying the gateway | Does not process new payments or create orders |

**Violation to avoid:** putting Redis logic + SQL logic + reservation creation all in one `InventoryManager` god class. We split them into `RedisInventoryGate`, `SqlInventoryRepository`, and `InventoryService` (which orchestrates them).

---

## O — Open/Closed Principle
> *Open for extension; closed for modification.*

**`IPaymentGateway` interface + concrete gateways**

```python
class IPaymentGateway(ABC):
    @abstractmethod
    def charge(self, key: str, amount: Decimal, token: str) -> GatewayResponse: ...
    @abstractmethod
    def query_status(self, gateway_ref: str) -> GatewayResponse: ...

class StripeGateway(IPaymentGateway): ...    # existing
class RazorpayGateway(IPaymentGateway): ...  # new provider — no change to PaymentService
```

`PaymentService`, `CircuitBreakerDecorator`, and `ReconcilerJob` all depend on `IPaymentGateway`. Adding a new gateway provider requires **zero changes** to these classes.

**Also applies to:** `IOrderEventPublisher` — adding a new notification channel (WhatsApp) means adding a new `WhatsAppOrderEventPublisher` class, not editing `OrderService`.

---

## L — Liskov Substitution Principle
> *Subtypes must be fully substitutable for their base type.*

| Base type | Substitutable implementations | Substituted in |
|-----------|------------------------------|----------------|
| `IPaymentGateway` | `StripeGateway`, `RazorpayGateway`, `CircuitBreakerDecorator` | `PaymentService.__init__` |
| `IInventoryGate` | `RedisInventoryGate` (or an `InMemoryGate` for tests) | `InventoryService.__init__` |
| `IOrderRepository` | `SqlOrderRepository` (prod), `InMemoryOrderRepository` (test) | `OrderService.__init__` |

**`CircuitBreakerDecorator` as a gateway substitute:** it implements `IPaymentGateway` and wraps another `IPaymentGateway`. `PaymentService` never knows whether the circuit breaker is present — the wrapped version is behaviourally identical from the caller's perspective.

**Violation to avoid:** a subclass that overrides `charge()` to throw an exception unconditionally or return a different type — this would break every caller that relies on the `IPaymentGateway` contract.

---

## I — Interface Segregation Principle
> *Clients should not be forced to depend on methods they do not use.*

**Split: `IInventoryGate` vs `IInventoryRepository`**

```python
class IInventoryGate:          # Redis operations only
    def decrement(...)
    def increment(...)
    def get_count(...)

class IInventoryRepository:    # SQL operations only
    def conditional_decrement(...)
    def conditional_increment(...)
```

`ExpirySweeper` only needs `IInventoryGate.increment()` and `IInventoryRepository.conditional_increment()`. It does not need `get_count()` or any write path beyond increment. Splitting the interfaces means `ExpirySweeper` depends on the smallest possible surface.

**Split: `IOrderRepository` vs `IOrderEventPublisher`**

`OrderEventConsumer` uses `OrderService`, which separates query/write (`IOrderRepository`) from event emission (`IOrderEventPublisher`). A read-only consumer never accidentally calls publish.

---

## D — Dependency Inversion Principle
> *High-level modules depend on abstractions. Low-level modules implement them.*

```python
# HIGH-LEVEL: PaymentService — depends only on abstractions
class PaymentService:
    def __init__(
        self,
        gateway:      IPaymentGateway,    # not StripeGateway
        payment_repo: IPaymentRepository, # not SqlPaymentRepository
        outbox_repo:  IOutboxRepository,  # not SqlOutboxRepository
    ): ...

# HIGH-LEVEL: InventoryService — depends only on abstractions
class InventoryService:
    def __init__(
        self,
        gate:        IInventoryGate,        # not RedisInventoryGate
        inv_repo:    IInventoryRepository,  # not SqlInventoryRepository
        res_repo:    IReservationRepository,
    ): ...
```

Concrete classes (`StripeGateway`, `RedisInventoryGate`, `SqlPaymentRepository`) are **constructed once at startup** by a DI container (FastAPI `Depends()`) and injected. No service ever calls `import StripeGateway` inside its business logic.

**Benefit:** swapping Stripe → Razorpay in production is a config change; swapping SQL repo → in-memory repo in tests is a constructor argument.
