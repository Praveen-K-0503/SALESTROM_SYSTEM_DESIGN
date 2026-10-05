# ADR-004: Cache Strategy — Redis as Approximate Fast Gate with Explicit Warm-Up

**Date:** 2026-10-05  
**Status:** Accepted

---

## Context

The inventory counter (`available_quantity`) must be:
- **Readable** at up to 500,000 req/sec at the edge (the "is there stock?" question).
- **Writeable** atomically under ~10,000 concurrent decrement attempts at sale start.
- **Accurate enough** that it never causes oversell, even if it is occasionally pessimistic (wrongly reporting 0 when stock exists).

PostgreSQL cannot serve 500,000 reads/sec on a single integer column. A caching strategy is required.

---

## Options Considered

### Option A — Cache-Aside (Lazy Loading)

Read from Redis; on miss, read PostgreSQL; write to PostgreSQL and invalidate cache on update.

**Pros:** Simple; cache is only populated on demand.  
**Cons:** At sale start, all 500,000 buyers simultaneously miss the cache (cold start). All miss and hit PostgreSQL simultaneously — thundering herd. Exactly the scenario we must avoid.

---

### Option B — Write-Through

Every write to PostgreSQL also writes to Redis synchronously (within the same operation).

**Pros:** Cache always consistent with DB.  
**Cons:** Every reservation write incurs two synchronous writes (DB + Redis) before returning. Adds ~1ms latency per write. More importantly, this approach doesn't give us the fast-gate property — we still need to do a DB write before updating the cache, so we cannot use the cache to reject early.

---

### Option C — Read-Through

Cache fronts DB for reads; writes go directly to DB; cache is updated on read miss.

**Pros:** Reads served from cache after first access.  
**Cons:** Same thundering herd problem as cache-aside on cold start. Cache misses under high concurrency produce a read stampede on the DB.

---

### Option D — Redis as Pre-Loaded Fast Gate with Explicit Warm-Up ✅ Chosen

At sale activation (before accepting buyer requests):
```
MSET inv:{sale_id}:{product_id} = available_quantity  (from DB)
```

Redis is the **first gate** (fast, approximate). SQL is the **second gate** (slow, definitive).

On every reservation attempt:
1. `EVAL lua_decrement(...)` → if 0, reject immediately (fast path, no DB).
2. If 1, do SQL `UPDATE ... WHERE available_quantity >= 1`.
3. If SQL returns 0 rows → `INCR` Redis (rollback).

On Redis restart:
1. Inventory Service detects Redis unavailable (health check).
2. Warm-up job re-loads counter from DB: `SET inv:... = (SELECT available_quantity ...)`.
3. Service switches back to Redis gate.

---

## Decision

**Option D.** Redis pre-loaded fast gate with explicit warm-up and SQL safety net.

---

## Consequences

| Aspect | Result |
|--------|--------|
| Read throughput | Redis: ~200,000 ops/sec per shard; handles burst |
| Write throughput | Redis atomic Lua: ~100,000 ops/sec per shard |
| Cache miss storm | Eliminated (pre-loaded at sale activation) |
| Consistency | Redis may briefly over-report available stock (drift). SQL prevents any oversell. |
| Failure | Redis unavailable → warm-up from DB → SQL-only mode during gap |
| Complexity | Warm-up job required; rollback (INCR) required on SQL failure |

## What This Decision Sacrifices

**Cache simplicity.** A standard cache-aside pattern requires no warm-up job and no rollback logic. We sacrifice that simplicity for the guarantee that the cache is never cold at the most critical moment (T=0 of the flash sale). We also accept that Redis and SQL can briefly disagree by a few units — the SQL gate ensures this disagreement never produces oversell.
