# SALESTORM — System Design Submission

**Hackathon:** System Design Hackathon  
**Team:** SALESTORM_TEAM_NAME  
**Date:** 2026-10-05

---

## Project Overview

SALESTORM is a flash-sale platform designed to sell **100 units** to **10,000 concurrent buyers** with:
- **Zero oversell** — no unit sold more than once, under any failure condition
- **Reliable payment processing** — idempotent charges, retry with backoff, circuit breaker, reconciliation on timeout
- **Resilient order processing** — transactional outbox + SQS ensures Order Service recovers from a 30-second outage without data loss
- **Edge-first traffic shaping** — waiting room + rate limiting absorbs 500,000 req/sec burst before it reaches any service

Core traffic flow:
```
Buyer → CDN/WAF → Waiting Room → Load Balancer → API Gateway
  → Inventory Service (Redis gate + SQL truth)
  → Checkout Service
  → Payment Service (idempotent, circuit breaker)
  → Order Service (event-driven, recoverable)
  → Shipment Service → Notification Service
```

---

## Folder Guide

| Folder | Contents |
|--------|----------|
| [`01_Requirements/`](./01_Requirements/) | Functional and non-functional requirements, constraints |
| [`02_HLD/`](./02_HLD/) | High-level architecture: context, container, component, deployment diagrams |
| [`03_LLD/`](./03_LLD/) | Class diagrams, sequence diagrams, state machines |
| [`04_Database/`](./04_Database/) | ER diagram, PostgreSQL schema (`schema.sql`), transaction boundary documentation |
| [`05_API/`](./05_API/) | OpenAPI 3.0 specification, events and commands catalogue |
| [`06_SOLID/`](./06_SOLID/) | SOLID principles applied to real classes in this system |
| [`07_Design_Patterns/`](./07_Design_Patterns/) | 8 design patterns with problem, usage, trade-off, and extension guide |
| [`08_Scalability_Reliability/`](./08_Scalability_Reliability/) | Traffic absorption, bottleneck analysis, failure recovery, retry/DLQ policy |
| [`09_Security_Observability/`](./09_Security_Observability/) | JWT auth, RBAC, TLS, rate limiting, metrics, tracing, alert runbooks |
| [`10_ADR/`](./10_ADR/) | Five architectural decision records |
| [`11_AI_Assisted_Validation/`](./11_AI_Assisted_Validation/) | Simulation script, results, AI usage note |
| [`12_Presentation/`](./12_Presentation/) | Presentation slide deck (`presentation.md`) |
| [`web_app/`](./web_app/) | Full-stack interactive Light Theme web application & stress test console |

---

## ⚡ Interactive Web Application (Live Demonstration)

A full-stack, light-themed web application is included to demonstrate the live system architecture, inventory reservation pipeline, outbox worker, chaos resilience, and the 10,000-user concurrency stress test.

### Features
1. **Light Theme Storefront & Checkout**: Real-time product cards, stock meter, 10-minute reservation countdown timer, and simulated payment gateway (normal, card failure, gateway timeout, duplicate click).
2. **10,000-User Stress Test Lab**: One-click execution of 10,000 concurrent purchase attempts for 100 units, live animated counters for Redis Fast Gate drops, SQL conditional writes, duplicate prevention, and zero-oversell proof.
3. **Chaos & Fault Tolerance Lab**: Test downstream Order Service outage for 30 seconds; observe the Transactional Outbox buffer events and automatically drain & reconcile without lost orders once service recovers. Interactive Circuit Breaker trip and reset.
4. **Deliverables Explorer**: Interactive browser to read and inspect all 21 hackathon system design documents, sequence diagrams, and architecture blueprints.
5. **Real-time Telemetry Terminal**: Live log stream of every Redis, SQL, Outbox, and Sweeper event.

### How to Run the Web Application
```bash
# From workspace root:
py run_app.py

# Or directly from SALESTROM_MD_MMD/:
py SALESTROM_MD_MMD/run_app.py
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in any modern browser.

---

## Mandatory Deliverables

| Deliverable | File(s) |
|-------------|---------|
| Functional requirements | [`01_Requirements/requirements.md`](./01_Requirements/requirements.md) |
| Non-functional requirements | [`01_Requirements/requirements.md`](./01_Requirements/requirements.md) |
| System context diagram | [`02_HLD/01_context.mmd`](./02_HLD/01_context.mmd) |
| Container diagram | [`02_HLD/02_container.mmd`](./02_HLD/02_container.mmd) |
| Component diagram | [`02_HLD/03_component.mmd`](./02_HLD/03_component.mmd) |
| Deployment diagram | [`02_HLD/04_deployment.mmd`](./02_HLD/04_deployment.mmd) |
| HLD narrative | [`02_HLD/hld.md`](./02_HLD/hld.md) |
| Class diagrams (3) | [`03_LLD/01_class_inventory.mmd`](./03_LLD/01_class_inventory.mmd), [`02_class_payment.mmd`](./03_LLD/02_class_payment.mmd), [`03_class_order.mmd`](./03_LLD/03_class_order.mmd) |
| Sequence diagrams (3) | [`03_LLD/04_seq_reservation.mmd`](./03_LLD/04_seq_reservation.mmd), [`05_seq_payment.mmd`](./03_LLD/05_seq_payment.mmd), [`06_seq_order_recovery.mmd`](./03_LLD/06_seq_order_recovery.mmd) |
| State machine diagrams (2) | [`03_LLD/07_state_reservation.mmd`](./03_LLD/07_state_reservation.mmd), [`08_state_order.mmd`](./03_LLD/08_state_order.mmd) |
| LLD narrative | [`03_LLD/lld.md`](./03_LLD/lld.md) |
| ER diagram | [`04_Database/er_diagram.mmd`](./04_Database/er_diagram.mmd) |
| SQL schema | [`04_Database/schema.sql`](./04_Database/schema.sql) |
| Database narrative | [`04_Database/database.md`](./04_Database/database.md) |
| OpenAPI specification | [`05_API/openapi.yaml`](./05_API/openapi.yaml) |
| Events and commands catalogue | [`05_API/events.md`](./05_API/events.md) |
| SOLID principles | [`06_SOLID/solid.md`](./06_SOLID/solid.md) |
| Design patterns | [`07_Design_Patterns/patterns.md`](./07_Design_Patterns/patterns.md) |
| Scalability analysis | [`08_Scalability_Reliability/scalability.md`](./08_Scalability_Reliability/scalability.md) |
| Reliability and recovery | [`08_Scalability_Reliability/reliability.md`](./08_Scalability_Reliability/reliability.md) |
| Security | [`09_Security_Observability/security.md`](./09_Security_Observability/security.md) |
| Observability | [`09_Security_Observability/observability.md`](./09_Security_Observability/observability.md) |
| ADR — Redis gate vs alternatives | [`10_ADR/ADR-001-redis-gate.md`](./10_ADR/ADR-001-redis-gate.md) |
| ADR — SQL vs NoSQL | [`10_ADR/ADR-002-sql-vs-nosql.md`](./10_ADR/ADR-002-sql-vs-nosql.md) |
| ADR — Sync vs async | [`10_ADR/ADR-003-sync-vs-async.md`](./10_ADR/ADR-003-sync-vs-async.md) |
| ADR — Cache strategy | [`10_ADR/ADR-004-cache-strategy.md`](./10_ADR/ADR-004-cache-strategy.md) |
| ADR — Outbox vs direct calls | [`10_ADR/ADR-005-outbox-vs-direct-calls.md`](./10_ADR/ADR-005-outbox-vs-direct-calls.md) |
| Simulation script | [`11_AI_Assisted_Validation/simulation.py`](./11_AI_Assisted_Validation/simulation.py) |
| Simulation README | [`11_AI_Assisted_Validation/README.md`](./11_AI_Assisted_Validation/README.md) |
| AI usage note | [`11_AI_Assisted_Validation/ai_usage_note.md`](./11_AI_Assisted_Validation/ai_usage_note.md) |

---

## Key Design Decisions (Quick Reference)

| Decision | Choice |
|----------|--------|
| Inventory gate | Redis Lua atomic decrement (fast) + SQL `available_quantity >= 1` (truth) |
| Reservation TTL | 10 minutes; expiry sweeper runs every 30 s |
| Idempotency | SHA256(customer_id ‖ sale_id ‖ product_id) with DB `UNIQUE` constraint |
| Payment | Idempotent gateway call + 3-retry exponential backoff + circuit breaker + reconcile on timeout |
| Event delivery | Transactional outbox + SQS + DLQ (at-least-once; idempotent consumers) |
| Traffic shaping | Cloudflare waiting room + per-IP CDN rate limit + per-user API Gateway rate limit |
| Database | PostgreSQL (ACID, FK, CHECK) + Redis (counter cache) |
| Async boundary | Reserve/pay/order-create are synchronous; shipment and notifications are asynchronous |
