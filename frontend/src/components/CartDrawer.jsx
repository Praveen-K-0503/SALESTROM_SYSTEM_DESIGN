import React, { useState } from 'react';
import { ProductVisual } from './ProductIllustrations';

export default function CartDrawer({
  cartItems,
  onClose,
  onProceedCheckout,
  onRemoveItem
}) {
  const [couponCode, setCouponCode] = useState('UPIFREE');
  const [discount, setDiscount] = useState(1000);

  const subtotal = cartItems.reduce((acc, item) => acc + (item.sale_price * (item.quantity || 1)), 0);
  const finalTotal = Math.max(0, subtotal - discount);

  return (
    <div className="cart-backdrop" onClick={onClose}>
      <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        
        {/* Drawer Header */}
        <div className="cart-drawer-header">
          <div className="cart-title-row">
            <span className="cart-icon">🛍️</span>
            <h3>Shopping Bag ({cartItems.length} {cartItems.length === 1 ? 'Item' : 'Items'})</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Free Shipping Progress */}
        <div className="free-shipping-bar">
          <span className="text-xs text-success font-semibold">✓ BlueDart Express Priority Air Included (Free of Cost)</span>
        </div>

        {/* Items List */}
        <div className="cart-items-container">
          {cartItems.length === 0 ? (
            <div className="cart-empty-state">
              <span className="empty-cart-icon">🛍️</span>
              <h4>Your Bag is Empty</h4>
              <p className="text-xs text-muted">Browse the live drops and reserve your exclusive unit.</p>
            </div>
          ) : (
            cartItems.map((item) => (
              <div key={item.id} className="cart-item-row">
                <div className="cart-item-visual">
                  <ProductVisual productId={item.id} className="w-16 h-16" />
                </div>
                <div className="cart-item-details">
                  <span className="badge badge-primary">{item.sku}</span>
                  <h4>{item.name}</h4>
                  <p className="text-xs text-muted">Stock: <strong>{item.available_quantity} Left</strong></p>
                  <div className="cart-item-price font-mono font-bold text-primary">
                    ₹{item.sale_price.toLocaleString('en-IN')}
                  </div>
                </div>
                <button
                  className="cart-remove-btn"
                  title="Remove from bag"
                  onClick={() => onRemoveItem(item.id)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* Cart Footer Summary */}
        {cartItems.length > 0 && (
          <div className="cart-footer">
            
            {/* Promo Code Input */}
            <div className="cart-coupon-box">
              <div className="coupon-input-group">
                <input
                  type="text"
                  className="input-field font-mono uppercase"
                  placeholder="Promo Code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    if (couponCode === 'FLASH500') setDiscount(500);
                    else if (couponCode === 'UPIFREE') setDiscount(1000);
                    else if (couponCode === 'FESTIVE2026') setDiscount(2000);
                    else alert('Coupon invalid');
                  }}
                >
                  Apply
                </button>
              </div>
              {discount > 0 && (
                <span className="text-xs text-success font-semibold mt-1">
                  ✓ Voucher applied (-₹{discount.toLocaleString('en-IN')})
                </span>
              )}
            </div>

            {/* Calculations */}
            <div className="cart-totals-list">
              <div className="cart-total-row">
                <span>Subtotal</span>
                <span>₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              {discount > 0 && (
                <div className="cart-total-row text-success">
                  <span>Voucher Discount</span>
                  <span>-₹{discount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="cart-total-row">
                <span>BlueDart Express Air</span>
                <span className="text-success font-semibold">FREE</span>
              </div>
              <div className="cart-total-row net-row">
                <span>Total Amount</span>
                <span className="font-mono text-xl font-extrabold text-primary">₹{finalTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Action */}
            <button
              className="btn btn-primary btn-block btn-lg mt-3"
              onClick={() => onProceedCheckout(cartItems[0])}
            >
              ⚡ Instant 10-Min Hold & Checkout
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
