(() => {
// options-config.js — extracted from options.js
// =========================================================================
// 1. CHUYỂN TAB & CẤU HÌNH API KEY
// =========================================================================

// ─── LAZY LOADER cho Address scripts (~6MB, không load khi mở trang) ─────────
let _addressScriptsLoaded = false;
let _addressScriptsLoading = false;

const onDOMReady = globalThis.onDOMReady || function(fn) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
};

const ADDRESS_SCRIPTS = [
  '../../src/application/address/database/data.js',
  '../../src/application/address/database/ward_merger.js',
  '../../src/application/address/database/data-new-loader.js',
  '../../src/application/address/fuzzy.js',
  '../../src/application/address/aliases.js',
  '../../src/application/address/normalizer.js',
  '../../src/application/address/validator.js',
  '../../src/application/address/parser.js',
  '../../src/application/address/rules.js',
  '../../src/application/address/learning.js',
  '../../src/application/address/ai.js',
  '../../src/application/address/engine.js',
];

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function _loadAddressScripts() {
  if (_addressScriptsLoaded) return true;
  if (_addressScriptsLoading) {
    // Đợi cho đến khi load xong
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (_addressScriptsLoaded) { clearInterval(check); resolve(true); }
      }, 100);
    });
  }
  _addressScriptsLoading = true;
  const tabEl = document.getElementById('tab-address');
  // Hiện spinner
  const spinner = document.createElement('div');
  spinner.id = '_addrLoadingSpinner';
  spinner.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:var(--bg,#f8fafc);z-index:10;border-radius:12px';
  spinner.innerHTML = '<div style="width:36px;height:36px;border:3px solid var(--border,#e2e8f0);border-top-color:var(--primary,#4f46e5);border-radius:50%;animation:spin 0.8s linear infinite"></div><p style="color:var(--text-s,#64748b);font-size:13px;font-weight:500">Đang tải dữ liệu địa chỉ (~6MB)…</p>';
  if (tabEl) { tabEl.style.position = 'relative'; tabEl.appendChild(spinner); }
  try {
    // Load tuần tự vì có phụ thuộc nhau
    for (const src of ADDRESS_SCRIPTS) {
      await _loadScript(src);
    }
    _addressScriptsLoaded = true;
  } catch (e) {
    console.error('Lỗi load address scripts:', e);
  } finally {
    _addressScriptsLoading = false;
    spinner.remove();
  }
  return _addressScriptsLoaded;
}

// Xử lý chuyển đổi Tab (event delegation)
document.querySelector('.nav-menu')?.addEventListener('click', async (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  const tabName = item.getAttribute('data-tab');
  if (!tabName) return;
  const tabEl = document.getElementById(`tab-${tabName}`);
  if (!tabEl) {
    console.warn(`[OptionsTab] Tab element id="tab-${tabName}" not found.`);
    return;
  }
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  item.classList.add('active');
  tabEl.classList.add('active');

  // Kích hoạt vẽ biểu đồ thống kê
  if (tabName === 'analytics' && typeof renderAnalytics === 'function') {
    renderAnalytics();
  }
  // Kích hoạt tải danh sách đơn đã lên đơn
  if (tabName === 'submitted' && typeof loadSubmittedOrders === 'function') {
    loadSubmittedOrders();
  }
  // Kích hoạt tải danh sách đơn nháp
  if (tabName === 'orders' && typeof loadOrders === 'function') {
    loadOrders();
  }
  // Kích hoạt quản lý khách hàng
  if (tabName === 'customers' && typeof renderCustomers === 'function') {
    renderCustomers();
  }
  // Kích hoạt quản lý shop
  if (tabName === 'shops' && typeof loadShops === 'function') {
    loadShops();
  }
  // Kích hoạt hiển thị nhật ký lỗi
  if (tabName === 'logs' && typeof renderLogs === 'function') {
    renderLogs();
  }
  // Kích hoạt tải lịch sử tách đơn
  if (tabName === 'history' && typeof loadHistory === 'function') {
    loadHistory();
  }
  // Lazy-load address scripts lần đầu bấm tab địa chỉ
  if (tabName === 'address') {
    const ok = await _loadAddressScripts();
    if (ok && typeof initAddressTab === 'function') {
      initAddressTab();
    }
  }
  // Kích hoạt cập nhật cài đặt đám mây khi bấm tab settings
  if (tabName === 'settings') {
    if (typeof updateCloudConnectionStatus === 'function') updateCloudConnectionStatus();
  }
  // Kích hoạt tải danh sách máy khi bấm tab devices
  if (tabName === 'devices') {
    if (typeof loadCloudDevices === 'function') loadCloudDevices();
  }
});

// Xử lý chuyển đổi CMS Sub-Navigation Pills trong tab Settings
document.addEventListener('DOMContentLoaded', () => {
  const subnavBtns = document.querySelectorAll('.cms-subnav-btn');
  const sectionCards = document.querySelectorAll('.settings-section-card');

  subnavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.getAttribute('data-subtab');

      subnavBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'var(--bg-card)';
        b.style.color = 'var(--text-p)';
        b.style.borderColor = 'var(--border)';
      });

      btn.classList.add('active');
      btn.style.background = 'var(--primary)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--primary)';

      sectionCards.forEach(card => {
        if (subtab === 'all') {
          card.style.display = 'block';
        } else {
          const cardId = card.id;
          if (cardId === `panel-subtab-${subtab}`) {
            card.style.display = 'block';
          } else {
            card.style.display = 'none';
          }
        }
      });
    });
  });
});

// ======================================================================
// SUPABASE CLOUD SYNC — Toàn bộ luồng kết nối, đẩy và tải dữ liệu
// ======================================================================

function _cloudResult(msg, ok = true) {
  const box = document.getElementById('cloud-result');
  const iconEl = document.getElementById('cloud-result-icon');
  const msgEl = document.getElementById('cloud-result-msg');
  if (!box) return;
  box.style.display = 'flex';
  box.style.background = ok ? '#dcfce7' : '#fee2e2';
  box.style.border = ok ? '1px solid #86efac' : '1px solid #fca5a5';
  box.style.color = ok ? '#166534' : '#991b1b';
  if (iconEl) iconEl.textContent = ok ? '✅' : '❌';
  if (msgEl) msgEl.textContent = msg;
  if (ok) setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function _cloudSetStatus(label, sub, connected) {
  const dot = document.getElementById('cloud-status-dot');
  const lbl = document.getElementById('cloud-status-label');
  const sublbl = document.getElementById('cloud-status-sub');
  if (dot) dot.style.background = connected ? '#22c55e' : (connected === null ? '#f59e0b' : '#94a3b8');
  if (lbl) lbl.textContent = label;
  if (sublbl) sublbl.textContent = sub;
}

function _cloudSetButtons(connected) {
  const btnConnect = document.getElementById('btnCloudConnect');
  const btnUp = document.getElementById('btnCloudSyncUp');
  const btnDown = document.getElementById('btnCloudSyncDown');
  const btnDisc = document.getElementById('btnCloudDisconnect');
  if (btnConnect) btnConnect.disabled = connected;
  if (btnUp) btnUp.disabled = !connected;
  if (btnDown) btnDown.disabled = !connected;
  if (btnDisc) btnDisc.disabled = !connected;
}

async function updateCloudConnectionStatus() {
  if (typeof SupabaseCloud === 'undefined') {
    _cloudSetStatus('Supabase chưa được nạp', 'Kiểm tra script supabase/client.js', false);
    return;
  }
  try {
    const cfg = await SupabaseCloud.loadConfig();
    const urlInp = document.getElementById('supabaseUrlInput');
    const keyInp = document.getElementById('supabaseKeyInput');
    if (urlInp && cfg.url) urlInp.value = cfg.url;
    if (keyInp && cfg.anonKey) keyInp.value = cfg.anonKey;

    const deviceIdEl = document.getElementById('cloudDeviceIdDisplay');
    await SupabaseCloud._getDeviceId();
    if (deviceIdEl && SupabaseCloud._deviceId) {
      deviceIdEl.textContent = 'Device ID: ' + SupabaseCloud._deviceId;
      deviceIdEl.style.display = 'block';
    }

    const nameEl = document.getElementById('deviceNameInput');
    await SupabaseCloud._getDeviceName();
    if (nameEl && SupabaseCloud._deviceName) nameEl.value = SupabaseCloud._deviceName;

    if (!cfg.url || !cfg.anonKey || cfg.url.includes('YOUR_SUPABASE')) {
      _cloudSetStatus('Chưa cấu hình', 'Nhập Supabase URL & Anon Key rồi bấm "Kết nối & Đồng bộ"', false);
      _cloudSetButtons(false);
    } else if (SupabaseCloud.isConnected) {
      _cloudSetStatus('✅ Đã kết nối Supabase', cfg.url.replace('https://', '').split('.')[0] + '.supabase.co', true);
      _cloudSetButtons(true);
    } else {
      _cloudSetStatus('Đã cấu hình — Chưa kiểm tra', 'Bấm "Kết nối & Đồng bộ" để xác nhận kết nối', null);
      _cloudSetButtons(false);
    }
  } catch (e) {
    _cloudSetStatus('Lỗi nạp cấu hình', e.message, false);
  }
}

async function loadCloudDevices() {
  const setStatus = (connected, label, sub) => {
    const dot = document.getElementById('device-tab-status-dot');
    const lbl = document.getElementById('device-tab-status-label');
    const sublbl = document.getElementById('device-tab-status-sub');
    if (dot) dot.style.background = connected === true ? '#22c55e' : (connected === null ? '#f59e0b' : '#ef4444');
    if (lbl) lbl.textContent = label;
    if (sublbl) sublbl.textContent = sub;
  };

  if (typeof SupabaseCloud === 'undefined') {
    setStatus(false, 'Supabase chưa được nạp', 'Kiểm tra script supabase/client.js');
    return;
  }

  setStatus(null, 'Đang kiểm tra kết nối...', 'Đang tải Cấu hình kết nối Đám Mây...');
  try {
    const cfg = await SupabaseCloud.loadConfig();
    if (!cfg.url || !cfg.anonKey || cfg.url.includes('YOUR_SUPABASE')) {
      setStatus(false, 'Chưa cấu hình Supabase', 'Vào tab Cài đặt để nhập URL & Anon Key');
      return;
    }

    const devices = await SupabaseCloud.fetchDevices();
    const currentId = SupabaseCloud._deviceId || '';
    const currentName = SupabaseCloud._deviceName || '';

    const nameEl = document.getElementById('device-tab-current-name');
    const idEl = document.getElementById('device-tab-current-id');
    if (nameEl) nameEl.textContent = currentName || 'Máy hiện tại';
    if (idEl) idEl.textContent = currentId || '(chưa xác định)';

    setStatus(true, '✅ Đã kết nối Supabase', 'Đồng bộ thiết bị hoạt động bình thường');

    const countEl = document.getElementById('cloudDeviceCount');
    const listEl = document.getElementById('cloudDeviceNames');
    if (countEl) countEl.textContent = 'Danh sách Thiết bị (' + devices.length + ')';
    if (listEl) {
      const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      if (!devices.length) {
        listEl.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:8px 0">Chưa có thiết bị nào được đồng bộ.</div>';
      } else {
        listEl.innerHTML = devices.map(d => {
          const seen = d.lastSeen ? new Date(d.lastSeen).toLocaleString('vi-VN') : 'Chưa rõ';
          const isCurrent = currentId && String(d.deviceId) === String(currentId);
          return '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px">' +
            '<div style="width:10px;height:10px;border-radius:50%;background:' + (isCurrent ? '#22c55e' : '#94a3b8') + ';flex-shrink:0"></div>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:700;color:#0F172A;word-break:break-all">' + esc(d.name || 'Máy không tên') + (isCurrent ? ' <span style="font-weight:600;color:#22c55e">(máy hiện tại)</span>' : '') + '</div>' +
            '<div style="font-size:11px;color:#64748B;word-break:break-all">ID: ' + esc(String(d.deviceId)) + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:12px;flex-shrink:0;font-size:11px;color:#64748B">' +
            '<div style="text-align:right"><div style="font-weight:700;color:#0F172A">' + (d.draftCount || 0) + '</div><div>đơn nháp</div></div>' +
            '<div style="text-align:right"><div style="font-weight:700;color:#0F172A">' + (d.submittedCount || 0) + '</div><div>đã lên đơn</div></div>' +
            '</div>' +
            '<div style="font-size:11px;color:#94a3b8;flex-shrink:0">' + seen + '</div>' +
            '</div>';
        }).join('');
      }
    }
  } catch (e) {
    setStatus(false, 'Lỗi kết nối', e.message || 'Không thể tải danh sách thiết bị');
    const countEl = document.getElementById('cloudDeviceCount');
    if (countEl) countEl.textContent = 'Không thể tải danh sách Thiết bị';
  }
}

window.updateCloudConnectionStatus = updateCloudConnectionStatus;
window.loadCloudDevices = loadCloudDevices;

async function loadShopSelector() {
  const sel = document.getElementById('topbarShopSelect');
  if (!sel) return;
  try {
    if (typeof ShopService === 'undefined') return;
    
    // Đồng bộ danh sách shop từ Supabase Cloud trước nếu có kết nối
    if (typeof ShopService.syncShopsFromCloud === 'function') {
      await ShopService.syncShopsFromCloud().catch(() => {});
    }

    const shops = await ShopService.getShops();
    const active = await ShopService.getActiveShop();
    const activeId = active ? String(active.id || active) : '';
    sel.innerHTML = '';
    if (!shops || !shops.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Chưa có Shop';
      sel.appendChild(opt);
      return;
    }
    let foundActive = false;
    shops.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name || ('Shop ' + String(s.id).slice(-6));
      if (activeId && String(s.id) === activeId) { opt.selected = true; foundActive = true; }
      sel.appendChild(opt);
    });
    if (!foundActive && shops.length > 0) {
      sel.selectedIndex = 0;
      await ShopService.setActiveShop(shops[0].id);
    }
    if (!sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.addEventListener('change', async () => {
        if (!sel.value) return;
        try {
          await ShopService.setActiveShop(sel.value);
          if (typeof loadOrders === 'function') loadOrders();
          if (typeof loadSubmittedOrders === 'function') loadSubmittedOrders();
          if (typeof renderCustomers === 'function') renderCustomers();
          if (typeof renderAnalytics === 'function') renderAnalytics();
          if (typeof showQuickToast === 'function') {
            const currentOpt = sel.options[sel.selectedIndex];
            showQuickToast(`🏪 Đã chuyển sang ${currentOpt ? currentOpt.text : 'Shop mới'}`, 'success', 2500);
          }
        } catch (e) { console.warn('[ShopSelector] Đổi shop lỗi:', e); }
      });
    }
  } catch (e) {
    console.warn('[ShopSelector] Lỗi tải shop:', e);
  }
}

window.loadShopSelector = loadShopSelector;

 document.addEventListener('DOMContentLoaded', () => {

  // ── Nạp danh sách Shop cho dropdown topbar ──
  if (typeof loadShopSelector === 'function') {
    loadShopSelector();
  }

  // ── Lưu cấu hình Supabase URL + Key ──
  const btnSaveSupabase = document.getElementById('btnSaveSupabaseConfig');
  if (btnSaveSupabase) {
    btnSaveSupabase.addEventListener('click', async () => {
      const url = (document.getElementById('supabaseUrlInput')?.value || '').trim();
      const key = (document.getElementById('supabaseKeyInput')?.value || '').trim();
      const statusEl = document.getElementById('supabaseConfigSaveStatus');
      if (!url || !key) {
        if (statusEl) { statusEl.textContent = '⚠️ Nhập đủ URL và Key'; statusEl.style.color = '#dc2626'; }
        return;
      }
      if (typeof SupabaseCloud !== 'undefined') {
        await SupabaseCloud.saveConfig(url, key);
      }
      if (statusEl) {
        statusEl.textContent = '✅ Đã lưu cấu hình!';
        statusEl.style.color = '#16a34a';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
      }
    });
  }

  // ── Lưu tên máy ──
  const btnSaveName = document.getElementById('btnSaveDeviceName');
  if (btnSaveName) {
    btnSaveName.addEventListener('click', async () => {
      const name = (document.getElementById('deviceNameInput')?.value || '').trim();
      if (!name) return;
      if (typeof SupabaseCloud !== 'undefined') await SupabaseCloud.setDeviceName(name);
      _cloudResult('✅ Đã lưu tên máy: ' + name, true);
    });
  }

  // ── Kết nối & Đồng bộ ──
  const btnConnect = document.getElementById('btnCloudConnect');
  if (btnConnect) {
    btnConnect.addEventListener('click', async () => {
      if (typeof SupabaseCloud === 'undefined') {
        _cloudResult('Supabase client chưa được nạp', false); return;
      }
      const url = (document.getElementById('supabaseUrlInput')?.value || '').trim();
      const key = (document.getElementById('supabaseKeyInput')?.value || '').trim();
      if (!url || !key) {
        _cloudResult('Vui lòng nhập Supabase URL và Anon Key trước', false); return;
      }

      btnConnect.disabled = true;
      btnConnect.textContent = '🔄 Đang kết nối...';
      _cloudSetStatus('Đang kết nối...', 'Vui lòng chờ...', null);

      try {
        await SupabaseCloud.saveConfig(url, key);
        const test = await SupabaseCloud.testConnection();
        if (!test.ok) {
          _cloudResult('❌ Kết nối thất bại: ' + test.reason, false);
          _cloudSetStatus('Kết nối thất bại', test.reason, false);
          _cloudSetButtons(false);
          btnConnect.disabled = false;
          btnConnect.textContent = '🔄 Kết nối & Đồng bộ';
          return;
        }

        SupabaseCloud.isConnected = true;
        await SupabaseCloud.registerDevice().catch(() => {});

        _cloudSetStatus('✅ Đã kết nối Supabase', url.replace('https://', '').split('.')[0] + '.supabase.co', true);
        _cloudSetButtons(true);
        _cloudResult('✅ Kết nối thành công! Thiết bị đã được đăng ký.', true);
      } catch (e) {
        _cloudResult('❌ Lỗi: ' + (e.message || 'Không thể kết nối'), false);
        _cloudSetStatus('Kết nối thất bại', e.message, false);
        _cloudSetButtons(false);
      } finally {
        btnConnect.disabled = false;
        btnConnect.textContent = '🔄 Kết nối & Đồng bộ';
      }
    });
  }

  // ── Đẩy lên Cloud (Sync Up) ──
  const btnUp = document.getElementById('btnCloudSyncUp');
  if (btnUp) {
    btnUp.addEventListener('click', async () => {
      if (typeof SupabaseCloud === 'undefined' || !SupabaseCloud.isConnected) {
        _cloudResult('Chưa kết nối Supabase', false); return;
      }
      btnUp.disabled = true;
      btnUp.textContent = '⬆️ Đang đẩy lên...';
      try {
        let savedOrders = [], submittedOrders = [];
        if (typeof OrderStorage !== 'undefined') {
          if (typeof OrderStorage.getOrders === 'function') savedOrders = await OrderStorage.getOrders();
          if (typeof OrderStorage.getSubmittedOrders === 'function') submittedOrders = await OrderStorage.getSubmittedOrders();
        }

        let pushed = 0;
        if (savedOrders.length > 0) {
          await SupabaseCloud.pushOrders(savedOrders);
          pushed += savedOrders.length;
        }
        if (submittedOrders.length > 0 && typeof SupabaseCloud.pushSubmittedOrders === 'function') {
          await SupabaseCloud.pushSubmittedOrders(submittedOrders);
          pushed += submittedOrders.length;
        }
        _cloudResult(`✅ Đã đẩy lên ${pushed} đơn hàng lên Supabase Cloud`, true);
      } catch (e) {
        _cloudResult('❌ Lỗi khi đẩy dữ liệu: ' + (e.message || 'Unknown'), false);
      } finally {
        btnUp.disabled = false;
        btnUp.textContent = '⬆️ Đẩy lên Cloud';
      }
    });
  }

  // ── Tải về máy (Sync Down) ──
  const btnDown = document.getElementById('btnCloudSyncDown');
  if (btnDown) {
    btnDown.addEventListener('click', async () => {
      if (typeof SupabaseCloud === 'undefined' || !SupabaseCloud.isConnected) {
        _cloudResult('Chưa kết nối Supabase', false); return;
      }
      btnDown.disabled = true;
      btnDown.textContent = '⬇️ Đang tải về...';
      try {
        let pulled = 0;
        const cloudOrders = await SupabaseCloud.fetchOrders();
        if (cloudOrders && cloudOrders.length > 0) {
          if (typeof OrderStorage !== 'undefined' && typeof OrderStorage.mergeOrders === 'function') {
            await OrderStorage.mergeOrders(cloudOrders);
          } else if (typeof chrome !== 'undefined' && chrome.storage) {
            const key = await new Promise(r => chrome.storage.local.get(['activeShopId'], res => r(res.activeShopId || 'shop_default')));
            const storageKey = `savedOrders_${key}`;
            const existing = await new Promise(r => chrome.storage.local.get([storageKey, 'savedOrders'], res => r(res[storageKey] || res.savedOrders || [])));
            const existingIds = new Set((existing || []).map(o => o.id));
            const newOrders = cloudOrders.filter(o => o.id && !existingIds.has(o.id));
            const merged = [...(existing || []), ...newOrders];
            await new Promise(r => chrome.storage.local.set({ [storageKey]: merged, savedOrders: merged }, r));
          }
          pulled += cloudOrders.length;
        }
        _cloudResult(`✅ Đã tải về ${pulled} đơn hàng từ Cloud`, true);
        if (typeof loadOrders === 'function') loadOrders();
        if (typeof loadSubmittedOrders === 'function') loadSubmittedOrders();
      } catch (e) {
        _cloudResult('❌ Lỗi khi tải dữ liệu: ' + (e.message || 'Unknown'), false);
      } finally {
        btnDown.disabled = false;
        btnDown.textContent = '⬇️ Tải về máy';
      }
    });
  }

  // ── Ngắt kết nối ──
  const btnDisc = document.getElementById('btnCloudDisconnect');
  if (btnDisc) {
    btnDisc.addEventListener('click', async () => {
      if (typeof SupabaseCloud !== 'undefined') {
        await SupabaseCloud.signOut();
        SupabaseCloud.isConnected = false;
      }
      _cloudSetStatus('Đã ngắt kết nối', 'Nhấn "Kết nối & Đồng bộ" để kết nối lại', false);
      _cloudSetButtons(false);
      _cloudResult('🔌 Đã ngắt kết nối Supabase', true);
    });
  }
});

// ── Lắng nghe cập nhật tự động từ Service Worker (auto-sync) ───────────
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return;

    // Khi Service Worker báo có dữ liệu mới từ Cloud → refresh danh sách
    if (message.type === 'cloud_sync_update') {
      if (message.table === 'orders' && typeof loadOrders === 'function') {
        loadOrders();
        _cloudResult(`☁️ Tự động cập nhật: thêm ${message.count} đơn nháp từ Cloud`, true);
      }
      if (message.table === 'submitted_orders' && typeof loadSubmittedOrders === 'function') {
        loadSubmittedOrders();
        _cloudResult(`☁️ Tự động cập nhật: thêm ${message.count} đơn đã lên từ Cloud`, true);
      }
      if (typeof renderAnalytics === 'function') renderAnalytics();
      if (typeof renderCustomers === 'function') renderCustomers();
    }

    // Khi Service Worker cập nhật cấu hình từ Cloud → áp dụng ngay
    if (message.type === 'cloud_config_update' && message.settings) {
      const { apiKey, apiModel, customAiPrompt } = message.settings;
      const apiKeyEl = document.getElementById('apiKey');
      const apiModelEl = document.getElementById('apiModel');
      const promptEl = document.getElementById('customAiPromptInput');
      if (apiKey && apiKeyEl) apiKeyEl.value = apiKey;
      if (apiModel && apiModelEl) apiModelEl.value = apiModel;
      if (customAiPrompt && promptEl) promptEl.value = customAiPrompt;
      _cloudResult('⚙️ Đã cập nhật cấu hình AI từ Cloud', true);
    }
  });
}

// Hiển thị trạng thái lưu cấu hình API
function showApiStatus(msg, type = 'ok', icon = '') {
  const statusEl = document.getElementById('apiStatus') || document.getElementById('promptStatus');
  if (!statusEl) return;
  statusEl.innerHTML = icon ? `<span class="spinner" style="${type === 'testing' ? '' : 'display:none'}"></span><span>${icon} ${msg}</span>` : `<span>${msg}</span>`;
  if (type === 'testing') {
    statusEl.innerHTML = `<span class="spinner"></span><span>${msg}</span>`;
  } else {
    statusEl.innerHTML = `<span>${msg}</span>`;
  }
  statusEl.className = type;
  if (type !== 'testing') {
    setTimeout(() => { 
      statusEl.textContent = ''; 
      statusEl.className = ''; 
      statusEl.style.display = '';
    }, 5000);
  }
}

// Kiểm tra kết nối AI Gateway (thay thế testGroqApiKey cũ)
// P0-04: Extension không gọi trực tiếp api.groq.com nữa
async function checkAiGatewayStatus() {
  const statusEl = document.getElementById('apiStatus') || document.getElementById('promptStatus');
  if (!statusEl) return;

  showApiStatus('Đang kiểm tra kết nối AI Gateway...', 'testing');

  try {
    // Kiểm tra session
    let session = null;
    if (typeof AuthSession !== 'undefined' && AuthSession.getSession) {
      session = await AuthSession.getSession();
    }
    if (!session || !session.access_token) {
      showApiStatus('❌ Chưa đăng nhập. Vui lòng đăng nhập để dùng AI.', 'err');
      return;
    }

    // Gọp tin AI gateway qua background service worker
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'runGroq',
        text: 'Khởi động kiểm tra',
        localResult: {}
      }, (res) => resolve(res || { ok: false, error: 'No response' }));
    });

    if (result && result.ok) {
      const quotaInfo = result.quota
        ? ` — quota còn: ${result.quota.remaining ?? '?'}`
        : '';
      showApiStatus(`✅ AI Gateway hoạt động bình thường${quotaInfo}.`, 'ok');
    } else {
      showApiStatus(`⚠️ ${result.error || 'AI Gateway không phản hồi.'}`, 'err');
    }
  } catch (err) {
    showApiStatus('❌ Không thể kết nối. Kiểm tra lại mạng hoặc thử tải lại trang.', 'err');
  }
}


// ─── PHASE 1: Tải ngay từ local (< 50ms, không đợi cloud) ───────────────

// ─── PHASE 1.5: Thiết lập UI AI Gateway Status ────────────────────────
setTimeout(async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const apiKeyLabel = document.querySelector('label[for="apiKey"]');

  if (apiKeyInput) {
    apiKeyInput.value = '✔️ Được quản lý server-side qua AI Gateway';
    apiKeyInput.readOnly = true;
    apiKeyInput.style.color = '#3C7363';
    apiKeyInput.style.fontWeight = '600';
  }
  if (apiKeyLabel) {
    apiKeyLabel.textContent = 'AI Gateway';
  }

  // Thử kiểm tra kết nối gateway tự động sau 1s
  setTimeout(() => {
    if (typeof checkAiGatewayStatus === 'function') {
      checkAiGatewayStatus();
    }
  }, 1000);
}, 150);


// ─── PHASE 2: Sync cloud song song ở nền (không block UI) ───────────────
setTimeout(() => {
  if (typeof OrderStorage === 'undefined' || typeof OrderStorage.syncAllFromCloudParallel !== 'function') return;
  OrderStorage.syncAllFromCloudParallel({
    onApiKeyReady(key) {
      const apiKeyInput = document.getElementById('apiKey');
      if (key && apiKeyInput && key !== apiKeyInput.value) {
        apiKeyInput.value = key;
        showApiStatus('☁️ API key đã được cập nhật từ cloud.', 'ok');
      }
    },
    onOrdersReady(result) {
      if (!result || !result.ok) return;
      const newCount = result.newCount || 0;
      if (newCount > 0) {
        if (typeof loadOrders === 'function') loadOrders();
        if (typeof showQuickToast === 'function') {
          showQuickToast(`☁️ Đã đồng bộ thêm ${newCount} đơn từ cloud`, 'success');
        }
      }
    },
    onCustomersReady(meta) {
      if (!meta) return;
      const customersTab = document.getElementById('tab-customers');
      if (customersTab && customersTab.classList.contains('active') && typeof renderCustomers === 'function') {
        renderCustomers();
      }
    }
  });
}, 300);


// Lưu Cấu hình AI — chỉ lưu model name để hiển thị
const btnSaveApi = document.getElementById('btnSaveApi');
if (btnSaveApi) {
  btnSaveApi.addEventListener('click', async () => {
    const apiModelSelect = document.getElementById('apiModel');
    const model = apiModelSelect ? apiModelSelect.value : 'llama-3.3-70b-versatile';
    if (typeof OrderStorage !== 'undefined') {
      try {
        await OrderStorage.saveAIConfigs({ groqModelName: model });
        showApiStatus('💾 Đã lưu cấu hình thành công.', 'ok');
      } catch (err) {
        showApiStatus('Lỗi khi lưu: ' + err.message, 'err');
      }
    }
  });
}

// Kiểm tra AI Gateway
const btnTestApi = document.getElementById('btnTestApi');
if (btnTestApi) {
  btnTestApi.addEventListener('click', () => {
    checkAiGatewayStatus();
  });
}


// =========================================================================
// NÂNG CẤP HỆ THỐNG: BLACKLIST, PROMPT, BACKUP, VÀ THỐNG KÊ BIỂU ĐỒ SVG
// =========================================================================
onDOMReady(() => {
    // Toàn bộ 5 panel cài đặt hiển thị đồng thời theo phương án 2 (không còn submenu)

    // 1. QUẢN LÝ CUSTOM PROMPT AI
    const customAiPromptInput = document.getElementById('customAiPromptInput');
    const btnSavePrompt = document.getElementById('btnSavePrompt');
    const btnResetPrompt = document.getElementById('btnResetPrompt');
    const promptStatus = document.getElementById('promptStatus');

    // 2. QUẢN LÝ BLACKLIST (DANH SÁCH ĐEN)
    const blacklistPhoneInp = document.getElementById('blacklistPhoneInp');
    const blacklistReasonInp = document.getElementById('blacklistReasonInp');
    const btnAddBlacklist = document.getElementById('btnAddBlacklist');
    const searchBlacklistInp = document.getElementById('searchBlacklistInp');
    const blacklistTableBody = document.getElementById('blacklistTableBody');
    const blacklistEmptyState = document.getElementById('blacklistEmptyState');
    let blacklistArray = [];

    function renderBlacklist() {
        if (!blacklistTableBody) return;
        const query = searchBlacklistInp ? searchBlacklistInp.value.trim().toLowerCase() : '';
        const filtered = blacklistArray.filter(item => item.phone.includes(query) || (item.reason || '').toLowerCase().includes(query));

        blacklistTableBody.innerHTML = '';
        if (filtered.length === 0) {
            if (blacklistEmptyState) blacklistEmptyState.style.display = 'block';
            return;
        }
        if (blacklistEmptyState) blacklistEmptyState.style.display = 'none';

        filtered.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border)';
            
            const tdPhone = document.createElement('td');
            tdPhone.style.padding = '10px';
            tdPhone.style.fontWeight = '600';
            tdPhone.style.color = '#dc2626';
            tdPhone.textContent = item.phone;

            const tdReason = document.createElement('td');
            tdReason.style.padding = '10px';
            tdReason.textContent = item.reason || 'Không rõ lý do';

            const tdDate = document.createElement('td');
            tdDate.style.padding = '10px';
            tdDate.style.textAlign = 'center';
            tdDate.style.fontSize = '12px';
            tdDate.style.color = '#64748b';
            tdDate.textContent = item.createdAt || '';

            const tdActions = document.createElement('td');
            tdActions.style.padding = '10px';
            tdActions.style.textAlign = 'center';
            const btnDelete = document.createElement('button');
            btnDelete.className = 'btn btn-secondary';
            btnDelete.style.cssText = 'padding:4px 8px; font-size:11px; color:#dc2626; border-color:#fca5a5;';
            btnDelete.textContent = 'Xóa';
            btnDelete.addEventListener('click', () => {
                if (confirm('Bỏ chặn SĐT ' + item.phone + '?')) {
                    blacklistArray = blacklistArray.filter(i => i.phone !== item.phone);
                    if (typeof OrderStorage !== 'undefined') {
                        OrderStorage.saveAIConfigs({ blacklistPhones: blacklistArray }).then(() => {
                            renderBlacklist();
                            if (typeof showQuickToast === 'function') {
                                showQuickToast('🔓 Đã bỏ chặn số điện thoại ' + item.phone, 'success');
                            }
                        });
                    }
                }
            });
            tdActions.appendChild(btnDelete);

            tr.appendChild(tdPhone);
            tr.appendChild(tdReason);
            tr.appendChild(tdDate);
            tr.appendChild(tdActions);
            blacklistTableBody.appendChild(tr);
        });
    }

    const DEFAULT_PROMPT = `Bạn là chuyên gia bóc tách đơn hàng. Trả về JSON duy nhất, không bọc markdown.
    YÊU CẦU:
    - phone PHẢI là số điện thoại Việt Nam bắt đầu bằng 0, gồm 10 hoặc 11 chữ số.
    - Nếu văn bản có nhiều số điện thoại, hãy giữ số đầu tiên hợp lệ làm phone.
    - Nếu có số điện thoại dính nhau, tách ra và chỉ giữ số hợp lệ 10 hoặc 11 chữ số.
    - codAmount là số nguyên, không có ký tự khác.
    - correctAddress PHẢI đầy đủ và chi tiết: bao gồm cả số phòng, số nhà, ngõ/đường, tòa nhà/block/khu đô thị, Phường/Xã, Quận/Huyện, Tỉnh/Thành phố (ví dụ: S202 vinsmart city...). KHÔNG được tự ý cắt bỏ căn hộ/tòa nhà.
    - Nếu địa chỉ viết tắt (HN, HCM...), hãy mở rộng đầy đủ.
    - Nếu không biết rõ Phường/Xã hoặc Quận/Huyện, chỉ ghi các cấp hành chính lớn nhất biết được. Tuyệt đối KHÔNG tự ý điền các từ đại diện như "Phường", "Quận", "Xã", "Huyện" làm giá trị mặc định.
    - orderCode là mã quản lý đơn hàng của shop (ví dụ: e100.377). Tuyệt đối KHÔNG lấy số phòng, số nhà, số căn hộ hoặc tên tòa nhà/block (như S202, S2.02, tòa S2, block A...) làm mã đơn hàng.
    JSON format: {"name":"...","phone":"...","orderCode":"...","codAmount":0,"correctAddress":"..."}
    Văn bản: {text}`;

    // Define and expose unified config loader/renderer
    window.loadSettingsToUI = async function() {
        if (typeof OrderStorage !== 'undefined') {
            const configs = await OrderStorage.getAIConfigs();
            const apiKeyInput = document.getElementById('apiKey');
            if (apiKeyInput) {
              apiKeyInput.value = '✔️ Được quản lý server-side qua AI Gateway';
              apiKeyInput.readOnly = true;
            }
            const apiModelSelect = document.getElementById('apiModel');
            if (apiModelSelect) apiModelSelect.value = configs.groqModelName || 'llama-3.3-70b-versatile';
            if (customAiPromptInput) customAiPromptInput.value = configs.customAiPrompt || DEFAULT_PROMPT;
            blacklistArray = configs.blacklistPhones || [];
            renderBlacklist();
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['fbDeviceName'], (res) => {
                const deviceNameEl = document.getElementById('currentDeviceName');
                if (deviceNameEl && res.fbDeviceName) deviceNameEl.textContent = res.fbDeviceName;
            });
        }
    };
    window.loadSettingsToUI();

    if (btnSavePrompt) {
        btnSavePrompt.addEventListener('click', () => {
            const promptVal = customAiPromptInput ? customAiPromptInput.value.trim() : '';
            if (!promptVal.includes('{text}')) {
                if (promptStatus) {
                    promptStatus.textContent = '❌ Lỗi: Prompt bắt buộc phải chứa từ khóa {text}';
                    promptStatus.style.color = '#dc2626';
                }
                return;
            }
            try {
                if (typeof OrderStorage !== 'undefined') {
                    OrderStorage.saveAIConfigs({ customAiPrompt: promptVal }).then(() => {
                        if (promptStatus) {
                            promptStatus.textContent = '✅ Đã lưu mẫu Prompt AI thành công!';
                            promptStatus.style.color = '#059669';
                            setTimeout(() => { promptStatus.textContent = ''; }, 3000);
                        }
                    });
                }
            } catch (err) {}
        });
    }

    if (btnResetPrompt) {
        btnResetPrompt.addEventListener('click', () => {
            if (confirm('Bạn có chắc chắn muốn khôi phục Prompt AI về mặc định?')) {
                if (customAiPromptInput) customAiPromptInput.value = DEFAULT_PROMPT;
                try {
                    if (typeof OrderStorage !== 'undefined') {
                        OrderStorage.saveAIConfigs({ customAiPrompt: DEFAULT_PROMPT }).then(() => {
                            if (promptStatus) {
                                promptStatus.textContent = '🔄 Đã khôi phục Prompt mặc định.';
                                promptStatus.style.color = '#0284c7';
                                setTimeout(() => { promptStatus.textContent = ''; }, 3000);
                            }
                        });
                    }
                } catch (err) {}
            }
        });
    }

    if (btnAddBlacklist) {
        btnAddBlacklist.addEventListener('click', () => {
            const phone = blacklistPhoneInp.value.trim().replace(/\D/g, '');
            const reason = blacklistReasonInp.value.trim();
            if (!phone || phone.length < 9 || phone.length > 11) {
                alert('Vui lòng nhập số điện thoại hợp lệ (9-11 chữ số)');
                return;
            }
            if (blacklistArray.some(b => b.phone === phone)) {
                alert('Số điện thoại này đã có trong danh sách đen!');
                return;
            }

            const today = new Date();
            const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
            
            blacklistArray.push({ phone, reason, createdAt: dateStr });
            if (typeof OrderStorage !== 'undefined') {
                OrderStorage.saveAIConfigs({ blacklistPhones: blacklistArray }).then(() => {
                    blacklistPhoneInp.value = '';
                    blacklistReasonInp.value = '';
                    renderBlacklist();
                    showQuickToast('🚫 Đã chặn số điện thoại ' + phone, 'success');
                });
            }
        });
    }

    if (searchBlacklistInp) {
        searchBlacklistInp.addEventListener('input', renderBlacklist);
    }

    if (typeof renderBlacklist === 'function') renderBlacklist();

    // 4. SAO LƯU & KHÔI PHỤC DỮ LIỆU
    const btnExportData = document.getElementById('btnExportData');
    const btnTriggerImport = document.getElementById('btnTriggerImport');
    const importFileInp = document.getElementById('importFileInp');
    const backupStatus = document.getElementById('backupStatus');

    if (btnExportData) {
        btnExportData.addEventListener('click', () => {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(null, (allData) => {
                        triggerDownload(allData);
                    });
                } else {
                    const localData = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        try {
                            localData[key] = JSON.parse(localStorage.getItem(key));
                        } catch (e) {
                            localData[key] = localStorage.getItem(key);
                        }
                    }
                    triggerDownload(localData);
                }
            } catch (err) {}
        });
    }

    function triggerDownload(dataObj) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataObj, null, 2));
        const downloadAnchor = document.createElement('a');
        
        const today = new Date();
        const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
        
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `autofill_backup_${dateStr}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        if (backupStatus) {
            backupStatus.textContent = '📥 Đã xuất file backup JSON thành công!';
            backupStatus.style.color = '#059669';
            setTimeout(() => { backupStatus.textContent = ''; }, 3000);
        }
    }

    if (btnTriggerImport && importFileInp) {
        btnTriggerImport.addEventListener('click', () => {
            importFileInp.click();
        });

        importFileInp.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    
                    if (typeof parsed !== 'object' || parsed === null) {
                        throw new Error('Định dạng file backup không hợp lệ.');
                    }

                    if (confirm('Bạn có đồng ý ghi đè/gộp dữ liệu hiện tại bằng tệp tin sao lưu này?')) {
                        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                            chrome.storage.local.get(null, (current) => {
                                // Gộp đơn hàng
                                const mergedOrders = [...(current.savedOrders || [])];
                                if (parsed.savedOrders && Array.isArray(parsed.savedOrders)) {
                                    parsed.savedOrders.forEach(o => {
                                        if (!mergedOrders.some(mo => mo.id === o.id)) {
                                            mergedOrders.push(o);
                                        }
                                    });
                                }

                                // Gộp lịch sử
                                const mergedHistory = [...(current.splitHistory || [])];
                                if (parsed.splitHistory && Array.isArray(parsed.splitHistory)) {
                                    parsed.splitHistory.forEach(h => {
                                        if (!mergedHistory.some(mh => mh.id === h.id)) {
                                            mergedHistory.push(h);
                                        }
                                    });
                                }

                                // Gộp blacklist
                                const mergedBlacklist = [...(current.blacklistPhones || [])];
                                if (parsed.blacklistPhones && Array.isArray(parsed.blacklistPhones)) {
                                    parsed.blacklistPhones.forEach(b => {
                                        if (!mergedBlacklist.some(mb => mb.phone === b.phone)) {
                                            mergedBlacklist.push(b);
                                        }
                                    });
                                }

                                const newData = {
                                    ...current,
                                    ...parsed,
                                    savedOrders: mergedOrders,
                                    splitHistory: mergedHistory,
                                    blacklistPhones: mergedBlacklist
                                };

                                chrome.storage.local.set(newData, () => {
                                    if (backupStatus) {
                                        backupStatus.textContent = '✅ Khôi phục thành công! Đang tải lại dữ liệu...';
                                        backupStatus.style.color = '#059669';
                                    }
                                    setTimeout(() => {
                                        window.location.reload();
                                    }, 1200);
                                });
                            });
                        } else {
                            // LocalStorage backup fallback
                            localStorage.clear();
                            Object.keys(parsed).forEach(k => {
                                const val = parsed[k];
                                if (typeof val === 'object') {
                                    localStorage.setItem(k, JSON.stringify(val));
                                } else {
                                    localStorage.setItem(k, String(val));
                                }
                            });
                            if (backupStatus) {
                                backupStatus.textContent = '✅ Khôi phục thành công (Local)! Đang tải lại dữ liệu...';
                                backupStatus.style.color = '#059669';
                            }
                            setTimeout(() => {
                                window.location.reload();
                            }, 1200);
                        }
                    }
                } catch (err) {
                    alert('Lỗi nạp file sao lưu: ' + err.message);
                }
            };
            reader.readAsText(file);
        });
    }
});

})();
