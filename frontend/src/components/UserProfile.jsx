import React, { useState, useEffect } from 'react';

export default function UserProfile({ currentUser, onUpdateCurrentUser, onLogout }) {
  const [profileData, setProfileData] = useState(currentUser);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  // Editable profile form state
  const [editName, setEditName] = useState(currentUser.name || '');
  const [editEmail, setEditEmail] = useState(currentUser.email || '');
  const [editPhone, setEditPhone] = useState(currentUser.phone || '+91 98765 43210');
  const [editUpi, setEditUpi] = useState(currentUser.upi_id || '');

  // Add Address Modal state
  const [showAddAddrModal, setShowAddAddrModal] = useState(false);
  const [newAddrName, setNewAddrName] = useState(currentUser.name || '');
  const [newAddrPhone, setNewAddrPhone] = useState(currentUser.phone || '+91 98765 43210');
  const [newAddrPin, setNewAddrPin] = useState('560038');
  const [newAddrLine, setNewAddrLine] = useState('');
  const [newAddrLocality, setNewAddrLocality] = useState('');
  const [newAddrCity, setNewAddrCity] = useState('Bengaluru');
  const [newAddrState, setNewAddrState] = useState('Karnataka');
  const [newAddrType, setNewAddrType] = useState('HOME');
  const [newAddrIsDefault, setNewAddrIsDefault] = useState(false);

  // Fetch live addresses and profile from API
  const loadUserData = async () => {
    try {
      // 1. Fetch profile & stats
      const userRes = await fetch(`/api/users/${currentUser.id}`);
      if (userRes.ok) {
        const u = await userRes.json();
        setProfileData(u);
        setEditName(u.name);
        setEditEmail(u.email);
        setEditPhone(u.phone || '+91 98765 43210');
        setEditUpi(u.upi_id || '');
      }

      // 2. Fetch addresses
      const addrRes = await fetch(`/api/users/${currentUser.id}/addresses`);
      if (addrRes.ok) {
        const d = await addrRes.json();
        setAddresses(d.addresses || []);
      }
    } catch (err) {
      console.error('Failed to load user addresses:', err);
    }
  };

  useEffect(() => {
    loadUserData();
  }, [currentUser]);

  // Save profile changes (PUT /api/users/{id})
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaveSuccess('');
    setSaveError('');

    try {
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim(),
          upi_id: editUpi.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update profile.');

      setSaveSuccess('Profile updated successfully in real database!');
      if (onUpdateCurrentUser) {
        onUpdateCurrentUser(data.user);
      }
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (err) {
      setSaveError(err.message || 'Error updating profile.');
    } finally {
      setLoading(false);
    }
  };

  // Add new address (POST /api/users/{id}/addresses)
  const handleAddAddress = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${currentUser.id}/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAddrName.trim(),
          phone: newAddrPhone.trim(),
          pincode: newAddrPin.trim(),
          address_line: newAddrLine.trim(),
          locality: newAddrLocality.trim(),
          city: newAddrCity.trim(),
          state: newAddrState.trim(),
          address_type: newAddrType,
          is_default: newAddrIsDefault
        })
      });

      if (res.ok) {
        setShowAddAddrModal(false);
        setNewAddrLine('');
        setNewAddrLocality('');
        await loadUserData();
      } else {
        const d = await res.json();
        alert(d.detail || 'Failed to add address');
      }
    } catch (err) {
      alert('Error creating address: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Set default address (PUT /api/users/{id}/addresses/{aid}/default)
  const handleSetDefaultAddress = async (addressId) => {
    try {
      const res = await fetch(`/api/users/${currentUser.id}/addresses/${addressId}/default`, {
        method: 'PUT'
      });
      if (res.ok) {
        await loadUserData();
      }
    } catch (err) {
      console.error('Failed to set default address:', err);
    }
  };

  // Delete address (DELETE /api/users/{id}/addresses/{aid})
  const handleDeleteAddress = async (addressId) => {
    if (!window.confirm('Are you sure you want to remove this delivery address?')) return;
    try {
      const res = await fetch(`/api/users/${currentUser.id}/addresses/${addressId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await loadUserData();
      }
    } catch (err) {
      console.error('Failed to delete address:', err);
    }
  };

  return (
    <div className="profile-page-container">
      
      {/* Top Profile Summary Card */}
      <div className="profile-header-card">
        <div className="profile-avatar-large">👤</div>
        <div className="profile-info-block">
          <div className="badge badge-accent">VERIFIED VIP BUYER</div>
          <h2>{profileData.name}</h2>
          <p className="text-xs text-muted">
            Customer ID: <code className="font-mono">{profileData.id}</code> · Mobile: <strong>{profileData.phone || '+91 98765 43210'}</strong> · Email: <strong>{profileData.email}</strong>
          </p>
          <div className="profile-stats-row mt-2">
            <span className="profile-stat-tag">📦 Total Orders: <strong>{profileData.orders_count || 0}</strong></span>
            <span className="profile-stat-tag">❤️ Wishlist Items: <strong>{profileData.wishlist_count || 0}</strong></span>
            <span className="profile-stat-tag">📍 Saved Addresses: <strong>{addresses.length}</strong></span>
            <span className="profile-stat-tag">⚡ Free UPI Rails: <strong>Active</strong></span>
          </div>
        </div>

        <div className="profile-header-actions">
          <button className="btn btn-outline btn-sm" onClick={onLogout}>
            🚪 Sign Out
          </button>
        </div>
      </div>

      {/* Grid: 2 Columns (Profile Edit & Addresses) */}
      <div className="profile-grid mt-4">
        
        {/* Left Column: Personal Information (Edit Profile) */}
        <div className="profile-col-card">
          <div className="card-title-row">
            <h3>👤 Personal & Account Information</h3>
            <span className="text-xs text-muted">Real-Time DB Sync</span>
          </div>

          {saveSuccess && <div className="auth-alert success mb-3">✓ {saveSuccess}</div>}
          {saveError && <div className="auth-alert error mb-3">⚠️ {saveError}</div>}

          <form onSubmit={handleSaveProfile} className="profile-edit-form">
            <div className="form-group">
              <label>Full Legal Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label>Primary Mobile Number (+91)</label>
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                required
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label>Linked UPI ID / VPA (For Zero-Fee 1-Click Payments)</label>
              <input
                type="text"
                value={editUpi}
                onChange={(e) => setEditUpi(e.target.value)}
                placeholder="e.g. praveen@okaxis or 9876543210@paytm"
                className="input-field"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving Changes...' : '💾 Save Profile Changes'}
            </button>
          </form>

          {/* Security & KYC Badge */}
          <div className="security-notice-box mt-4">
            <div className="sec-icon">🔒</div>
            <div>
              <strong>NPCI & RBI Certified Account Tokenization</strong>
              <p className="text-xs text-muted">
                Your payment VPAs and contact records are encrypted with SHA-256 and AES standards. Zero gateway fees apply on all UPI & RuPay transactions.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Address Book CRUD */}
        <div className="profile-col-card">
          <div className="card-title-row">
            <div>
              <h3>📍 Delivery Address Book</h3>
              <p className="text-xs text-muted">BlueDart Air Priority Express Serviceable</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddAddrModal(true)}>
              + Add New Address
            </button>
          </div>

          <div className="addresses-list mt-3">
            {addresses.length === 0 ? (
              <div className="empty-addresses-box">
                <p className="text-xs text-muted">No saved delivery addresses found.</p>
                <button className="btn btn-outline btn-sm mt-2" onClick={() => setShowAddAddrModal(true)}>
                  Add Address Now
                </button>
              </div>
            ) : (
              addresses.map((addr) => (
                <div key={addr.id} className={`address-item-card ${addr.is_default ? 'active-address' : ''}`}>
                  <div className="address-type-row">
                    <div className="addr-tag-group">
                      <span className="badge badge-secondary">{addr.address_type || 'HOME'}</span>
                      {addr.is_default ? (
                        <span className="badge badge-primary">DEFAULT ADDRESS</span>
                      ) : (
                        <button
                          className="btn-set-default"
                          onClick={() => handleSetDefaultAddress(addr.id)}
                        >
                          Set as Default
                        </button>
                      )}
                    </div>

                    <button
                      className="btn-del-address"
                      title="Delete Address"
                      onClick={() => handleDeleteAddress(addr.id)}
                    >
                      🗑️
                    </button>
                  </div>

                  <strong className="text-sm font-semibold">{addr.name}</strong>
                  <p className="text-xs text-body mt-1">
                    {addr.address_line}{addr.locality ? `, ${addr.locality}` : ''}
                  </p>
                  <p className="text-xs text-muted">
                    {addr.city}, {addr.state} - <strong className="font-mono">{addr.pincode}</strong>
                  </p>
                  <p className="text-xs font-mono text-muted mt-1">📞 {addr.phone}</p>
                </div>
              ))
            )}
          </div>

          {/* Linked Payment Methods */}
          <div className="mt-4 pt-3 border-top">
            <h4 className="text-xs font-bold uppercase text-muted mb-2">Linked Free Payment Rails</h4>
            <div className="linked-methods-list">
              <div className="linked-method-item">
                <div className="method-icon-pill">UPI</div>
                <div>
                  <strong>Instant UPI QR & Intent</strong>
                  <p className="text-xs font-mono text-muted">{editUpi || 'praveen@okaxis'}</p>
                </div>
                <span className="badge badge-success">0% Fee</span>
              </div>
              <div className="linked-method-item">
                <div className="method-icon-pill">RuPay</div>
                <div>
                  <strong>RuPay Debit & Credit Cards</strong>
                  <p className="text-xs text-muted">Zero Surcharge Mandate (RBI)</p>
                </div>
                <span className="badge badge-success">Verified</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ==================================================================== */}
      {/* Add Address Modal */}
      {/* ==================================================================== */}
      {showAddAddrModal && (
        <div className="modal-backdrop" onClick={() => setShowAddAddrModal(false)}>
          <div className="modal-dialog add-address-modal" onClick={(e) => e.stopPropagation()}>
            <div className="address-modal-header">
              <h3>Add New Delivery Address</h3>
              <button className="close-btn" onClick={() => setShowAddAddrModal(false)}>×</button>
            </div>

            <form onSubmit={handleAddAddress} className="address-form">
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Recipient Name *</label>
                  <input
                    type="text"
                    required
                    value={newAddrName}
                    onChange={(e) => setNewAddrName(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="form-group">
                  <label>10-Digit Mobile Number *</label>
                  <input
                    type="text"
                    required
                    value={newAddrPhone}
                    onChange={(e) => setNewAddrPhone(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>6-Digit Pincode *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={newAddrPin}
                    onChange={(e) => setNewAddrPin(e.target.value)}
                    className="input-field font-mono"
                  />
                </div>
                <div className="form-group">
                  <label>Locality / Area / Landmark</label>
                  <input
                    type="text"
                    value={newAddrLocality}
                    onChange={(e) => setNewAddrLocality(e.target.value)}
                    placeholder="Near Metro Station"
                    className="input-field"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Flat, House No., Building, Apartment, Street *</label>
                <input
                  type="text"
                  required
                  value={newAddrLine}
                  onChange={(e) => setNewAddrLine(e.target.value)}
                  placeholder="e.g. 42 Indiranagar 100ft Road"
                  className="input-field"
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>City / District *</label>
                  <input
                    type="text"
                    required
                    value={newAddrCity}
                    onChange={(e) => setNewAddrCity(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="form-group">
                  <label>State *</label>
                  <input
                    type="text"
                    required
                    value={newAddrState}
                    onChange={(e) => setNewAddrState(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Address Type</label>
                <div className="address-type-selector">
                  <button
                    type="button"
                    className={`type-btn ${newAddrType === 'HOME' ? 'active' : ''}`}
                    onClick={() => setNewAddrType('HOME')}
                  >
                    🏠 Home (All Day Delivery)
                  </button>
                  <button
                    type="button"
                    className={`type-btn ${newAddrType === 'WORK' ? 'active' : ''}`}
                    onClick={() => setNewAddrType('WORK')}
                  >
                    🏢 Work (10 AM - 6 PM)
                  </button>
                </div>
              </div>

              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="chk-default"
                  checked={newAddrIsDefault}
                  onChange={(e) => setNewAddrIsDefault(e.target.checked)}
                />
                <label htmlFor="chk-default">Make this my default shipping address</label>
              </div>

              <div className="modal-actions-row mt-3">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddAddrModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Delivery Address'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
