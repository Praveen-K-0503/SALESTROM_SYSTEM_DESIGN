# ADR-002: Database — PostgreSQL vs NoSQL

**Date:** 2026-10-05  
**Status:** Accepted

---

## Context

SALESTORM manages 15 entity types with complex relationships: inventory ↔ reservations ↔ orders ↔ payments ↔ outbox events. The system has three hard consistency requirements:

1. No oversell (`available_quantity` must never go negative).
2. No double charge (idempotency key must be unique per payment).
3. At-least-once event delivery (outbox event and business record must commit atomically).

All three require multi-table atomic writes — a capability that varies significantly across database families.

---

## Options Considered

### Option A — Amazon DynamoDB (NoSQL)

**Pros:** Horizontal write scale, single-digit ms reads, fully managed, no connection pools.  
**Cons:**
- No multi-table transactions in the general case (DynamoDB Transactions cover only 25 items within one account/region but adds significant latency).
- No foreign key constraints — referential integrity is application-enforced.
- No `CHECK` constraints — domain invariants require application-layer enforcement only.
- No SQL `JOIN` — querying reservation + inventory + order together requires multiple round trips or denormalisation.
- Schema flexibility is a liability here: enforcement of `available_quantity >= 0` cannot be delegated to the DB.

---

### Option B — MongoDB (Document NoSQL)

**Pros:** Flexible schema; document model can co-locate reservation + inventory in one document (avoids joins).  
**Cons:**
- Multi-document ACID transactions exist (since v4.0) but add write amplification and latency.
- No FK constraints; referential integrity is application-enforced.
- Aggregation pipelines replace SQL `JOIN` — more complex for relational queries.
- Less mature tooling for financial-grade audit and compliance.

---

### Option C — PostgreSQL (RDBMS) + Redis ✅ Chosen

**PostgreSQL** for all transactional data (source of truth).  
**Redis** for the inventory counter fast gate and idempotency cache.

**Pros:**
- Full ACID with multi-table transactions: `INSERT payment + INSERT outbox_event` in one `COMMIT` — atomic, no partial failure.
- `CHECK` constraints enforce `available_quantity >= 0`, `status IN (...)`, `amount > 0` at the DB tier, independent of application logic.
- `FOREIGN KEY` constraints enforce referential integrity: no orphaned payments, no reservations referencing non-existent inventory.
- `UNIQUE` constraint on `idempotency_key` prevents double-charge even under concurrent duplicate requests.
- Mature tooling: `EXPLAIN ANALYZE`, `pg_stat_activity`, logical replication, `pg_dump`.
- RDS Multi-AZ: synchronous standby replication, automatic failover.

**Cons:**
- Vertical scaling bottleneck: a single primary handles all writes. Horizontal write sharding is complex.
- Connection overhead: each ECS task holds a connection pool; connection count is bounded by RDS instance.
- At the current scale (100 units → ~100 concurrent SQL writers), these limits are not binding.

---

## Decision

**Option C.** PostgreSQL as the source of truth for all transactional data. Redis as the fast gate and cache layer.

---

## Consequences

| Aspect | Result |
|--------|--------|
| Consistency | DB-tier invariants enforced by CHECK, FK, UNIQUE — not just application code |
| Atomic events | Outbox + business record commit in one transaction |
| Write throughput | ~2,000–5,000 TPS on r6g.xlarge (sufficient for ≤ 200 concurrent inventory writers) |
| Read throughput | Read replicas serve status reads; Redis serves counter reads |
| Scalability ceiling | Write throughput bounded by single primary — revisit if units/sale > 10,000 |

## What This Decision Sacrifices

**Horizontal write scalability.** If a future sale has 100,000 units with proportional concurrent write throughput, a single PostgreSQL primary will become a bottleneck. At that scale, we would revisit write sharding (by `sale_id`) or adopt a distributed RDBMS (e.g., CockroachDB, Aurora Limitless). For v1 (≤ 10,000 units, bounded by the gate), PostgreSQL is sufficient.
