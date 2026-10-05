import React from 'react';
import { ProductVisual } from './ProductIllustrations';

export default function OrderReceiptModal({ orderData, onClose, onViewOrders }) {
  if (!orderData) return null;

  const { product, payment_id, transaction_ref, amount, discount_amount, coupon_code, payment_method, shipping_address } = orderData;
  const orderNumber = 'ST-' + Math.floor(100000 + Math.random() * 900000);
  const trackingNumber = 'BD-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog receipt-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Success Header */}
        <div className="receipt-header">
          <div className="receipt-success-icon">✓</div>
          <span className="badge badge-success">PAYMENT SETTLED (ZERO FEE)</span>
          <h2>Thank You For Your Flash Order!</h2>
          <p className="text-sm text-muted">
            Your limited vault allocation has been locked, verified via ACID source of truth, and queued for priority dispatch.
          </p>
        </div>

        {/* Highlighted Order & Tracking Banner */}
        <div className="receipt-summary-banner">
          <div className="summary-item">
            <span className="label">Order Number</span>
            <strong className="value font-mono text-primary">{orderNumber}</strong>
          </div>
          <div className="summary-item">
            <span className="label">BlueDart Air Tracking</span>
            <strong className="value font-mono">{trackingNumber}</strong>
            <span className="subtext">BlueDart Express Priority Air</span>
          </div>
          <div className="summary-item">
            <span className="label">Estimated Delivery</span>
            <strong className="value text-success">Thursday (2 Days)</strong>
            <span className="subtext">Complimentary Insured Air Cargo</span>
          </div>
        </div>

        {/* Live Shipment Progress Tracker */}
        <div className="shipment-tracker-card">
          <h4>Live Order & Dispatch Timeline</h4>
          <div className="stepper-horizontal">
            <div className="step-node completed">
              <div className="step-circle">✓</div>
              <div className="step-label">UPI / Free Pay</div>
              <div className="step-time">Instant (0% Fee)</div>
            </div>
            <div className="step-line completed"></div>
            <div className="step-node completed">
              <div className="step-circle">✓</div>
              <div className="step-label">Stock Allocated</div>
              <div className="step-time">ACID DB</div>
            </div>
            <div className="step-line completed"></div>
            <div className="step-node active">
              <div className="step-circle pulse">3</div>
              <div className="step-label">BLR Hub Pick</div>
              <div className="step-time">Processing</div>
            </div>
            <div className="step-line"></div>
            <div className="step-node">
              <div className="step-circle">4</div>
              <div className="step-label">BlueDart Air</div>
              <div className="step-time">In Transit</div>
            </div>
          </div>
        </div>

        {/* Itemized Order Details */}
        <div className="receipt-details-card">
          <div className="receipt-product-row">
            <div className="receipt-product-visual">
              <ProductVisual productId={product.id} className="w-16 h-16" />
            </div>
            <div className="receipt-product-meta">
              <h4>{product.name}</h4>
              <p className="text-xs text-muted">{product.tagline} · SKU: {product.sku}</p>
              <div className="text-xs text-muted mt-1">
                Payment: <strong className="text-main">{payment_method}</strong> ({transaction_ref || 'Instant Switch Verified'})
              </div>
            </div>
            <div className="receipt-product-price">
              <span className="font-mono font-bold text-lg">₹{amount.toLocaleString('en-IN')}</span>
              <span className="text-xs text-muted">Qty: 1</span>
            </div>
          </div>

          <div className="receipt-breakdown-table">
            <div className="row">
              <span>Item MRP</span>
              <span>₹{product.sale_price.toLocaleString('en-IN')}</span>
            </div>
            {discount_amount > 0 && (
              <div className="row text-success">
                <span>Voucher Code ({coupon_code})</span>
                <span>-₹{discount_amount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="row">
              <span>BlueDart Priority Air Express</span>
              <span className="text-success font-semibold">FREE</span>
            </div>
            <div className="row">
              <span>Payment Gateway Surcharge</span>
              <span className="text-success font-semibold">₹0.00 (Zero Fee)</span>
            </div>
            <div className="row total">
              <span>Total Paid</span>
              <span className="font-mono text-primary">₹{amount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="receipt-shipping-address">
            <span className="text-xs text-muted uppercase font-bold">Delivery Address (India)</span>
            <p className="text-sm font-medium">{shipping_address}</p>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="receipt-actions">
          <button className="btn btn-outline" onClick={handlePrint}>
            🖨️ Print GST Invoice
          </button>
          <button className="btn btn-primary" onClick={onViewOrders}>
            📦 Track in My Orders
          </button>
          <button className="btn btn-subtle" onClick={onClose}>
            Back to Store
          </button>
        </div>

      </div>
    </div>
  );
}
