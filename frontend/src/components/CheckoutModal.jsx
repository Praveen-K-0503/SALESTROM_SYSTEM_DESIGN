import React, { useState, useEffect } from 'react';
import { ProductVisual } from './ProductIllustrations';

export default function CheckoutModal({
  product,
  reservation,
  currentUser,
  onClose,
  onPaymentSuccess
}) {
  const [paymentMethod, setPaymentMethod] = useState('UPI_QR'); // UPI_QR, UPI_VPA, RUPAY_CARD, NETBANKING, COD, STRIPE_CARD
  const [upiId, setUpiId] = useState(currentUser.upi_id || 'praveen@okaxis');
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');
  const [cardNumber, setCardNumber] = useState('6521 8291 0023 4912'); // RuPay card test number
  const [cardExp, setCardExp] = useState('09/29');
  const [cardCvc, setCardCvc] = useState('891');
  const [cardName, setCardName] = useState(currentUser.name || 'Praveen Kumar');
  const [address, setAddress] = useState(currentUser.shipping_address || '42 Indiranagar 100ft Road, Bengaluru, Karnataka 560038');
  
  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // 10-Minute Hold countdown timer (600s)
  const [secondsRemaining, setSecondsRemaining] = useState(reservation?.ttl_seconds || 600);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMessage('Your 10-minute inventory hold has expired! The reserved stock has been released.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await fetch('/api/coupons/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim(),
          order_amount: product.sale_price
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.detail || 'Invalid coupon');
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon(data);
      }
    } catch (err) {
      setCouponError('Failed to apply coupon');
    } finally {
      setCouponLoading(false);
    }
  };

  const discountAmount = appliedCoupon ? appliedCoupon.discount_amount : 0;
  const finalPayable = Math.max(0, product.sale_price - discountAmount);

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (secondsRemaining <= 0) {
      setErrorMessage('Hold has expired. Please reserve again from the drop catalog.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      const idempotencyKey = `pay-${reservation.reservation_id}-${Date.now()}`;
      const payload = {
        reservation_id: reservation.reservation_id,
        payment_method: paymentMethod,
        upi_vpa: upiId,
        bank_name: selectedBank,
        card_number: cardNumber,
        exp_month: cardExp.split('/')[0] || '09',
        exp_year: cardExp.split('/')[1] || '29',
        cvc: cardCvc,
        name_on_card: cardName,
        coupon_code: appliedCoupon?.code,
        discount_amount: discountAmount,
        idempotency_key: idempotencyKey
      };

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || data.status === 'FAILED') {
        setErrorMessage(data.message || data.error_reason || 'Payment failed. Please check your payment details.');
      } else {
        onPaymentSuccess({
          ...data,
          product: product,
          amount: finalPayable,
          original_amount: product.sale_price,
          discount_amount: discountAmount,
          coupon_code: appliedCoupon?.code,
          payment_method: paymentMethod,
          shipping_address: address
        });
      }
    } catch (err) {
      setErrorMessage('Network or server connection error. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog checkout-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-badge">INDIA VAULT DROP · EXCLUSIVE ALLOCATION</div>
            <h2 className="modal-title">Complete Your Flash Purchase</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        {/* 10-Minute Hold Urgency Bar */}
        <div className={`reservation-timer-banner ${secondsRemaining < 120 ? 'timer-critical' : ''}`}>
          <div className="timer-info">
            <span className="timer-icon">⏱️</span>
            <div>
              <strong>10-Minute Inventory Hold Active: </strong>
              <span>Stock guaranteed for <strong className="font-mono text-danger">{formatTime(secondsRemaining)}</strong></span>
            </div>
          </div>
          <div className="timer-progress-track">
            <div 
              className="timer-progress-fill" 
              style={{ width: `${(secondsRemaining / (reservation?.ttl_seconds || 600)) * 100}%` }}
            />
          </div>
        </div>

        {errorMessage && (
          <div className="alert alert-error">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        <div className="checkout-grid">
          
          {/* Left Column: Product Summary, Coupon & Delivery Address */}
          <div className="checkout-summary-col">
            <div className="checkout-product-card">
              <div className="checkout-product-visual">
                <ProductVisual productId={product.id} className="w-20 h-20" />
              </div>
              <div className="checkout-product-info">
                <span className="badge badge-primary">{product.sku}</span>
                <h3>{product.name}</h3>
                <p className="text-xs text-muted">{product.tagline}</p>
                <div className="checkout-price-row">
                  <span className="sale-price">₹{product.sale_price.toLocaleString('en-IN')}</span>
                  <span className="base-price">₹{product.base_price.toLocaleString('en-IN')}</span>
                  <span className="discount-tag">Save ₹{(product.base_price - product.sale_price).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Promo Coupon Card */}
            <div className="coupon-box-card">
              <div className="field-label">Apply Promo Voucher / Discount</div>
              <div className="coupon-input-group">
                <input
                  type="text"
                  className="input-field font-mono uppercase"
                  placeholder="e.g. FLASH500 or UPIFREE"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                >
                  {couponLoading ? 'Checking...' : 'Apply'}
                </button>
              </div>

              {/* Quick Coupon Chips */}
              <div className="quick-coupon-chips">
                <button type="button" className="chip" onClick={() => setCouponCode('FLASH500')}>FLASH500 (₹500 Off)</button>
                <button type="button" className="chip" onClick={() => setCouponCode('UPIFREE')}>UPIFREE (₹1,000 Off)</button>
              </div>

              {appliedCoupon && (
                <div className="coupon-success-tag">
                  ✓ {appliedCoupon.message}
                </div>
              )}
              {couponError && (
                <div className="text-xs text-danger mt-1">
                  ✕ {couponError}
                </div>
              )}
            </div>

            {/* Price Breakdown */}
            <div className="price-breakdown-card">
              <div className="breakdown-row">
                <span>Drop Price (1 Unit)</span>
                <span>₹{product.sale_price.toLocaleString('en-IN')}</span>
              </div>
              {discountAmount > 0 && (
                <div className="breakdown-row text-success">
                  <span>Voucher Discount ({appliedCoupon.code})</span>
                  <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="breakdown-row">
                <span>BlueDart Express Priority Air</span>
                <span className="text-success font-semibold">FREE (Vault Drop)</span>
              </div>
              <div className="breakdown-row">
                <span>Payment Processing Fee</span>
                <span className="text-success font-semibold">₹0.00 (Zero Surcharge)</span>
              </div>
              <div className="breakdown-row total-row">
                <span>Net Payable Amount</span>
                <span className="font-mono text-xl font-extrabold text-primary">₹{finalPayable.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Delivery Destination */}
            <div className="shipping-address-card">
              <div className="card-subheading">
                <span>📍 Delivery Address (India)</span>
                <span className="text-xs text-muted">BlueDart Air Delivery</span>
              </div>
              <input
                type="text"
                className="input-field"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full delivery address"
                required
              />
              <p className="text-xs text-muted mt-1">Recipient: <strong>{currentUser.name}</strong> ({currentUser.email})</p>
            </div>
          </div>

          {/* Right Column: Free Payment Methods */}
          <div className="checkout-payment-col">
            <h3 className="section-title">Select Free Payment Method</h3>
            <p className="text-xs text-muted mb-3">100% Free Instant Payment Rails with Zero Gateway Surcharge</p>

            {/* Payment Method Selector Grid */}
            <div className="payment-method-selector">
              <button
                type="button"
                className={`pm-btn ${paymentMethod === 'UPI_QR' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('UPI_QR')}
              >
                ⚡ UPI QR
              </button>
              <button
                type="button"
                className={`pm-btn ${paymentMethod === 'UPI_VPA' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('UPI_VPA')}
              >
                📱 UPI ID
              </button>
              <button
                type="button"
                className={`pm-btn ${paymentMethod === 'RUPAY_CARD' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('RUPAY_CARD')}
              >
                💳 RuPay / Card
              </button>
              <button
                type="button"
                className={`pm-btn ${paymentMethod === 'NETBANKING' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('NETBANKING')}
              >
                🏦 NetBanking
              </button>
              <button
                type="button"
                className={`pm-btn ${paymentMethod === 'COD' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('COD')}
              >
                💵 Cash on Delivery
              </button>
            </div>

            <form onSubmit={handleSubmitPayment}>
              
              {/* Option 1: UPI Instant QR Code */}
              {paymentMethod === 'UPI_QR' && (
                <div className="upi-qr-card">
                  <div className="qr-badge">SCAN & PAY WITH ANY UPI APP</div>
                  
                  {/* Dynamic SVG UPI QR Code */}
                  <div className="upi-qr-frame">
                    <svg viewBox="0 0 160 160" width="140" height="140" className="upi-qr-svg">
                      <rect width="160" height="160" fill="white" />
                      {/* Top-Left Finder */}
                      <rect x="10" y="10" width="40" height="40" fill="black" />
                      <rect x="18" y="18" width="24" height="24" fill="white" />
                      <rect x="24" y="24" width="12" height="12" fill="black" />
                      {/* Top-Right Finder */}
                      <rect x="110" y="10" width="40" height="40" fill="black" />
                      <rect x="118" y="18" width="24" height="24" fill="white" />
                      <rect x="124" y="24" width="12" height="12" fill="black" />
                      {/* Bottom-Left Finder */}
                      <rect x="10" y="110" width="40" height="40" fill="black" />
                      <rect x="18" y="118" width="24" height="24" fill="white" />
                      <rect x="24" y="124" width="12" height="12" fill="black" />
                      {/* Center UPI Logo Icon */}
                      <rect x="66" y="66" width="28" height="28" rx="6" fill="#00baf2" />
                      <text x="80" y="84" fill="white" fontSize="10" fontWeight="900" textAnchor="middle">UPI</text>
                      {/* Mock Data Modules */}
                      <rect x="60" y="20" width="8" height="8" fill="black" />
                      <rect x="75" y="15" width="8" height="16" fill="black" />
                      <rect x="90" y="30" width="10" height="8" fill="black" />
                      <rect x="20" y="65" width="8" height="12" fill="black" />
                      <rect x="35" y="80" width="12" height="8" fill="black" />
                      <rect x="110" y="65" width="12" height="10" fill="black" />
                      <rect x="135" y="80" width="10" height="12" fill="black" />
                      <rect x="60" y="120" width="16" height="8" fill="black" />
                      <rect x="85" y="130" width="10" height="12" fill="black" />
                      <rect x="110" y="115" width="8" height="16" fill="black" />
                      <rect x="130" y="135" width="14" height="10" fill="black" />
                    </svg>
                  </div>

                  <div className="upi-app-icons">
                    <span className="app-pill gpay">GPay</span>
                    <span className="app-pill phonepe">PhonePe</span>
                    <span className="app-pill paytm">Paytm</span>
                    <span className="app-pill cred">CRED</span>
                    <span className="app-pill bhim">BHIM</span>
                  </div>

                  <p className="text-xs text-muted mt-2">
                    UPI ID: <strong className="font-mono text-primary">salestorm.drop@okaxis</strong>
                  </p>
                  <p className="text-xs text-success font-semibold">
                    ✓ Instant 0% fee settlement with NCPI UPI Autopay
                  </p>
                </div>
              )}

              {/* Option 2: Direct UPI ID / VPA */}
              {paymentMethod === 'UPI_VPA' && (
                <div className="vpa-box">
                  <div className="form-group">
                    <label className="field-label">Enter Your UPI ID / VPA</label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="e.g. mobile@upi or username@okaxis"
                      required
                    />
                    <span className="text-xs text-muted mt-1">A payment collect request will be pushed instantly to your UPI app.</span>
                  </div>
                </div>
              )}

              {/* Option 3: RuPay / Debit & Credit Card */}
              {paymentMethod === 'RUPAY_CARD' && (
                <div className="card-fields-container">
                  <div className="form-group">
                    <label className="field-label">Cardholder Name</label>
                    <input
                      type="text"
                      className="input-field"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <div className="field-label-row">
                      <label className="field-label">RuPay / Visa / Master Card Number</label>
                      <span className="badge badge-success">0% Surcharge</span>
                    </div>
                    <input
                      type="text"
                      className="input-field font-mono"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-row-triplet">
                    <div className="form-group">
                      <label className="field-label">Expiry (MM/YY)</label>
                      <input
                        type="text"
                        className="input-field font-mono"
                        value={cardExp}
                        onChange={(e) => setCardExp(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="field-label">CVV</label>
                      <input
                        type="text"
                        className="input-field font-mono"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Option 4: NetBanking */}
              {paymentMethod === 'NETBANKING' && (
                <div className="netbanking-box">
                  <label className="field-label">Choose Your Bank</label>
                  <select
                    className="input-field"
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                  >
                    <option value="HDFC Bank">HDFC Bank (Instant Free Debit)</option>
                    <option value="State Bank of India">State Bank of India (SBI)</option>
                    <option value="ICICI Bank">ICICI Bank Internet Banking</option>
                    <option value="Axis Bank">Axis Bank NetBanking</option>
                    <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                  </select>
                  <p className="text-xs text-muted mt-2">Zero bank charges. Direct RBI IMPS/NEFT settlement.</p>
                </div>
              )}

              {/* Option 5: Cash on Delivery */}
              {paymentMethod === 'COD' && (
                <div className="cod-box">
                  <div className="cod-icon">💵</div>
                  <h4>Cash on Delivery (Pay on Arrival)</h4>
                  <p className="text-xs text-muted">
                    Pay securely in cash or UPI QR to the BlueDart courier partner upon delivery.
                  </p>
                  <div className="cod-badge">Free 1-Click Verification</div>
                </div>
              )}

              {/* Security & Idempotency Guarantee */}
              <div className="security-guarantee">
                <span className="security-icon">🛡️</span>
                <span className="text-xs text-muted">
                  NPCI 256-Bit Encrypted · Instant Free Settlement · Atomic Idempotency Protection
                </span>
              </div>

              {/* Authorize & Pay Submit Button */}
              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg mt-4"
                disabled={isProcessing || secondsRemaining <= 0}
              >
                {isProcessing ? (
                  <span className="btn-spinner-content">
                    <span className="spinner"></span>
                    <span>Confirming with Payment Switch...</span>
                  </span>
                ) : (
                  <span>⚡ Pay ₹{finalPayable.toLocaleString('en-IN')} (Free Instant Checkout)</span>
                )}
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
}
