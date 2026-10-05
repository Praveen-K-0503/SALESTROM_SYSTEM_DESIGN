import React, { useState, useEffect } from 'react';
import { ProductVisual } from './ProductIllustrations';

export default function MyOrders({ currentUser, onBrowseDrops, onAddToCart }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTrackingOrder, setActiveTrackingOrder] = useState(null);
  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState(null);
  const [advancingOrderId, setAdvancingOrderId] = useState(null);
  const [copiedTracking, setCopiedTracking] = useState(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?user_id=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [currentUser]);

  // Advance order status for testing / live courier simulation
  const handleAdvanceOrder = async (orderId) => {
    setAdvancingOrderId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/advance`, { method: 'POST' });
      if (res.ok) {
        await fetchOrders();
        // If tracker modal is open for this order, refresh its detail
        if (activeTrackingOrder && activeTrackingOrder.id === orderId) {
          const detailRes = await fetch(`/api/orders/${orderId}`);
          if (detailRes.ok) {
            const updated = await detailRes.json();
            setActiveTrackingOrder(updated);
          }
        }
      }
    } catch (err) {
      console.error('Error advancing order:', err);
    } finally {
      setAdvancingOrderId(null);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedTracking(id);
    setTimeout(() => setCopiedTracking(null), 2000);
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order? The stock will be released and 100% refund initiated to your payment source.')) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: 'POST' });
      const d = await res.json();
      alert(d.message);
      await fetchOrders();
    } catch (err) {
      alert('Error cancelling order: ' + err.message);
    }
  };

  // Filter orders by search and status
  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.tracking_number && o.tracking_number.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'IN_TRANSIT') return ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status);
    if (statusFilter === 'DELIVERED') return o.status === 'DELIVERED';
    return true;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'DELIVERED': return 'badge-success';
      case 'OUT_FOR_DELIVERY': return 'badge-warning';
      case 'SHIPPED': return 'badge-primary';
      case 'PROCESSING': return 'badge-secondary';
      default: return 'badge-primary';
    }
  };

  const getStatusHeadline = (status) => {
    switch (status) {
      case 'DELIVERED':
        return { text: 'Delivered at Destination', subtext: 'Package safely delivered and signed via OTP.', icon: '✅' };
      case 'OUT_FOR_DELIVERY':
        return { text: 'Out for Delivery Today by 4:00 PM', subtext: 'Courier associate is out for delivery. Keep OTP ready.', icon: '🛵' };
      case 'SHIPPED':
        return { text: 'Shipped via BlueDart Priority Air', subtext: 'Air cargo flight B737 in transit to destination hub.', icon: '✈️' };
      case 'PROCESSING':
        return { text: 'Packed & Dispatched from Warehouse', subtext: 'Picked and quality-checked at Bengaluru South Mega-Hub.', icon: '⚙️' };
      default:
        return { text: 'Order Confirmed & Approved', subtext: 'Payment verified. Allocating automated picking bay.', icon: '📦' };
    }
  };

  return (
    <div className="orders-page-container">
      
      {/* Flipkart / Amazon Style Header & Search */}
      <div className="orders-top-card">
        <div className="orders-title-row">
          <div>
            <div className="breadcrumbs-strip">
              <span>Home</span> › <span>My Account</span> › <strong>My Orders</strong>
            </div>
            <h1 className="orders-main-title">My Orders & Live Shipments</h1>
            <p className="text-xs text-muted">
              Real-time BlueDart Air tracking, OTP delivery security, and official tax invoices for <strong>{currentUser.name}</strong>
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={fetchOrders}>
            🔄 Refresh Status
          </button>
        </div>

        {/* Search & Status Tabs Bar */}
        <div className="orders-filter-bar">
          <div className="orders-search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by product name, SKU, or Order ID (#ST-...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="orders-search-input"
            />
          </div>

          <div className="orders-tab-group">
            <button
              className={`orders-tab-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              All Orders ({orders.length})
            </button>
            <button
              className={`orders-tab-btn ${statusFilter === 'IN_TRANSIT' ? 'active' : ''}`}
              onClick={() => setStatusFilter('IN_TRANSIT')}
            >
              🚚 In Transit ({orders.filter(o => o.status !== 'DELIVERED').length})
            </button>
            <button
              className={`orders-tab-btn ${statusFilter === 'DELIVERED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('DELIVERED')}
            >
              ✅ Delivered ({orders.filter(o => o.status === 'DELIVERED').length})
            </button>
          </div>
        </div>
      </div>

      {/* Orders List View */}
      {loading ? (
        <div className="orders-loading-card">
          <span className="spinner"></span>
          <span>Loading verified orders from ACID database...</span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="orders-empty-card">
          <div className="empty-icon">📦</div>
          <h3>No Orders Found</h3>
          <p className="text-xs text-muted">
            {searchQuery ? `No orders matched "${searchQuery}".` : "You haven't placed any orders in this drop yet."}
          </p>
          <button className="btn btn-primary mt-4" onClick={onBrowseDrops}>
            🏷️ Browse Live Drops
          </button>
        </div>
      ) : (
        <div className="orders-cards-stack">
          {filteredOrders.map((o) => {
            const headline = getStatusHeadline(o.status);
            const orderDate = new Date(o.created_at * 1000);

            return (
              <div key={o.id} className="amazon-order-card">
                
                {/* 1. Amazon-Style Top Order Header Strip */}
                <div className="order-strip-header">
                  <div className="strip-group">
                    <span className="strip-label">ORDER PLACED</span>
                    <strong className="strip-val">
                      {orderDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </strong>
                  </div>

                  <div className="strip-group">
                    <span className="strip-label">TOTAL PAID</span>
                    <strong className="strip-val font-mono text-primary">
                      ₹{o.total_amount.toLocaleString('en-IN')}
                    </strong>
                  </div>

                  <div className="strip-group ship-to-group">
                    <span className="strip-label">SHIP TO</span>
                    <strong className="strip-val text-primary ship-to-name">
                      {o.customer_name} ▾
                    </strong>
                    <div className="address-hover-tooltip">
                      <strong>{o.customer_name}</strong>
                      <p>{o.resolved_address || currentUser.shipping_address}</p>
                      <p className="text-xs text-muted">Phone: +91 98765 43210</p>
                    </div>
                  </div>

                  <div className="strip-group strip-right">
                    <div className="order-id-copy-row">
                      <span className="strip-label">ORDER # {o.order_number}</span>
                      <button
                        className="btn-copy-id"
                        onClick={() => copyToClipboard(o.order_number, o.id)}
                        title="Copy Order ID"
                      >
                        {copiedTracking === o.id ? '✓' : '📋'}
                      </button>
                    </div>
                    <div className="invoice-link-row">
                      <button
                        className="link-btn text-xs font-semibold"
                        onClick={() => setActiveInvoiceOrder(o)}
                      >
                        📄 Tax Invoice
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Status Delivery Headline Bar (Flipkart Style) */}
                <div className="order-delivery-headline-bar">
                  <div className="headline-left">
                    <span className="headline-icon">{headline.icon}</span>
                    <div>
                      <div className="headline-title">
                        {headline.text}
                      </div>
                      <div className="headline-subtext">
                        {headline.subtext}
                      </div>
                    </div>
                  </div>

                  <div className="headline-right">
                    <span className={`badge ${getStatusColor(o.status)}`}>
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {/* 3. Main Product Details & Action Columns */}
                <div className="order-item-content-grid">
                  
                  {/* Left Column: Product Thumbnail & Details */}
                  <div className="order-product-details-col">
                    <div className="order-photo-box">
                      <ProductVisual productId={o.product_id} alt={o.product_name} />
                    </div>

                    <div className="order-meta-info">
                      <h3 className="order-item-title">{o.product_name}</h3>
                      <p className="order-item-tagline">{o.product_tagline}</p>
                      <p className="order-item-sku">SKU: <code>{o.product_sku || o.product_id}</code> · Qty: {o.quantity || 1}</p>

                      <div className="order-pricing-row">
                        <span className="item-price-current">₹{o.total_amount.toLocaleString('en-IN')}</span>
                        <span className="free-shipping-tag">✓ FREE BlueDart Priority Delivery</span>
                      </div>

                      {/* Payment Method Badge */}
                      <div className="payment-provenance-pill">
                        <span>💳</span>
                        <span>
                          {o.payment_method ? `Paid via Free ${o.payment_method}` : 'Paid via Free Instant UPI'} · 
                          Ref: <code className="font-mono text-xs">{o.transaction_ref || 'UPI_TXN_SETTLED'}</code>
                        </span>
                      </div>

                      {/* Flipkart Delivery Security OTP Banner */}
                      {o.status !== 'DELIVERED' && (
                        <div className="delivery-otp-ribbon">
                          <span className="otp-icon">🔐</span>
                          <div className="otp-text">
                            <span>Delivery Secret OTP: <strong className="otp-code">{o.delivery_otp || '8492'}</strong></span>
                            <span className="otp-note">Share with courier associate only when package is physically in hand.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Amazon / Flipkart Action Buttons */}
                  <div className="order-actions-col">
                    <button
                      className="btn btn-primary btn-track"
                      onClick={() => setActiveTrackingOrder(o)}
                    >
                      🚚 Track Package
                    </button>

                    {/* Step Courier Status */}
                    {o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && (
                      <button
                        className="btn btn-outline btn-step-courier"
                        disabled={advancingOrderId === o.id}
                        onClick={() => handleAdvanceOrder(o.id)}
                        title="Simulate courier scanning package at next logistics milestone"
                      >
                        {advancingOrderId === o.id ? (
                          <span className="btn-spinner-content">
                            <span className="spinner spinner-sm"></span>
                            <span>Advancing...</span>
                          </span>
                        ) : (
                          <span>⚡ Advance Courier Milestone</span>
                        )}
                      </button>
                    )}

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setActiveInvoiceOrder(o)}
                    >
                      📄 View Tax Invoice
                    </button>

                    {o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && (
                      <button
                        className="btn btn-outline btn-sm text-danger"
                        onClick={() => handleCancelOrder(o.id)}
                      >
                        ❌ Cancel Order & Refund
                      </button>
                    )}

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => onAddToCart && onAddToCart({
                        id: o.product_id,
                        name: o.product_name,
                        sale_price: o.total_amount,
                        base_price: o.total_amount * 1.5,
                        sku: o.product_sku
                      })}
                    >
                      🔄 Buy Again
                    </button>
                  </div>

                </div>

                {/* 4. Footer Carrier & Tracking Bar */}
                <div className="order-carrier-footer-bar">
                  <div className="carrier-info-left">
                    <span className="text-xs text-muted">Courier Partner:</span>
                    <strong className="text-xs">{o.carrier || 'BlueDart Express Priority Air'}</strong>
                    <span className="text-muted">·</span>
                    <span className="text-xs text-muted">Tracking ID:</span>
                    <strong className="text-xs font-mono">{o.tracking_number || 'BD-01A62FF51A'}</strong>
                  </div>

                  <div className="carrier-info-right">
                    <span className="text-xs text-success font-semibold">
                      🛡️ Insured Transit · 10-Day Replacement Guarantee
                    </span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. Flipkart / Amazon Interactive Full Tracking Modal */}
      {/* ==================================================================== */}
      {activeTrackingOrder && (
        <div className="modal-backdrop" onClick={() => setActiveTrackingOrder(null)}>
          <div className="modal-dialog tracking-detail-modal" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="tracking-modal-header">
              <div className="tracking-header-left">
                <span className="badge badge-primary">BLUE DART AIR LOGISTICS</span>
                <h2>Shipment & Delivery Tracker</h2>
                <p className="text-xs text-muted">
                  Order <strong>#{activeTrackingOrder.order_number}</strong> · Air Waybill: <strong className="font-mono">{activeTrackingOrder.tracking_number}</strong>
                </p>
              </div>
              <button className="close-btn" onClick={() => setActiveTrackingOrder(null)}>×</button>
            </div>

            {/* Top Estimated Delivery Banner */}
            <div className="tracking-eta-banner">
              <div className="eta-badge-col">
                <span className="eta-icon">🚚</span>
                <div>
                  <span className="text-xs text-muted uppercase font-bold">Estimated Delivery</span>
                  <div className="eta-highlight">
                    {activeTrackingOrder.status === 'DELIVERED' ? 'Delivered Successfully' : 'Tomorrow by 4:00 PM'}
                  </div>
                  <span className="text-xs text-success font-semibold">
                    {activeTrackingOrder.status === 'DELIVERED' ? 'Completed on Schedule' : 'On Schedule · BlueDart Flight Cargo'}
                  </span>
                </div>
              </div>

              {/* Delivery Secret OTP */}
              <div className="eta-otp-col">
                <span className="text-xs text-muted font-bold">DELIVERY OTP</span>
                <div className="large-otp-display">{activeTrackingOrder.delivery_otp || '8492'}</div>
                <span className="text-xs text-muted">Share at doorstep only</span>
              </div>
            </div>

            {/* Interactive Flipkart-Style Horizontal Stepper */}
            <div className="flipkart-stepper-box">
              <div className="stepper-track-row">
                
                {/* Step 1: Confirmed */}
                <div className="stepper-step completed">
                  <div className="step-circle">✓</div>
                  <div className="step-text">
                    <strong>Ordered</strong>
                    <span>Payment Verified</span>
                  </div>
                </div>
                <div className={`stepper-connector ${activeTrackingOrder.status !== 'CONFIRMED' ? 'completed' : ''}`}></div>

                {/* Step 2: Processing */}
                <div className={`stepper-step ${['PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeTrackingOrder.status) ? 'completed' : 'pending'}`}>
                  <div className="step-circle">
                    {['PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeTrackingOrder.status) ? '✓' : '2'}
                  </div>
                  <div className="step-text">
                    <strong>Packed</strong>
                    <span>BLR Mega-Hub</span>
                  </div>
                </div>
                <div className={`stepper-connector ${['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeTrackingOrder.status) ? 'completed' : ''}`}></div>

                {/* Step 3: Shipped */}
                <div className={`stepper-step ${['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeTrackingOrder.status) ? 'completed' : 'pending'}`}>
                  <div className="step-circle">
                    {['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeTrackingOrder.status) ? '✓' : '3'}
                  </div>
                  <div className="step-text">
                    <strong>Shipped</strong>
                    <span>Flight B737 Air Cargo</span>
                  </div>
                </div>
                <div className={`stepper-connector ${['OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeTrackingOrder.status) ? 'completed' : ''}`}></div>

                {/* Step 4: Out for Delivery */}
                <div className={`stepper-step ${['OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeTrackingOrder.status) ? 'completed' : 'pending'}`}>
                  <div className="step-circle">
                    {activeTrackingOrder.status === 'DELIVERED' ? '✓' : '4'}
                  </div>
                  <div className="step-text">
                    <strong>Out for Delivery</strong>
                    <span>Courier Assigned</span>
                  </div>
                </div>
                <div className={`stepper-connector ${activeTrackingOrder.status === 'DELIVERED' ? 'completed' : ''}`}></div>

                {/* Step 5: Delivered */}
                <div className={`stepper-step ${activeTrackingOrder.status === 'DELIVERED' ? 'completed' : 'pending'}`}>
                  <div className="step-circle">
                    {activeTrackingOrder.status === 'DELIVERED' ? '✓' : '5'}
                  </div>
                  <div className="step-text">
                    <strong>Delivered</strong>
                    <span>Signed via OTP</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Detailed Real-Time Activity Log from SQLite */}
            <div className="timeline-activity-section">
              <h4>Real-Time Courier Activity Log</h4>
              <div className="activity-log-list">
                {activeTrackingOrder.timeline && activeTrackingOrder.timeline.length > 0 ? (
                  activeTrackingOrder.timeline.map((t, idx) => (
                    <div key={idx} className="activity-log-item">
                      <div className="activity-dot"></div>
                      <div className="activity-content">
                        <div className="activity-top">
                          <strong className="activity-status">{t.status.replace(/_/g, ' ')}</strong>
                          <span className="activity-time">
                            {new Date(t.timestamp * 1000).toLocaleString('en-IN', {
                              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="activity-note">{t.note}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="activity-log-item">
                    <div className="activity-dot"></div>
                    <div className="activity-content">
                      <strong className="activity-status">ORDER PLACED & CONFIRMED</strong>
                      <p className="activity-note">Payment confirmed via Free Digital Rail. Stock deducted from ACID inventory.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Courier Associate & Delivery Address Card */}
            <div className="tracker-meta-grid">
              <div className="tracker-meta-card">
                <span className="text-xs text-muted uppercase font-bold">Delivery Associate</span>
                <strong className="text-sm font-semibold">Ramesh Kumar (BlueDart Air Express)</strong>
                <p className="text-xs text-muted">Vehicle: Electric Van DL-01-EA-4921</p>
                <button className="btn btn-xs btn-outline mt-2" onClick={() => alert('Courier Associate Contact: Ramesh Kumar (+91 98450 12345). Delivery associate will contact you upon arriving at the gate.')}>
                  📞 Call Delivery Associate
                </button>
              </div>

              <div className="tracker-meta-card">
                <span className="text-xs text-muted uppercase font-bold">Shipping Destination</span>
                <strong className="text-sm font-semibold">{activeTrackingOrder.customer_name}</strong>
                <p className="text-xs text-muted mt-1">{activeTrackingOrder.resolved_address || currentUser.shipping_address}</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="tracking-modal-actions">
              {activeTrackingOrder.status !== 'DELIVERED' && (
                <button
                  className="btn btn-outline"
                  disabled={advancingOrderId === activeTrackingOrder.id}
                  onClick={() => handleAdvanceOrder(activeTrackingOrder.id)}
                >
                  {advancingOrderId === activeTrackingOrder.id ? 'Advancing...' : '⚡ Step Next Delivery Status (Demo)'}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setActiveTrackingOrder(null)}>
                Close Tracker
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. Official Indian GST Tax Invoice Modal */}
      {/* ==================================================================== */}
      {activeInvoiceOrder && (
        <div className="modal-backdrop" onClick={() => setActiveInvoiceOrder(null)}>
          <div className="modal-dialog gst-invoice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="invoice-header-row">
              <div>
                <h2>TAX INVOICE</h2>
                <p className="text-xs text-muted">Original for Recipient · Indian GST Compliant</p>
              </div>
              <button className="close-btn" onClick={() => setActiveInvoiceOrder(null)}>×</button>
            </div>

            <div className="invoice-meta-table">
              <div className="col">
                <strong>Sold By:</strong>
                <p>SALESTORM Retail India Pvt. Ltd.</p>
                <p>Plot 42, Koramangala Industrial Layout</p>
                <p>Bengaluru, Karnataka 560034</p>
                <p className="text-xs font-mono">GSTIN: 29AAACS1234F1Z5</p>
              </div>

              <div className="col">
                <strong>Billed & Shipped To:</strong>
                <p>{activeInvoiceOrder.customer_name}</p>
                <p>{activeInvoiceOrder.resolved_address || currentUser.shipping_address}</p>
                <p className="text-xs font-mono">Customer ID: {currentUser.id}</p>
              </div>

              <div className="col">
                <strong>Invoice Details:</strong>
                <p>Invoice No: <code className="font-mono">INV-{activeInvoiceOrder.order_number}</code></p>
                <p>Order No: <code className="font-mono">{activeInvoiceOrder.order_number}</code></p>
                <p>Date: {new Date(activeInvoiceOrder.created_at * 1000).toLocaleDateString('en-IN')}</p>
                <p>AWB: <code className="font-mono">{activeInvoiceOrder.tracking_number}</code></p>
              </div>
            </div>

            {/* Line items table */}
            <table className="invoice-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>HSN Code</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Tax (CGST+SGST 18%)</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>{activeInvoiceOrder.product_name}</strong>
                    <div className="text-xs text-muted">{activeInvoiceOrder.product_tagline}</div>
                  </td>
                  <td className="font-mono text-xs">8517</td>
                  <td>1</td>
                  <td className="font-mono">₹{(activeInvoiceOrder.total_amount / 1.18).toFixed(2)}</td>
                  <td className="font-mono">₹{(activeInvoiceOrder.total_amount - (activeInvoiceOrder.total_amount / 1.18)).toFixed(2)}</td>
                  <td className="font-mono font-bold">₹{activeInvoiceOrder.total_amount.toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>

            <div className="invoice-totals-box">
              <div className="row">
                <span>Taxable Value:</span>
                <span>₹{(activeInvoiceOrder.total_amount / 1.18).toFixed(2)}</span>
              </div>
              <div className="row">
                <span>Integrated GST (18%):</span>
                <span>₹{(activeInvoiceOrder.total_amount - (activeInvoiceOrder.total_amount / 1.18)).toFixed(2)}</span>
              </div>
              <div className="row">
                <span>Shipping & Handling (BlueDart Air):</span>
                <span className="text-success">₹0.00 (FREE)</span>
              </div>
              <div className="row total">
                <strong>Total Invoice Amount:</strong>
                <strong className="text-primary font-mono text-lg">₹{activeInvoiceOrder.total_amount.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            <div className="invoice-seal-strip">
              <div className="seal-text">
                <span>Authorized Signatory for SALESTORM RETAIL INDIA</span>
                <span className="text-xs text-muted font-mono">Digitally signed via SHA-256 e-Invoice Gateway</span>
              </div>
              <div className="invoice-actions">
                <button className="btn btn-outline" onClick={() => window.print()}>
                  🖨️ Print Invoice
                </button>
                <button className="btn btn-primary" onClick={() => setActiveInvoiceOrder(null)}>
                  Done
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
