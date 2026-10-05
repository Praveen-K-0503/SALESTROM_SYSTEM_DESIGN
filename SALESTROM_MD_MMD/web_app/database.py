"""
SALESTORM — Real-World SQLite Persistent Relational Database (WAL Mode)
=======================================================================
Implements the complete entity model required by the System Design Hackathon:
- CUSTOMER, PRODUCT, CATEGORY, INVENTORY, INVENTORY_RESERVATION,
  CART / CART_ITEM, ORDER / ORDER_ITEM, PAYMENT, SALE / COUPON,
  SHIPMENT, NOTIFICATION, and TRANSACTIONAL OUTBOX.
All prices stored in Indian Rupees (INR ₹).
"""

import sqlite3
import time
import hashlib
import logging
from pathlib import Path

logger = logging.getLogger("salestorm.database")

DB_DIR = Path(__file__).resolve().parent
DB_PATH = DB_DIR / "salestorm.db"

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for high concurrent reads/writes
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def init_db():
    conn = get_connection()
    cur = conn.cursor()

    # Users / Customers Table
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        shipping_address TEXT,
        upi_id TEXT,
        created_at REAL NOT NULL
    );

    -- Categories Table
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL
    );

    -- Products Table
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sku TEXT UNIQUE NOT NULL,
        category_id TEXT,
        tagline TEXT,
        description TEXT,
        base_price REAL NOT NULL,
        sale_price REAL NOT NULL,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at REAL NOT NULL
    );

    -- Inventory Table (ACID Source of Truth)
    CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        total_quantity INTEGER NOT NULL,
        available_quantity INTEGER NOT NULL,
        reserved_quantity INTEGER NOT NULL DEFAULT 0,
        sold_quantity INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at REAL NOT NULL
    );

    -- Inventory Reservations Table
    CREATE TABLE IF NOT EXISTS inventory_reservations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        status TEXT NOT NULL,
        expires_at REAL NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        payment_id TEXT,
        order_id TEXT,
        created_at REAL NOT NULL
    );

    -- Cart / Cart Items Table
    CREATE TABLE IF NOT EXISTS cart_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at REAL NOT NULL
    );

    -- Coupons / Deals Table
    CREATE TABLE IF NOT EXISTS coupons (
        code TEXT PRIMARY KEY,
        discount_amount REAL NOT NULL,
        discount_type TEXT NOT NULL DEFAULT 'FIXED',
        min_order_amount REAL NOT NULL DEFAULT 0,
        description TEXT,
        active INTEGER NOT NULL DEFAULT 1
    );

    -- Payments Table (Supports Free UPI, RuPay, NetBanking, Cards)
    CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL REFERENCES inventory_reservations(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        transaction_ref TEXT,
        upi_vpa TEXT,
        idempotency_key TEXT UNIQUE NOT NULL,
        error_reason TEXT,
        created_at REAL NOT NULL
    );

    -- Orders Table
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        reservation_id TEXT NOT NULL,
        payment_id TEXT NOT NULL,
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT NOT NULL,
        tracking_number TEXT,
        carrier TEXT DEFAULT 'BlueDart Express Air',
        estimated_delivery TEXT,
        shipping_address TEXT,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL
    );

    -- Order Timeline
    CREATE TABLE IF NOT EXISTS order_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL REFERENCES orders(id),
        status TEXT NOT NULL,
        timestamp REAL NOT NULL,
        note TEXT NOT NULL
    );

    -- Shipments Table
    CREATE TABLE IF NOT EXISTS shipments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        carrier TEXT NOT NULL,
        tracking_number TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        origin_hub TEXT NOT NULL,
        destination_city TEXT NOT NULL,
        estimated_delivery REAL NOT NULL,
        updated_at REAL NOT NULL
    );

    -- Notifications Table
    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        channel TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DELIVERED',
        created_at REAL NOT NULL
    );

    -- Transactional Outbox Table
    CREATE TABLE IF NOT EXISTS outbox_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at REAL NOT NULL,
        processed_at REAL
    );

    -- Indices for high-concurrency lookups
    CREATE INDEX IF NOT EXISTS idx_res_status_exp ON inventory_reservations(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
    -- User Delivery Addresses Table (Real Address Book CRUD)
    CREATE TABLE IF NOT EXISTS user_addresses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        pincode TEXT NOT NULL,
        address_line TEXT NOT NULL,
        locality TEXT,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        address_type TEXT DEFAULT 'HOME',
        is_default INTEGER DEFAULT 0,
        created_at REAL NOT NULL
    );

    -- Customer Wishlist Table
    CREATE TABLE IF NOT EXISTS wishlist (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        created_at REAL NOT NULL,
        UNIQUE(user_id, product_id)
    );
    """)

    # Safe column migrations for existing tables
    for alter_sql in [
        "ALTER TABLE products ADD COLUMN image_url TEXT",
        "ALTER TABLE products ADD COLUMN category_id TEXT",
        "ALTER TABLE users ADD COLUMN upi_id TEXT",
        "ALTER TABLE users ADD COLUMN phone TEXT",
        "ALTER TABLE users ADD COLUMN password_hash TEXT",
        "ALTER TABLE orders ADD COLUMN shipping_address TEXT",
        "ALTER TABLE payments ADD COLUMN transaction_ref TEXT",
        "ALTER TABLE payments ADD COLUMN upi_vpa TEXT"
    ]:
        try:
            cur.execute(alter_sql)
        except Exception:
            pass

    # Seed Categories
    categories = [
        ('cat-wearables', 'Wearables & Smartwatches', 'wearables'),
        ('cat-audio', 'Audiophile & Studio Sound', 'audio'),
        ('cat-gaming', 'Pro Gaming Hardware', 'gaming'),
        ('cat-optics', 'Aerial Optics & Drones', 'optics')
    ]
    for cid, name, slug in categories:
        cur.execute("INSERT OR IGNORE INTO categories (id, name, slug) VALUES (?, ?, ?)", (cid, name, slug))

    # Seed Promotional Coupons
    coupons = [
        ('FLASH500', 500.0, 'FIXED', 5000.0, '₹500 Instant Discount on Flash Drop Orders'),
        ('UPIFREE', 1000.0, 'FIXED', 10000.0, '₹1,000 Off on Zero-Fee UPI & NetBanking Payments'),
        ('FESTIVE2026', 2000.0, 'FIXED', 20000.0, '₹2,000 Flat Festival Drop Voucher')
    ]
    for code, disc, dtype, min_amt, desc in coupons:
        cur.execute("INSERT OR REPLACE INTO coupons (code, discount_amount, discount_type, min_order_amount, description, active) VALUES (?, ?, ?, ?, ?, 1)",
                    (code, disc, dtype, min_amt, desc))

    # Seed Real Flagship Drop Products with Indian Rupee (INR) Pricing & Real Image URLs
    now = time.time()
    products_to_seed = [
        (
            'prod-apex-watch',
            'Apex CyberWatch Ultra',
            'SKU-APEX-ULTRA-2026',
            'cat-wearables',
            'Limited Titanium Edition · Dual-Band GPS · 100ATM',
            'Crafted from grade-5 aerospace titanium, featuring biometric health tracking, precision sapphire touch display, and quantum multi-band GPS.',
            79999.00,
            39999.00,
            '/images/apex_watch.jpg',
            100
        ),
        (
            'prod-titan-ring',
            'Titan Horizon Smart Ring',
            'SKU-TITAN-RING-01',
            'cat-wearables',
            'Ceramic Titanium · Continuous Sleep & HRV · 7-Day Battery',
            'Aerospace brushed titanium body with hypoallergenic inner ceramic molding, medical-grade PPG optical pulse sensors, and contactless gesture tap.',
            24999.00,
            14999.00,
            '/images/titan_ring.jpg',
            120
        ),
        (
            'prod-nebula-audio',
            'Nebula Pro Studio Headphones',
            'SKU-NEBULA-ANC-PRO',
            'cat-audio',
            'Lossless 24-Bit Hi-Res · Hybrid Spatial ANC',
            'Studio-grade 50mm beryllium dynamic acoustic drivers with 48dB active noise cancellation, low-latency Bluetooth 5.4, and precision aluminum earcups.',
            34999.00,
            19999.00,
            '/images/nebula_headphones.jpg',
            150
        ),
        (
            'prod-aerobeats-buds',
            'AeroBeats Carbon Wireless Earbuds',
            'SKU-AEROBEATS-TWS',
            'cat-audio',
            'Dual Balanced Armature · 50dB Hybrid ANC · LDAC Hi-Res',
            'Acoustic carbon-tuned dual balanced armature drivers with LDAC 990kbps lossless streaming, 42-hour battery life, and IPX7 sweat resistance.',
            16999.00,
            8999.00,
            '/images/aerobeats_buds.jpg',
            120
        ),
        (
            'prod-quantum-key',
            'Quantum Arc Magnetic Keyboard',
            'SKU-QUANTUM-ARC-80',
            'cat-gaming',
            'Hall-Effect Magnetic Switches · 8000Hz Polling',
            'CNC machined aerospace aluminum chassis with analog magnetic switches, rapid-trigger dynamic actuation (0.1mm to 4.0mm), and sound-dampening poron foam.',
            22999.00,
            12999.00,
            '/images/quantum_keyboard.jpg',
            80
        ),
        (
            'prod-viper-mouse',
            'Viper Strike Ultralight Gaming Mouse',
            'SKU-VIPER-MOUSE-X',
            'cat-gaming',
            'Magnesium Alloy Skeleton · 36,000 DPI · 42g Featherweight',
            'Aerospace magnesium-alloy honeycomb chassis, PixArt 3395 optical sensor, 8000Hz hyper-polling rate, and zero-delay optical switches.',
            14999.00,
            7499.00,
            '/images/viper_mouse.jpg',
            90
        ),
        (
            'prod-aerodrone-4k',
            'AeroVision 4K Drone Explorer',
            'SKU-AEROVISION-4K',
            'cat-optics',
            'Tri-Omnidirectional Obstacle Sensing · 4K HDR',
            'Ultra-compact folding aerial camera drone with 1-inch CMOS sensor, 45-minute flight time, Level-7 wind resistance, and 15km O4 video transmission.',
            79999.00,
            49999.00,
            '/images/aerovision_drone.jpg',
            50
        ),
        (
            'prod-gimbal-camera',
            'Aura Pocket 3-Axis 8K Gimbal Camera',
            'SKU-AURA-POCKET-8K',
            'cat-optics',
            'Mechanical 3-Axis Stabilization · 1-Inch Sensor · AI Track',
            'Pocket-sized motorized 3-axis mechanical gimbal camera with 2-inch rotatable OLED touchscreen, 4K/120fps slow motion, and active AI face tracking.',
            44999.00,
            27999.00,
            '/images/gimbal_camera.jpg',
            75
        )
    ]

    for pid, name, sku, cat_id, tag, desc, bp, sp, img_url, stock in products_to_seed:
        cur.execute("SELECT id FROM products WHERE id = ?", (pid,))
        if not cur.fetchone():
            cur.execute("""
            INSERT INTO products (id, name, sku, category_id, tagline, description, base_price, sale_price, image_url, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
            """, (pid, name, sku, cat_id, tag, desc, bp, sp, img_url, now))

            cur.execute("""
            INSERT INTO inventory (id, product_id, total_quantity, available_quantity, reserved_quantity, sold_quantity, version, updated_at)
            VALUES (?, ?, ?, ?, 0, 0, 1, ?)
            """, (f"inv-{pid}", pid, stock, stock, now))
        else:
            # Update prices to INR and image URL
            cur.execute("""
            UPDATE products
            SET base_price = ?, sale_price = ?, image_url = ?, tagline = ?, description = ?
            WHERE id = ?
            """, (bp, sp, img_url, tag, desc, pid))

    # Seed Default Verified Indian Users
    # Seed Default Verified Indian Users (with default password 'salestorm123' sha256)
    default_pwd_hash = hashlib.sha256("salestorm123".encode()).hexdigest()
    default_users = [
        ('usr-101', 'praveen@salestorm.in', 'Praveen Kumar', '+91 98765 43210', '42 Indiranagar 100ft Road, Bengaluru, Karnataka 560038', 'praveen@okaxis', default_pwd_hash),
        ('usr-102', 'ananya.sharma@techmail.in', 'Ananya Sharma', '+91 98200 12345', '15 Bandra Kurla Complex, Mumbai, Maharashtra 400051', 'ananya@oksbi', default_pwd_hash),
        ('usr-103', 'rohan.patel@designers.org.in', 'Rohan Patel', '+91 98110 54321', '88 Cyber City, DLF Phase 2, Gurugram, Haryana 122002', 'rohan@paytm', default_pwd_hash),
        ('usr-104', 'priya.iyer@devhub.net.in', 'Priya Iyer', '+91 94440 98765', '12 Anna Salai, T. Nagar, Chennai, Tamil Nadu 600017', 'priya@ibl', default_pwd_hash)
    ]
    for uid, email, name, phone, addr, upi, pwd in default_users:
        cur.execute("SELECT id FROM users WHERE id = ?", (uid,))
        if not cur.fetchone():
            cur.execute("""
            INSERT INTO users (id, email, name, phone, shipping_address, upi_id, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (uid, email, name, phone, addr, upi, pwd, now))
        else:
            cur.execute("""
            UPDATE users SET shipping_address = ?, upi_id = ?, email = ?, name = ?, phone = ?, password_hash = ? WHERE id = ?
            """, (addr, upi, email, name, phone, pwd, uid))

    # Seed User Address Book entries
    default_addresses = [
        ('addr-101-1', 'usr-101', 'Praveen Kumar', '+91 98765 43210', '560038', '42 Indiranagar 100ft Road', 'Near Metro Station', 'Bengaluru', 'Karnataka', 'HOME', 1),
        ('addr-101-2', 'usr-101', 'Praveen Kumar (Office)', '+91 98765 43210', '560103', 'Tower B, 4th Floor, EcoSpace Tech Park', 'Bellandur Outer Ring Rd', 'Bengaluru', 'Karnataka', 'WORK', 0),
        ('addr-102-1', 'usr-102', 'Ananya Sharma', '+91 98200 12345', '400051', '15 Bandra Kurla Complex, G Block', 'Near Diamond Bourse', 'Mumbai', 'Maharashtra', 'HOME', 1)
    ]
    for aid, uid, aname, aphone, pin, line, loc, city, st, atype, is_def in default_addresses:
        cur.execute("SELECT id FROM user_addresses WHERE id = ?", (aid,))
        if not cur.fetchone():
            cur.execute("""
            INSERT INTO user_addresses (id, user_id, name, phone, pincode, address_line, locality, city, state, address_type, is_default, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (aid, uid, aname, aphone, pin, line, loc, city, st, atype, is_def, now))

    conn.commit()
    conn.close()
    logger.info("Real database initialized successfully at %s with INR currency, address books, and Indian user profiles.", DB_PATH)

if __name__ == "__main__":
    init_db()
    print("Database initialization complete.")
