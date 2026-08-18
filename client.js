// backend/supabase/client.js
// Supabase PostgREST Cloud Client — Thay thế Firebase REST API
// =========================================================================

(() => {
  const isBackground = typeof window === 'undefined';
  const SupabaseCloud = globalThis.SupabaseCloud || {};

  SupabaseCloud._deviceId = null;
  SupabaseCloud._deviceName = '';
  SupabaseCloud.isConnected = false;

  SupabaseCloud._savedUrl = '';
  SupabaseCloud._savedAnonKey = '';

  SupabaseCloud._getConfig = function() {
    const cfg = typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG : { url: '', anonKey: '' };
    const url = (this._savedUrl || cfg.url || '').trim();
    const anonKey = (this._savedAnonKey || cfg.anonKey || '').trim();
    return { url, anonKey };
  };

  SupabaseCloud.saveConfig = async function(url, anonKey) {
    const u = (url || '').trim();
    const k = (anonKey || '').trim();
    this._savedUrl = u;
    this._savedAnonKey = k;
    if (typeof SUPABASE_CONFIG !== 'undefined') {
      SUPABASE_CONFIG.url = u;
      SUPABASE_CONFIG.anonKey = k;
    }
    return new Promise(resolve => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ supabaseUrl: u, supabaseAnonKey: k }, resolve);
        } else {
          localStorage.setItem('supabaseUrl', u);
          localStorage.setItem('supabaseAnonKey', k);
          resolve();
        }
      } catch (e) { resolve(); }
    });
  };

  SupabaseCloud.loadConfig = async function() {
    return new Promise(async (resolve) => {
      try {
        let u = null, k = null;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const r = await new Promise(res => chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey'], res));
          u = r.supabaseUrl;
          k = r.supabaseAnonKey;
        } else {
          u = localStorage.getItem('supabaseUrl');
          k = localStorage.getItem('supabaseAnonKey');
        }

        // Tự động kéo cấu hình từ GitHub nếu người dùng chưa điền thủ công (Chỉ dùng trên Dev)
        if (!u || !k) {
          if (typeof __IS_DEV_EXTENSION__ !== 'undefined' && __IS_DEV_EXTENSION__) {
            try {
              const c = new AbortController();
              const t = setTimeout(() => c.abort(), 3000);
              const url = 'https://raw.githubusercontent.com/vinhtaibonsai-coder/supbase/main/configAOF.json';
              const res = await fetch(url + '?t=' + Date.now(), { signal: c.signal });
              clearTimeout(t);
              if (res.ok) {
                const data = await res.json();
                if (data.url && data.anonKey && typeof SUPABASE_CONFIG !== 'undefined') {
                  SUPABASE_CONFIG.url = data.url;
                  SUPABASE_CONFIG.anonKey = data.anonKey;
                }
              }
            } catch (e) {}
          }
        }

        if (u) this._savedUrl = u;
        if (k) this._savedAnonKey = k;
        
        resolve(this._getConfig());
      } catch (e) { resolve(this._getConfig()); }
    });
  };

  SupabaseCloud._url = function(path) {
    const cfg = this._getConfig();
    const baseUrl = (cfg.url || '').trim().replace(/\/$/, '');
    return `${baseUrl}/rest/v1/${path}`;
  };

  SupabaseCloud._headers = function(accessToken = null) {
    const cfg = this._getConfig();
    const key = (cfg.anonKey || '').trim();
    let token = accessToken;
    if (!token && typeof AuthSession !== 'undefined' && AuthSession._cachedToken) {
      token = AuthSession._cachedToken;
    }
    if (!token) token = key;

    return {
      'apikey': key,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates'
    };
  };

  SupabaseCloud.testConnection = async function() {
    await this.loadConfig();
    const cfg = this._getConfig();
    if (!cfg.url || !cfg.anonKey || cfg.url.includes('YOUR_SUPABASE')) {
      return { ok: false, reason: 'Chưa điền URL hoặc Anon Key' };
    }
    try {
      const resp = await fetch(this._url('orders?select=id&limit=1'), {
        headers: this._headers()
      });
      if (resp.ok) {
        this.isConnected = true;
        return { ok: true, url: cfg.url };
      } else {
        const text = await resp.text().catch(() => '');
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, reason: 'Mã Anon Key không hợp lệ hoặc bị từ chối' };
        }
        return { ok: false, reason: `HTTP ${resp.status}: ${text || 'Không thể truy cập Supabase'}` };
      }
    } catch (e) {
      return { ok: false, reason: 'Không thể kết nối mạng hoặc sai URL Supabase' };
    }
  };

  SupabaseCloud.signIn = async function() {
    if (!isBackground) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'firebaseSignIn' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { reject(new Error(lastErr.message)); return; }
          if (response && response.ok) {
            SupabaseCloud.isConnected = true;
            SupabaseCloud._deviceId = response.deviceId || SupabaseCloud._deviceId || '';
            SupabaseCloud._deviceName = response.deviceName || SupabaseCloud._deviceName || '';
            resolve();
          } else {
            reject(new Error(response?.error || 'Kết nối Supabase thất bại'));
          }
        });
      });
    }

    await this.loadConfig();
    await this._getDeviceId();
    await this._getDeviceName();
    const cfg = this._getConfig();
    if (!cfg.url || !cfg.anonKey) {
      throw new Error('Chưa cấu hình Supabase URL hoặc Anon Key trong Cài đặt');
    }
    this.isConnected = true;
    return true;
  };

  SupabaseCloud.signOut = async function() {
    this.isConnected = false;
    return true;
  };

  SupabaseCloud.setDeviceName = async function(name) {
    const n = (name || '').trim();
    this._deviceName = n;
    return new Promise(resolve => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ fbDeviceName: n }, resolve);
        } else {
          localStorage.setItem('fbDeviceName', n);
          resolve();
        }
      } catch (e) { resolve(); }
    });
  };

  SupabaseCloud._getDeviceName = async function() {
    if (this._deviceName) return this._deviceName;
    return new Promise(resolve => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['fbDeviceName'], r => {
            this._deviceName = r.fbDeviceName || '';
            resolve(this._deviceName);
          });
        } else {
          this._deviceName = localStorage.getItem('fbDeviceName') || '';
          resolve(this._deviceName);
        }
      } catch (e) { resolve(''); }
    });
  };

  SupabaseCloud._getDeviceId = async function() {
    if (this._deviceId) return this._deviceId;
    return new Promise(resolve => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['fbDeviceId'], r => {
            if (r.fbDeviceId) { this._deviceId = r.fbDeviceId; resolve(r.fbDeviceId); return; }
            const id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 12);
            this._deviceId = id;
            chrome.storage.local.set({ fbDeviceId: id }, () => resolve(id));
          });
        } else {
          let id = localStorage.getItem('fbDeviceId');
          if (!id) { id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 12); localStorage.setItem('fbDeviceId', id); }
          this._deviceId = id;
          resolve(id);
        }
      } catch (e) { resolve('dev_fallback_' + Date.now()); }
    });
  };

  // ─── DEVICES MANAGEMENT ───
  // Lấy access token hợp lệ của user hiện tại (từ AuthSession) nếu có.
  SupabaseCloud._sessionToken = async function() {
    try {
      if (typeof AuthSession !== 'undefined' && AuthSession.getSession) {
        const session = await AuthSession.getSession();
        if (session && session.auth_mode === 'local_dev') {
          console.warn('[SupabaseCloud] Local dev session cannot be used for cloud operations.');
          return null;
        }
        if (session && session.access_token) return session.access_token;
      }
    } catch (_) {}
    return null;
  };

  // Helper gọi RPC bằng token của user đang đăng nhập (auth.uid()) hoặc anon key.
  SupabaseCloud.rpc = async function(method, params) {
    try {
      await this.loadConfig();
      const token = await this._sessionToken();
      const cfg = this._getConfig();
      const baseUrl = (cfg.url || '').trim().replace(/\/$/, '');
      const resp = await fetch(`${baseUrl}/rest/v1/rpc/${encodeURIComponent(method)}`, {
        method: 'POST',
        headers: this._headers(token || null),
        body: JSON.stringify(params || {})
      });
      const text = await resp.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
      if (!resp.ok) return { ok: false, error: data || ('HTTP ' + resp.status), status: resp.status };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message || 'NETWORK_ERR' };
    }
  };

  // Kiểm tra thiết bị hiện tại có bị thu hồi (revoked) trong extension_devices.
  // Trả về: { revoked: boolean } hoặc { ok:false } khi chưa có token / chưa có thiết bị.
  SupabaseCloud.checkDeviceRevoked = async function() {
    try {
      await this.loadConfig();
      await this._getDeviceId();
      const token = await this._sessionToken();
      if (!token) return { ok: false, reason: 'NO_TOKEN' };

      const cfg = this._getConfig();
      const baseUrl = (cfg.url || '').trim().replace(/\/$/, '');
      const resp = await fetch(
        `${baseUrl}/rest/v1/extension_devices?select=device_id,revoked&device_id=eq.${encodeURIComponent(this._deviceId)}`,
        { headers: this._headers(token), cache: 'no-store' }
      );
      if (!resp.ok) return { ok: false, reason: 'HTTP_' + resp.status };
      const rows = await resp.json();
      const match = (rows || []).find(r => r.device_id === this._deviceId);
      return { ok: true, revoked: !!(match && match.revoked) };
    } catch (e) {
      return { ok: false, reason: 'ERR' };
    }
  };

  // Upsert thiết bị hiện tại vào bảng extension_devices (cần JWT để auth.uid()).
  SupabaseCloud.syncDeviceRecord = async function() {
    try {
      await this.loadConfig();
      await this._getDeviceId();
      await this._getDeviceName();
      const token = await this._sessionToken();
      if (!token) return { ok: false, reason: 'NO_TOKEN' };

      const deviceId = this._deviceId;
      const name = this._deviceName || ('Chrome (' + (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Mac') ? 'Mac' : 'Windows') + ')');

      // Lấy user_id (UUID) của người đang đăng nhập
      let userId = null;
      try {
        if (typeof AuthSession !== 'undefined' && AuthSession.getUser) {
          const user = await AuthSession.getUser();
          if (user && user.id) userId = user.id;
        }
      } catch (_) {}

      const cfg = this._getConfig();
      const baseUrl = (cfg.url || '').trim().replace(/\/$/, '');
      const lastSeen = new Date().toISOString();
      const record = { device_id: deviceId, device_name: name, browser: 'Chrome', last_seen: lastSeen };
      if (userId) record.user_id = userId;
      const resp = await fetch(`${baseUrl}/rest/v1/extension_devices`, {
        method: 'POST',
        headers: { ...this._headers(token), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify([record])
      });
      return { ok: resp.ok };
    } catch (e) {
      return { ok: false, reason: 'ERR' };
    }
  };

  SupabaseCloud.registerDevice = async function() {
    if (!isBackground) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'registerDevice' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve({ ok: false }); return; }
          resolve(response || { ok: false });
        });
      });
    }

    await this.loadConfig();
    await this._getDeviceId();
    await this._getDeviceName();
    const deviceId = this._deviceId;
    let platform = 'Windows';
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      if (ua.includes('Mac')) platform = 'Mac';
      else if (ua.includes('Linux')) platform = 'Linux';
      else if (ua.includes('Android')) platform = 'Android';
      else if (ua.includes('iPhone') || ua.includes('iPad')) platform = 'iOS';
    }
    const defaultSmartName = 'Chrome (' + platform + ')';
    const name = (this._deviceName && this._deviceName !== 'Máy không tên' && !this._deviceName.startsWith('dev_'))
      ? this._deviceName
      : defaultSmartName;
    this._deviceName = name;
    const lastSeen = new Date().toISOString();

    const resp = await fetch(this._url('devices'), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify([{
        device_id: deviceId,
        name: name,
        platform: platform,
        last_seen: lastSeen
      }])
    });
    return { ok: resp.ok };
  };

  SupabaseCloud.fetchDevices = async function() {
    if (!isBackground) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchDevices' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve([]); return; }
          if (response && response.error) resolve([]);
          else resolve(response || []);
        });
      });
    }

    await this.loadConfig();
    await this._getDeviceId();
    await this._getDeviceName();

    const devicesMap = new Map();
    if (this._deviceId) {
      devicesMap.set(this._deviceId, {
        deviceId: this._deviceId,
        name: this._deviceName || 'Máy hiện tại',
        platform: typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Mac') ? 'Mac' : 'Windows',
        lastSeen: new Date().toISOString(),
        draftCount: 0,
        submittedCount: 0
      });
    }

    // 1. Lấy danh sách từ bảng devices (nếu có)
    try {
      const resp = await fetch(this._url('devices?select=*&order=last_seen.desc'), {
        headers: this._headers(),
        cache: 'no-store'
      });
      if (resp.ok) {
        const data = await resp.json();
        (data || []).forEach(d => {
          const id = d.device_id || d.deviceId || '';
          if (id) {
            devicesMap.set(id, {
              deviceId: id,
              name: d.name || 'Máy không tên',
              platform: d.platform || 'Windows',
              lastSeen: d.last_seen || d.lastSeen || '',
              draftCount: 0,
              submittedCount: 0
            });
          }
        });
      }
    } catch (_) {}

    // 2. Thống kê đơn nháp (orders) theo device_id / device_name
    try {
      const resp = await fetch(this._url('orders?select=device_id,device_name'), {
        headers: this._headers(),
        cache: 'no-store'
      });
      if (resp.ok) {
        const orders = await resp.json();
        (orders || []).forEach(o => {
          const devId = o.device_id ? String(o.device_id) : (o.device_name ? String(o.device_name) : null);
          const devName = o.device_name || '';
          if (devId || devName) {
            let matched = null;
            for (const dev of devicesMap.values()) {
              if ((devId && String(dev.deviceId) === String(devId)) || (devName && dev.name === devName)) {
                matched = dev;
                break;
              }
            }
            if (!matched) {
              const key = devId || devName;
              matched = {
                deviceId: key,
                name: devName || ('Thiết bị ' + String(key).slice(-6)),
                platform: 'Windows',
                lastSeen: '',
                draftCount: 0,
                submittedCount: 0
              };
              devicesMap.set(key, matched);
            }
            matched.draftCount++;
          }
        });
      }
    } catch (_) {}

    // 3. Thống kê đơn đã lên (submitted_orders) theo device_id / device_name
    try {
      const resp = await fetch(this._url('submitted_orders?select=device_id,device_name,created_at'), {
        headers: this._headers(),
        cache: 'no-store'
      });
      if (resp.ok) {
        const subs = await resp.json();
        (subs || []).forEach(s => {
          const devId = s.device_id ? String(s.device_id) : (s.device_name ? String(s.device_name) : '');
          const devName = s.device_name || '';
          if (devId || devName) {
            let matched = null;
            for (const dev of devicesMap.values()) {
              if ((devId && String(dev.deviceId) === String(devId)) || (devName && dev.name === devName)) {
                matched = dev;
                break;
              }
            }
            if (!matched) {
              const key = devId || devName;
              matched = {
                deviceId: key,
                name: devName || ('Máy ' + String(key).slice(-6)),
                platform: 'Windows',
                lastSeen: s.created_at || '',
                draftCount: 0,
                submittedCount: 0
              };
              devicesMap.set(key, matched);
            }
            matched.submittedCount++;
            if (devName && (matched.name === 'Máy không tên' || matched.name.startsWith('Thiết bị ') || matched.name.startsWith('Máy '))) {
              matched.name = devName;
            }
            if (s.created_at && (!matched.lastSeen || new Date(s.created_at) > new Date(matched.lastSeen))) {
              matched.lastSeen = s.created_at;
            }
          }
        });
      }
    } catch (_) {}

    return Array.from(devicesMap.values());
  };

  SupabaseCloud.deleteDevice = async function(targetDeviceId) {
    if (!targetDeviceId) return { ok: false };
    if (!isBackground) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'deleteDevice', deviceId: targetDeviceId }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve({ ok: false }); return; }
          resolve(response || { ok: false });
        });
      });
    }

    await this.loadConfig();
    const resp = await fetch(this._url(`devices?device_id=eq.${encodeURIComponent(targetDeviceId)}`), {
      method: 'DELETE',
      headers: this._headers()
    });
    return { ok: resp.ok };
  };

  SupabaseCloud.adoptDeviceProfile = async function(oldDeviceId, newName) {
    if (oldDeviceId && oldDeviceId !== this._deviceId) {
      try { await this.deleteDevice(oldDeviceId); } catch (_) {}
    }
    if (newName) {
      await this.setDeviceName(newName);
    }
    return await this.registerDevice();
  };

  SupabaseCloud._getActiveShopId = async function() {
    try {
      if (typeof AuthSession !== 'undefined' && AuthSession.getActiveShop) {
        const id = await AuthSession.getActiveShop();
        if (id) return id;
      }
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise(resolve => {
          chrome.storage.local.get(['vnpost_session'], r => {
            if (r.vnpost_session && r.vnpost_session.active_shop_id) {
              resolve(r.vnpost_session.active_shop_id);
            } else {
              resolve(null);
            }
          });
        });
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  // ─── ORDERS MANAGEMENT ───
  SupabaseCloud.pushOrders = async function(orders) {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'pushOrders', orders }, resolve);
      });
    }

    if (!Array.isArray(orders) || orders.length === 0) return;
    const shopId = await this._getActiveShopId();

    const records = orders.map(o => {
      const rec = {
        id: o.id || 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: o.name || o.customer_name || '',
        customer_name: o.name || o.customer_name || '',
        phone: o.phone || '',
        address: o.address || '',
        order_code: o.orderCode || '',
        cod_amount: Number(o.codAmount) || 0,
        collect_fee: !!o.collectFee,
        platform: o.platform || '',
        created_at: o.createdAt || new Date().toISOString(),
        device_name: o.deviceName || this._deviceName || '',
        status: o.status || 'draft'
      };
      if (shopId) rec.shop_id = shopId;
      return rec;
    });

    await fetch(this._url('orders'), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(records)
    });
  };

  SupabaseCloud.pushOrder = async function(order) {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'pushOrder', order }, resolve);
      });
    }

    const id = order.id || 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const shopId = await this._getActiveShopId();
    const rec = {
      id: id,
      name: order.name || order.customer_name || '',
      customer_name: order.name || order.customer_name || '',
      phone: order.phone || '',
      address: order.address || '',
      order_code: order.orderCode || '',
      cod_amount: Number(order.codAmount) || 0,
      collect_fee: !!order.collectFee,
      platform: order.platform || '',
      created_at: order.createdAt || new Date().toISOString(),
      device_name: order.deviceName || this._deviceName || '',
      status: order.status || 'draft'
    };
    if (shopId) rec.shop_id = shopId;

    const resp = await fetch(this._url('orders'), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify([rec])
    });
    return resp.ok;
  };

  SupabaseCloud.fetchOrders = async function() {
    if (!isBackground) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchOrders' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve([]); return; }
          if (response && response.error) resolve([]);
          else resolve(response || []);
        });
      });
    }

    const resp = await fetch(this._url('orders?select=*&order=created_at.desc&limit=1000'), {
      headers: this._headers(),
      cache: 'no-store'
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data || []).map(o => ({
      id: o.id,
      name: o.name || o.customer_name || '',
      phone: o.phone || '',
      address: o.address || '',
      orderCode: o.order_code || o.orderCode || '',
      codAmount: Number(o.cod_amount) || 0,
      collectFee: o.collect_fee === true,
      platform: o.platform || '',
      createdAt: o.created_at || o.createdAt || '',
      deviceName: o.device_name || o.deviceName || ''
    }));
  };

  SupabaseCloud.deleteOrder = async function(orderId) {
    if (!orderId) return false;
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'deleteOrder', orderId }, resolve);
      });
    }

    const resp = await fetch(this._url(`orders?id=eq.${encodeURIComponent(orderId)}`), {
      method: 'DELETE',
      headers: this._headers()
    });
    return resp.ok;
  };

  SupabaseCloud.deleteBulkOrdersCloud = async function(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return true;
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'deleteBulkOrdersCloud', ids }, resolve);
      });
    }

    await this.loadConfig();
    const formattedIds = ids.map(id => `"${String(id).replace(/"/g, '')}"`).join(',');
    const [resp1, resp2] = await Promise.all([
      fetch(this._url(`orders?id=in.(${formattedIds})`), { method: 'DELETE', headers: this._headers() }),
      fetch(this._url(`history?id=in.(${formattedIds})`), { method: 'DELETE', headers: this._headers() })
    ]);
    return resp1.ok || resp2.ok;
  };

  // ─── SUBMITTED ORDERS MANAGEMENT ───
  SupabaseCloud.pushSubmittedOrders = async function(orders) {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'pushSubmittedOrders', orders }, resolve);
      });
    }

    if (!Array.isArray(orders) || orders.length === 0) return;
    const shopId = await this._getActiveShopId();
    
    const records = orders.map(o => {
      const rec = {
        id: o.id || 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        saved_order_id: o.savedOrderId || '',
        name: o.name || '',
        phone: o.phone || '',
        address: o.address || '',
        order_code: o.orderCode || '',
        cod_amount: Number(o.codAmount) || 0,
        collect_fee: !!o.collectFee,
        platform: o.platform || '',
        tracking_code: o.trackingCode || '',
        submitted_at: o.submittedAt || new Date().toISOString(),
        submitted_date: o.submittedDate || '',
        device_name: o.deviceName || this._deviceName || ''
      };
      if (shopId) rec.shop_id = shopId;
      return rec;
    });

    await fetch(this._url('submitted_orders'), {
      method: 'POST',
      headers: { ...this._headers(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(records)
    });
  };

  SupabaseCloud.pushSubmittedOrder = async function(order) {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'pushSubmittedOrder', order }, resolve);
      });
    }

    const id = order.id || 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const shopId = await this._getActiveShopId();
    const rec = {
      id: id,
      saved_order_id: order.savedOrderId || '',
      name: order.name || '',
      phone: order.phone || '',
      address: order.address || '',
      order_code: order.orderCode || '',
      cod_amount: Number(order.codAmount) || 0,
      collect_fee: !!order.collectFee,
      platform: order.platform || '',
      tracking_code: order.trackingCode || '',
      submitted_at: order.submittedAt || new Date().toISOString(),
      submitted_date: order.submittedDate || '',
      device_name: order.deviceName || this._deviceName || '',
      carrier_account: order.carrierAccount || order.carrier_account || ''
    };
    if (shopId) rec.shop_id = shopId;

    const resp = await fetch(this._url('submitted_orders'), {
      method: 'POST',
      headers: { ...this._headers(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify([rec])
    });
    return resp.ok;
  };

  SupabaseCloud.fetchSubmittedOrders = async function() {
    if (!isBackground) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchSubmittedOrders' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve([]); return; }
          if (response && response.error) resolve([]);
          else resolve(response || []);
        });
      });
    }

    const resp = await fetch(this._url('submitted_orders?select=*&order=submitted_at.desc&limit=500'), {
      headers: this._headers(),
      cache: 'no-store'
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data || []).map(o => ({
      id: o.id,
      savedOrderId: o.saved_order_id || o.savedOrderId || '',
      name: o.name || '',
      phone: o.phone || '',
      address: o.address || '',
      orderCode: o.order_code || o.orderCode || '',
      codAmount: Number(o.cod_amount) || 0,
      collectFee: o.collect_fee === true,
      platform: o.platform || '',
      trackingCode: o.tracking_code || o.trackingCode || '',
      submittedAt: o.submitted_at || o.submittedAt || '',
      submittedDate: o.submitted_date || o.submittedDate || '',
      deviceName: o.device_name || o.deviceName || ''
    }));
  };

  SupabaseCloud.deleteSubmittedOrderCloud = async function(orderId) {
    if (!orderId) return false;
    if (!isBackground) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'deleteSubmittedOrderCloud', orderId }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve(false); return; }
          resolve(response ? response.ok : false);
        });
      });
    }

    const resp = await fetch(this._url(`submitted_orders?id=eq.${encodeURIComponent(orderId)}`), {
      method: 'DELETE',
      headers: this._headers()
    });
    return resp.ok;
  };

  SupabaseCloud.deleteOrderCloud = async function(orderId) {
    if (!orderId) return false;
    if (!isBackground) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'deleteOrderCloud', id: orderId }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve(false); return; }
          resolve(response ? response.ok : false);
        });
      });
    }

    await this.loadConfig();
    const encId = encodeURIComponent(orderId);
    let deleted_by = null;
    if (typeof AuthSession !== 'undefined') {
        const user = await AuthSession.getUser();
        if (user) deleted_by = user.id;
    }
    const patchData = { deleted_at: new Date().toISOString(), deleted_by };
    
    const [resp1, resp2] = await Promise.all([
      fetch(this._url(`orders?id=eq.${encId}`), { 
          method: 'PATCH', 
          headers: { ...this._headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify(patchData)
      }),
      fetch(this._url(`history?id=eq.${encId}`), { 
          method: 'PATCH', 
          headers: { ...this._headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify(patchData)
      })
    ]);
    return resp1.ok || resp2.ok;
  };

  SupabaseCloud.deleteHistoryOrder = SupabaseCloud.deleteOrderCloud;

  SupabaseCloud.deleteBulkSubmittedOrdersCloud = async function(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return true;
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'deleteBulkSubmittedOrdersCloud', ids }, resolve);
      });
    }

    await this.loadConfig();
    const idList = ids.join(',');
    let deleted_by = null;
    if (typeof AuthSession !== 'undefined') {
        const user = await AuthSession.getUser();
        if (user) deleted_by = user.id;
    }
    const patchData = { deleted_at: new Date().toISOString(), deleted_by };

    const resp = await fetch(this._url(`submitted_orders?id=in.(${idList})`), {
      method: 'PATCH',
      headers: { ...this._headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(patchData)
    });
    return resp.ok;
  };

  SupabaseCloud.clearSubmittedOrdersCloud = async function() {
    if (!isBackground) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'clearSubmittedOrdersCloud' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve(false); return; }
          resolve(response ? response.ok : false);
        });
      });
    }

    await this.loadConfig();
    let deleted_by = null;
    if (typeof AuthSession !== 'undefined') {
        const user = await AuthSession.getUser();
        if (user) deleted_by = user.id;
    }
    const patchData = { deleted_at: new Date().toISOString(), deleted_by };

    const resp = await fetch(this._url('submitted_orders?id=not.is.null'), {
      method: 'PATCH',
      headers: { ...this._headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(patchData)
    });
    return resp.ok;
  };

  SupabaseCloud.clearHistoryCloud = async function() {
    if (!isBackground) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'clearHistoryCloud' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve(false); return; }
          resolve(response ? response.ok : false);
        });
      });
    }

    const resp = await fetch(this._url('history?id=not.is.null'), {
      method: 'DELETE',
      headers: this._headers()
    });
    return resp.ok;
  };

  SupabaseCloud.pushCustomersCloud = async function(customers) {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'pushCustomersCloud', customers }, resolve);
      });
    }

    if (!Array.isArray(customers) || customers.length === 0) return true;
    const shopId = await this._getActiveShopId();

    const records = customers.map(c => {
      let validLatestDate = new Date().toISOString();
      if (c.latestDate) {
        const parsed = new Date(c.latestDate);
        if (!isNaN(parsed.getTime())) validLatestDate = parsed.toISOString();
      }

      const cleanPhone = (c.cleanPhone || c.phone || '').replace(/\D/g, '');
      const rawName = (c.name || c.customer_name || 'Khách hàng').trim();
      const phoneKey = cleanPhone ? cleanPhone : ('no_phone_' + rawName.toLowerCase().replace(/[^a-z0-9]/g, '_'));

      const rec = {
        phone: phoneKey,
        name: rawName,
        address: c.address || '—',
        province: c.province || '',
        segment: c.segment || 'new',
        total_orders: Number(c.count || c.totalOrders || 1),
        total_cod: Number(c.totalCod || 0),
        latest_date: validLatestDate,
        fav_carrier: c.favCarrier || c.platform || '',
        facebook_url: c.facebookUrl || '',
        tags: c.tags || '',
        notes: c.notes || c.note || '',
        updated_at: new Date().toISOString()
      };
      if (shopId) rec.shop_id = shopId;
      return rec;
    });

    const resp = await fetch(this._url('customers'), {
      method: 'POST',
      headers: { ...this._headers(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(records)
    });
    return resp.ok;
  };

  SupabaseCloud.fetchCustomersCloud = async function() {
    if (!isBackground) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'fetchCustomersCloud' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve([]); return; }
          if (response && response.error) resolve([]);
          else resolve(response || []);
        });
      });
    }

    const resp = await fetch(this._url('customers?select=*&order=updated_at.desc&limit=1000'), {
      headers: this._headers(),
      cache: 'no-store'
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data || []).map(c => {
      const isFakePhone = (c.phone || '').startsWith('no_phone_');
      const displayPhone = isFakePhone ? '—' : (c.phone || '');
      const cleanPhone = isFakePhone ? '' : (c.phone || '').replace(/\D/g, '');
      return {
        name: c.name || '',
        phone: displayPhone,
        cleanPhone: cleanPhone,
        address: c.address || '',
        province: c.province || '',
        segment: c.segment || 'new',
        count: c.total_orders || 1,
        totalOrders: c.total_orders || 1,
        totalCod: Number(c.total_cod) || 0,
        latestDate: c.latest_date || '',
        favCarrier: c.fav_carrier || '',
        facebookUrl: c.facebook_url || '',
        tags: c.tags || '',
        notes: c.notes || ''
      };
    });
  };

  SupabaseCloud.clearCustomersCloud = async function() {
    if (!isBackground) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'clearCustomersCloud' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve(false); return; }
          resolve(response ? response.ok : false);
        });
      });
    }

    const resp = await fetch(this._url('customers?name=not.is.null'), {
      method: 'DELETE',
      headers: this._headers()
    });
    return resp.ok;
  };

  SupabaseCloud.clearAllCloudData = async function() {
    const res1 = await this.clearSubmittedOrdersCloud();
    const res2 = await this.clearHistoryCloud();
    const res3 = await this.clearCustomersCloud();
    return res1 && res2 && res3;
  };

  // ─── HISTORY MANAGEMENT ───
  SupabaseCloud.pushHistory = async function(entries) {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'pushHistory', entries }, resolve);
      });
    }

    if (!Array.isArray(entries) || entries.length === 0) return true;
    const shopId = await this._getActiveShopId();

    const records = entries.map(entry => {
      const res = entry.result || {};
      const waybill = res.waybillCode || res.maVanDon || res.trackingCode || entry.waybill_code || entry.ma_van_don || '';
      
      let validCreatedAt = new Date().toISOString();
      const rawDate = entry.createdAt || entry.created_at || '';
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) validCreatedAt = parsed.toISOString();
      }

      const rec = {
        id: entry.id || 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        raw_text: entry.rawText || entry.raw_text || '',
        customer_name: (entry.customer_name || entry.name || res.name || res.recipientName || 'Khách hàng').trim(),
        phone: (entry.phone || res.phone || res.recipientPhone || '').trim(),
        address: (entry.address || res.normalizedAddress || res.address || '').trim(),
        order_code: entry.order_code || entry.orderCode || res.orderCode || res.maDon || '',
        waybill_code: waybill,
        cod_amount: Number(entry.cod_amount || entry.codAmount || res.codAmount || res.cod || 0),
        platform: entry.platform || res.platform || 'vnpost',
        created_at: validCreatedAt,
        created_at_short: entry.createdAtShort || '',
        device_name: entry.deviceName || entry.device_name || this._deviceName || '',
        result: res
      };
      if (shopId) rec.shop_id = shopId;
      return rec;
    });

    const resp = await fetch(this._url('history'), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(records)
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error("Lỗi push history sang Supabase:", resp.status, errText);
      return false;
    }
    return true;
  };

  SupabaseCloud.fetchHistory = async function() {
    if (!isBackground) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchHistory' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve([]); return; }
          if (response && response.error) resolve([]);
          else resolve(response || []);
        });
      });
    }

    const resp = await fetch(this._url('history?select=*&order=created_at.desc&limit=1000'), {
      headers: this._headers(),
      cache: 'no-store'
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data || []).map(h => ({
      id: h.id,
      rawText: h.raw_text || h.rawText || '',
      name: h.customer_name || h.name || '',
      customer_name: h.customer_name || h.name || '',
      phone: h.phone || '',
      address: h.address || '',
      orderCode: h.order_code || h.orderCode || '',
      order_code: h.order_code || h.orderCode || '',
      waybillCode: h.waybill_code || h.waybillCode || '',
      waybill_code: h.waybill_code || h.waybillCode || '',
      codAmount: Number(h.cod_amount) || 0,
      cod_amount: Number(h.cod_amount) || 0,
      platform: h.platform || '',
      createdAt: h.created_at || h.createdAt || '',
      created_at: h.created_at || h.createdAt || '',
      createdAtShort: h.created_at_short || h.createdAtShort || '',
      deviceName: h.device_name || h.deviceName || '',
      result: h.result || {}
    }));
  };

  // ─── SETTINGS & API KEY ───
  SupabaseCloud.pushApiKey = async function(apiKey) {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'pushApiKey', apiKey }, resolve);
      });
    }

    const resp = await fetch(this._url('settings'), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify([{
        key: 'groq_api_key',
        value: { key: apiKey }
      }])
    });
    return resp.ok;
  };

  SupabaseCloud.fetchApiKey = async function() {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'fetchApiKey' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve(null); return; }
          resolve(response ? response.key : null);
        });
      });
    }

    const resp = await fetch(this._url('settings?key=eq.groq_api_key&select=value'), {
      headers: this._headers()
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data && data[0] && data[0].value ? data[0].value.key : null;
  };

  SupabaseCloud.pushCustomerMetadata = async function(phone, meta) {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'pushCustomerMetadata', phone, meta }, resolve);
      });
    }

    const key = 'meta_' + (phone || '').replace(/\D/g, '');
    const resp = await fetch(this._url('settings'), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify([{
        key: key,
        value: meta
      }])
    });
    return resp.ok;
  };

  SupabaseCloud.fetchCustomersMetadata = async function() {
    if (!isBackground) {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'fetchCustomersMetadata' }, response => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) { resolve({}); return; }
          resolve(response ? response.metadata : {});
        });
      });
    }

    const resp = await fetch(this._url('settings?key=like.meta_*&select=key,value'), {
      headers: this._headers()
    });
    if (!resp.ok) return {};
    const data = await resp.json();
    const result = {};
    (data || []).forEach(row => {
      if (row.key && row.value) {
        const phone = row.key.replace(/^meta_/, '');
        result[phone] = row.value;
      }
    });
    return result;
  };

  // ─── FIREBASE TO SUPABASE MIGRATION ───
  SupabaseCloud._decodeFirestoreFields = function(fields) {
    if (!fields) return {};
    const obj = {};
    for (const [key, val] of Object.entries(fields)) {
      if (val.stringValue !== undefined) obj[key] = val.stringValue;
      else if (val.integerValue !== undefined) obj[key] = Number(val.integerValue);
      else if (val.doubleValue !== undefined) obj[key] = Number(val.doubleValue);
      else if (val.booleanValue !== undefined) obj[key] = val.booleanValue;
      else if (val.timestampValue !== undefined) obj[key] = val.timestampValue;
      else if (val.mapValue !== undefined) obj[key] = this._decodeFirestoreFields(val.mapValue.fields);
      else if (val.arrayValue !== undefined) obj[key] = (val.arrayValue.values || []).map(v => {
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.mapValue !== undefined) return this._decodeFirestoreFields(v.mapValue.fields);
        return v;
      });
    }
    return obj;
  };

  SupabaseCloud._fetchFirestoreREST = async function(projectId, path) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?pageSize=500`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      const docs = data.documents || [];
      return docs.map(d => {
        const decoded = this._decodeFirestoreFields(d.fields);
        const docId = d.name ? d.name.split('/').pop() : '';
        if (!decoded.id && docId) decoded.id = docId;
        return decoded;
      });
    } catch (e) {
      return [];
    }
  };

  SupabaseCloud.migrateFromFirebase = async function(firebaseProjectId = 'nppdungxuan') {
    if (!isBackground) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'migrateFirebaseToSupabase', firebaseProjectId }, resolve);
      });
    }

    await this.loadConfig();
    const cfg = this._getConfig();
    if (!cfg.url || !cfg.anonKey || cfg.url.includes('YOUR_SUPABASE')) {
      return { ok: false, error: 'Chưa điền URL & Anon Key trong file backend/supabase/supabase-config.js hoặc trên giao diện Cài đặt' };
    }

    try {
      let totalCount = 0;
      let ordersCount = 0;
      let subCount = 0;
      let histCount = 0;

      // 1. Quét Đơn hàng lưu tạm từ các đường dẫn Firebase phổ biến
      const orderPaths = ['shared/data/orders', 'shared/orders', 'orders'];
      for (const p of orderPaths) {
        const orderDocs = await this._fetchFirestoreREST(firebaseProjectId, p);
        if (orderDocs.length > 0) {
          await this.pushOrders(orderDocs);
          ordersCount += orderDocs.length;
          totalCount += orderDocs.length;
          break;
        }
      }

      // 2. Quét Đơn hàng đã lên đơn từ các đường dẫn Firebase phổ biến
      const subPaths = ['shared/data/submitted_orders', 'shared/submitted_orders', 'submitted_orders'];
      for (const p of subPaths) {
        const subDocs = await this._fetchFirestoreREST(firebaseProjectId, p);
        if (subDocs.length > 0) {
          await this.pushSubmittedOrders(subDocs);
          subCount += subDocs.length;
          totalCount += subDocs.length;
          break;
        }
      }

      // 3. Quét Lịch sử từ các đường dẫn Firebase phổ biến
      const histPaths = ['shared/data/history', 'shared/history', 'history'];
      for (const p of histPaths) {
        const histDocs = await this._fetchFirestoreREST(firebaseProjectId, p);
        if (histDocs.length > 0) {
          await this.pushHistory(histDocs);
          histCount += histDocs.length;
          totalCount += histDocs.length;
          break;
        }
      }

      // 4. Đồng bộ dữ liệu hiện có từ bộ nhớ local máy tính lên Supabase
      if (typeof OrderStorage !== 'undefined') {
        const localOrders = await OrderStorage.getOrders().catch(() => []);
        if (localOrders.length > 0) {
          await this.pushOrders(localOrders);
          if (ordersCount === 0) { ordersCount = localOrders.length; totalCount += localOrders.length; }
        }
        const localSub = await OrderStorage.getSubmittedOrders().catch(() => []);
        if (localSub.length > 0) {
          await this.pushSubmittedOrders(localSub);
          if (subCount === 0) { subCount = localSub.length; totalCount += localSub.length; }
        }
      }

      return { ok: true, count: totalCount, ordersCount, subCount, histCount };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  SupabaseCloud.getSystemConfigs = async function() {
    try {
      const resp = await fetch(this._url('system_configs?select=key,value'), {
        headers: this._headers()
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (_) {}
    return [];
  };

  // Nạp cấu hình tự động khi mô-đun được nạp
  SupabaseCloud.loadConfig().catch(() => {});

  globalThis.SupabaseCloud = SupabaseCloud;
  // NOTE: FirebaseCloud alias đã bị xóa — xem AUTO_FILL_ORDER_OFFICIAL_SOURCE_AUDIT P0-01
})();
