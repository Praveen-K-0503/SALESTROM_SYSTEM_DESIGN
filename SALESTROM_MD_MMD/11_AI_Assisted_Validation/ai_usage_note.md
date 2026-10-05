# AI Usage Note — SALESTORM

**Team:** SALESTORM_TEAM_NAME  
**Submission date:** 2026-10-05

---

## Tool Used

**Antigravity** — AI coding assistant developed by Google DeepMind.  
Used within the Antigravity IDE during the hackathon session.

---

## What the Tool Was Used For

| Task | AI involvement |
|------|---------------|
| Architecture diagrams (Mermaid) | Drafted context, container, component, and deployment diagrams from team-provided specifications |
| LLD diagrams | Drafted class diagrams, sequence diagrams, and state machine diagrams based on team-defined interfaces and state transitions |
| Documentation | Drafted `requirements.md`, `hld.md`, `lld.md`, `database.md`, `security.md`, `observability.md`, `scalability.md`, `reliability.md`, `solid.md`, `patterns.md`, `events.md` |
| OpenAPI specification | Generated `openapi.yaml` from team-specified endpoints, request/response shapes, and error codes |
| ADR documents | Drafted all five ADRs from team-provided decision context, options, and rationale |
| SQL schema | Generated `schema.sql` from team-specified entity list, constraints, and indexing requirements |
| Simulation script | Generated `simulation.py` from team-specified scenario parameters (users, units, payment rates, outage scenario) |

---

## What the Team Did

The team made **all design decisions** before and during the session. The AI assisted with drafting and formatting only.

Specific team-owned decisions (not suggested by AI):
- Redis Lua atomic decrement as the fast gate; SQL conditional update as the source of truth
- Reservation TTL of 10 minutes with an expiry sweeper
- Idempotency key defined as (customer_id + sale_id + product_id) with a unique DB constraint
- Payment retry strategy: exponential backoff with jitter, 3 attempts, then PENDING_RECONCILE
- Transactional outbox + SQS + DLQ for reliable event delivery
- Reservation state machine: AVAILABLE → RESERVED → PAYMENT_PENDING → CONFIRMED / RELEASED
- Order state machine: CREATED → PAYMENT_PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED / CANCELLED
- Waiting room + per-IP and per-user rate limiting at the CDN/edge layer
- All service boundaries, API contracts, and database schema design

---

## Validation Statement

The team reviewed and validated all AI-generated output against the design decisions listed above. Diagrams were verified for consistency with the written specifications. The simulation script was reviewed for correctness against the intended failure scenarios. No AI-generated content was accepted without team review.

Any inconsistency between AI-drafted documents and the team's stated design decisions was resolved in favour of the stated decisions.
