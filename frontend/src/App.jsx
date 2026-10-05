import React, { useState, useEffect } from 'react';
import Storefront from './components/Storefront';
import MyOrders from './components/MyOrders';
import UserProfile from './components/UserProfile';
import CartDrawer from './components/CartDrawer';
import WishlistDrawer from './components/WishlistDrawer';
import AuthModal from './components/AuthModal';
import CheckoutModal from './components/CheckoutModal';
import OrderReceiptModal from './components/OrderReceiptModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('storefront'); // storefront, orders, profile
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Direct checkout modal triggered from cart
  const [activeCheckoutProduct, setActiveCheckoutProduct] = useState(null);
  const [activeReservation, setActiveReservation] = useState(null);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('salestorm_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      id: 'usr-101',
      name: 'Praveen Kumar',
      phone: '+91 98765 43210',
      shipping_address: '42 Indiranagar 100ft Road, Bengaluru, Karnataka 560038',
      email: 'praveen@salestorm.in',
      upi_id: 'praveen@okaxis'
    };
  });

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Failed to fetch products', err);
    }
  };

  const fetchWishlist = async () => {
    if (!currentUser || !currentUser.id) return;
    try {
      const res = await fetch(`/api/wishlist?user_id=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setWishlistItems(data.wishlist || []);
      }
    } catch (err) {
      console.error('Failed to fetch wishlist', err);
    }
  };

  useEffect(() => {
    fetchProducts();
    const interval = setInterval(fetchProducts, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchWishlist();
  }, [currentUser]);

  // Auth Handlers
  const handleAuthSuccess = (user, token) => {
    setCurrentUser(user);
    localStorage.setItem('salestorm_user', JSON.stringify(user));
    if (token) localStorage.setItem('salestorm_token', token);
    setIsAuthModalOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('salestorm_user');
    localStorage.removeItem('salestorm_token');
    setCurrentUser({
      id: 'guest',
      name: 'Guest Shopper',
      phone: '',
      email: '',
      shipping_address: '',
      upi_id: ''
    });
    setWishlistItems([]);
    setCartItems([]);
    setActiveTab('storefront');
  };

  const handleUpdateCurrentUser = (updatedUser) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('salestorm_user', JSON.stringify(updatedUser));
  };

  // Cart Handlers
  const handleAddToCart = (product) => {
    setCartItems(prev => {
      const exists = prev.find(i => i.id === product.id);
      if (exists) return prev;
      return [...prev, { ...product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const handleRemoveFromCart = (productId) => {
    setCartItems(prev => prev.filter(i => i.id !== productId));
  };

  // Wishlist Handlers
  const handleToggleWishlist = async (product) => {
    if (!currentUser || currentUser.id === 'guest') {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      const res = await fetch('/api/wishlist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          product_id: product.id
        })
      });
      if (res.ok) {
        await fetchWishlist();
      }
    } catch (err) {
      console.error('Error toggling wishlist', err);
    }
  };

  const handleRemoveFromWishlist = async (productId) => {
    await handleToggleWishlist({ id: productId });
  };

  // Cart direct reservation & checkout
  const handleProceedCartCheckout = async (product) => {
    if (!currentUser || currentUser.id === 'guest') {
      setIsAuthModalOpen(true);
      return;
    }
    setIsCartOpen(false);
    try {
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          product_id: product.id,
          quantity: 1,
          ttl_seconds: 600
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.message || 'Product sold out!');
      } else {
        setActiveCheckoutProduct(product);
        setActiveReservation(data);
      }
    } catch (err) {
      alert('Error reserving stock');
    }
  };

  // Live stock counts
  const totalStockLeft = products.reduce((acc, p) => acc + (p.available_quantity || 0), 0);
  const totalStockCap = products.reduce((acc, p) => acc + (p.total_quantity || 0), 0);
  const wishlistIds = wishlistItems.map(w => w.id);

  return (
    <div className="app-container">
      
      {/* Flipkart / Amazon Promotional Announcement Header */}
      <div className="announcement-strip">
        <div className="strip-container">
          <span>⚡ <strong>FESTIVAL VAULT DROP LIVE:</strong> Use Voucher <strong className="font-mono text-primary">FLASH500</strong> for ₹500 Off · 100% Free Instant UPI & RuPay Checkout · Free BlueDart Priority Air Delivery Across India</span>
        </div>
      </div>

      {/* Top Consumer Navigation Bar */}
      <header className="top-nav">
        <div className="nav-container">
          
          {/* Brand Logo */}
          <div className="brand" onClick={() => setActiveTab('storefront')} style={{ cursor: 'pointer' }}>
            <div className="logo-icon">⚡</div>
            <div className="brand-text">
              <h1>SALESTORM</h1>
              <span className="brand-tag">INDIA'S TECH VAULT</span>
            </div>
          </div>

          {/* Consumer Navigation Tabs */}
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'storefront' ? 'active' : ''}`}
              onClick={() => setActiveTab('storefront')}
            >
              🔥 Flash Drops
            </button>
            <button
              className={`nav-tab ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => {
                if (currentUser.id === 'guest') {
                  setIsAuthModalOpen(true);
                } else {
                  setActiveTab('orders');
                }
              }}
            >
              📦 My Orders & Tracking
            </button>
            <button
              className={`nav-tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => {
                if (currentUser.id === 'guest') {
                  setIsAuthModalOpen(true);
                } else {
                  setActiveTab('profile');
                }
              }}
            >
              👤 My Account & Addresses
            </button>
          </nav>

          {/* Right Action Icons: Stock, Wishlist, Bag, and User Sign In */}
          <div className="nav-actions">
            
            {/* Live Vault Inventory Ticker */}
            <div className="stock-pill" title="Live Available Vault Inventory">
              <span className="pulse-dot"></span>
              <span>Vault Stock: <strong>{totalStockLeft}</strong> / {totalStockCap || 380}</span>
            </div>

            {/* Wishlist Button */}
            <button
              className="btn btn-sm btn-wishlist-nav"
              onClick={() => setIsWishlistOpen(true)}
              title="Saved Wishlist Items"
            >
              <span>❤️ Wishlist</span>
              {wishlistItems.length > 0 && <span className="cart-badge-count">{wishlistItems.length}</span>}
            </button>

            {/* Shopping Bag Button */}
            <button
              className="btn btn-sm btn-cart"
              onClick={() => setIsCartOpen(true)}
              title="Open Shopping Bag"
            >
              <span>🛍️ Bag</span>
              {cartItems.length > 0 && <span className="cart-badge-count">{cartItems.length}</span>}
            </button>

            {/* Authentication / User Chip */}
            {currentUser && currentUser.id !== 'guest' ? (
              <div className="auth-user-chip" onClick={() => setActiveTab('profile')}>
                <span className="user-avatar-icon">👤</span>
                <span className="user-name-text">Hi, {currentUser.name.split(' ')[0]}</span>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm btn-signin"
                onClick={() => setIsAuthModalOpen(true)}
              >
                🔑 Sign In / Register
              </button>
            )}

          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'storefront' && (
          <Storefront
            products={products}
            currentUser={currentUser}
            onRefreshProducts={fetchProducts}
            onViewOrders={() => setActiveTab('orders')}
            onAddToCart={handleAddToCart}
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
          />
        )}

        {activeTab === 'orders' && (
          <MyOrders
            currentUser={currentUser}
            onBrowseDrops={() => setActiveTab('storefront')}
            onAddToCart={handleAddToCart}
          />
        )}

        {activeTab === 'profile' && (
          <UserProfile
            currentUser={currentUser}
            onUpdateCurrentUser={handleUpdateCurrentUser}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Shopping Cart Drawer */}
      {isCartOpen && (
        <CartDrawer
          cartItems={cartItems}
          onClose={() => setIsCartOpen(false)}
          onProceedCheckout={handleProceedCartCheckout}
          onRemoveItem={handleRemoveFromCart}
        />
      )}

      {/* Saved Wishlist Drawer */}
      {isWishlistOpen && (
        <WishlistDrawer
          isOpen={isWishlistOpen}
          onClose={() => setIsWishlistOpen(false)}
          wishlistItems={wishlistItems}
          onRemoveFromWishlist={handleRemoveFromWishlist}
          onAddToCart={handleAddToCart}
        />
      )}

      {/* Real Sign In / Register Modal */}
      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onAuthSuccess={handleAuthSuccess}
        />
      )}

      {/* Direct Cart Checkout Modal */}
      {activeCheckoutProduct && activeReservation && (
        <CheckoutModal
          product={activeCheckoutProduct}
          reservation={activeReservation}
          currentUser={currentUser}
          onClose={() => {
            setActiveCheckoutProduct(null);
            setActiveReservation(null);
          }}
          onPaymentSuccess={(orderData) => {
            setActiveCheckoutProduct(null);
            setActiveReservation(null);
            setConfirmedOrder(orderData);
            setCartItems([]);
            fetchProducts();
          }}
        />
      )}

      {/* Confirmed Order Receipt Modal */}
      {confirmedOrder && (
        <OrderReceiptModal
          orderData={confirmedOrder}
          onClose={() => setConfirmedOrder(null)}
          onViewOrders={() => {
            setConfirmedOrder(null);
            setActiveTab('orders');
          }}
        />
      )}

      {/* ==================================================================== */}
      {/* Amazon & Flipkart Caliber E-Commerce Footer */}
      {/* ==================================================================== */}
      <footer className="ecommerce-footer">
        <div className="footer-top-strip">
          <div className="trust-pillar">
            <span className="pillar-icon">🔒</span>
            <div>
              <strong>100% Genuine Guaranteed</strong>
              <p>Authentic brand sealed drops with direct manufacturer serial numbers.</p>
            </div>
          </div>
          <div className="trust-pillar">
            <span className="pillar-icon">⚡</span>
            <div>
              <strong>Zero-Fee Instant UPI & RuPay</strong>
              <p>Government of India 0% MDR mandate. GPay, PhonePe, Paytm, BHIM.</p>
            </div>
          </div>
          <div className="trust-pillar">
            <span className="pillar-icon">✈️</span>
            <div>
              <strong>BlueDart Air Priority Express</strong>
              <p>Complimentary insured air shipping with OTP verification on delivery.</p>
            </div>
          </div>
          <div className="trust-pillar">
            <span className="pillar-icon">🛡️</span>
            <div>
              <strong>10-Day Easy Replacement</strong>
              <p>1-Year official India brand warranty included on every tech drop.</p>
            </div>
          </div>
        </div>

        <div className="footer-links-grid">
          <div className="footer-col">
            <h4>⚡ SALESTORM INDIA</h4>
            <p className="text-xs text-muted">
              India's premier high-volume flash vault for limited-edition titanium wearables, studio beryllium acoustics, pro gaming gear, and 8K aerial optics.
            </p>
            <div className="footer-registered-badge mt-2">
              <span className="badge badge-secondary">CIN: U72200KA2026PTC194821</span>
            </div>
          </div>

          <div className="footer-col">
            <h4>Customer Service</h4>
            <ul className="footer-menu">
              <li><a href="#orders" onClick={(e) => { e.preventDefault(); setActiveTab('orders'); }}>Track Your BlueDart Shipment</a></li>
              <li><a href="#profile" onClick={(e) => { e.preventDefault(); setActiveTab('profile'); }}>Manage Delivery Addresses</a></li>
              <li><a href="#returns" onClick={(e) => { e.preventDefault(); alert('10-Day Replacement Guarantee: If your package arrives damaged or defective, initiate a replacement in My Orders for instant courier pickup.'); }}>Replacement & Return Policy</a></li>
              <li><a href="#help" onClick={(e) => { e.preventDefault(); alert('24x7 Customer Care Helpline: +91 1800 123 4567 | care@salestorm.in'); }}>Help Center & 24x7 Support</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Consumer Policies</h4>
            <ul className="footer-menu">
              <li><a href="#privacy" onClick={(e) => { e.preventDefault(); alert('Privacy Policy: All customer credentials and payment tokens are protected with SHA-256 and AES encryption. We do not sell your personal data.'); }}>Privacy Policy & Tokenization</a></li>
              <li><a href="#terms" onClick={(e) => { e.preventDefault(); alert('Terms of Sale: 1 unit per customer during flash sales. Unpaid reservations are released automatically after 10 minutes.'); }}>Terms of Sale & Fair Allocation</a></li>
              <li><a href="#gst" onClick={(e) => { e.preventDefault(); alert('GST Invoicing: All purchases include a downloadable tax invoice with GSTIN 29AAACS1234F1Z5.'); }}>GST Compliance & Tax Invoices</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Payment & Logistics Rails</h4>
            <div className="payment-badges-row">
              <span className="pay-badge">UPI (0% Fee)</span>
              <span className="pay-badge">RuPay</span>
              <span className="pay-badge">Google Pay</span>
              <span className="pay-badge">PhonePe</span>
              <span className="pay-badge">Paytm</span>
              <span className="pay-badge">NetBanking</span>
              <span className="pay-badge">BlueDart Air</span>
            </div>
            <p className="text-xs text-muted mt-2">
              Regulated by Reserve Bank of India (RBI) & National Payments Corporation of India (NPCI).
            </p>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <span>© 2026 SALESTORM RETAIL INDIA PRIVATE LIMITED · Koramangala, Bengaluru, Karnataka 560034. All rights reserved.</span>
          <span className="security-tag">🔒 256-Bit SSL Secure Platform</span>
        </div>
      </footer>

    </div>
  );
}
