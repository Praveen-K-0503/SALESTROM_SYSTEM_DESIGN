import React, { useState } from 'react';

const PRODUCT_IMAGE_MAP = {
  'prod-apex-watch': '/images/apex_watch.jpg',
  'prod-titan-ring': '/images/titan_ring.jpg',
  'prod-nebula-audio': '/images/nebula_headphones.jpg',
  'prod-aerobeats-buds': '/images/aerobeats_buds.jpg',
  'prod-quantum-key': '/images/quantum_keyboard.jpg',
  'prod-viper-mouse': '/images/viper_mouse.jpg',
  'prod-aerodrone-4k': '/images/aerovision_drone.jpg',
  'prod-gimbal-camera': '/images/gimbal_camera.jpg'
};

const PRODUCT_FALLBACK_ICONS = {
  'prod-apex-watch': '⌚',
  'prod-titan-ring': '💍',
  'prod-nebula-audio': '🎧',
  'prod-aerobeats-buds': '🎵',
  'prod-quantum-key': '⌨️',
  'prod-viper-mouse': '🖱️',
  'prod-aerodrone-4k': '🛸',
  'prod-gimbal-camera': '📷'
};

export function ProductVisual({ productId, className = "product-real-image", alt = "Drop Product" }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = PRODUCT_IMAGE_MAP[productId] || '/images/apex_watch.jpg';
  const icon = PRODUCT_FALLBACK_ICONS[productId] || '📦';

  return (
    <div className={`product-img-wrapper ${className}`}>
      {!imgError ? (
        <img
          src={imgSrc}
          alt={alt}
          className="product-photo"
          loading="eager"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="product-fallback-box">
          <span className="fallback-emoji">{icon}</span>
          <span className="fallback-title">{alt}</span>
        </div>
      )}
    </div>
  );
}
