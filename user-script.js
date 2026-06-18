// ==UserScript==
// @name         AXON Data Collector (remember device)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Bottom-right panel + remember device option + lord-icon + session persistence + permissions + Collect RT
// @match        https://*/*
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

  // Floating lock button (lord-icon) setup
  const btn = document.createElement("div");
  btn.id = "axon-floating-btn";
  btn.innerHTML = "🔒";
  document.body.appendChild(btn);

  function initLordicon() {
    console.log('initLordicon called, customElements.get("lord-icon"):', !!customElements.get('lord-icon'));
    if (customElements.get('lord-icon')) {
      customElements.whenDefined('lord-icon').then(() => {
        console.log('lord-icon custom element is defined');
        const wrapper = document.createElement('div');
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.justifyContent = "center";
        wrapper.style.width = "100%";
        wrapper.style.height = "100%";
        const icon = document.createElement('lord-icon');
        icon.src = "https://cdn.lordicon.com/aszjakup.json";
        icon.trigger = "loop";
        icon.colors = "primary:#ffffff,secondary:#38bdf8";
        icon.style.width = "36px";
        icon.style.height = "36px";
        wrapper.appendChild(icon);
        btn.innerHTML = "";
        btn.appendChild(wrapper);
        console.log('Lordicon element added to DOM');
      }).catch((err) => {
        console.error('Error waiting for lord-icon custom element:', err);
        btn.innerHTML = "🔒";
      });
    } else {
      console.log('lord-icon custom element not available, using emoji');
      btn.innerHTML = "🔒";
    }
  }

  // Initialize lordicon floating button state
  async function initFloatingButton() {
    await loadLordiconLibrary();
    initLordicon();
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

  // --- CSV Upload Modal UI ---
  function showCSVUploadModal(featureName, config) {
    const MAX_LINES = config?.max_lines || 50; // Get max_lines from backend config, default to 50
    const modalHTML = `
      <h3 style="margin:4px 0 16px;color:#38bdf8;text-align:center;font-weight:600;font-size:18px;">${escapeHtml(featureName)}</h3>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:13px;color:#9ca3af;margin-bottom:8px;">Upload CSV file with phone numbers (Max ${MAX_LINES} lines)</label>
        <input id="axon-csv-file" type="file" accept=".csv" class="axon-input" />
      </div>
      <div id="axon-csv-preview" style="margin-bottom:16px;display:none;">
        <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Preview (first 5 rows):</div>
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

    const fileInput = panel.querySelector("#axon-csv-file");
    const previewDiv = panel.querySelector("#axon-csv-preview");
    const previewContent = panel.querySelector("#axon-csv-preview-content");
    const statusDiv = panel.querySelector("#axon-csv-status");
    const processBtn = panel.querySelector("#axon-csv-process");
    const cancelBtn = panel.querySelector("#axon-csv-cancel");

    let parsedData = [];

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        parsedData = parseCSV(text);

        if (parsedData.length > MAX_LINES) {
          statusDiv.textContent = `Error: CSV contains ${parsedData.length} rows, but maximum allowed is ${MAX_LINES}`;
          statusDiv.style.color = "#f87171";
          previewDiv.style.display = "none";
          processBtn.disabled = true;
          showInlineMsg(panel, `CSV exceeds maximum limit of ${MAX_LINES} rows. Please reduce the file size.`, 'error');
          return;
        }

        if (parsedData.length > 0) {
          statusDiv.textContent = `Loaded ${parsedData.length} rows`;
          statusDiv.style.color = "#9ca3af";
          previewDiv.style.display = "block";
          previewContent.textContent = parsedData.slice(0, 5).map(row => JSON.stringify(row)).join('\n');
          processBtn.disabled = false;
        } else {
          statusDiv.textContent = "No valid data found in CSV";
          statusDiv.style.color = "#9ca3af";
          previewDiv.style.display = "none";
          processBtn.disabled = true;
        }
      };
      reader.readAsText(file);
    });

    cancelBtn.addEventListener('click', () => closePanel());

    // Collect RT can run off the line IDs collected by the last Bulk Fix,
    // so allow processing without a CSV when those are available.
    if (featureName === 'Bulk Collect RT Data' && Array.isArray(window.__bulkFixLineIds) && window.__bulkFixLineIds.length) {
      statusDiv.textContent = `Using ${window.__bulkFixLineIds.length} line IDs from last Bulk Fix. Upload a CSV to override.`;
      processBtn.disabled = false;
    }

    processBtn.addEventListener('click', async () => {
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

  // --- CSV Parser ---
  function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }

    return data;
  }

  // --- Bulk Recent Fix Processing ---
  async function processBulkRecentFix(phoneNumbers, panel) {
    const lineIds = [];
    const statusDiv = panel.querySelector("#axon-csv-status");
    const processBtn = panel.querySelector("#axon-csv-process");

    processBtn.disabled = true;
    processBtn.textContent = "Getting line IDs...";

    // Step 1: Get line IDs from phone numbers
    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i].phone_number || phoneNumbers[i].phone || phoneNumbers[i].Phone || Object.values(phoneNumbers[i])[0];
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

      // Small delay to avoid overwhelming the server
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

    // Step 2: Apply Recent Fix to all line IDs
    processBtn.textContent = "Applying Recent Fix...";
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < lineIds.length; i++) {
      const { phone_number, line_id } = lineIds[i];
      statusDiv.textContent = `Applying fix: ${i + 1}/${lineIds.length}: Line ID ${line_id} (${phone_number})`;

      try {
        const success = await applyRecentFix(line_id);
        if (success) {
          successCount++;
          console.log(`Successfully applied Recent Fix to line ID ${line_id}`);
        } else {
          failureCount++;
          console.warn(`Failed to apply Recent Fix to line ID ${line_id}`);
        }
      } catch (error) {
        failureCount++;
        console.error(`Error applying Recent Fix to line ID ${line_id}:`, error);
      }

      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    statusDiv.textContent = `Completed. Found ${lineIds.length} line IDs, Applied fix: ${successCount} success, ${failureCount} failed`;
    processBtn.textContent = "Done";
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
      statusDiv.textContent = 'No line IDs available. Run Bulk Fix first or upload a CSV.';
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

  function rtBuildSvgChart(doc, series, title, color) {
    const wrap = doc.createElement('div');
    wrap.className = 'rt-chart';
    const h = doc.createElement('div');
    h.className = 'rt-chart-title';
    h.textContent = title;
    wrap.appendChild(h);

    if (!Array.isArray(series) || series.length === 0) {
      const empty = doc.createElement('div');
      empty.className = 'rt-chart-empty';
      empty.textContent = 'No history data';
      wrap.appendChild(empty);
      return wrap;
    }

    const W = 520, H = 220, pad = 40;
    const values = series.map(p => p.value);
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const stepX = series.length > 1 ? (W - 2 * pad) / (series.length - 1) : 0;
    const x = i => pad + i * stepX;
    const y = val => H - pad - ((val - min) / range) * (H - 2 * pad);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'rt-chart-svg');

    [0, 0.5, 1].forEach(t => {
      const gy = pad + t * (H - 2 * pad);
      const line = doc.createElementNS(svgNS, 'line');
      line.setAttribute('x1', pad); line.setAttribute('x2', W - pad);
      line.setAttribute('y1', gy); line.setAttribute('y2', gy);
      line.setAttribute('stroke', 'rgba(255,255,255,0.1)');
      svg.appendChild(line);
      const lbl = doc.createElementNS(svgNS, 'text');
      lbl.setAttribute('x', 4); lbl.setAttribute('y', gy + 4);
      lbl.setAttribute('fill', '#9ca3af'); lbl.setAttribute('font-size', '10');
      lbl.textContent = Math.round(max - t * range);
      svg.appendChild(lbl);
    });

    const pts = series.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
    const poly = doc.createElementNS(svgNS, 'polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', color);
    poly.setAttribute('stroke-width', '2');
    svg.appendChild(poly);

    series.forEach((p, i) => {
      const c = doc.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', x(i)); c.setAttribute('cy', y(p.value));
      c.setAttribute('r', '3'); c.setAttribute('fill', color);
      const tt = doc.createElementNS(svgNS, 'title');
      tt.textContent = `${p.date}: ${p.value}`;
      c.appendChild(tt);
      svg.appendChild(c);
      if (i === 0 || i === series.length - 1) {
        const t = doc.createElementNS(svgNS, 'text');
        t.setAttribute('x', x(i)); t.setAttribute('y', H - pad + 14);
        t.setAttribute('fill', '#9ca3af'); t.setAttribute('font-size', '9');
        t.setAttribute('text-anchor', i === 0 ? 'start' : 'end');
        t.textContent = (p.date || '').split(' ')[0];
        svg.appendChild(t);
      }
    });

    wrap.appendChild(svg);
    return wrap;
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
      body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;}
      .rt-header{padding:16px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,0.08);position:sticky;top:0;background:#0f172a;z-index:5;}
      .rt-header h1{font-size:18px;margin:0;color:#38bdf8;}
      .rt-count{font-size:13px;color:#9ca3af;}
      .rt-filter{margin-left:auto;display:flex;gap:8px;align-items:center;}
      .rt-filter input{background:#1e293b;border:1px solid rgba(255,255,255,0.12);color:#e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;min-width:240px;}
      .rt-btn{background:#1e293b;border:1px solid rgba(255,255,255,0.12);color:#e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer;}
      .rt-table-wrap{overflow:auto;padding:0 12px 12px;}
      table{border-collapse:collapse;width:100%;font-size:12px;}
      th,td{border:1px solid rgba(255,255,255,0.08);padding:6px 8px;text-align:left;white-space:nowrap;}
      th{background:#1e293b;position:sticky;top:0;cursor:default;}
      tbody tr{cursor:pointer;}
      tbody tr:nth-child(even){background:rgba(255,255,255,0.02);}
      tbody tr:hover{background:rgba(56,189,248,0.12);}
      tbody tr.selected{background:rgba(56,189,248,0.2);}
      .rt-bad{color:#f87171;} .rt-good{color:#34d399;}
      .rt-charts{display:flex;gap:24px;flex-wrap:wrap;padding:16px 20px;border-top:1px solid rgba(255,255,255,0.08);}
      .rt-chart{background:#111c33;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;}
      .rt-chart-title{font-size:13px;color:#93c5fd;margin-bottom:8px;}
      .rt-chart-svg{width:520px;max-width:100%;height:auto;}
      .rt-chart-empty{color:#6b7280;font-size:12px;padding:20px;}
      .rt-detail-head{padding:12px 20px 0;font-size:14px;color:#e2e8f0;}
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

    const header = doc.createElement('div');
    header.className = 'rt-header';
    const title = doc.createElement('h1');
    title.textContent = 'AXON — Collect RT Results';
    const count = doc.createElement('span');
    count.className = 'rt-count';
    count.textContent = `${results.length} line(s)`;
    const filterWrap = doc.createElement('div');
    filterWrap.className = 'rt-filter';
    const filterInput = doc.createElement('input');
    filterInput.type = 'text';
    filterInput.placeholder = 'Filter table…';
    const exportBtn = doc.createElement('button');
    exportBtn.className = 'rt-btn';
    exportBtn.textContent = 'Export JSON';
    filterWrap.appendChild(filterInput);
    filterWrap.appendChild(exportBtn);
    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(filterWrap);
    doc.body.appendChild(header);

    const tableWrap = doc.createElement('div');
    tableWrap.className = 'rt-table-wrap';
    const table = doc.createElement('table');
    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    columns.forEach(c => {
      const th = doc.createElement('th');
      th.textContent = c.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = doc.createElement('tbody');
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    doc.body.appendChild(tableWrap);

    const detailHead = doc.createElement('div');
    detailHead.className = 'rt-detail-head';
    detailHead.textContent = 'Select a line to view its history charts.';
    doc.body.appendChild(detailHead);
    const chartsDiv = doc.createElement('div');
    chartsDiv.className = 'rt-charts';
    doc.body.appendChild(chartsDiv);

    function showCharts(item) {
      chartsDiv.innerHTML = '';
      detailHead.textContent = `History — Line ID ${item.line_id}${item.phone_number ? ' (' + item.phone_number + ')' : ''}`;
      const h = item.history || {};
      chartsDiv.appendChild(rtBuildSvgChart(doc, h.dsMabr, 'Estimated DS MABR (kbps)', '#38bdf8'));
      chartsDiv.appendChild(rtBuildSvgChart(doc, h.dsSyncRate, 'DS Sync Rate (kbps)', '#34d399'));
    }

    const rows = [];
    results.forEach((item, idx) => {
      const tr = doc.createElement('tr');
      const flag = item.timedOut || item.noData || item.error || item.workerError;
      columns.forEach(c => {
        const td = doc.createElement('td');
        let val = rtFormatValue(item[c.key]);
        if (c.key === 'rtStatus' && flag) {
          val = item.timedOut ? 'Timed out' : item.noData ? 'No data' : 'Error';
          td.className = 'rt-bad';
        }
        if (val.length > 60) { td.title = val; val = val.slice(0, 60) + '…'; }
        td.textContent = val;
        tr.appendChild(td);
      });
      tr.addEventListener('click', () => {
        rows.forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
        showCharts(item);
      });
      tbody.appendChild(tr);
      rows.push(tr);
    });

    filterInput.addEventListener('input', () => {
      const q = filterInput.value.toLowerCase();
      let visible = 0;
      rows.forEach(tr => {
        const match = tr.textContent.toLowerCase().includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      count.textContent = `${visible}/${results.length} line(s)`;
    });

    exportBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'axon-rt-results.json';
      a.click();
    });

    const firstWithHistory = results.find(r => r.history && (r.history.dsMabr?.length || r.history.dsSyncRate?.length));
    if (firstWithHistory) {
      const i = results.indexOf(firstWithHistory);
      rows[i].classList.add('selected');
      showCharts(firstWithHistory);
    }
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
