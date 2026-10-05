import React, { useState } from 'react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  if (!isOpen) return null;

  const [mode, setMode] = useState('LOGIN'); // 'LOGIN' or 'REGISTER'
  const [loginInput, setLoginInput] = useState('');
  const [password, setPassword] = useState('');
  
  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regUpi, setRegUpi] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: loginInput.trim(),
          password: password
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Login failed. Please check credentials.');
      }

      setSuccessMsg('Welcome back, ' + data.user.name + '!');
      if (onAuthSuccess) {
        onAuthSuccess(data.user, data.token);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          phone: regPhone.trim(),
          password: regPassword,
          shipping_address: regAddress.trim() || 'Indiranagar, Bengaluru, Karnataka 560038',
          upi_id: regUpi.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Registration failed. Email or phone already in use.');
      }

      setSuccessMsg('Account registered successfully! Welcome to SALESTORM.');
      if (onAuthSuccess) {
        onAuthSuccess(data.user, data.token);
      }
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      setErrorMsg(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const fillQuickDemo = (email, pwd) => {
    setLoginInput(email);
    setPassword(pwd);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog auth-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="auth-modal-header">
          <div className="auth-brand-row">
            <span className="auth-brand-logo">⚡ SALESTORM</span>
            <span className="auth-subtitle">India's Premier Flash Vault</span>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Tab switch */}
        <div className="auth-tab-switch">
          <button
            className={`auth-tab ${mode === 'LOGIN' ? 'active' : ''}`}
            onClick={() => { setMode('LOGIN'); setErrorMsg(''); setSuccessMsg(''); }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${mode === 'REGISTER' ? 'active' : ''}`}
            onClick={() => { setMode('REGISTER'); setErrorMsg(''); setSuccessMsg(''); }}
          >
            Create New Account
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && <div className="auth-alert error">⚠️ {errorMsg}</div>}
        {successMsg && <div className="auth-alert success">✓ {successMsg}</div>}

        {/* SIGN IN FORM */}
        {mode === 'LOGIN' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email Address or Mobile Number</label>
              <input
                type="text"
                placeholder="e.g. praveen@salestorm.in or +91 98765 43210"
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                required
                className="input-field"
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label>Password</label>
                <span className="text-xs text-muted">Demo: salestorm123</span>
              </div>
              <input
                type="password"
                placeholder="Enter account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-field"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Verifying Account...' : 'Sign In to SALESTORM'}
            </button>

            {/* Quick Demo Credentials */}
            <div className="quick-demo-box">
              <span className="text-xs font-semibold text-muted">Quick Demo Accounts:</span>
              <div className="quick-demo-chips">
                <button
                  type="button"
                  className="demo-chip"
                  onClick={() => fillQuickDemo('praveen@salestorm.in', 'salestorm123')}
                >
                  👤 Praveen Kumar (Bengaluru)
                </button>
                <button
                  type="button"
                  className="demo-chip"
                  onClick={() => fillQuickDemo('ananya.sharma@techmail.in', 'salestorm123')}
                >
                  👤 Ananya Sharma (Mumbai)
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* REGISTRATION FORM */
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Rohan Patel"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label>10-Digit Mobile (+91) *</label>
                <input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  required
                  className="input-field"
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Email Address *</label>
                <input
                  type="email"
                  placeholder="name@domain.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label>Create Password *</label>
                <input
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input-field"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Delivery Address in India (Street, City, State, Pincode)</label>
              <input
                type="text"
                placeholder="Flat / House / Apartment, Area, City, State - PIN"
                value={regAddress}
                onChange={(e) => setRegAddress(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label>UPI ID / VPA (Optional for 1-Click Zero-Fee Checkout)</label>
              <input
                type="text"
                placeholder="e.g. username@okhdfcbank"
                value={regUpi}
                onChange={(e) => setRegUpi(e.target.value)}
                className="input-field"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Creating Account...' : 'Complete Registration'}
            </button>
          </form>
        )}

        <div className="auth-footer-notice">
          <span>🔒 256-Bit SSL Encrypted · NPCI & RBI Certified Payment Rails</span>
        </div>

      </div>
    </div>
  );
}
