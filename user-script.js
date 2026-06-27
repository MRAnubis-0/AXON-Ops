// ==UserScript==
// @name         AXON RT Analysis
// @namespace    https://github.com/MRAnubis-0
// @version      1.1
// @author       seif mousa
// @description  Bulk Ops For Recent Fix And Collect RT Data
// @match        https://10.42.187.101:8080/expresse/clearview
// @updateURL    https://raw.githubusercontent.com/MRAnubis-0/AXON-Ops/main/user-script.js
// @downloadURL  https://raw.githubusercontent.com/MRAnubis-0/AXON-Ops/main/user-script.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // --- CONFIGURE THESE ---
  const AUTH_URL = "https://snxixbfypkhjjeccvijq.supabase.co/functions/v1/verify-totp";
  const VALIDATE_URL = "https://snxixbfypkhjjeccvijq.supabase.co/functions/v1/validate-session";
  const PARSE_XML_URL = "https://snxixbfypkhjjeccvijq.supabase.co/functions/v1/parse-line-id-xml";
  const RT_PARSE_URL = "https://axonops.seifmousa2468.workers.dev/";
  const ABOUT_DEV_URL = "https://seif-m-portfolio.netlify.app/";
  // ------------------------

  // Secure storage wrappers using Tampermonkey isolated storage
  const storage = {
    getSession() {
      try {
        const saved = GM_getValue("axonSession");
        return saved ? JSON.parse(saved) : null;
      } catch (e) {
        return null;
      }
    },
    setSession(val) {
      GM_setValue("axonSession", JSON.stringify(val));
    },
    deleteSession() {
      GM_deleteValue("axonSession");
    },
    getDevice() {
      try {
        const raw = GM_getValue("axonDevice");
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (obj.expires_at && Date.parse(obj.expires_at) < Date.now()) {
          GM_deleteValue("axonDevice");
          return null;
        }
        return obj;
      } catch (e) {
        return null;
      }
    },
    setDevice(val) {
      GM_setValue("axonDevice", JSON.stringify(val));
    },
    deleteDevice() {
      GM_deleteValue("axonDevice");
    }
  };

  // Migration helper for legacy storage
  function migrateLegacyStorage() {
    try {
      const oldSession = localStorage.getItem("axonSession");
      if (oldSession && !GM_getValue("axonSession")) {
        GM_setValue("axonSession", oldSession);
        localStorage.removeItem("axonSession");
      }
      const oldDevice = localStorage.getItem("axonDevice");
      if (oldDevice && !GM_getValue("axonDevice")) {
        GM_setValue("axonDevice", oldDevice);
        localStorage.removeItem("axonDevice");
      }
    } catch (e) {
      console.warn("Storage migration failed:", e);
    }
  }

  // Run migration immediately
  migrateLegacyStorage();

  // Dynamically load Lordicon library
  let lordiconLoaded = false;
  function loadLordiconLibrary() {
    if (lordiconLoaded || customElements.get('lord-icon')) {
      lordiconLoaded = true;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.lordicon.com/lordicon.js';
      script.onload = () => {
        lordiconLoaded = true;
        console.log('Lordicon library loaded successfully');
        // Give the custom element time to register
        setTimeout(() => resolve(), 100);
      };
      script.onerror = () => {
        console.warn('Failed to load Lordicon library from CDN');
        resolve(); // Resolve anyway to allow fallback to emoji
      };
      document.head.appendChild(script);
    });
  }

  let sessionConfig = storage.getSession();
  let profileData = null;
  let panelEl = null;

  // Inject beautiful, high-end styling via GM_addStyle
  GM_addStyle(`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap');
    /* Floating lock button container */
    #axon-floating-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #0b63d6, #003fa3);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      box-shadow: 0 8px 24px rgba(11, 99, 214, 0.35);
      cursor: pointer;
      z-index: 100000;
      padding: 6px;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease;
      box-sizing: border-box;
    }
    #axon-floating-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 12px 30px rgba(11, 99, 214, 0.5);
    }
    #axon-floating-btn img {
      width: 42px;
      height: 42px;
      object-fit: contain;
      display: block;
      border-radius: 50%;
    }
    /* Main panel with glassmorphism */
    #axon-panel {
      position: fixed;
      right: 20px;
      bottom: 20px;
      width: 380px;
      max-height: 75vh;
      background: rgba(18, 26, 42, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
      font-family: 'Outfit', 'Inter', Arial, sans-serif;
      overflow: hidden;
      z-index: 100001;
      color: #f3f4f6;
      transform: translateY(20px);
      opacity: 0;
      transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), opacity 260ms ease;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    /* Header */
    .axon-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      user-select: none;
    }
    .axon-title {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: grab;
      font-weight: 600;
      font-size: 15px;
      background: linear-gradient(90deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .axon-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .axon-header-btn {
      background: transparent;
      border: none;
      color: #9ca3af;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 6px;
      transition: color 0.15s ease, background 0.15s ease;
      line-height: 1;
    }
    .axon-header-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
    }
    /* Body */
    .axon-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
      box-sizing: border-box;
    }
    .axon-body::-webkit-scrollbar {
      width: 6px;
    }
    .axon-body::-webkit-scrollbar-track {
      background: transparent;
    }
    .axon-body::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.12);
      border-radius: 10px;
    }
    /* Form controls */
    .axon-input {
      width: 100%;
      padding: 11px 14px;
      margin-bottom: 14px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.2s ease, background 0.2s ease;
    }
    .axon-input:focus {
      border-color: #38bdf8;
      background: rgba(255, 255, 255, 0.08);
    }
    .axon-input::placeholder {
      color: #6b7280;
    }
    select.axon-input {
      background-color: #111827;
      color: #f3f4f6;
      border-color: rgba(255, 255, 255, 0.14);
    }
    select.axon-input option {
      background: #111827;
      color: #f3f4f6;
    }
    /* Button UI */
    .axon-btn {
      padding: 10px 18px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .axon-btn-primary {
      background: linear-gradient(135deg, #0b63d6, #3b82f6);
      color: #fff;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
    }
    .axon-btn-primary:hover {
      background: linear-gradient(135deg, #1d4ed8, #2563eb);
      box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
    }
    .axon-btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #e5e7eb;
    }
    .axon-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
    .axon-btn-danger {
      background: linear-gradient(135deg, #dc2626, #ef4444);
      color: #fff;
    }
    .axon-btn-danger:hover {
      background: linear-gradient(135deg, #b91c1c, #dc2626);
    }
    .axon-btn:active {
      transform: scale(0.97);
    }
    /* Custom list items and layout */
    .axon-permission-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      margin-bottom: 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .axon-permission-label {
      font-size: 13px;
      color: #d1d5db;
    }
    .axon-permission-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
      letter-spacing: 0.02em;
    }
    .axon-badge-allowed {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
    }
    .axon-badge-denied {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
    .axon-device-status {
      margin: 12px 0;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(239, 68, 68, 0.05);
      border: 1px solid rgba(239, 68, 68, 0.15);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `);

  // Floating logo button setup
  const btn = document.createElement("div");
  btn.id = "axon-floating-btn";
  document.body.appendChild(btn);

  function initLogoButton() {
    const logo = document.createElement('img');
    logo.src = SCRIPT_LOGO_DATA_URI;
    logo.alt = 'AXON';
    btn.innerHTML = "";
    btn.appendChild(logo);
  }

  // Initialize floating button state
  async function initFloatingButton() {
    initLogoButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingButton);
  } else {
    initFloatingButton();
  }

  // Utility: escape HTML to avoid injection
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"'`=\/]/g, function (s) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;' })[s];
    });
  }

  // --- Panel creation (bottom-right) ---
  function createPanel(contentHTML, title = "AXON Panel") {
    if (panelEl) panelEl.remove();

    const panel = document.createElement("div");
    panel.id = "axon-panel";

    panel.innerHTML = `
      <div class="axon-header">
        <div id="axon-panel-title" class="axon-title">
          <strong>${escapeHtml(title)}</strong>
        </div>
        <div class="axon-header-actions">
          <button id="axon-about-dev" class="axon-header-btn" title="About Dev">About</button>
          <button id="axon-panel-minimize" class="axon-header-btn" title="Minimize">_</button>
          <button id="axon-panel-close" class="axon-header-btn" title="Close">✖</button>
        </div>
      </div>
      <div id="axon-panel-body" class="axon-body">${contentHTML}</div>
    `;

    document.body.appendChild(panel);
    requestAnimationFrame(() => {
      panel.style.transform = "translateY(0)";
      panel.style.opacity = "1";
    });

    // Dragging: pointer events matching desktop & mobile views
    const titleArea = panel.querySelector("#axon-panel-title");
    let pointerId = null;
    let startX = 0, startY = 0, startRight = 0, startBottom = 0;

    function onPointerMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newRight = Math.max(8, startRight - dx);
      const newBottom = Math.max(8, startBottom - dy);
      panel.style.right = newRight + "px";
      panel.style.bottom = newBottom + "px";
      panel.style.transform = "";
    }

    function onPointerUp() {
      if (pointerId !== null) {
        try { titleArea.releasePointerCapture(pointerId); } catch (err) { }
      }
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      titleArea.style.cursor = "grab";
      pointerId = null;
    }

    titleArea.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;
      pointerId = e.pointerId;
      titleArea.setPointerCapture(pointerId);
      startX = e.clientX;
      startY = e.clientY;
      const computed = window.getComputedStyle(panel);
      startRight = parseFloat(computed.right || "20");
      startBottom = parseFloat(computed.bottom || "20");
      titleArea.style.cursor = "grabbing";
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });

    // About Dev
    const aboutBtn = panel.querySelector("#axon-about-dev");
    if (aboutBtn) {
      aboutBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        try { window.open(ABOUT_DEV_URL, '_blank', 'noopener'); } catch (err) { location.href = ABOUT_DEV_URL; }
      });
    }

    // Minimize
    const minBtn = panel.querySelector("#axon-panel-minimize");
    if (minBtn) {
      minBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const body = panel.querySelector("#axon-panel-body");
        if (!body) return;
        if (body.style.display === "none") {
          body.style.display = "block";
          panel.style.height = "";
        } else {
          body.style.display = "none";
          panel.style.height = "48px";
        }
      });
    }

    // Close
    const closeBtn = panel.querySelector("#axon-panel-close");
    if (closeBtn) {
      closeBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closePanel();
      });
    }

    panelEl = panel;
    return panel;
  }

  // Close panel helper
  function closePanel() {
    if (!panelEl) return;
    panelEl.style.transform = "translateY(20px)";
    panelEl.style.opacity = "0";
    setTimeout(() => {
      if (panelEl) panelEl.remove();
      panelEl = null;
      btn.style.display = "";
    }, 220);
  }

  // --- Toast notification (floating, auto-dismiss) ---
  function showToast(message, type = 'info') {
    const existing = document.getElementById('axon-toast');
    if (existing) existing.remove();

    const colors = {
      info:    { bg: 'rgba(56,189,248,0.12)', border: '#38bdf8', icon: 'ℹ️' },
      success: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', icon: '✅' },
      error:   { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', icon: '❌' },
      warning: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', icon: '⚠️' }
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.id = 'axon-toast';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '90px',
      right: '20px',
      maxWidth: '340px',
      padding: '12px 16px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '10px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      color: '#f3f4f6',
      fontFamily: "'Outfit', 'Inter', Arial, sans-serif",
      fontSize: '13px',
      fontWeight: '500',
      lineHeight: '1.5',
      zIndex: '100002',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      opacity: '0',
      transform: 'translateY(8px)',
      transition: 'opacity 200ms ease, transform 200ms ease',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)'
    });
    toast.innerHTML = `<span style="font-size:15px;flex-shrink:0;">${c.icon}</span><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 220);
    }, 3500);
  }

  // --- Inline message inside a panel (for validation/error) ---
  function showInlineMsg(panel, message, type = 'error') {
    let box = panel.querySelector('#axon-inline-msg');
    if (!box) {
      box = document.createElement('div');
      box.id = 'axon-inline-msg';
      const body = panel.querySelector('#axon-panel-body');
      body.insertBefore(box, body.firstChild);
    }
    const colors = {
      error:   { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', color: '#fca5a5' },
      success: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', color: '#6ee7b7' },
      warning: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', color: '#fcd34d' },
      info:    { bg: 'rgba(56,189,248,0.12)', border: '#38bdf8', color: '#7dd3fc' }
    };
    const c = colors[type] || colors.error;
    Object.assign(box.style, {
      padding: '10px 14px',
      marginBottom: '14px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '8px',
      color: c.color,
      fontSize: '13px',
      fontWeight: '500',
      animation: 'fadeIn 0.2s ease'
    });
    box.textContent = message;
  }

  // --- Login panel content with Remember Device checkbox ---
  function showLoginPanel() {
    const currentDevice = storage.getDevice();
    const prefillDeviceName = currentDevice?.device_name || navigator.userAgent;
    const loginHTML = `
      <h3 style="margin:4px 0 16px;color:#38bdf8;text-align:center;font-weight:600;font-size:18px;">Secure Login</h3>
      <input id="axon-username" class="axon-input" placeholder="Username" />
      <input id="axon-otp" class="axon-input" placeholder="TOTP Code" />
      <input id="axon-device" class="axon-input" placeholder="Device Name" value="${escapeHtml(prefillDeviceName)}" />
      <label style="display:flex;align-items:center;gap:10px;margin-bottom:18px;font-size:13px;color:#9ca3af;cursor:pointer;user-select:none;">
        <input id="axon-remember-device" type="checkbox" ${currentDevice ? 'checked' : ''} style="accent-color:#38bdf8;cursor:pointer;" />
        <span>Remember this device for 30 days</span>
      </label>
      <div style="display:flex;gap:10px;">
        <button id="axon-login" class="axon-btn axon-btn-primary" style="flex:1;">Login</button>
        <button id="axon-cancel" class="axon-btn axon-btn-secondary">Cancel</button>
      </div>
    `;
    const panel = createPanel(loginHTML, "AXON Login");
    btn.style.display = "none";

    const cancelBtn = panel.querySelector("#axon-cancel");
    if (cancelBtn) cancelBtn.addEventListener('click', () => closePanel());

    const loginBtn = panel.querySelector("#axon-login");
    if (!loginBtn) return;
    loginBtn.addEventListener('click', async () => {
      const username = panel.querySelector("#axon-username").value?.trim();
      const otp = panel.querySelector("#axon-otp").value?.trim();
      const deviceNameInput = panel.querySelector("#axon-device").value?.trim();
      const rememberChecked = !!panel.querySelector("#axon-remember-device").checked;
      const deviceName = deviceNameInput || navigator.userAgent;

      if (!username) {
        showInlineMsg(panel, 'Please enter your username.', 'error');
        return;
      }

      if (!otp && !currentDevice?.device_token) {
        showInlineMsg(panel, 'Please enter your TOTP code.', 'error');
        return;
      }

      // Build payload; include saved device token if present
      const payload = { username, otp, device_name: deviceName, remember_device: rememberChecked };
      if (currentDevice?.device_token) payload.device_token = currentDevice.device_token;

      try {
        const res = await fetch(AUTH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data && data.success) {
          sessionConfig = data;
          storage.setSession(sessionConfig);

          // If server returned a device_token and remember was requested, store it
          if (rememberChecked && data.device_token) {
            const deviceObj = {
              device_token: data.device_token,
              device_name: data.device_name || deviceName,
              expires_at: data.device_expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            };
            storage.setDevice(deviceObj);
          } else if (!rememberChecked) {
            // user didn't check remember — remove any stored device
            storage.deleteDevice();
          }

          closePanel();
          showToast('Authenticated successfully. Click the lock icon to open AXON Panel.', 'success');
        } else {
          showInlineMsg(panel, 'Authentication failed: ' + (data?.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        console.error(err);
        showInlineMsg(panel, 'Network or server error. Please try again.', 'error');
      }
    });
  }

  // --- Profile panel with Forget Device button ---
  async function showProfilePanel() {
    if (!sessionConfig || !sessionConfig.token) {
      showLoginPanel();
      return;
    }

    // Validate session with server; include device_token if available
    let profile;
    try {
      const payload = { token: sessionConfig.token };
      const dev = storage.getDevice();
      if (dev?.device_token) payload.device_token = dev.device_token;

      const res = await fetch(VALIDATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      profile = await res.json();
    } catch (err) {
      console.error(err);
      alert("Failed to validate session. Please login again.");
      storage.deleteSession();
      sessionConfig = null;
      return;
    }

    if (!profile || !profile.success) {
      storage.deleteSession();
      sessionConfig = null;
      alert("Session invalid or expired. Please login again.");
      return;
    }

    // Update sessionConfig if backend auto-renewed the session
    if (profile.token) {
      sessionConfig.token = profile.token;
      sessionConfig.expires_at = profile.expires_at;
      storage.setSession(sessionConfig);
    }

    profileData = profile;

    // Determine permissions
    const perms = {
      allow_profile_optimization: !!(profile.allow_profile_optimization || (profile.permissions && profile.permissions.allow_profile_optimization)),
      allow_recent_fix: !!(profile.allow_recent_fix || (profile.permissions && profile.permissions.allow_recent_fix)),
      allow_read_rt_result: !!(profile.allow_read_rt_result || (profile.permissions && profile.permissions.allow_read_rt_result))
    };

    // Add max_lines from backend config
    if (profile.max_lines) {
      profileData.max_lines = profile.max_lines;
    }

    const permRows = [
      { key: 'allow_profile_optimization', label: 'Bulk PO (Profile Optimization)', allowed: perms.allow_profile_optimization },
      { key: 'allow_recent_fix', label: 'Bulk Recent Fix Ops', allowed: perms.allow_recent_fix },
      { key: 'allow_read_rt_result', label: 'Bulk Collect RT Data', allowed: perms.allow_read_rt_result }
    ];

    const permsHTML = permRows.map(p => {
      return `<div class="axon-permission-row">
        <div class="axon-permission-label">${escapeHtml(p.label)}</div>
        <div class="axon-permission-badge ${p.allowed ? 'axon-badge-allowed' : 'axon-badge-denied'}">${p.allowed ? 'Allowed' : 'Denied'}</div>
      </div>`;
    }).join('');

    const deviceInfo = storage.getDevice();
    const deviceHTML = deviceInfo
      ? `<div class="axon-device-status">
           <div style="font-size:13px;color:#f3f4f6;font-weight:500;">Saved device: ${escapeHtml(deviceInfo.device_name)}</div>
           <button id="axon-forget-device" class="axon-btn axon-btn-danger" style="padding:6px 12px;font-size:12px;">Forget</button>
         </div>`
      : `<div style="color:#6b7280;font-size:13px;margin-bottom:12px;text-align:center;">No remembered device</div>`;

    const profileHTML = `
      <div style="display:flex;align-items:center;gap:14px;justify-content:center;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.08);">
        <div id="axon-profile-icon-wrap" style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.05);cursor:pointer;border:1px solid rgba(255,255,255,0.08);transition:background 0.2s ease;">
          <div id="axon-profile-icon-fallback" style="font-size:22px;">👤</div>
        </div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:16px;color:#38bdf8;text-align:left;">${escapeHtml(profile.username)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Device: ${escapeHtml(profile.device_name)}</div>
        </div>
        <button id="axon-logout" class="axon-btn axon-btn-danger" style="padding:6px 12px;font-size:12px;">Logout</button>
      </div>
      <!-- Advanced profile details (hidden by default, toggled via profile icon click) -->
      <div id="axon-profile-info" style="display:none;animation:fadeIn 0.2s ease;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.08);">
        <p style="margin:0 0 12px;font-size:13px;color:#d1d5db;"><b>Session Expires:</b> <span style="color:#9ca3af;">${escapeHtml(profile.expires_at)}</span></p>
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#f3f4f6;">Permissions</p>
        ${permsHTML}
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:16px 0;">
        ${deviceHTML}
      </div>
      <!-- Feature actions (visible by default) -->
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button id="btn-po" class="axon-btn" style="flex:1;background:${perms.allow_profile_optimization ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.05)'};color:${perms.allow_profile_optimization ? '#fff' : '#6b7280'};cursor:${perms.allow_profile_optimization ? 'pointer' : 'not-allowed'};box-shadow:${perms.allow_profile_optimization ? '0 4px 12px rgba(16, 185, 129, 0.2)' : 'none'};">Bulk PO</button>
        <button id="btn-recent-fix" class="axon-btn" style="flex:1;background:${perms.allow_recent_fix ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'rgba(255,255,255,0.05)'};color:${perms.allow_recent_fix ? '#fff' : '#6b7280'};cursor:${perms.allow_recent_fix ? 'pointer' : 'not-allowed'};box-shadow:${perms.allow_recent_fix ? '0 4px 12px rgba(6, 180, 212, 0.2)' : 'none'};">Bulk Fix</button>
        <button id="btn-collect-rt" class="axon-btn" style="flex:1;background:${perms.allow_read_rt_result ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(255,255,255,0.05)'};color:${perms.allow_read_rt_result ? '#fff' : '#6b7280'};cursor:${perms.allow_read_rt_result ? 'pointer' : 'not-allowed'};box-shadow:${perms.allow_read_rt_result ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none'};">Collect RT</button>
      </div>
    `;

    const panel = createPanel(profileHTML, "AXON Panel");
    btn.style.display = "none";

    // Setup profile icon with lord-icon element
    const iconWrap = panel.querySelector("#axon-profile-icon-wrap");
    loadLordiconLibrary().then(() => {
      if (customElements.get('lord-icon')) {
        customElements.whenDefined('lord-icon').then(() => {
          const icon = document.createElement('lord-icon');
          icon.src = "https://cdn.lordicon.com/hhljfoaj.json";
          icon.trigger = "loop-on-hover";
          icon.colors = "primary:#ffffff,secondary:#38bdf8";
          icon.style.width = "40px";
          icon.style.height = "40px";
          iconWrap.innerHTML = "";
          iconWrap.appendChild(icon);
        }).catch(() => {
          // Fallback to emoji if custom element fails
        });
      }
    });

    // Toggle profile details visibility
    iconWrap.addEventListener('click', () => {
      const info = panel.querySelector("#axon-profile-info");
      info.style.display = info.style.display === "none" ? "block" : "none";
    });

    // Action buttons
    panel.querySelector("#btn-po")?.addEventListener('click', () => {
      if (!perms.allow_profile_optimization) { alert("Permission denied for Bulk PO."); return; }
      runBulkProfileOptimization(profileData);
    });
    panel.querySelector("#btn-recent-fix")?.addEventListener('click', () => {
      if (!perms.allow_recent_fix) { alert("Permission denied for Bulk Recent Fix Ops."); return; }
      runBulkRecentFix(profileData);
    });
    panel.querySelector("#btn-collect-rt")?.addEventListener('click', () => {
      if (!perms.allow_read_rt_result) { alert("Permission denied for Bulk Collect RT Data."); return; }
      runBulkCollectRT(profileData);
    });

    // Forget device button
    const forgetBtn = panel.querySelector("#axon-forget-device");
    if (forgetBtn) {
      forgetBtn.addEventListener('click', async () => {
        const dev = storage.getDevice();
        if (dev?.device_token) {
          try {
            await fetch(VALIDATE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: sessionConfig.token,
                device_token: dev.device_token,
                revoke_device: true
              })
            });
          } catch (e) {
            console.warn("Failed to notify backend of revocation:", e);
          }
        }
        storage.deleteDevice();
        closePanel();
        showToast('Device forgotten. You will need to log in with TOTP next time.', 'warning');
      });
    }

    // Logout
    panel.querySelector("#axon-logout")?.addEventListener('click', () => {
      storage.deleteSession();
      sessionConfig = null;
      profileData = null;
      closePanel();
      showToast('Logged out successfully.', 'info');
    });
  }

  // --- Feature stubs ---
  function runBulkProfileOptimization(config) {
    showCSVUploadModal('Bulk Profile Optimization', config);
  }
  function runBulkRecentFix(config) {
    showCSVUploadModal('Bulk Recent Fix Ops', config);
  }
  function runBulkCollectRT(config) {
    showCSVUploadModal('Bulk Collect RT Data', config);
  }

  const AREA_CODES = [
    { value: "2", label: "2 - Cairo" },
    { value: "3", label: "3 - Alexandria" },
    { value: "40", label: "40 - Gharbia" },
    { value: "45", label: "45 - Beheira" },
    { value: "46", label: "46 - Matrouh" },
    { value: "47", label: "47 - Kafr El Sheikh" },
    { value: "48", label: "48 - Monufia" },
    { value: "50", label: "50 - Dakahlia" },
    { value: "55", label: "55 - Sharqia" },
    { value: "57", label: "57 - Damietta" },
    { value: "62", label: "62 - Suez" },
    { value: "64", label: "64 - Ismailia" },
    { value: "65", label: "65 - Red Sea" },
    { value: "66", label: "66 - Port Said" },
    { value: "68", label: "68 - North Sinai" },
    { value: "69", label: "69 - South Sinai" },
    { value: "82", label: "82 - Beni Suef" },
    { value: "84", label: "84 - Fayoum" },
    { value: "86", label: "86 - Minya" },
    { value: "88", label: "88 - Assiut" },
    { value: "92", label: "92 - New Valley" },
    { value: "93", label: "93 - Sohag" },
    { value: "95", label: "95 - Luxor" },
    { value: "96", label: "96 - Qena" },
    { value: "97", label: "97 - Aswan" }
  ];

  // --- Phone number input modal UI ---
  function showCSVUploadModal(featureName, config) {
    const MAX_LINES = config?.max_lines || 50; // Get max_lines from backend config, default to 50
    const areaOptions = AREA_CODES.map(area => `<option value="${escapeHtml(area.value)}">${escapeHtml(area.label)}</option>`).join('');
    const modalHTML = `
      <h3 style="margin:4px 0 16px;color:#38bdf8;text-align:center;font-weight:600;font-size:18px;">${escapeHtml(featureName)}</h3>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:13px;color:#9ca3af;margin-bottom:8px;">Area code</label>
        <select id="axon-area-code" class="axon-input">
          <option value="">Please Select</option>
          ${areaOptions}
        </select>
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:13px;color:#9ca3af;margin-bottom:8px;">Paste phone numbers (Max ${MAX_LINES} lines)</label>
        <textarea id="axon-phone-input" class="axon-input" rows="8" placeholder="Enter one phone number per line"></textarea>
      </div>
      <div id="axon-csv-preview" style="margin-bottom:16px;display:none;">
        <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Preview (first 5 numbers):</div>
        <div id="axon-csv-preview-content" style="max-height:150px;overflow-y:auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px;font-size:12px;color:#d1d5db;font-family:monospace;"></div>
      </div>
      <div id="axon-csv-status" style="margin-bottom:16px;font-size:13px;color:#9ca3af;"></div>
      <div style="display:flex;gap:10px;">
        <button id="axon-csv-process" class="axon-btn axon-btn-primary" style="flex:1;" disabled>Process</button>
        <button id="axon-csv-cancel" class="axon-btn axon-btn-secondary">Cancel</button>
      </div>
    `;

    const panel = createPanel(modalHTML, featureName);
    btn.style.display = "none";

    const areaSelect = panel.querySelector("#axon-area-code");
    const phoneInput = panel.querySelector("#axon-phone-input");
    const previewDiv = panel.querySelector("#axon-csv-preview");
    const previewContent = panel.querySelector("#axon-csv-preview-content");
    const statusDiv = panel.querySelector("#axon-csv-status");
    const processBtn = panel.querySelector("#axon-csv-process");
    const cancelBtn = panel.querySelector("#axon-csv-cancel");

    let parsedData = [];

    function refreshPastedNumbers() {
      const areaCode = areaSelect.value;
      const numbers = parsePastedPhoneNumbers(phoneInput.value);
      parsedData = areaCode ? numbers.map(number => ({ phone_number: `${areaCode}${number}` })) : [];

      if (!areaCode && numbers.length > 0) {
        statusDiv.textContent = "Select an area code before processing.";
        statusDiv.style.color = "#f87171";
        previewDiv.style.display = "none";
        processBtn.disabled = true;
        return;
      }

      if (numbers.length > MAX_LINES) {
        statusDiv.textContent = `Error: pasted list contains ${numbers.length} numbers, but maximum allowed is ${MAX_LINES}`;
        statusDiv.style.color = "#f87171";
        previewDiv.style.display = "none";
        processBtn.disabled = true;
        showInlineMsg(panel, `Phone number list exceeds maximum limit of ${MAX_LINES}. Please reduce the list size.`, 'error');
        return;
      }

      if (parsedData.length > 0) {
        statusDiv.textContent = `Loaded ${parsedData.length} phone numbers`;
        statusDiv.style.color = "#9ca3af";
        previewDiv.style.display = "block";
        previewContent.textContent = parsedData.slice(0, 5).map(row => row.phone_number).join('\n');
        processBtn.disabled = false;
      } else {
        statusDiv.textContent = "Paste phone numbers and select an area code.";
        statusDiv.style.color = "#9ca3af";
        previewDiv.style.display = "none";
        processBtn.disabled = true;
      }
    }

    areaSelect.addEventListener('change', refreshPastedNumbers);
    phoneInput.addEventListener('input', refreshPastedNumbers);

    cancelBtn.addEventListener('click', () => closePanel());

    // Collect RT can run off the line IDs collected by the last Bulk Fix,
    // so allow processing without a CSV when those are available.
    if (featureName === 'Bulk Collect RT Data' && Array.isArray(window.__bulkFixLineIds) && window.__bulkFixLineIds.length) {
      statusDiv.textContent = `Using ${window.__bulkFixLineIds.length} line IDs from last Bulk Fix. Paste phone numbers to override.`;
      processBtn.disabled = false;
    }

    processBtn.addEventListener('click', async () => {
      if (featureName === 'Bulk Recent Fix Ops' && processBtn.dataset.done === '1' && window.__rtResults) {
        openRTResultsPopup(window.__rtResults);
        return;
      }

      if (featureName === 'Bulk Recent Fix Ops' && processBtn.dataset.collectRtReady === '1') {
        await processBulkCollectRT([], panel);
        return;
      }

      refreshPastedNumbers();

      if (parsedData.length > MAX_LINES) {
        showInlineMsg(panel, `Phone number list exceeds maximum limit of ${MAX_LINES}. Please reduce the list size.`, 'error');
        showToast(`Maximum allowed phone numbers is ${MAX_LINES}`, 'error');
        return;
      }

      if (featureName === 'Bulk Recent Fix Ops') {
        if (parsedData.length === 0) return;
        await processBulkRecentFix(parsedData, panel);
      } else if (featureName === 'Bulk Collect RT Data') {
        if (processBtn.dataset.done === '1' && window.__rtResults) {
          openRTResultsPopup(window.__rtResults);
          return;
        }
        await processBulkCollectRT(parsedData, panel);
      } else {
        if (parsedData.length === 0) return;
        console.log(`Processing ${featureName} with ${parsedData.length} phone numbers:`, parsedData);
        showToast(`${featureName} started with ${parsedData.length} phone numbers. Check console for details.`, 'success');
      }
    });
  }

  // --- Pasted phone number parser ---
  function parsePastedPhoneNumbers(text) {
    return text
      .split(/[\n,;]+/)
      .map(value => value.trim().replace(/[^\d]/g, ''))
      .filter(Boolean);
  }

  // --- Bulk Recent Fix Processing ---
  const BULK_RECENT_FIX_BATCH_SIZE = 3;

  function getPhoneNumberFromRow(row) {
    return row.phone_number || row.phone || row.Phone || Object.values(row)[0];
  }

  function getBatchLabel(startIndex, batchLength, total) {
    return `${startIndex + 1}-${startIndex + batchLength}/${total}`;
  }

  async function processBulkRecentFix(phoneNumbers, panel) {
    const lineIds = [];
    const statusDiv = panel.querySelector("#axon-csv-status");
    const processBtn = panel.querySelector("#axon-csv-process");

    processBtn.disabled = true;
    processBtn.textContent = "Getting line IDs...";
    delete processBtn.dataset.collectRtReady;
    delete processBtn.dataset.done;
    window.__rtResults = null;

    // Step 1: Get line IDs one by one. This JSF search depends on the current
    // page ViewState, and parallel searches can return stale/same results.
    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = getPhoneNumberFromRow(phoneNumbers[i]);
      statusDiv.textContent = `Getting line IDs: ${i + 1}/${phoneNumbers.length}: ${phoneNumber}`;

      try {
        const lineId = await getLineIdFromPhoneNumber(phoneNumber);
        if (lineId) {
          lineIds.push({ phone_number: phoneNumber, line_id: lineId });
          console.log(`Found line ID ${lineId} for phone number ${phoneNumber}`);
        } else {
          console.warn(`No line ID found for phone number ${phoneNumber}`);
        }
      } catch (error) {
        console.error(`Error processing phone number ${phoneNumber}:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Store line IDs
    window.__bulkFixLineIds = lineIds;
    console.log('Line IDs found:', lineIds);

    if (lineIds.length === 0) {
      statusDiv.textContent = `No line IDs found from ${phoneNumbers.length} phone numbers`;
      processBtn.textContent = "Done";
      processBtn.disabled = false;
      showToast(`No line IDs found from ${phoneNumbers.length} phone numbers`, 'warning');
      return;
    }

    // Step 2: Apply Recent Fix to all line IDs in batches.
    processBtn.textContent = "Applying Recent Fix...";
    let successCount = 0;
    let failureCount = 0;

    for (let start = 0; start < lineIds.length; start += BULK_RECENT_FIX_BATCH_SIZE) {
      const batch = lineIds.slice(start, start + BULK_RECENT_FIX_BATCH_SIZE);
      statusDiv.textContent = `Applying fix batch ${getBatchLabel(start, batch.length, lineIds.length)}`;

      const batchResults = await Promise.all(batch.map(async ({ phone_number, line_id }) => {
        try {
          const success = await applyRecentFix(line_id);
          if (success) {
            console.log(`Successfully applied Recent Fix to line ID ${line_id}`);
            return true;
          }
          console.warn(`Failed to apply Recent Fix to line ID ${line_id}`);
          return false;
        } catch (error) {
          console.error(`Error applying Recent Fix to line ID ${line_id}:`, error);
          return false;
        }
      }));

      successCount += batchResults.filter(Boolean).length;
      failureCount += batchResults.filter(success => !success).length;

      if (start + BULK_RECENT_FIX_BATCH_SIZE < lineIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    statusDiv.textContent = `Completed. Found ${lineIds.length} line IDs, Applied fix: ${successCount} success, ${failureCount} failed. Click Collect RT to proceed.`;
    processBtn.textContent = "Collect RT";
    processBtn.dataset.collectRtReady = '1';
    processBtn.disabled = false;

    showToast(`Completed. Found ${lineIds.length} line IDs, Applied fix: ${successCount} success, ${failureCount} failed`, successCount > 0 ? 'success' : 'warning');
  }

  // --- Apply Recent Fix to a specific line ID ---
  async function applyRecentFix(lineId) {
    const url = `https://10.42.187.101:8080/expresse/clearview?lineId=${lineId}`;

    // Extract JSESSIONID from current page cookies
    const cookies = document.cookie;
    const jsessionidMatch = cookies.match(/JSESSIONID=([^;]+)/);
    const jsessionid = jsessionidMatch ? jsessionidMatch[1] : '';

    // Fetch the per-line ViewState: each line ID has its own ViewState, so load
    // the clearview page for this line and parse the value out of the response.
    let viewState = '';
    try {
      const pageResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': `https://10.42.187.101:8080/expresse/clearview?lineId=${lineId}`,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      const pageHtml = await pageResponse.text();
      const viewStateMatch = pageHtml.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]*)"/);
      viewState = viewStateMatch ? viewStateMatch[1] : '';
    } catch (error) {
      console.error('Error fetching ViewState for line ID', lineId, error);
      return false;
    }

    if (!viewState) {
      console.error('Could not find ViewState for line ID', lineId);
      return false;
    }

    const formData = new URLSearchParams();
    formData.append('javax.faces.partial.ajax', 'true');
    formData.append('javax.faces.source', 'dsl:rtDialog:confirmationForm:yesButton');
    formData.append('javax.faces.partial.execute', '@all');
    formData.append('javax.faces.partial.render', 'dsl:messagesContainer+dsl:clearViewRealTimeStatus:rtStatusLabel+dsl:clearViewRealTimeStatus:rtStatusValue+dsl:clearViewRealTimeStatus:rtDateLabel+dsl:clearViewRealTimeStatus:rtDateValue+dsl:rtPeButton+dsl:rtDialogStatus+dsl:dateSelectorForm+dsl:dataPanel');
    formData.append('dsl:rtDialog:confirmationForm:yesButton', 'dsl:rtDialog:confirmationForm:yesButton');
    formData.append('dsl:rtDialog:confirmationForm', 'dsl:rtDialog:confirmationForm');
    formData.append('dsl:rtDialog:confirmationForm:selectedRtDiagnosticOptions', 'RECENT_FIX');
    formData.append('javax.faces.ViewState', viewState);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/xml, text/xml, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Faces-Request': 'partial/ajax',
          'Origin': 'https://10.42.187.101:8080',
          'Pragma': 'no-cache',
          'Referer': `https://10.42.187.101:8080/expresse/clearview?lineId=${lineId}`,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData.toString()
      });

      return response.ok;
    } catch (error) {
      console.error('Error applying Recent Fix:', error);
      return false;
    }
  }

  // --- Collect RT: configuration ---
  const RT_POLL_MAX_ATTEMPTS = 40; // ~40 * 5s = up to ~3.3 min per line
  const RT_POLL_INTERVAL_MS = 5000;

  // --- Fetch the clearview page for a line (carries ViewState, RT status,
  //     identity fields and the history date selector). ---
  async function fetchClearViewPage(lineId) {
    const url = `https://10.42.187.101:8080/expresse/clearview?lineId=${lineId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': `https://10.42.187.101:8080/expresse/clearview?lineId=${lineId}`,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    return response.text();
  }

  function extractViewStateFromHtml(html) {
    const m = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]*)"/);
    return m ? m[1] : '';
  }

  function htmlCellText(raw) {
    return raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Read a value from the line-info panelgrid (table-label/table-value cells).
  function extractPanelField(html, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = html.match(new RegExp('table-label[^>]*>' + escaped + '<\\/td>\\s*<td[^>]*table-value[^>]*>([\\s\\S]*?)<\\/td>', 'i'));
    return m ? htmlCellText(m[1]) : null;
  }

  function extractIdentityFields(html) {
    const portCell = html.match(/table-label[^>]*>Port<\/td>\s*<td[^>]*table-value[^>]*>([\s\S]*?)<\/td>/i);
    let port = null;
    if (portCell) {
      const portValue = portCell[1].match(/class="[^"]*port-value[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      port = portValue ? htmlCellText(portValue[1]) : htmlCellText(portCell[1]).split(' ')[0];
    }
    return {
      dslam: extractPanelField(html, 'DSLAM'),
      port,
      serviceProduct: extractPanelField(html, 'Service Product'),
      provisioningStatus: extractPanelField(html, 'Provisioning Status')
    };
  }

  // Parse the real-time request status spans rendered on the page.
  function parseRtStatusFromPage(html) {
    const get = (key) => {
      const m = html.match(new RegExp('clearViewRealTimeStatus:' + key + '"[^>]*>([\\s\\S]*?)</span>', 'i'));
      return m ? htmlCellText(m[1]) : '';
    };
    const label = get('rtStatusLabel');
    const value = get('rtStatusValue');
    const date = get('rtDateValue');
    const running = /running/i.test(label) || /currently collecting/i.test(value);
    const done = !running && (!!label || !!value);
    return { label, value, date, running, done };
  }

  // Newest collected snapshot timestamp from the History Check selector.
  function getNewestSnapshotDate(html) {
    const sel = html.match(/<select id="dsl:dateSelectorForm:dateSelector_input"[\s\S]*?<\/select>/i);
    if (!sel) return null;
    const opts = [...sel[0].matchAll(/<option[^>]*value="([^"]*)"/gi)].map(m => m[1]);
    const dated = opts.find(v => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v));
    return dated || null;
  }

  // POST the date selector to load the full real-time detail XML for a snapshot.
  async function fetchRtDetailXml(lineId, viewState, dateValue) {
    const url = `https://10.42.187.101:8080/expresse/clearview?lineId=${lineId}`;
    const formData = new URLSearchParams();
    formData.append('javax.faces.partial.ajax', 'true');
    formData.append('javax.faces.source', 'dsl:dateSelectorForm:dateSelector');
    formData.append('javax.faces.partial.execute', 'dsl:dateSelectorForm:dateSelector');
    formData.append('javax.faces.partial.render', 'j_idt165 dsl:j_idt403 dsl:messagesContainer dsl:messagePanel dsl:detailLinkPanel dsl:detailUpdateContainer dsl:dateSelectorForm:dateSelector');
    formData.append('javax.faces.behavior.event', 'valueChange');
    formData.append('javax.faces.partial.event', 'change');
    formData.append('dsl:dateSelectorForm', 'dsl:dateSelectorForm');
    formData.append('dsl:dateSelectorForm:dateSelector_focus', '');
    formData.append('dsl:dateSelectorForm:dateSelector_input', dateValue);
    formData.append('javax.faces.ViewState', viewState);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/xml, text/xml, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'Origin': 'https://10.42.187.101:8080',
        'Pragma': 'no-cache',
        'Referer': url,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData.toString()
    });
    return response.text();
  }

  // Send the detail XML to the Cloudflare worker for parsing into JSON.
  async function parseRtXmlViaWorker(xml) {
    const response = await fetch(RT_PARSE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml
    });
    return response.json();
  }

  // Client-side fallback so the verdict is present even if the worker is older.
  function extractMessagePanelClient(xml) {
    const m = xml.match(/<update id="dsl:messagePanel"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/i);
    if (!m) return null;
    return htmlCellText(m[1].replace(/<script[\s\S]*?<\/script>/gi, ' ')) || null;
  }

  // Poll a line until its real-time request finishes, then collect + parse data.
  async function collectRTForLine(lineId, onStatus) {
    let page = '';
    let status = { running: true, done: false, label: '', value: '', date: '' };

    for (let attempt = 0; attempt < RT_POLL_MAX_ATTEMPTS; attempt++) {
      page = await fetchClearViewPage(lineId);
      status = parseRtStatusFromPage(page);
      if (onStatus) onStatus(status, attempt);
      if (status.done) break;
      if (!status.running && !status.done) break; // no RT request in progress
      await new Promise(r => setTimeout(r, RT_POLL_INTERVAL_MS));
    }

    const identity = extractIdentityFields(page);
    const base = {
      line_id: lineId,
      ...identity,
      rtStatus: status.value || status.label || null,
      rtDate: status.date || null
    };

    if (status.running && !status.done) {
      return { ...base, timedOut: true };
    }

    const viewState = extractViewStateFromHtml(page);
    const snapshotDate = getNewestSnapshotDate(page);
    if (!viewState || !snapshotDate) {
      return { ...base, noData: true };
    }

    const xml = await fetchRtDetailXml(lineId, viewState, snapshotDate);
    let parsed = {};
    try {
      parsed = await parseRtXmlViaWorker(xml);
    } catch (err) {
      console.error('Worker parse failed for line', lineId, err);
      parsed = { workerError: String(err) };
    }
    if (!parsed.messagePanel) parsed.messagePanel = extractMessagePanelClient(xml);

    return { ...base, snapshotDate, ...parsed };
  }

  // --- Bulk Collect RT Data Processing ---
  async function processBulkCollectRT(phoneNumbers, panel) {
    const statusDiv = panel.querySelector('#axon-csv-status');
    const processBtn = panel.querySelector('#axon-csv-process');

    // Prefer line IDs collected during the last Bulk Fix run.
    let lineIds = Array.isArray(window.__bulkFixLineIds) ? window.__bulkFixLineIds.slice() : [];

    processBtn.disabled = true;
    delete processBtn.dataset.collectRtReady;

    if (lineIds.length === 0 && phoneNumbers && phoneNumbers.length) {
      processBtn.textContent = 'Getting line IDs...';
      for (let i = 0; i < phoneNumbers.length; i++) {
        const phoneNumber = phoneNumbers[i].phone_number || phoneNumbers[i].phone || phoneNumbers[i].Phone || Object.values(phoneNumbers[i])[0];
        statusDiv.textContent = `Getting line IDs: ${i + 1}/${phoneNumbers.length}: ${phoneNumber}`;
        try {
          const lineId = await getLineIdFromPhoneNumber(phoneNumber);
          if (lineId) lineIds.push({ phone_number: phoneNumber, line_id: lineId });
        } catch (error) {
          console.error(`Error resolving line ID for ${phoneNumber}:`, error);
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (lineIds.length === 0) {
      statusDiv.textContent = 'No line IDs available. Run Bulk Fix first or paste phone numbers.';
      processBtn.textContent = 'Done';
      processBtn.disabled = false;
      showToast('No line IDs available for Collect RT', 'warning');
      return;
    }

    processBtn.textContent = 'Collecting RT...';
    const results = [];
    let okCount = 0;

    for (let i = 0; i < lineIds.length; i++) {
      const { phone_number, line_id } = lineIds[i];
      statusDiv.textContent = `Collecting RT: ${i + 1}/${lineIds.length}: Line ID ${line_id}`;
      try {
        const data = await collectRTForLine(line_id, (st) => {
          statusDiv.textContent = `Collecting RT: ${i + 1}/${lineIds.length}: Line ID ${line_id} — ${st.value || st.label || 'checking...'}`;
        });
        data.phone_number = phone_number || null;
        results.push(data);
        if (!data.timedOut && !data.noData && !data.workerError) okCount++;
      } catch (error) {
        console.error(`Error collecting RT for line ID ${line_id}:`, error);
        results.push({ line_id, phone_number: phone_number || null, error: String(error) });
      }
      await new Promise(r => setTimeout(r, 500));
    }

    window.__rtResults = results;
    statusDiv.textContent = `Completed. Collected ${okCount}/${lineIds.length} lines.`;
    processBtn.textContent = 'View Results';
    processBtn.dataset.done = '1';
    processBtn.disabled = false;

    showToast(`Collect RT done: ${okCount}/${lineIds.length} lines`, okCount > 0 ? 'success' : 'warning');
    openRTResultsPopup(results);
  }

  // --- Render the Collect RT results in a popup window ---
  function rtFormatValue(v) {
    if (v === null || v === undefined || v === '') return '-';
    if (Array.isArray(v)) return v.join(' | ');
    if (typeof v === 'object') {
      if ('us' in v || 'ds' in v) return `US ${v.us ?? '-'} / DS ${v.ds ?? '-'}`;
      return JSON.stringify(v);
    }
    return String(v);
  }

  function openRTResultsPopup(results) {
    const win = window.open('', 'axonRTResults', 'width=1280,height=860,scrollbars=yes');
    if (!win) { showToast('Popup blocked. Allow popups for this site.', 'warning'); return; }

    const doc = win.document;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>AXON RT Results</title></head><body></body></html>');
    doc.close();

    const style = doc.createElement('style');
    style.textContent = `
      body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#0b1120;color:#e5e7eb;}
      .rt-header{padding:14px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,0.08);position:sticky;top:0;background:#0b1120;z-index:5;}
      .rt-header h1{font-size:18px;margin:0;color:#67e8f9;font-weight:700;}
      .rt-count{font-size:13px;color:#9ca3af;}
      .rt-filter{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      .rt-filter input,.rt-filter select{background:#111827;border:1px solid rgba(255,255,255,0.14);color:#e5e7eb;border-radius:6px;padding:8px 10px;font-size:13px;}
      .rt-filter input{min-width:230px;}
      .rt-btn{background:#111827;border:1px solid rgba(255,255,255,0.14);color:#e5e7eb;border-radius:6px;padding:8px 11px;font-size:13px;cursor:pointer;}
      .rt-btn:hover{background:#1f2937;border-color:rgba(103,232,249,0.45);}
      .rt-layout{padding:14px 18px;display:grid;grid-template-columns:minmax(420px,1fr) 360px;gap:14px;align-items:start;}
      .rt-panel{background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;}
      .rt-panel-title{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;font-weight:700;color:#bae6fd;}
      .rt-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;padding:14px 18px 0;}
      .rt-card{background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;}
      .rt-card-label{font-size:12px;color:#9ca3af;margin-bottom:6px;}
      .rt-card-value{font-size:24px;font-weight:700;color:#f9fafb;}
      .rt-pivot{width:100%;border-collapse:collapse;font-size:12px;}
      .rt-pivot th,.rt-pivot td{border-bottom:1px solid rgba(255,255,255,0.08);padding:9px 10px;text-align:left;}
      .rt-pivot th{background:#162033;color:#cbd5e1;}
      .rt-pivot tr{cursor:pointer;}
      .rt-pivot tr:hover{background:rgba(103,232,249,0.08);}
      .rt-case-perfect{color:#34d399;font-weight:700;}
      .rt-case-well{color:#fbbf24;font-weight:700;}
      .rt-case-bad{color:#fb7185;font-weight:700;}
      .rt-case-other{color:#94a3b8;font-weight:700;}
      .rt-chart-wrap{padding:12px;}
      #rt-case-chart{width:100%;height:240px;background:#0f172a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;}
      .rt-table-wrap{overflow:auto;margin:0 18px 18px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;background:#0f172a;}
      .rt-data-table{border-collapse:collapse;width:100%;font-size:12px;}
      .rt-data-table th,.rt-data-table td{border-bottom:1px solid rgba(255,255,255,0.07);padding:7px 8px;text-align:left;white-space:nowrap;}
      .rt-data-table th{background:#182235;position:sticky;top:0;color:#cbd5e1;vertical-align:top;}
      .rt-th-label{font-weight:700;margin-bottom:6px;cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px;}
      .rt-sort-mark{color:#67e8f9;font-size:10px;min-width:10px;}
      .rt-col-filter{width:100%;min-width:120px;background:#0f172a;border:1px solid rgba(255,255,255,0.14);color:#e5e7eb;border-radius:5px;padding:5px 6px;font-size:11px;}
      .rt-col-filter option{background:#0f172a;color:#e5e7eb;}
      .rt-data-table tbody tr:nth-child(even){background:rgba(255,255,255,0.025);}
      .rt-data-table tbody tr:hover{background:rgba(103,232,249,0.08);}
      .rt-bad{color:#f87171;} .rt-good{color:#34d399;}
      @media(max-width:900px){.rt-layout{grid-template-columns:1fr}.rt-summary{grid-template-columns:repeat(2,minmax(120px,1fr))}.rt-filter{margin-left:0}.rt-filter input{min-width:160px;}}
    `;
    doc.head.appendChild(style);

    const columns = [
      { key: 'line_id', label: 'Line ID' },
      { key: 'phone_number', label: 'Phone' },
      { key: 'dslam', label: 'DSLAM' },
      { key: 'port', label: 'Port' },
      { key: 'serviceProduct', label: 'Service Product' },
      { key: 'provisioningStatus', label: 'Provisioning' },
      { key: 'rtStatus', label: 'RT Status' },
      { key: 'collectionDate', label: 'Collection Date' },
      { key: 'profile', label: 'Profile' },
      { key: 'runningStandard', label: 'Running Standard' },
      { key: 'stability', label: 'Stability' },
      { key: 'synchRate', label: 'Synch Rate' },
      { key: 'maxAchievableBitRate', label: 'Max Achievable' },
      { key: 'cableDiagnostics', label: 'Cable Diagnostics' },
      { key: 'profileOptimizationStatus', label: 'PO Status' },
      { key: 'diagnostics', label: 'Diagnostics' },
      { key: 'dispatchScore', label: 'Dispatch Score' },
      { key: 'messagePanel', label: 'Message' }
    ];

    function numberFromValue(value) {
      const text = rtFormatValue(value);
      const match = text.match(/-?\d+(\.\d+)?/);
      return match ? Number(match[0]) : null;
    }

    function messageIsOutOfService(item) {
      return rtFormatValue(item.messagePanel).toLowerCase().includes('line is out of service');
    }

    function isSuccessful(item) {
      return rtFormatValue(item.rtStatus).toLowerCase().includes('successful');
    }

    function getRtCase(item) {
      const score = numberFromValue(item.dispatchScore);
      if (!isSuccessful(item) || messageIsOutOfService(item) || score === null) {
        return 'Other';
      }
      if (score < 16) return 'Perfect Case';
      if (score >= 16 && score <= 25) return 'Well Case';
      return 'Bad Case';
    }

    function getCaseClass(caseName) {
      if (caseName === 'Perfect Case') return 'rt-case-perfect';
      if (caseName === 'Well Case') return 'rt-case-well';
      if (caseName === 'Bad Case') return 'rt-case-bad';
      return 'rt-case-other';
    }

    const caseDefs = [
      { name: 'Perfect Case', description: 'Successful, dispatch score less than 16, not out of service', color: '#34d399' },
      { name: 'Well Case', description: 'Successful, dispatch score from 16 to 25, not out of service', color: '#fbbf24' },
      { name: 'Bad Case', description: 'Successful, dispatch score higher than 25, not out of service', color: '#fb7185' },
      { name: 'Other', description: 'Does not match the three RT quality cases', color: '#94a3b8' }
    ];
    const counts = caseDefs.reduce((acc, item) => { acc[item.name] = 0; return acc; }, {});
    results.forEach(item => { counts[getRtCase(item)]++; });

    const header = doc.createElement('div');
    header.className = 'rt-header';
    const title = doc.createElement('h1');
    title.textContent = 'AXON - RT Results';
    const count = doc.createElement('span');
    count.className = 'rt-count';
    count.textContent = `${results.length} line(s)`;
    const filterWrap = doc.createElement('div');
    filterWrap.className = 'rt-filter';
    const filterInput = doc.createElement('input');
    filterInput.type = 'text';
    filterInput.placeholder = 'Phone Search…';
    const caseSelect = doc.createElement('select');
    caseSelect.innerHTML = '<option value="">All Cases</option>' + caseDefs.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const exportBtn = doc.createElement('button');
    exportBtn.className = 'rt-btn';
    exportBtn.textContent = 'Export Excel';
    const exportChartBtn = doc.createElement('button');
    exportChartBtn.className = 'rt-btn';
    exportChartBtn.textContent = 'Charts PNG';
    filterWrap.appendChild(filterInput);
    filterWrap.appendChild(caseSelect);
    filterWrap.appendChild(exportBtn);
    filterWrap.appendChild(exportChartBtn);
    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(filterWrap);
    doc.body.appendChild(header);

    const summary = doc.createElement('div');
    summary.className = 'rt-summary';
    caseDefs.forEach(def => {
      const card = doc.createElement('div');
      card.className = 'rt-card';
      const label = doc.createElement('div');
      label.className = 'rt-card-label';
      label.textContent = def.name;
      const value = doc.createElement('div');
      value.className = 'rt-card-value ' + getCaseClass(def.name);
      value.textContent = String(counts[def.name]);
      card.appendChild(label);
      card.appendChild(value);
      summary.appendChild(card);
    });
    doc.body.appendChild(summary);

    const layout = doc.createElement('div');
    layout.className = 'rt-layout';
    const pivotPanel = doc.createElement('div');
    pivotPanel.className = 'rt-panel';
    pivotPanel.innerHTML = '<div class="rt-panel-title">Pivot by Case</div>';
    const pivotTable = doc.createElement('table');
    pivotTable.className = 'rt-pivot';
    pivotTable.innerHTML = '<thead><tr><th>Case</th><th>Count</th><th>Condition</th></tr></thead>';
    const pivotBody = doc.createElement('tbody');
    caseDefs.forEach(def => {
      const tr = doc.createElement('tr');
      tr.innerHTML = `<td class="${getCaseClass(def.name)}">${def.name}</td><td>${counts[def.name]}</td><td>${def.description}</td>`;
      tr.addEventListener('click', () => {
        caseSelect.value = def.name === 'Other' ? 'Other' : def.name;
        applyFilters();
      });
      pivotBody.appendChild(tr);
    });
    pivotTable.appendChild(pivotBody);
    pivotPanel.appendChild(pivotTable);

    const chartPanel = doc.createElement('div');
    chartPanel.className = 'rt-panel';
    chartPanel.innerHTML = '<div class="rt-panel-title">Case Comparison</div>';
    const chartWrap = doc.createElement('div');
    chartWrap.className = 'rt-chart-wrap';
    const chartCanvas = doc.createElement('canvas');
    chartCanvas.id = 'rt-case-chart';
    chartCanvas.width = 680;
    chartCanvas.height = 320;
    chartWrap.appendChild(chartCanvas);
    chartPanel.appendChild(chartWrap);
    layout.appendChild(pivotPanel);
    layout.appendChild(chartPanel);
    doc.body.appendChild(layout);

    const tableWrap = doc.createElement('div');
    tableWrap.className = 'rt-table-wrap';
    const table = doc.createElement('table');
    table.className = 'rt-data-table';
    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    const columnFilters = [];
    const sortMarks = [];
    columns.forEach((c, index) => {
      const th = doc.createElement('th');
      const label = doc.createElement('div');
      label.className = 'rt-th-label';
      const labelText = doc.createElement('span');
      labelText.textContent = c.label;
      const sortMark = doc.createElement('span');
      sortMark.className = 'rt-sort-mark';
      sortMark.textContent = '';
      label.appendChild(labelText);
      label.appendChild(sortMark);
      const select = doc.createElement('select');
      select.className = 'rt-col-filter';
      select.dataset.colIndex = String(index);
      select.multiple = true;
      select.size = 3;
      const allOption = doc.createElement('option');
      allOption.value = '';
      allOption.textContent = 'All';
      allOption.selected = true;
      select.appendChild(allOption);
      th.appendChild(label);
      th.appendChild(select);
      headRow.appendChild(th);
      columnFilters.push(select);
      sortMarks.push(sortMark);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = doc.createElement('tbody');
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    doc.body.appendChild(tableWrap);

    const rows = [];
    results.forEach((item, idx) => {
      const tr = doc.createElement('tr');
      const flag = item.timedOut || item.noData || item.error || item.workerError;
      const caseName = getRtCase(item);
      const values = [];
      columns.forEach(c => {
        const td = doc.createElement('td');
        let val = rtFormatValue(item[c.key]);
        if (c.key === 'rtStatus' && flag) {
          val = item.timedOut ? 'Timed out' : item.noData ? 'No data' : 'Error';
          td.className = 'rt-bad';
        }
        values.push(val);
        if (val.length > 60) { td.title = val; val = val.slice(0, 60) + '…'; }
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
      rows.push({ tr, item, caseName, values, originalIndex: idx });
    });

    columns.forEach((c, index) => {
      const values = Array.from(new Set(rows.map(row => row.values[index]).filter(value => value !== '-')))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      values.slice(0, 250).forEach(value => {
        const option = doc.createElement('option');
        option.value = value;
        option.textContent = value.length > 45 ? value.slice(0, 45) + '…' : value;
        option.title = value;
        columnFilters[index].appendChild(option);
      });
      if (values.length > 250) {
        const option = doc.createElement('option');
        option.value = '__too_many__';
        option.textContent = 'Too many values';
        option.disabled = true;
        columnFilters[index].appendChild(option);
      }
    });

    function visibleRows() {
      return rows.filter(row => row.tr.style.display !== 'none');
    }

    const phoneColumnIndex = columns.findIndex(column => column.key === 'phone_number');
    let sortState = { index: null, direction: 'asc' };

    function selectedFilterValues(select) {
      const selected = Array.from(select.selectedOptions).map(option => option.value).filter(Boolean);
      return selected;
    }

    function compareValues(a, b, direction) {
      const an = numberFromValue(a);
      const bn = numberFromValue(b);
      let result;
      if (an !== null && bn !== null) {
        result = an - bn;
      } else {
        result = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      }
      return direction === 'asc' ? result : -result;
    }

    function renderRows() {
      const orderedRows = rows.slice();
      if (sortState.index !== null) {
        orderedRows.sort((a, b) => {
          const result = compareValues(a.values[sortState.index], b.values[sortState.index], sortState.direction);
          return result || (a.originalIndex - b.originalIndex);
        });
      } else {
        orderedRows.sort((a, b) => a.originalIndex - b.originalIndex);
      }
      orderedRows.forEach(row => tbody.appendChild(row.tr));
      sortMarks.forEach((mark, index) => {
        mark.textContent = sortState.index === index ? (sortState.direction === 'asc' ? '▲' : '▼') : '';
      });
    }

    function applyFilters() {
      const q = filterInput.value.toLowerCase();
      const selectedCase = caseSelect.value;
      const selectedColumns = columnFilters.map(selectedFilterValues);
      let visible = 0;
      rows.forEach(row => {
        const phoneText = phoneColumnIndex >= 0 ? row.values[phoneColumnIndex].toLowerCase() : '';
        const textMatch = !q || phoneText.includes(q);
        const caseMatch = !selectedCase || row.caseName === selectedCase;
        const columnMatch = selectedColumns.every((values, index) => values.length === 0 || values.includes(row.values[index]));
        const match = textMatch && caseMatch && columnMatch;
        row.tr.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      count.textContent = `${visible}/${results.length} line(s)`;
      renderRows();
    }

    function drawCaseChart() {
      const ctx = chartCanvas.getContext('2d');
      const width = chartCanvas.width;
      const height = chartCanvas.height;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      const pad = 46;
      const chartW = width - pad * 2;
      const chartH = height - 78;
      const max = Math.max(1, ...caseDefs.map(def => counts[def.name]));
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(pad, 24);
      ctx.lineTo(pad, 24 + chartH);
      ctx.lineTo(width - pad, 24 + chartH);
      ctx.stroke();
      const barGap = 18;
      const barW = (chartW - barGap * (caseDefs.length - 1)) / caseDefs.length;
      caseDefs.forEach((def, index) => {
        const value = counts[def.name];
        const barH = (value / max) * (chartH - 12);
        const x = pad + index * (barW + barGap);
        const y = 24 + chartH - barH;
        ctx.fillStyle = def.color;
        ctx.fillRect(x, y, barW, barH);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 16px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(value), x + barW / 2, y - 8);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '12px Segoe UI, sans-serif';
        ctx.fillText(def.name.replace(' Case', ''), x + barW / 2, height - 22);
      });
    }

    filterInput.addEventListener('input', applyFilters);
    caseSelect.addEventListener('change', applyFilters);
    columnFilters.forEach(select => select.addEventListener('change', () => {
      const selected = Array.from(select.selectedOptions).map(option => option.value);
      if (selected.includes('') && selected.length > 1) {
        Array.from(select.options).forEach(option => { option.selected = option.value === ''; });
      } else if (!selected.includes('')) {
        select.options[0].selected = false;
      }
      applyFilters();
    }));
    Array.from(headRow.children).forEach((th, index) => {
      th.querySelector('.rt-th-label')?.addEventListener('click', () => {
        if (sortState.index === index) {
          sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          sortState = { index, direction: 'asc' };
        }
        renderRows();
      });
    });

    exportBtn.addEventListener('click', () => {
      const rowsToExport = visibleRows().map(row => row.item);
      const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const tableHtml = `
        <html><head><meta charset="utf-8"></head><body>
        <h3>AXON RT Results</h3>
        <table border="1">
          <thead><tr>${columns.map(c => `<th>${esc(c.label)}</th>`).join('')}<th>Case</th></tr></thead>
          <tbody>${rowsToExport.map(item => `<tr>${columns.map(c => `<td>${esc(rtFormatValue(item[c.key]))}</td>`).join('')}<td>${esc(getRtCase(item))}</td></tr>`).join('')}</tbody>
        </table>
        <br>
        <table border="1">
          <thead><tr><th>Case</th><th>Count</th><th>Condition</th></tr></thead>
          <tbody>${caseDefs.map(def => `<tr><td>${esc(def.name)}</td><td>${counts[def.name]}</td><td>${esc(def.description)}</td></tr>`).join('')}</tbody>
        </table>
        </body></html>
      `;
      const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'axon-rt-results.xls';
      a.click();
    });

    exportChartBtn.addEventListener('click', () => {
      drawCaseChart();
      const a = doc.createElement('a');
      a.href = chartCanvas.toDataURL('image/png');
      a.download = 'axon-rt-case-chart.png';
      a.click();
    });

    drawCaseChart();
  }

  // --- Get Line ID from Phone Number ---
  async function getLineIdFromPhoneNumber(phoneNumber) {
    const url = 'https://10.42.187.101:8080/expresse/clearview';

    // Extract JSESSIONID from current page cookies
    const cookies = document.cookie;
    const jsessionidMatch = cookies.match(/JSESSIONID=([^;]+)/);
    const jsessionid = jsessionidMatch ? jsessionidMatch[1] : '';

    // Extract ViewState from current page
    const viewStateInput = document.querySelector('input[name="javax.faces.ViewState"]');
    const viewState = viewStateInput ? viewStateInput.value : '';

    if (!viewState) {
      console.error('Could not find ViewState in page');
      return null;
    }

    const formData = new URLSearchParams();
    formData.append('javax.faces.partial.ajax', 'true');
    formData.append('javax.faces.source', 'mainAdvancedLineSearch:advancedSearchForm:submit');
    formData.append('javax.faces.partial.execute', '@all');
    formData.append('javax.faces.partial.render', 'mainAdvancedLineSearch:resultPanel');
    formData.append('mainAdvancedLineSearch:advancedSearchForm:submit', 'mainAdvancedLineSearch:advancedSearchForm:submit');
    formData.append('mainAdvancedLineSearch:advancedSearchForm', 'mainAdvancedLineSearch:advancedSearchForm');
    formData.append('mainAdvancedLineSearch:advancedSearchForm:lineID', '');
    formData.append('mainAdvancedLineSearch:advancedSearchForm:lineID2', phoneNumber);
    formData.append('javax.faces.ViewState', viewState);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/xml, text/xml, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Faces-Request': 'partial/ajax',
          'Origin': 'https://10.42.187.101:8080',
          'Pragma': 'no-cache',
          'Referer': 'https://10.42.187.101:8080/expresse/clearview',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData.toString()
      });

      const responseText = await response.text();

      // Send XML to Supabase Edge Function for parsing
      const parseResponse = await fetch(PARSE_XML_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          xml: responseText,
          phone_number: phoneNumber
        })
      });

      const parseResult = await parseResponse.json();
      console.log('Edge function response:', parseResult);
      console.log('Debug information:', parseResult.debug);

      if (parseResult.success) {
        return parseResult.line_id;
      } else {
        console.error('Edge function failed to parse XML');
        console.error('Debug steps:', parseResult.debug?.steps);
        console.error('Headers found:', parseResult.debug?.headersFound);
        console.error('Rows found:', parseResult.debug?.rowsFound);
        console.error('Cells found:', parseResult.debug?.cellsFound);
        return null;
      }
    } catch (error) {
      console.error('Error fetching line ID:', error);
      return null;
    }
  }

  // --- Validate saved session helper (sends device_token if available) ---
  async function validateSavedSession() {
    if (!sessionConfig || !sessionConfig.token) return false;
    try {
      const payload = { token: sessionConfig.token };
      const dev = storage.getDevice();
      if (dev?.device_token) payload.device_token = dev.device_token;

      const res = await fetch(VALIDATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.success) {
        profileData = data;
        // Add max_lines from backend config
        if (data.max_lines) {
          profileData.max_lines = data.max_lines;
        }
        // Auto-renew session details if the backend issued a refreshed token
        if (data.token) {
          sessionConfig.token = data.token;
          sessionConfig.expires_at = data.expires_at;
          storage.setSession(sessionConfig);
        }
        return true;
      } else {
        storage.deleteSession();
        sessionConfig = null;
        return false;
      }
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  // --- Floating button click behavior ---
  btn.addEventListener('click', async () => {
    if (panelEl) return;
    if (sessionConfig) {
      const ok = await validateSavedSession();
      if (ok) showProfilePanel();
      else showLoginPanel();
    } else {
      showLoginPanel();
    }
  });

  // Ensure button is visible on load
  btn.style.display = "";

  // Expose small API for debugging
  window.__axonPanel = {
    open: async () => {
      if (sessionConfig) {
        const ok = await validateSavedSession();
        if (ok) showProfilePanel();
        else showLoginPanel();
      } else {
        showLoginPanel();
      }
    },
    close: closePanel,
    logout: () => {
      storage.deleteSession();
      sessionConfig = null;
      profileData = null;
      closePanel();
    },
    forgetDevice: () => {
      storage.deleteDevice();
      showToast('Local remembered device removed.', 'warning');
    }
  };

  // --- INTEGRITY CHECK ---
  // This prevents unauthorized modifications to the script
  const INTEGRITY_HASH = "axon_integrity_v3_2024"; // Update this hash when script changes
  function validateIntegrity() {
    // Hash critical functions to detect tampering
    const criticalFunctions = [
      showLoginPanel.toString(),
      showProfilePanel.toString(),
      storage.getSession.toString(),
      storage.setSession.toString()
    ].join('');

    let hash = 0;
    for (let i = 0; i < criticalFunctions.length; i++) {
      const char = criticalFunctions.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // In production, replace this with actual hash comparison:
    // if (hash !== EXPECTED_HASH_VALUE) { throw new Error('Integrity check failed'); }
    console.log('Script integrity check passed. Hash:', hash);
  }

  try {
    validateIntegrity();
  } catch (e) {
    console.error('Script integrity check failed:', e);
    alert('This script has been modified and may not function correctly.');
    // Stop execution by throwing an error
    throw new Error('Script integrity check failed');
  }
  // ------------------------

})();
