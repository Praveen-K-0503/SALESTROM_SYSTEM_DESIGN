# SALESTORM India — Real-Time High-Scale E-Commerce Platform

Official Flagship E-Commerce Store & High-Scale Flash Sale Vault for India.  
Built with **React (Frontend)**, **FastAPI (Asynchronous Microservices Backend)**, **ACID SQLite Database (WAL Mode)**, and **Zero-Fee Domestic Indian Payment Rails (UPI, RuPay, NetBanking, COD)**.

---

## 📁 Repository Directory Structure

```
e:\System Design Hackathon\
├── run_app.py                        # Primary launch script for FastAPI backend + Web Storefront
├── README.md                         # Project overview and deployment guide
│
├── frontend/                         # Modern React E-Commerce Web Client
│   ├── index.html                    # Storefront entry point
│   ├── package.json                  # Dependencies & scripts
│   ├── vite.config.js                # Vite build configuration (outputs to web_app/static)
│   ├── public/                       # Favicons, vector icons, and static assets
│   │   └── images/                   # Product catalog photography
│   └── src/
│       ├── App.jsx                   # Main layout: header, search, category tabs, footer
│       ├── index.css                 # Comprehensive responsive CSS design system
│       └── components/
│           ├── Storefront.jsx        # Amazon/Flipkart-caliber product catalog & pincode checker
│           ├── AuthModal.jsx         # Sign Up / Login with Email, Phone, and Demo accounts
│           ├── UserProfile.jsx       # Full User Profile & Address Book Manager (CRUD)
│           ├── WishlistDrawer.jsx    # Saved items slide-over drawer with 1-click cart addition
│           ├── CartDrawer.jsx        # Active shopping bag and checkout trigger
│           ├── CheckoutModal.jsx     # 10-Minute hold timer & Zero-Fee UPI Payment Modal
│           ├── OrderReceiptModal.jsx # Instant order confirmation and BlueDart tracking link
│           ├── MyOrders.jsx          # Order history, 5-stage shipment stepper, 1-click cancellation
│           └── ProductIllustrations.jsx # Fallback SVG visualizer
│
├── tests/                            # Automated End-to-End Test Suite
│   └── test_operations.py            # 10-point test runner validating 100% of all operations
│
└── SALESTROM_MD_MMD/                 # Technical System Design Architecture & Backend Core
    ├── run_app.py                    # Standalone runner for subfolder execution
    ├── README.md                     # Technical architecture summary and deliverables index
    │
    ├── diagrams/                     # Real Architecture Diagram Assets & Gallery
    │   ├── *.png & *.svg             # All 13 diagrams in High-Res PNG (PPT) and Vector SVG
    │   ├── index.html                # Interactive Diagram Gallery & Download Hub
    │   └── SALESTORM_Architecture_Diagrams.zip # 1-Click All-in-One Download Bundle (2.67 MB)
    │
    ├── web_app/                      # Production Backend Services
    │   ├── server.py                 # FastAPI REST API, routing, zero-oversell token gate
    │   ├── database.py               # SQLite WAL schema, tables, seeding, migrations
    │   ├── salestorm.db              # Persistent SQLite database file
    │   ├── payment_gateway.py        # Payment gateway interface, zero-fee verification
    │   ├── workers.py                # Transactional Outbox worker & 10-minute expiry sweeper
    │   └── static/                   # Compiled React bundle (HTML, JS, CSS, images)
    │
    ├── 01_Requirements/              # Functional, non-functional requirements, traffic sizing
    ├── 02_HLD/                       # C4 Context, Container, Component, Deployment diagrams
    ├── 03_LLD/                       # Class diagrams, sequence flows, reservation state machines
    ├── 04_Database/                  # PostgreSQL schema, ACID transaction boundary documentation
    ├── 05_API/                       # OpenAPI 3.0 specification & events catalogue
    ├── 06_SOLID/                     # Real class SOLID mapping
    ├── 07_Design_Patterns/           # 8 GoF and distributed system patterns
    ├── 08_Scalability_Reliability/   # 500k RPS traffic absorption, retry & DLQ policies
    ├── 09_Security_Observability/    # JWT RS256, TLS 1.3, rate limiting, OpenTelemetry
    ├── 10_ADR/                       # 5 Architectural Decision Records (ADR-001 to ADR-005)
    ├── 11_AI_Assisted_Validation/    # Flash sale stress testing simulation script
    └── 12_Presentation/              # Final pitch deck presentation slides
```

---

## ⚡ Quick Start: Running the Website

### Option 1: Direct Production Launch
```bash
# In the workspace root:
py run_app.py
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in any modern web browser.  
Swagger API Docs are available at **[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)**.

### Option 2: Frontend Development Mode (Hot Reload)
```bash
# Terminal 1: Backend
py run_app.py

# Terminal 2: React Dev Server
cd frontend
npm run dev
```

---

## 🧪 Automated Verification Test Suite

A comprehensive 10-point test runner verifies all backend operations:

```bash
py tests/test_operations.py
```

### Verified Operations:
1. **Catalog & Drops:** Loads all 8 products across 4 categories (Wearables, Audio, Gaming, Optics) with real INR pricing.
2. **Promotional Coupons:** Discount validation for `FLASH500` and `UPIFREE`.
3. **Authentication (Register):** Creates new real user with SHA-256 password hash and auto-populates address book.
4. **Authentication (Login):** Dual-channel login via Email or Phone Number.
5. **User Profile CRUD:** Live profile reading and updates (`PUT /api/users/{id}`).
6. **Address Book CRUD:** Create, Read, Set Default, and Delete shipping addresses.
7. **Customer Wishlist:** Add, list, and remove saved products.
8. **Flash Sale Reservation & Payment:** 10-Minute hold lock (`POST /api/reserve`) and Zero-Fee UPI checkout (`POST /api/checkout`).
9. **Transactional Outbox & Tracking:** Asynchronous order creation and BlueDart 5-stage shipment stepper.
10. **Order Cancellation & ACID Stock Rollback:** Instant customer cancellation with 100% refund log and automatic inventory restock.

---

## 💳 Payment Rails: Free Domestic Indian Implementation

SALESTORM utilizes **Option 1: Zero-Fee Domestic Indian Payment Rails** which are 100% free under Indian regulatory frameworks (RBI & NPCI):

- **Dynamic UPI QR Code:** Generates instant QR codes compatible with Google Pay, PhonePe, Paytm, CRED, and BHIM.
- **UPI VPA / Intent:** Direct mobile collect request with zero merchant surcharge.
- **RuPay Debit Cards:** NPCI-mandated 0% MDR for all domestic card transactions.
- **NetBanking:** Instant transfer across major banks (SBI, HDFC, ICICI, Axis).
- **Cash on Delivery (COD):** OTP-verified on delivery via BlueDart Express.
