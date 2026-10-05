import React, { useState } from 'react';
import { ProductVisual } from './ProductIllustrations';
import CheckoutModal from './CheckoutModal';
import OrderReceiptModal from './OrderReceiptModal';

export default function Storefront({
  products,
  currentUser,
  onRefreshProducts,
  onViewOrders,
  onAddToCart,
  wishlistIds = [],
  onToggleWishlist
}) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [activeReservation, setActiveReservation] = useState(null);
  const [reservingProductId, setReservingProductId] = useState(null);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  // Delivery Pincode Checker state
  const [pincode, setPincode] = useState('560038');
  const [pincodeStatus, setPincodeStatus] = useState('✓ Delivery by Tomorrow, 4:00 PM to 560038 (Bengaluru) via BlueDart Express Air — FREE');

  // Drop Alert subscription state
  const [notifContact, setNotifContact] = useState('');
  const [notifChannel, setNotifChannel] = useState('WHATSAPP');
  const [notifSuccess, setNotifSuccess] = useState('');

  // Check pincode serviceability
  const handleCheckPincode = (e) => {
    e.preventDefault();
    if (!pincode || pincode.length !== 6) {
      setPincodeStatus('⚠️ Please enter a valid 6-digit Indian PIN code.');
      return;
    }
    setPincodeStatus(`✓ Delivery by Tomorrow, 4:00 PM to ${pincode} via BlueDart Priority Air — FREE Express Delivery`);
  };

  // Filter products by category
  const filteredProducts = (products || []).filter((p) => {
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'WEARABLES') return p.category_id === 'cat-wearables' || p.id.includes('watch') || p.id.includes('ring');
    if (selectedCategory === 'AUDIO') return p.category_id === 'cat-audio' || p.id.includes('audio') || p.id.includes('buds');
    if (selectedCategory === 'GAMING') return p.category_id === 'cat-gaming' || p.id.includes('key') || p.id.includes('mouse');
    if (selectedCategory === 'OPTICS') return p.category_id === 'cat-optics' || p.id.includes('drone') || p.id.includes('cam');
    return true;
  });

  const handleReserveProduct = async (product) => {
    setReservingProductId(product.id);
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
        alert(data.message || 'Product sold out! The Fast Gate absorbed excess requests.');
      } else {
        // Successful reservation! Open checkout modal
        setActiveReservation({
          reservation: data,
          product: product
        });
        onRefreshProducts();
      }
    } catch (err) {
      alert('Network error while reserving product.');
    } finally {
      setReservingProductId(null);
    }
  };

  const handlePaymentSuccess = (orderData) => {
    setActiveReservation(null);
    setConfirmedOrder(orderData);
    onRefreshProducts();
  };

  const handleSubscribeNotification = async (e) => {
    e.preventDefault();
    if (!notifContact.trim()) return;
    try {
      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          contact: notifContact.trim(),
          channel: notifChannel
        })
      });
      const d = await res.json();
      setNotifSuccess(d.message || 'Subscribed for instant drop alerts!');
      setNotifContact('');
    } catch (err) {
      setNotifSuccess('Subscribed successfully!');
    }
  };

  return (
    <div className="storefront-container">
      
      {/* Top Promotional Coupon Ticker */}
      <div className="promo-ticker">
        <span>🎁 <strong>FESTIVAL VAULT DROP:</strong> Use Coupon <strong className="font-mono text-primary">FLASH500</strong> for ₹500 Off · or <strong className="font-mono text-success">UPIFREE</strong> for ₹1,000 Off on Free UPI Payments!</span>
      </div>

      {/* Hero Drop Banner */}
      <section className="hero-banner">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="pulse-dot"></span>
            <span>INDIA FESTIVAL VAULT DROP · 100% GENUINE GUARANTEED</span>
          </div>
          <h1 className="hero-title">Exclusive Tech Releases. Numbered Allocations.</h1>
          <p className="hero-subtitle">
            Engineered with aerospace titanium and beryllium drivers. 100% genuine guaranteed drops with zero-fee instant UPI & RuPay checkout, 10-minute cart reservation locks, and complimentary BlueDart Air Express delivery across India.
          </p>
          
          <div className="hero-metrics-strip">
            <div className="metric-pill">
              <span className="metric-icon">⏱️</span>
              <span>Guaranteed <strong>10-Min Reservation Hold</strong></span>
            </div>
            <div className="metric-pill">
              <span className="metric-icon">⚡</span>
              <span>100% Free <strong>Instant UPI & RuPay</strong></span>
            </div>
            <div className="metric-pill">
              <span className="metric-icon">✈️</span>
              <span>Complimentary <strong>BlueDart Air Priority</strong></span>
            </div>
            <div className="metric-pill">
              <span className="metric-icon">🛡️</span>
              <span>Official <strong>1-Year India Warranty</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* Category Navigation & Pincode Checker */}
      <section className="catalog-section">
        <div className="catalog-header-row">
          <div>
            <h2 className="catalog-title">Live Vault Drops (India)</h2>
            <p className="text-xs text-muted">Prices in Indian Rupees (₹). Official Brand Sealed Units with 1-Year India Warranty.</p>
          </div>

          <div className="category-pills">
            <button
              className={`cat-pill ${selectedCategory === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('ALL')}
            >
              All Drops ({products ? products.length : 0})
            </button>
            <button
              className={`cat-pill ${selectedCategory === 'WEARABLES' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('WEARABLES')}
            >
              Wearables ({(products || []).filter(p => p.category_id === 'cat-wearables' || p.id.includes('watch') || p.id.includes('ring')).length})
            </button>
            <button
              className={`cat-pill ${selectedCategory === 'AUDIO' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('AUDIO')}
            >
              Hi-Fi Audio ({(products || []).filter(p => p.category_id === 'cat-audio' || p.id.includes('audio') || p.id.includes('buds')).length})
            </button>
            <button
              className={`cat-pill ${selectedCategory === 'GAMING' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('GAMING')}
            >
              Pro Gaming ({(products || []).filter(p => p.category_id === 'cat-gaming' || p.id.includes('key') || p.id.includes('mouse')).length})
            </button>
            <button
              className={`cat-pill ${selectedCategory === 'OPTICS' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('OPTICS')}
            >
              Aerial Optics ({(products || []).filter(p => p.category_id === 'cat-optics' || p.id.includes('drone') || p.id.includes('cam')).length})
            </button>
          </div>
        </div>

        {/* Amazon / Flipkart Style Delivery Pincode Checker */}
        <div className="pincode-checker-bar">
          <form className="pincode-form" onSubmit={handleCheckPincode}>
            <span className="pincode-icon">📍</span>
            <span className="pincode-label">Deliver to:</span>
            <input
              type="text"
              maxLength={6}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 6-digit Pincode"
              className="pincode-input font-mono"
            />
            <button type="submit" className="btn-check-pincode">
              Check
            </button>
          </form>
          <div className="pincode-status-text">
            {pincodeStatus}
          </div>
        </div>

        {/* Product Cards Grid with REAL IMAGES */}
        <div className="products-grid">
          {filteredProducts.map((p) => {
            const isSoldOut = p.available_quantity <= 0;
            const pctRemaining = Math.round((p.available_quantity / p.total_quantity) * 100);
            const isLowStock = p.available_quantity > 0 && p.available_quantity < (p.total_quantity * 0.25);
            const savings = p.base_price - p.sale_price;
            const isWishlisted = wishlistIds && wishlistIds.includes(p.id);

            return (
              <div key={p.id} className={`product-card ${isSoldOut ? 'product-card-soldout' : ''}`}>
                
                {/* Visual Header with Real Image */}
                <div className="card-visual-wrapper">
                  <div className="card-badge-row">
                    <span className="badge badge-primary">{p.sku}</span>
                    <button
                      type="button"
                      className={`wishlist-heart-btn ${isWishlisted ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWishlist && onToggleWishlist(p);
                      }}
                      title={isWishlisted ? 'Saved in Wishlist' : 'Add to Wishlist'}
                    >
                      {isWishlisted ? '❤️' : '🤍'}
                    </button>
                  </div>

                  <div className="card-artwork">
                    <ProductVisual productId={p.id} className="product-real-img" alt={p.name} />
                  </div>
                </div>

                {/* Product Metadata */}
                <div className="card-body">
                  <div className="product-category-text">{p.tagline}</div>
                  <h3 className="product-name">{p.name}</h3>
                  <p className="product-desc">{p.description}</p>

                  {/* Stock Bar */}
                  <div className="stock-meter-container">
                    <div className="stock-meter-labels">
                      <span className="text-xs text-muted">Vault Allocation</span>
                      <span className="text-xs font-semibold">
                        {p.available_quantity} / {p.total_quantity} Units Remaining
                      </span>
                    </div>
                    <div className="stock-meter-track">
                      <div
                        className={`stock-meter-fill ${isSoldOut ? 'empty' : isLowStock ? 'low' : 'healthy'}`}
                        style={{ width: `${Math.max(pctRemaining, 4)}%` }}
                      />
                    </div>
                  </div>

                  {/* Price & Action Row */}
                  <div className="card-footer-row">
                    <div className="price-block">
                      <div className="current-sale-price">₹{p.sale_price.toLocaleString('en-IN')}</div>
                      <div className="price-msrp-row">
                        <span className="msrp-price">₹{p.base_price.toLocaleString('en-IN')}</span>
                        <span className="savings-badge">Save ₹{savings.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="action-buttons-group">
                      <button
                        className="btn btn-outline btn-sm"
                        title="Add to Bag"
                        disabled={isSoldOut}
                        onClick={() => onAddToCart && onAddToCart(p)}
                      >
                        🛍️
                      </button>
                      <button
                        className={`btn ${isSoldOut ? 'btn-disabled' : 'btn-primary'} btn-reserve`}
                        disabled={isSoldOut || reservingProductId === p.id}
                        onClick={() => handleReserveProduct(p)}
                      >
                        {reservingProductId === p.id ? (
                          <span className="btn-spinner-content">
                            <span className="spinner spinner-sm"></span>
                            <span>Locking...</span>
                          </span>
                        ) : isSoldOut ? (
                          <span>Sold Out</span>
                        ) : (
                          <span>⚡ Reserve & Buy</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </section>

      {/* Drop Alert Notification Subscriber Box */}
      <section className="drop-alert-section">
        <div className="alert-box-content">
          <div className="alert-text">
            <span className="badge badge-accent">NEVER MISS A DROP</span>
            <h3>Get WhatsApp & SMS Priority Notifications</h3>
            <p className="text-xs text-muted">
              Subscribe with your mobile number to receive 5-minute early access alerts before flash inventory goes live.
            </p>
          </div>

          <form className="alert-form" onSubmit={handleSubscribeNotification}>
            <div className="channel-selector">
              <button
                type="button"
                className={`channel-pill ${notifChannel === 'WHATSAPP' ? 'active' : ''}`}
                onClick={() => setNotifChannel('WHATSAPP')}
              >
                💬 WhatsApp
              </button>
              <button
                type="button"
                className={`channel-pill ${notifChannel === 'SMS' ? 'active' : ''}`}
                onClick={() => setNotifChannel('SMS')}
              >
                📱 SMS
              </button>
            </div>

            <div className="alert-input-row">
              <input
                type="text"
                className="input-field"
                placeholder={notifChannel === 'WHATSAPP' ? '+91 98765 43210 (WhatsApp)' : '+91 98765 43210 (Mobile)'}
                value={notifContact}
                onChange={(e) => setNotifContact(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary">
                🔔 Notify Me
              </button>
            </div>
            {notifSuccess && <div className="text-xs text-success font-semibold mt-1">✓ {notifSuccess}</div>}
          </form>
        </div>
      </section>

      {/* Active Checkout Modal */}
      {activeReservation && (
        <CheckoutModal
          product={activeReservation.product}
          reservation={activeReservation.reservation}
          currentUser={currentUser}
          onClose={() => setActiveReservation(null)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* Confirmed Order Receipt Modal */}
      {confirmedOrder && (
        <OrderReceiptModal
          orderData={confirmedOrder}
          onClose={() => setConfirmedOrder(null)}
          onViewOrders={() => {
            setConfirmedOrder(null);
            onViewOrders();
          }}
        />
      )}

    </div>
  );
}
