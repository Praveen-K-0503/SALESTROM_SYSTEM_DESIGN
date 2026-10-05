# ADR-001: Inventory Gate — Redis Lua + SQL Conditional UPDATE vs Alternatives

**Date:** 2026-10-05  
**Status:** Accepted

---

## Context

At sale launch, up to 10,000 buyers simultaneously attempt to decrement the same inventory row for `(sale_id, product_id)`. The system must guarantee:
1. Zero oversell (never sell more units than stock).
2. Sub-200ms p99 latency for the reserve endpoint.
3. Correct behaviour under concurrent requests, partial failures, and Redis restarts.

---

## Options Considered

### Option A — Pessimistic Locking (`SELECT FOR UPDATE`)

```sql
BEGIN;
  SELECT available_quantity FROM inventory
  WHERE sale_id = ? AND product_id = ?
  FOR UPDATE;                        -- row locked for full transaction
  
  UPDATE inventory SET available_quantity = available_quantity - 1
  WHERE available_quantity >= 1;
  
  INSERT INTO inventory_reservation (...);
COMMIT;
```

**Pros:** Simple, guaranteed correct.  
**Cons:** Row lock is held for the full transaction duration (typically 10–50 ms including network RTT). Under 10,000 concurrent writers, lock queue depth → ~10,000. Most requests wait for minutes. Throughput collapses to ~20-50 TPS for this one row.

---

### Option B — Optimistic Locking (Version Column CAS)

```sql
UPDATE inventory
SET available_quantity = available_quantity - 1,
    version = version + 1
WHERE sale_id = ? AND product_id = ?
  AND version = :current_version
  AND available_quantity >= 1;
-- 0 rows = conflict → retry with fresh version
```

**Pros:** No lock held. Works well at low contention.  
**Cons:** Under high contention (10,000 concurrent writers, 1 hot row), the probability that any given write succeeds without conflict is ~1/10,000. Retry rate approaches 100%. Retrying amplifies load: 10,000 initial attempts → 100,000 total DB round-trips. Thundering herd.

---

### Option C — Redis Lua Gate + SQL Conditional UPDATE ✅ Chosen

```lua
-- Redis Lua (atomic, no race condition within Redis)
local count = redis.call('GET', KEYS[1])
if tonumber(count) > 0 then
    redis.call('DECR', KEYS[1])
    return 1
else
    return 0
end
```

```sql
-- SQL (source of truth, safety net)
UPDATE inventory
SET available_quantity = available_quantity - 1,
    version = version + 1
WHERE sale_id = ? AND product_id = ?
  AND available_quantity >= 1;
-- 0 rows → rollback Redis (INCR)
```

**Pros:**
- Redis rejects ~99% of requests in < 1ms. SQL sees ≤ unit-count concurrent writers (100, not 10,000).
- No DB lock held — SQL UPDATE acquires a brief row lock only for the UPDATE operation itself, not across a full transaction.
- SQL remains the source of truth. Even if Redis drifts, `available_quantity >= 1` prevents oversell.

**Cons:**
- Two-phase write: Redis and SQL can diverge if Redis restarts or crashes between operations.
- Requires explicit rollback logic (INCR Redis when SQL returns 0 rows).
- Requires warm-up: on Redis restart, counter must be reloaded from SQL before accepting requests.

---

## Decision

**Option C.** Redis Lua gate as a high-throughput fast path; SQL conditional UPDATE as the definitive gate.

---

## Consequences

| Aspect | Result |
|--------|--------|
| Throughput | Redis handles 200,000+ ops/sec; SQL sees bounded concurrent writers |
| Latency p99 | < 5ms for rejected requests (Redis path); < 200ms end-to-end |
| Correctness | SQL guarantees no oversell even if Redis drifts |
| Complexity | Two-phase write; rollback path; warm-up on restart |
| Failure mode | Redis failure → fall through to SQL-only (slower, still correct) |

## What This Decision Sacrifices

**Simplicity.** Option A (pessimistic lock) requires five lines of SQL and is trivially correct. We trade that simplicity for the ability to handle 10,000 concurrent buyers without DB lock queue collapse. If the sale had fewer than 50 concurrent buyers, pessimistic locking would be sufficient and preferable.
