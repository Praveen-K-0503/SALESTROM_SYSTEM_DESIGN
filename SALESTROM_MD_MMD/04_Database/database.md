# Database Design — SALESTORM

Diagram: [er_diagram.mmd](./er_diagram.mmd) | Schema: [schema.sql](./schema.sql)

---

## 1. Entity Summary

| Entity | Role |
|--------|------|
| `CATEGORY` | Product taxonomy |
| `PRODUCT` | Catalogue item; base price, SKU |
| `SALE` | One flash sale for one product; defines price and unit count |
| `INVENTORY` | Per-sale stock counter; source of truth for `available_quantity` |
| `INVENTORY_RESERVATION` | One row per buyer per sale; holds idempotency key and TTL |
| `CUSTOMER` | Buyer identity and contact |
| `CART` / `CART_ITEM` | Pre-sale browsing state; not on the critical reservation path |
| `COUPON` | Optional discount applied at order creation |
| `ORDER` / `ORDER_ITEM` | Confirmed purchase record; drives fulfilment |
| `PAYMENT` | Gateway charge record; idempotency key enforces no double charge |
| `SHIPMENT` | One-to-one with order; carries tracking info |
| `NOTIFICATION` | Audit of every email/SMS sent |
| `OUTBOX_EVENT` | At-least-once async event delivery; written in same txn as business op |

---

## 2. Transaction Boundaries

### 2a. Reserve — two separate transactions

**Transaction 1 — SQL decrement (source of truth)**
```sql
BEGIN;
  UPDATE inventory
     SET available_quantity = available_quantity - 1,
         reserved_quantity  = reserved_quantity  + 1,
         version            = version + 1
   WHERE sale_id = ? AND product_id = ?
     AND available_quantity >= 1;      -- ← guard; 0 rows = no stock
  
  INSERT INTO inventory_reservation
    (customer_id, sale_id, product_id, inventory_id,
     idempotency_key, status, expires_at)
  VALUES (?, ?, ?, ?, ?, 'RESERVED', now() + interval '10 minutes');
COMMIT;
```
If `UPDATE` returns 0 rows, the transaction is rolled back and Redis is compensated (`INCR`).

**Redis (outside transaction)**  
The Lua decrement runs before the SQL transaction as a fast gate. It is not part of any DB transaction. Rollback is explicit (`INCR`).

---

### 2b. Payment — single atomic transaction

```sql
BEGIN;
  INSERT INTO payment
    (order_id, idempotency_key, amount, status, gateway_ref)
  VALUES (?, ?, ?, 'CONFIRMED', ?);

  INSERT INTO outbox_event
    (aggregate_type, aggregate_id, event_type, payload, status)
  VALUES ('payment', payment_id, 'PaymentSucceeded', ?, 'PENDING');
COMMIT;
```

Both rows are written or neither is. This is the **dual-write problem** solved atomically — the outbox row is created in the same commit as the payment row, so the event is never lost even if the Outbox Worker crashes immediately after.

---

### 2c. Expiry Sweep — per-reservation mini-transaction

```sql
BEGIN;
  UPDATE inventory_reservation
     SET status = 'RELEASED', updated_at = now()
   WHERE id = ? AND status = 'RESERVED';      -- optimistic lock: only if still RESERVED

  UPDATE inventory
     SET available_quantity = available_quantity + 1,
         reserved_quantity  = reserved_quantity  - 1,
         version            = version + 1
   WHERE id = ?;
COMMIT;
-- After commit:
INCR inv:{sale_id}:{product_id}   -- Redis compensation (outside txn)
```

The `AND status = 'RESERVED'` guard on the UPDATE means the sweeper is safe to re-run concurrently — only one sweeper thread wins; others update 0 rows and skip.

---

## 3. Where Consistency Is Guaranteed

| Invariant | Mechanism |
|-----------|-----------|
| `available_quantity >= 0` | `CHECK` constraint — DB rejects any update violating this |
| `available + reserved <= total` | `CHECK` constraint on `inventory` |
| No two successful reservations for the same `idempotency_key` | `UNIQUE (idempotency_key)` on `inventory_reservation` |
| No double charge for same key | `UNIQUE (idempotency_key)` on `payment` |
| At-least-once event delivery | `outbox_event` written in same DB txn; polled by Outbox Worker |
| Reservation status is a known value | `CHECK (status IN (...))` on `inventory_reservation` |
| Order status transitions are legal | Enforced in `OrderStateMachine` in application layer; DB `CHECK` enforces set membership |

---

## 4. Read vs Write Routing

| Operation | Target | Reason |
|-----------|--------|--------|
| Reserve / pay / order create | RDS Primary | Requires strong consistency and write |
| Order status read (`GET /orders/{id}`) | RDS Read Replica | High-volume, eventual consistency acceptable |
| Sale info read (`GET /sales/{id}/status`) | RDS Read Replica + Redis cache | Cacheable; stock counter served from Redis |
| Outbox polling | RDS Primary | Must see committed rows immediately |
| Sweeper queries | RDS Primary | Must not read stale replica data |

---

## 5. Key Indexes and Their Purpose

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_reservation_expiry` (partial, `status='RESERVED'`) | `inventory_reservation` | Sweeper query: only scans active reserved rows |
| `idx_payment_reconcile` (partial, `status='PENDING_RECONCILE'`) | `payment` | Reconciler finds pending rows without full-table scan |
| `idx_outbox_pending` (partial, `status='PENDING'`) | `outbox_event` | Outbox Worker polling: only unpublished rows |
| `idx_order_customer_status` | `order` | Buyer's order history page |
| `uq_reservation_idem` (unique) | `inventory_reservation` | Covers idempotency lookup + constraint |
| `uq_payment_idem` (unique) | `payment` | Covers idempotency lookup + constraint |
