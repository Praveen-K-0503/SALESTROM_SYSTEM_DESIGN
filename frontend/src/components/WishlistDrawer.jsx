import React from 'react';
import { ProductVisual } from './ProductIllustrations';

export default function WishlistDrawer({
  isOpen,
  onClose,
  wishlistItems,
  onRemoveFromWishlist,
  onAddToCart,
  onReserveProduct
}) {
  if (!isOpen) return null;

  return (
    <div className="cart-backdrop" onClick={onClose}>
      <div className="cart-drawer-panel" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="cart-header">
          <div className="cart-header-title">
            <span className="cart-icon">❤️</span>
            <h3>Saved Wishlist ({wishlistItems.length})</h3>
          </div>
          <button className="cart-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Content */}
        {wishlistItems.length === 0 ? (
          <div className="cart-empty-state">
            <div className="empty-cart-emoji">🤍</div>
            <h4>Your Wishlist is Empty</h4>
            <p className="text-xs text-muted">
              Tap the heart icon on any drop product to save it for quick access before inventory sells out.
            </p>
            <button className="btn btn-primary mt-4" onClick={onClose}>
              Explore Drops
            </button>
          </div>
        ) : (
          <div className="cart-items-scroll">
            {wishlistItems.map((item) => (
              <div key={item.id} className="cart-item-row">
                <div className="cart-item-visual">
                  <ProductVisual productId={item.id} alt={item.name} />
                </div>

                <div className="cart-item-details">
                  <h4 className="cart-item-name">{item.name}</h4>
                  <p className="cart-item-sku">{item.tagline || item.sku}</p>
                  
                  <div className="cart-item-price-row">
                    <span className="cart-item-price">₹{item.sale_price.toLocaleString('en-IN')}</span>
                    {item.available_quantity > 0 ? (
                      <span className="badge badge-success text-xs">In Stock ({item.available_quantity})</span>
                    ) : (
                      <span className="badge badge-danger text-xs">Sold Out</span>
                    )}
                  </div>

                  <div className="wishlist-action-btns">
                    <button
                      className="btn btn-primary btn-xs"
                      disabled={item.available_quantity <= 0}
                      onClick={() => {
                        onAddToCart(item);
                        onRemoveFromWishlist(item.id);
                      }}
                    >
                      🛍️ Move to Bag
                    </button>
                    <button
                      className="btn btn-outline btn-xs"
                      onClick={() => onRemoveFromWishlist(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="cart-footer">
          <button className="btn btn-outline btn-block" onClick={onClose}>
            Continue Shopping
          </button>
        </div>

      </div>
    </div>
  );
}
