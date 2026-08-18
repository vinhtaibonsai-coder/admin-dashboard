// order-dashboard/app.js
// Logic xử lý gọi API PostgREST, hiển thị Dữ liệu & Quản lý biểu đồ Chart.js
// =========================================================================

// 1. SUPABASE CONFIGURATION & INSTANCE INIT
const SUPABASE_URL = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url) 
  ? SUPABASE_CONFIG.url 
  : 'https://xlgovgynbsahuykyjzcx.supabase.co';
  
const SUPABASE_ANON_KEY = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.anonKey) 
  ? SUPABASE_CONFIG.anonKey 
  : 'sb_publishable_i7Ox-gsXTnPbP_AghSxb4Q_w6-5vbMg';

var sbInstance = null;

function initSupabase() {
  if (!sbInstance) {
    const createClientFn = window.supabase?.createClient || window.supabaseClient?.createClient;
    if (createClientFn) {
      const client = createClientFn(SUPABASE_URL, SUPABASE_ANON_KEY);
      // Đồng bộ session token từ localStorage để tránh bị nhận diện là anonymous/guest
      let accessToken = localStorage.getItem('access_token');
      let refreshToken = localStorage.getItem('refresh_token');
      // Fallback: nếu chưa có access_token (phiên đăng nhập cũ), đọc từ vnpost_session
      if (!accessToken) {
        try {
          const raw = localStorage.getItem('vnpost_session');
          if (raw) {
            const saved = JSON.parse(raw);
            accessToken = saved.access_token || null;
            refreshToken = saved.refresh_token || refreshToken || null;
          }
        } catch (_) {}
      }
      if (accessToken && client.auth && typeof client.auth.setSession === 'function') {
        try {
          client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || ''
          });
        } catch (err) {
          console.warn('Lỗi đồng bộ setSession:', err);
        }
      }
      sbInstance = client;
    }
  }
  return sbInstance;
}

let allOrders = [];
let customerMap = {};
let currentPage = 1;
let perPage = 20;

// DOM Elements
const navTabOrders = document.getElementById('nav-tab-orders');
const navTabCustomers = document.getElementById('nav-tab-customers');
const navTabUsers = document.getElementById('nav-tab-users');
const navTabAudit = document.getElementById('nav-tab-audit');
const sectionOrders = document.getElementById('section-orders');
const sectionCustomers = document.getElementById('section-customers');
const sectionUsers = document.getElementById('section-users');
const sectionAudit = document.getElementById('section-audit');

const searchInput = document.getElementById('search-input');
const deviceFilter = document.getElementById('device-filter');
const platformFilter = document.getElementById('platform-filter');
const dateFrom = document.getElementById('date-from');
const dateTo = document.getElementById('date-to');
const refreshBtn = document.getElementById('refresh-btn');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const mobileOrdersContainer = document.getElementById('mobile-orders-container');
const desktopTableBody = document.getElementById('desktop-table-body');
const statTotalOrders = document.getElementById('stat-total-orders');
const statTotalCod = document.getElementById('stat-total-cod');
const pageInfo = document.getElementById('page-info');
const perPageEl = document.getElementById('per-page');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');

// Customer Elements
const searchCustomerInput = document.getElementById('search-customer-input');
const customerTableBody = document.getElementById('customer-table-body');
const statTotalCustomers = document.getElementById('stat-total-customers-stat');
const customerCountInfo = document.getElementById('customer-count-info');
const custTierFilter = document.getElementById('cust-tier-filter');
const custCarrierFilter = document.getElementById('cust-carrier-filter');
const btnCustClearFilter = document.getElementById('btn-cust-clear-filter');

let realtimeChannel = null;

document.addEventListener('DOMContentLoaded', () => {
  setupTabSwitching();
  setupRightMenu();
  fetchOrders();
  subscribeRealtime();
  checkLoginStatus();

  // Wire up order pagination buttons
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderOrders();
      }
    });
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      currentPage++;
      renderOrders();
    });
  }
});

// 2. AUTHENTICATION & LOGIN MANAGEMENT
let currentUser = null;
let allUsers = [];

function checkLoginStatus() {
  let stored = localStorage.getItem('profile');
  if (!stored) {
    stored = localStorage.getItem('af_logged_user');
    if (stored) {
      localStorage.setItem('profile', stored);
    }
  }

  if (stored) {
    currentUser = JSON.parse(stored);
    
    // KiểMã tra quyền và ẩn tab theo Vai trò
    const role = localStorage.getItem('current_role') || 'SHOP_STAFF';
    if (role === 'SHOP_STAFF') {
      const staffHiddenTabs = ['nav-tab-shops', 'nav-tab-users', 'nav-tab-audit', 'sidebar-go-admin'];
      staffHiddenTabs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    }

    if (role === 'SYSTEM_ADMIN') {
      showAdminNavButtons();
    }
 
    // KiểMã tra quyền SYSTEM_ADMIN  dùng RPC get_user_role
    const sb = initSupabase();
    if (sb) {
      checkAdminRole(sb, currentUser);
    } else {
       updateHeaderAdminInfo(currentUser.email);
    }
  } else {
    window.location.href = 'login.html';
  }
}

async function checkAdminRole(sb, user) {
  try {
    const { data, error } = await sb.rpc('get_user_role', { p_user_id: user.id });
    if (!error && data === 'SYSTEM_ADMIN') {
      showAdminNavButtons();
      updateHeaderAdminInfo(user.email);
      return;
    }
  } catch (_) {}

  // Fallback: query user_roles + roles rồi (tránh embedded select gây lỗi FK)
  try {
    const { data: ur } = await sb.from('user_roles').select('role_id').eq('user_id', user.id).maybeSingle();
    if (ur) {
      const { data: r } = await sb.from('roles').select('code').eq('id', ur.role_id).maybeSingle();
      if (r && r.code === 'SYSTEM_ADMIN') {
        showAdminNavButtons();
        updateHeaderAdminInfo(user.email);
        return;
      }
    }
  } catch (_) {}

  updateHeaderAdminInfo(user.email);
}

function showAdminNavButtons() {
  document.querySelectorAll('#sidebar-go-admin, #right-nav-go-admin').forEach(el => {
    el.classList.remove('hidden');
    el.addEventListener('click', () => { window.location.href = 'admin.html'; });
  });
}

function updateHeaderAdminInfo(email) {
  const headerName = document.getElementById('header-admin-name');
  const headerAvatar = document.getElementById('header-admin-avatar');
  const rightName = document.getElementById('right-admin-name');
  const rightEmail = document.getElementById('right-admin-email');
  const rightAvatar = document.getElementById('right-admin-avatar');

  const username = email.split('@')[0];
  const initial = email.charAt(0).toUpperCase();

  if (headerName) headerName.textContent = username;
  if (rightName) rightName.textContent = username;
  if (rightEmail) rightEmail.textContent = email;
  if (rightAvatar) rightAvatar.textContent = initial;

  if (headerAvatar) {
    headerAvatar.style.display = 'none';
    let parentNode = headerAvatar.parentNode;
    const oldText = parentNode.querySelector('.avatar-text');
    if (oldText) oldText.remove();
    
    const textNode = document.createElement('span');
    textNode.className = 'avatar-text font-bold text-white text-xs';
    textNode.textContent = initial;
    parentNode.appendChild(textNode);
  }
}

function setupRightMenu() {
  const headerUserMenuBtn = document.getElementById('header-user-menu-btn');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const rightUserMenu = document.getElementById('right-user-menu');
  const rightMenuBackdrop = document.getElementById('right-menu-backdrop');
  const rightMenuCloseBtn = document.getElementById('right-menu-close-btn');

  function openRightMenu() {
    if (rightUserMenu) {
      rightUserMenu.classList.remove('hidden');
      setTimeout(() => {
        rightUserMenu.classList.remove('opacity-0', 'pointer-events-none');
        const panel = document.getElementById('right-menu-panel');
        if (panel) panel.classList.remove('translate-x-full');
      }, 10);
    }
  }

  function closeRightMenu() {
    if (rightUserMenu) {
      const panel = document.getElementById('right-menu-panel');
      if (panel) panel.classList.add('translate-x-full');
      rightUserMenu.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => {
        rightUserMenu.classList.add('hidden');
      }, 200);
    }
  }

  if (headerUserMenuBtn) headerUserMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); openRightMenu(); });
  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); openRightMenu(); });
  if (rightMenuCloseBtn) rightMenuCloseBtn.addEventListener('click', closeRightMenu);
  if (rightMenuBackdrop) rightMenuBackdrop.addEventListener('click', closeRightMenu);

  // Wire right menu nav tabs
  const rightNavStats = document.getElementById('right-nav-statistics');
  const rightNavOrders = document.getElementById('right-nav-orders');
  const rightNavCust = document.getElementById('right-nav-customers');
  const rightNavUsers = document.getElementById('right-nav-users');
  const rightNavRefresh = document.getElementById('right-nav-refresh');
  const rightLogoutBtn = document.getElementById('right-menu-logout-btn');

  if (rightNavStats && navTabStatistics) {
    rightNavStats.addEventListener('click', () => { navTabStatistics.click(); closeRightMenu(); });
  }
  if (rightNavOrders && navTabOrders) {
    rightNavOrders.addEventListener('click', () => { navTabOrders.click(); closeRightMenu(); });
  }
  if (rightNavCust && navTabCustomers) {
    rightNavCust.addEventListener('click', () => { navTabCustomers.click(); closeRightMenu(); });
  }
  if (rightNavUsers && navTabUsers) {
    rightNavUsers.addEventListener('click', () => { navTabUsers.click(); closeRightMenu(); });
  }
  if (rightNavRefresh && refreshBtn) {
    rightNavRefresh.addEventListener('click', () => { refreshBtn.click(); closeRightMenu(); });
  }
  if (rightLogoutBtn && sidebarLogoutBtn) {
    rightLogoutBtn.addEventListener('click', () => { sidebarLogoutBtn.click(); closeRightMenu(); });
  }
}

const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
if (sidebarLogoutBtn) {
  sidebarLogoutBtn.addEventListener('click', async () => {
    if (!confirm("Bạn có chắc chắn muốn đăng xuất tài khoản?")) return;
    
    const sb = initSupabase();
    if (sb) { try { await sb.auth.signOut(); } catch(_) {} }
    
    if (typeof AuthService !== 'undefined' && typeof AuthService.logout === 'function') {
      await AuthService.logout();
    } else {
      localStorage.removeItem('af_logged_user');
      localStorage.removeItem('profile');
      localStorage.removeItem('current_role');
      localStorage.removeItem('current_shop_id');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      
      // Clear extension storage as well if running as extension
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['af_session', 'af_session_expires', 'af_session_token', 'af_session_refresh'], () => {});
      }
    }
    currentUser = null;
    window.location.href = 'login.html';
  });
}

// Lắng nghe thay đổi hai chiều ngầm từ Supabase (Realtime Sync)
function subscribeRealtime() {
  const sb = initSupabase();
  if (!sb || realtimeChannel) return;

  try {
    realtimeChannel = sb
      .channel('public:all_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'history' }, (payload) => {
        console.log('⚡ Dữ liệu history Supabase thay đổi:', payload);
        fetchOrdersSilently();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submitted_orders' }, (payload) => {
        console.log('⚡ Dữ liệu submitted_orders Supabase thay đổi:', payload);
        fetchOrdersSilently();
      })
      .subscribe();
  } catch (err) {
    console.warn('Lỗi kết nối Supabase Realtime:', err);
  }
}

// Tự động kết nối lại khi phục hồi mạng internet
window.addEventListener('online', () => {
  console.log(' Trạng thái mạng: Đã phục hồi Internet. kết nối lại Realtime...');
  if (realtimeChannel) {
    try { realtimeChannel.unsubscribe(); } catch(_) {}
    realtimeChannel = null;
  }
  subscribeRealtime();
  fetchOrdersSilently();
});

async function fetchOrdersSilently() {
  const sb = initSupabase();
  if (!sb) return;

  try {
    const [subRes, histRes] = await Promise.all([
      sb.from('submitted_orders').select('*').order('submitted_at', { ascending: false }).then(r => r, () => ({ data: [] })),
      sb.from('history').select('*').order('created_at', { ascending: false }).then(r => r, () => ({ data: [] }))
    ]);

    const submittedData = (subRes && subRes.data) ? subRes.data : [];
    const historyData = (histRes && histRes.data) ? histRes.data : [];

    const merged = combineOrdersAndSubmitted(historyData, submittedData);

    if (merged.length > 0) {
      allOrders = merged;
      processCustomerData([...historyData, ...submittedData]);
      updateDeviceFilterOptions(allOrders);
      renderOrders();
      renderCustomers();
    }
  } catch(e) {
    console.warn("Lỗi tải ngầm Dữ liệu:", e);
  }
}

const navTabShops = document.getElementById('nav-tab-shops');
const navTabStatistics = document.getElementById('nav-tab-statistics');
const sectionStatistics = document.getElementById('section-statistics');
const navTabDrafts = document.getElementById('nav-tab-drafts');
const sectionDrafts = document.getElementById('section-drafts');

let rawHistoryData = [];

// Navigation Tabs Handler
function setupTabSwitching() {
  if (navTabStatistics) {
    navTabStatistics.addEventListener('click', () => {
      setActiveTab(navTabStatistics);
      sectionStatistics.classList.remove('hidden');
      if (sectionDrafts) sectionDrafts.classList.add('hidden');
      sectionOrders.classList.add('hidden');
      sectionCustomers.classList.add('hidden');
      sectionUsers.classList.add('hidden');
      renderCharts(allOrders);
    });
  }

  if (navTabOrders) {
    navTabOrders.addEventListener('click', () => {
      setActiveTab(navTabOrders);
      sectionOrders.classList.remove('hidden');
      if (sectionDrafts) sectionDrafts.classList.add('hidden');
      sectionStatistics.classList.add('hidden');
      sectionCustomers.classList.add('hidden');
      if (sectionUsers) sectionUsers.classList.add('hidden');
      if (sectionAudit) sectionAudit.classList.add('hidden');
    });
  }

  if (navTabDrafts) {
    navTabDrafts.addEventListener('click', () => {
      setActiveTab(navTabDrafts);
      if (sectionDrafts) sectionDrafts.classList.remove('hidden');
      sectionOrders.classList.add('hidden');
      sectionStatistics.classList.add('hidden');
      sectionCustomers.classList.add('hidden');
      if (sectionUsers) sectionUsers.classList.add('hidden');
      if (sectionAudit) sectionAudit.classList.add('hidden');
      renderDrafts();
    });
  }

  if (navTabCustomers) {
    navTabCustomers.addEventListener('click', () => {
      setActiveTab(navTabCustomers);
      sectionCustomers.classList.remove('hidden');
      if (sectionDrafts) sectionDrafts.classList.add('hidden');
      sectionStatistics.classList.add('hidden');
      sectionOrders.classList.add('hidden');
      if (sectionUsers) sectionUsers.classList.add('hidden');
      if (sectionAudit) sectionAudit.classList.add('hidden');
      renderCustomers();
    });
  }

  if (navTabUsers) {
    navTabUsers.addEventListener('click', () => {
      setActiveTab(navTabUsers);
      if (sectionUsers) sectionUsers.classList.remove('hidden');
      if (sectionDrafts) sectionDrafts.classList.add('hidden');
      sectionStatistics.classList.add('hidden');
      sectionOrders.classList.add('hidden');
      sectionCustomers.classList.add('hidden');
      if (sectionAudit) sectionAudit.classList.add('hidden');
      fetchUsers();
    });
  }

  if (navTabAudit) {
    navTabAudit.addEventListener('click', () => {
      setActiveTab(navTabAudit);
      if (sectionAudit) sectionAudit.classList.remove('hidden');
      if (sectionDrafts) sectionDrafts.classList.add('hidden');
      sectionStatistics.classList.add('hidden');
      sectionOrders.classList.add('hidden');
      sectionCustomers.classList.add('hidden');
      if (sectionUsers) sectionUsers.classList.add('hidden');
    });
  }
}

function setActiveTab(activeTabEl) {
  const tabs = [navTabShops, navTabStatistics, navTabOrders, navTabDrafts, navTabCustomers, navTabUsers, navTabAudit];
  tabs.forEach(tab => {
    if (tab) {
      if (tab === activeTabEl) {
        tab.className = "w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-brand-primaryBlue text-white font-semibold transition-all shadow-sm";
      } else {
        tab.className = "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-brand-darkText/70 hover:bg-brand-primaryBlueLight hover:text-brand-primaryBlue transition-all";
      }
    }
  });
}

// ==========================================
// 3. FETCH & PROCESS ORDERS & CUSTOMERS
// ==========================================
function combineOrdersAndSubmitted(historyData, submittedData) {
  const subBySavedId = {};
  const subById = {};
  const subByCode = {};
  const subByPhoneName = {};

  (submittedData || []).forEach(sub => {
    const tracking = sub.tracking_code || sub.trackingCode || sub.waybill_code || sub.waybillCode || sub.ma_van_don || sub.maVanDon || '';
    if (sub.saved_order_id || sub.savedOrderId) {
      subBySavedId[sub.saved_order_id || sub.savedOrderId] = sub;
    }
    if (sub.id) {
      subById[sub.id] = sub;
    }
    if (sub.order_code || sub.orderCode) {
      const codeKey = String(sub.order_code || sub.orderCode).trim().toLowerCase();
      if (codeKey && codeKey !== '' && codeKey !== '-') subByCode[codeKey] = sub;
    }
    if (sub.phone && (sub.name || sub.customer_name)) {
      const phoneKey = String(sub.phone).replace(/\D/g, '');
      const nameKey = String(sub.name || sub.customer_name).trim().toLowerCase();
      if (phoneKey && nameKey) subByPhoneName[phoneKey + '_' + nameKey] = sub;
    }
  });

  const mergedList = [];
  const processedSubIds = new Set();

  (historyData || []).forEach(hist => {
    let res = hist.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }

    const histId = hist.id;
    const histCode = String(hist.order_code || res.orderCode || res.maDon || res.orderNo || '').trim().toLowerCase();
    const histPhone = String(hist.phone || res.phone || res.recipientPhone || '').replace(/\D/g, '');
    const histName = String(hist.customer_name || hist.name || res.name || res.recipientName || '').trim().toLowerCase();

    const matchedSub = subBySavedId[histId] || subById[histId] || (histCode && subByCode[histCode]) || (histPhone && histName && subByPhoneName[histPhone + '_' + histName]) || null;

    if (matchedSub && !processedSubIds.has(matchedSub.id)) {
      processedSubIds.add(matchedSub.id);
      const tracking = matchedSub.tracking_code || matchedSub.trackingCode || matchedSub.waybill_code || matchedSub.waybillCode || matchedSub.ma_van_don || matchedSub.maVanDon || '';
      
      hist.waybill_code = tracking || hist.waybill_code || hist.tracking_code || hist.ma_van_don || '';
      if (typeof res === 'object') {
        res.trackingCode = tracking || res.trackingCode || res.waybillCode || '';
        res.waybillCode = tracking || res.waybillCode || '';
        hist.result = res;
      }
      if (matchedSub.submitted_at || matchedSub.submittedAt) {
        hist.submitted_at = matchedSub.submitted_at || matchedSub.submittedAt;
      }
      mergedList.push(hist);
    }
  });

  (submittedData || []).forEach(sub => {
    if (!processedSubIds.has(sub.id)) {
      const tracking = sub.tracking_code || sub.trackingCode || sub.waybill_code || sub.waybillCode || sub.ma_van_don || sub.maVanDon || '';
      mergedList.push({
        id: sub.id,
        customer_name: sub.name || sub.customer_name || '',
        phone: sub.phone || '',
        address: sub.address || '',
        order_code: sub.order_code || sub.orderCode || '',
        waybill_code: tracking,
        tracking_code: tracking,
        cod_amount: sub.cod_amount || sub.codAmount || 0,
        platform: sub.platform || 'vnpost',
        device_name: sub.device_name || sub.deviceName || '',
        created_at: sub.submitted_at || sub.submittedAt || sub.created_at || new Date().toISOString(),
        result: {
          name: sub.name || sub.customer_name || '',
          phone: sub.phone || '',
          address: sub.address || '',
          orderCode: sub.order_code || sub.orderCode || '',
          trackingCode: tracking,
          waybillCode: tracking,
          codAmount: sub.cod_amount || sub.codAmount || 0,
          platform: sub.platform || 'vnpost'
        }
      });
    }
  });

  return deduplicateOrders(mergedList);
}

function deduplicateOrders(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const map = new Map();

  list.forEach(item => {
    if (!item) return;

    let res = item.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }

    const id = item.id || '';
    const savedId = item.savedOrderId || item.saved_order_id || '';
    const name = (item.customer_name || item.name || res.name || res.recipientName || res.hoTen || '').trim().toLowerCase();
    const phone = (item.phone || res.phone || res.recipientPhone || res.sdt || '').replace(/\D/g, '');
    const orderCode = (item.order_code || item.orderCode || res.orderCode || res.maDon || res.orderNo || '').trim().toLowerCase();
    const trackingCode = (item.waybill_code || item.waybillCode || item.tracking_code || item.trackingCode || item.ma_van_don || res.waybillCode || res.trackingCode || '').trim();

    let key = '';
    if (orderCode && orderCode !== '' && orderCode !== '-') {
      key = 'code_' + orderCode;
    } else if (savedId && savedId !== '' && savedId !== '-') {
      key = 'saved_' + savedId;
    } else if (name && phone) {
      key = 'np_' + name + '_' + phone;
    } else if (id) {
      key = 'id_' + id;
    } else {
      key = 'raw_' + Math.random();
    }

    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const existing = map.get(key);
      let existingRes = existing.result || {};
      if (typeof existingRes === 'string') { try { existingRes = JSON.parse(existingRes); } catch(e) {} }

      const existingTracking = existing.waybill_code || existing.tracking_code || existing.waybillCode || existing.trackingCode || existingRes.waybillCode || existingRes.trackingCode || '';
      
      const mergedObj = { ...existing, ...item };
      if ((!existingTracking || existingTracking === '' || existingTracking === '-') && trackingCode && trackingCode !== '' && trackingCode !== '-') {
        mergedObj.waybill_code = trackingCode;
        mergedObj.tracking_code = trackingCode;
        if (typeof existingRes === 'object') {
          existingRes.waybillCode = trackingCode;
          existingRes.trackingCode = trackingCode;
          mergedObj.result = existingRes;
        }
      }
      map.set(key, mergedObj);
    }
  });

  const result = Array.from(map.values());
  result.sort((a, b) => {
    const tA = new Date(a.created_at || a.submitted_at || a.submittedAt || a.createdAt || 0).getTime() || 0;
    const tB = new Date(b.created_at || b.submitted_at || b.submittedAt || b.createdAt || 0).getTime() || 0;
    return tB - tA;
  });
  return result;
}

async function fetchOrders() {
  if (loadingState) loadingState.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');
  if (mobileOrdersContainer) mobileOrdersContainer.innerHTML = '';
  if (desktopTableBody) desktopTableBody.innerHTML = '';

  const sb = initSupabase();
  if (!sb) {
    if (loadingState) loadingState.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  try {
    const [subRes, histRes, custRes] = await Promise.all([
      sb.from('submitted_orders').select('*').then(r => r, () => ({ data: [] })),
      sb.from('history').select('*').then(r => r, () => ({ data: [] })),
      sb.from('customers').select('*').then(r => r, () => ({ data: [] }))
    ]);

    const submittedData = (subRes && subRes.data) ? subRes.data : [];
    const historyData = (histRes && histRes.data) ? histRes.data : [];
    rawHistoryData = historyData;
    const cloudCustomers = (custRes && custRes.data) ? custRes.data : [];

    const merged = combineOrdersAndSubmitted(historyData, submittedData);

    if (loadingState) loadingState.classList.add('hidden');

    allOrders = merged || [];

    if (!merged || merged.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      updateStats(0, 0);
    } else {
      if (emptyState) emptyState.classList.add('hidden');
    }

    if (cloudCustomers && cloudCustomers.length > 0) {
      customerMap = {};
      cloudCustomers.forEach(C => {
        const rawPhone = (C.phone || '').trim();
        const name = (C.name || '').trim();
        const isFakePhone = rawPhone.startsWith('no_phone_');
        const phone = (isFakePhone || rawPhone === '') ? '' : rawPhone;
        const cleanPhone = isFakePhone ? '' : rawPhone.replace(/\D/g, '');
        const key = cleanPhone ? cleanPhone : (isFakePhone ? rawPhone : name.toLowerCase());
        if (!key) return;
        customerMap[key] = {
          name: name || 'Khch hàng',
          phone: phone,
          cleanPhone: cleanPhone,
          address: C.address || '',
          totalOrders: Number(C.total_orders || C.count || 1),
          totalCod: Number(C.total_cod || 0),
          latestDate: C.latest_date || C.updated_at || '',
          platform: C.fav_carrier || '',
          note: C.notes || C.tags || ''
        };
      });
    } else {
      processCustomerData([...historyData, ...submittedData]);
    }

    // Tự động bổ sung các khách hàng từ local customerMetadata (nếu chưa có trên Cloud)
    try {
      let localMeta = {};
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const res = await new Promise(r => chrome.storage.local.get(['customerMetadata'], r));
        if (res && res.customerMetadata) localMeta = res.customerMetadata;
      } else if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('customerMetadata');
        if (stored) localMeta = JSON.parse(stored);
      }
      Object.entries(localMeta || {}).forEach(([metaKey, metaVal]) => {
        if (!metaVal) return;
        const isPhone = /^\d+$/.test(metaKey.replace(/\D/g, '')) && metaKey.replace(/\D/g, '').length >= 8;
        const phone = isPhone ? metaKey.trim() : (metaVal.phone || '').trim();
        const cleanPhone = phone.replace(/\D/g, '');
        const rawName = metaVal.name || metaVal.customer_name || metaVal.latestName || (!isPhone ? metaKey : '') || metaVal.notes || metaVal.note || '';
        const name = String(rawName).trim();
        const key = cleanPhone ? cleanPhone : (name ? name.toLowerCase() : '');
        if (key && key !== '' && key !== '-' && !customerMap[key]) {
          customerMap[key] = {
            name: name || 'Khch hàng',
            phone: phone || '',
            cleanPhone: cleanPhone,
            address: metaVal.address || '',
            totalOrders: 1,
            totalCod: 0,
            latestDate: new Date().toISOString(),
            platform: '',
            note: metaVal.notes || metaVal.note || ''
          };
        }
      });
    } catch (_) {}

    updateDeviceFilterOptions(allOrders);
    renderOrders();
    renderCustomers();
    renderDrafts();

  } catch(e) {
    console.error("Lỗi tải danh sách đơn hàng:", e);
    if (loadingState) loadingState.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
  }
}

function processCustomerData(orders) {
  customerMap = {};
  (orders || []).forEach(item => {
    if (!item) return;

    let res = item.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }

    const rawName = item.name || item.customer_name || res.name || res.recipientName || res.hoTen || '';
    const name = String(rawName).trim();
    const rawPhone = item.phone || res.phone || res.recipientPhone || res.sdt || '';
    const phone = String(rawPhone).trim();
    const cleanPhone = phone.replace(/\D/g, '');
    const address = (item.address || res.normalizedAddress || res.address || res.diaChi || '').trim();
    const cod = Number(res.codAmount || item.cod_amount || item.codAmount || res.cod || 0);
    const date = item.created_at || item.submitted_at || item.submittedAt || '';
    const platform = res.platform || item.platform || 'vnpost';

    const key = cleanPhone ? cleanPhone : name.toLowerCase();
    if (!key || key === '' || key === '-') return;

    const displayName = (name && name !== '') ? name : (phone || 'Khch hàng');

    if (!customerMap[key]) {
      customerMap[key] = {
        name: displayName,
        phone: phone || '',
        cleanPhone: cleanPhone,
        address: address || '',
        totalOrders: 1,
        totalCod: cod,
        latestDate: date,
        platform: platform,
        note: item.note || ''
      };
    } else {
      customerMap[key].totalOrders += 1;
      customerMap[key].totalCod += cod;
      if ((!customerMap[key].name || customerMap[key].name === '') && displayName && displayName !== '') {
        customerMap[key].name = displayName;
      }
      if (date >= customerMap[key].latestDate) {
        customerMap[key].latestDate = date;
        if (address && address !== '') customerMap[key].address = address;
        if (platform) customerMap[key].platform = platform;
        if (displayName && displayName !== '') customerMap[key].name = displayName;
        if (phone && phone !== '') customerMap[key].phone = phone;
      }
    }
  });
}

function renderDrafts() {
  const container = document.getElementById('drafts-table-body');
  const statTotalDrafts = document.getElementById('stat-total-drafts');
  const statTotalDraftsCod = document.getElementById('stat-total-drafts-cod');

  if (!container) return;

  const drafts = (rawHistoryData || []).filter(h => h);
  let totalCod = 0;

  drafts.forEach(d => {
    let res = d.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }
    totalCod += Number(d.cod_amount || res.codAmount || res.cod || 0);
  });

  if (statTotalDrafts) statTotalDrafts.textContent = drafts.length;
  if (statTotalDraftsCod) statTotalDraftsCod.textContent = `${totalCod.toLocaleString('vi-VN')} đ`;

  if (drafts.length === 0) {
    container.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500">Chưa có đơn nháp nào. Bấm "Lưu đơn" ở Extension Panel để thêm đơn nháp.</td></tr>`;
    return;
  }

  container.innerHTML = drafts.map(d => {
    let res = d.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }

    const name = d.customer_name || d.name || res.name || res.recipientName || '';
    const phone = d.phone || res.phone || res.recipientPhone || '';
    const code = d.order_code || res.orderCode || res.maDon || d.id || '';
    const cod = Number(d.cod_amount || res.codAmount || res.cod || 0);
    const platform = (d.platform || res.platform || 'vnpost').toUpperCase();
    const dateStr = formatDateShort(d.created_at || d.submitted_at || '');

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-3.5 pl-5">
          <div class="font-extrabold text-[#111111]">${escapeHtml(name)}</div>
          <div class="text-xs text-blue-700 font-mono-code font-bold">${escapeHtml(phone)}</div>
        </td>
        <td class="p-3.5 font-mono-code text-slate-700 font-semibold">${escapeHtml(code)}</td>
        <td class="p-3.5 font-extrabold text-emerald-800">${cod.toLocaleString('vi-VN')} đ</td>
        <td class="p-3.5 font-bold text-xs text-slate-700">${platform}</td>
        <td class="p-3.5 text-slate-500">${dateStr}</td>
        <td class="p-3.5 pr-5 text-right space-x-1">
          <button onclick="viewOrderDetails('${d.id}')" class="px-2.5 py-1 rounded bg-blue-100 text-blue-800 font-bold text-xs hover:bg-blue-200">Sửa</button>
          <button onclick="deleteOrder('${d.id}')" class="px-2.5 py-1 rounded bg-rose-100 text-rose-800 font-bold text-xs hover:bg-rose-200">Xa</button>
        </td>
      </tr>
    `;
  }).join('');
}

let custCurrentPage = 1;
let custPerPage = 20;

function renderCustomers() {
  const keyword = searchCustomerInput ? searchCustomerInput.value.toLowerCase().trim() : '';
  const tierVal = custTierFilter ? custTierFilter.value : 'ALL';
  const carrierVal = custCarrierFilter ? custCarrierFilter.value : 'ALL';

  let list = Object.values(customerMap).filter(C => {
    const matchKeyword = !keyword || 
      C.name.toLowerCase().includes(keyword) || 
      C.phone.includes(keyword) || 
      C.address.toLowerCase().includes(keyword);

    let matchTier = true;
    if (tierVal === 'VIP') matchTier = C.totalOrders >= 3;
    else if (tierVal === 'LOYAL') matchTier = C.totalOrders === 2;
    else if (tierVal === 'NEW') matchTier = C.totalOrders === 1;

    let matchCarrier = true;
    if (carrierVal !== 'ALL') {
      matchCarrier = (C.platform || '').toLowerCase().includes(carrierVal);
    }

    return matchKeyword && matchTier && matchCarrier;
  });

  list.sort((a, b) => b.totalOrders - a.totalOrders || b.totalCod - a.totalCod);

  const vipCount = Object.values(customerMap).filter(C => C.totalOrders >= 3).length;

  const totalCustCount = Object.keys(customerMap).length;
  if (statTotalCustomers) statTotalCustomers.textContent = totalCustCount;
  const statCustOrders = document.getElementById('stat-total-customers-orders');
  if (statCustOrders) statCustOrders.textContent = totalCustCount;
  const statCustStat = document.getElementById('stat-total-customers-stat');
  if (statCustStat) statCustStat.textContent = totalCustCount;

  const statVipEl = document.getElementById('stat-vip-customers');
  if (statVipEl) statVipEl.textContent = vipCount;

  const totalCust = list.length;
  const totalPages = Math.max(1, Math.ceil(totalCust / custPerPage));
  if (custCurrentPage > totalPages) custCurrentPage = totalPages;
  const start = (custCurrentPage - 1) * custPerPage;
  const pageItems = list.slice(start, start + custPerPage);

  if (customerCountInfo) {
    if (totalCust === 0) {
      customerCountInfo.textContent = 'Hiển thị 0 trong tổng số 0 khách hàng';
    } else {
      customerCountInfo.textContent = `Hiển thị từ ${start + 1} đến ${Math.min(start + custPerPage, totalCust)} trong tổng số ${totalCust} khách hàng`;
    }
  }

  const custBtnPrev = document.getElementById('cust-btn-prev');
  const custBtnNext = document.getElementById('cust-btn-next');
  if (custBtnPrev) custBtnPrev.disabled = custCurrentPage <= 1;
  if (custBtnNext) custBtnNext.disabled = custCurrentPage >= totalPages;

  const mobileCustContainer = document.getElementById('mobile-customers-container');
  if (mobileCustContainer) {
    if (pageItems.length === 0) {
      mobileCustContainer.innerHTML = `<div class="p-8 text-center bg-white rounded-2xl border border-[#EAEAEA] text-[#787774]">Không tìm thấy khách hàng phù hợp.</div>`;
    } else {
      mobileCustContainer.innerHTML = pageItems.map(C => {
        let dateFormatted = '';
        if (C.latestDate) {
          const d = new Date(C.latestDate);
          if (!isNaN(d.getTime())) {
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            dateFormatted = `${dd}/${mm}/${yyyy}`;
          }
        }

        let tierBadge = '';
        if (C.totalOrders >= 3) {
          tierBadge = `<span class="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">Khách VIP</span>`;
        } else if (C.totalOrders === 2) {
          tierBadge = `<span class="inline-block px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">Thân thiết</span>`;
        } else {
          tierBadge = `<span class="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium">Khách Mới</span>`;
        }

        return `
          <div class="bg-white rounded-2xl p-4 border border-[#EAEAEA] shadow-sm space-y-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h4 class="font-extrabold text-[#111111] text-base hover:underline cursor-pointer" onclick="filterCustomerOrders('${escapeHtml(C.phone || C.name)}')">${escapeHtml(C.name)}</h4>
                <p class="text-xs text-blue-700 font-mono-code font-bold mt-0.5">${escapeHtml(C.phone || '')}</p>
              </div>
              ${tierBadge}
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs bg-[#F9F9F8] p-3 rounded-xl border border-[#EAEAEA]">
              <div>
                <span class="text-[#787774] text-[11px]">Số đơn mua:</span>
                <div class="font-bold text-[#111111] text-sm mt-0.5">${C.totalOrders} đơn</div>
              </div>
              <div>
                <span class="text-[#787774] text-[11px]">Tổng chi tiêu:</span>
                <div class="font-extrabold text-emerald-800 text-sm mt-0.5">${C.totalCod.toLocaleString('vi-VN')}đ</div>
              </div>
            </div>

            <div class="text-xs text-[#2F3437] leading-relaxed bg-[#F7F6F3] p-2.5 rounded-xl border border-[#EAEAEA]">
              <span class="text-[#787774]">Địa chỉ gần nhất:</span> ${escapeHtml(C.address)}
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-[#EAEAEA] text-xs">
              <div class="flex items-center gap-2">
                <a href="https://facebook.com" target="_blank" class="text-slate-500 hover:text-blue-600 font-semibold">+ Link FB</a>
                <a href="https://zalo.me/${C.phone}" target="_blank" class="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">Zalo</a>
              </div>

              <div class="flex items-center gap-1.5">
                <button onclick="openEditCustomerModal('${escapeHtml(C.phone || C.name)}')" class="px-2.5 py-1 rounded-md bg-pastel-blue text-[#1F6C9F] font-bold text-xs">Sửa</button>
                <button onclick="deleteCustomer('${escapeHtml(C.phone || C.name)}')" class="px-2.5 py-1 rounded-md bg-pastel-rose text-[#9F2F2D] font-bold text-xs">Xa</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (customerTableBody) {
    customerTableBody.innerHTML = pageItems.map(C => {
      let dateFormatted = '';
      if (C.latestDate) {
        const d = new Date(C.latestDate);
        if (!isNaN(d.getTime())) {
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          dateFormatted = `${dd}/${mm}/${yyyy}`;
        }
      }

      let tierBadge = '';
      if (C.totalOrders >= 3) {
        tierBadge = `<span class="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">Khách VIP</span>`;
      } else if (C.totalOrders === 2) {
        tierBadge = `<span class="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">Thân thiết</span>`;
      } else {
        tierBadge = `<span class="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium">Khách Mới</span>`;
      }

      const p = (C.platform || '').toLowerCase();
      let carrierBadge = '';
      if (p.includes('jt') || p.includes('j&t')) {
        carrierBadge = `<span class="font-extrabold text-[#ff3333] text-xs">J&T Express</span>`;
      } else {
        carrierBadge = `<span class="font-extrabold text-[#fdb813] text-xs">VNPost</span>`;
      }

      return `
        <tr class="hover:bg-[#F9F9F8] transition-colors border-b border-[#EAEAEA] whitespace-nowrap">
          <td class="py-4 px-4 font-semibold text-blue-600 hover:underline cursor-pointer" onclick="filterCustomerOrders('${escapeHtml(C.phone || C.name)}')">${escapeHtml(C.name)}</td>
          <td class="py-4 px-4 font-mono-code text-[#2F3437] font-medium">${escapeHtml(C.phone || '')}</td>
          <td class="py-4 px-4 text-center font-bold text-[#111111]">${C.totalOrders}</td>
          <td class="py-4 px-4 text-right font-extrabold text-[#111111]">${C.totalCod.toLocaleString('vi-VN')}đ</td>
          <td class="py-4 px-4 text-center font-mono-code text-xs text-[#787774]">${dateFormatted}</td>
          <td class="py-4 px-4 text-center">${tierBadge}</td>
          <td class="py-4 px-4 text-center">${carrierBadge}</td>
          <td class="py-4 px-4 text-center">
            <div class="flex items-center justify-center gap-1.5 text-xs font-semibold">
              <a href="https://facebook.com" target="_blank" class="text-slate-500 hover:text-blue-600 hover:underline">+ Link FB</a>
              <a href="https://zalo.me/${C.phone}" target="_blank" class="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]" title="Mở Zalo">Z</a>
            </div>
          </td>
          <td class="py-4 px-4 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="openEditCustomerModal('${escapeHtml(C.phone || C.name)}')" title="Sửa thông tin khách hàng" class="px-2.5 py-1 rounded-md bg-pastel-blue text-[#1F6C9F] text-xs font-bold hover:bg-blue-200 transition-all flex items-center gap-1">
                <i class="ph ph-pencil-simple text-sm"></i>
                <span>Sửa</span>
              </button>
              <button onclick="deleteCustomer('${escapeHtml(C.phone || C.name)}')" title="Xóa toàn bộ Dữ liệu của khách hàng" class="px-2.5 py-1 rounded-md bg-pastel-rose text-[#9F2F2D] text-xs font-bold hover:bg-rose-200 transition-all flex items-center gap-1">
                <i class="ph ph-trash text-sm"></i>
                <span>Xa</span>
              </button>
              <button onclick="editCustomerNote('${escapeHtml(C.phone || C.name)}', '${escapeHtml(C.note)}')" class="px-2.5 py-1 rounded-md border border-[#EAEAEA] bg-white hover:bg-[#F7F6F3] text-xs font-medium text-[#2F3437] transition-all">
                Ghi chú
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

// Hàm Xóa Khách Hàng (Xóa tất cả đơn hàng thuộc vị khách này khỏi Supabase)
async function deleteCustomer(key) {
  const cust = customerMap[key];
  if (!cust) return alert("Không tìm thấy khách hàng!");

  if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA KHÁCH HÀNG "${cust.name}" (${cust.phone}) và toàn bộ ${cust.totalOrders} đơn hàng của vị khách này khỏi Supabase?`)) return;

  const userOrders = allOrders.filter(o => {
    let res = o.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(err) {} }
    const p = o.phone || res.phone || res.recipientPhone || '';
    const n = o.customer_name || res.name || res.recipientName || '';
    return (p && p.trim() === cust.phone.trim()) || (n && n.trim().toLowerCase() === cust.name.trim().toLowerCase());
  });

  const idsToDelete = userOrders.map(o => o.id);
  if (idsToDelete.length === 0) return alert("Không tìm thấy đơn hàng cần xóa!");

  const sb = initSupabase();
  if (!sb) return alert("Lỗi kết nối Supabase!");

  try {
    const { error } = await sb
      .from('history')
      .delete()
      .in('id', idsToDelete);

    if (error) {
      alert("Lỗi khi xóa khách hàng: " + error.message);
    } else {
      alert(`Đã xóa thành công khách hàng "${cust.name}" và ${idsToDelete.length} đơn hàng!`);
      fetchOrders();
    }
  } catch(e) {
    alert("Lỗi hệ thống: " + e.message);
  }
}

// Modal Edit Customer Logic
const editCustModal = document.getElementById('edit-customer-modal');
const editCustForm = document.getElementById('edit-customer-form');
const closeCustModalBtn = document.getElementById('close-cust-modal-btn');
const cancelCustModalBtn = document.getElementById('cancel-cust-modal-btn');

function openEditCustomerModal(key) {
  const cust = customerMap[key];
  if (!cust) return alert("Không tìm thấy thông tin khách hàng!");

  document.getElementById('edit-cust-key').value = key;
  const nameInput = document.getElementById('edit-cust-name');
  if (nameInput) nameInput.value = cust.name || '';
  
  document.getElementById('edit-cust-phone').value = cust.phone || '';
  document.getElementById('edit-cust-address').value = cust.address || '';
  document.getElementById('edit-cust-note').value = cust.note || '';

  if (editCustModal) editCustModal.classList.remove('hidden');
}

function closeEditCustomerModal() {
  if (editCustModal) editCustModal.classList.add('hidden');
}

if (closeCustModalBtn) closeCustModalBtn.onclick = closeEditCustomerModal;
if (cancelCustModalBtn) cancelCustModalBtn.onclick = closeEditCustomerModal;

if (editCustForm) {
  editCustForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const key = document.getElementById('edit-cust-key').value;
    const newName = document.getElementById('edit-cust-name').value.trim();
    const newPhone = document.getElementById('edit-cust-phone').value.trim();
    const newAddress = document.getElementById('edit-cust-address').value.trim();
    const newNote = document.getElementById('edit-cust-note').value.trim();

    const cust = customerMap[key];
    if (!cust) return;

    const userOrders = allOrders.filter(o => {
      let res = o.result || {};
      if (typeof res === 'string') { try { res = JSON.parse(res); } catch(err) {} }
      const p = o.phone || res.phone || res.recipientPhone || '';
      const n = o.customer_name || res.name || res.recipientName || '';
      return (p && p.trim() === cust.phone.trim()) || (n && n.trim().toLowerCase() === cust.name.trim().toLowerCase());
    });

    const sb = initSupabase();
    if (!sb) return alert("Lỗi kết nối Supabase!");

    try {
      let updateCount = 0;
      for (let o of userOrders) {
        let res = o.result || {};
        if (typeof res === 'string') { try { res = JSON.parse(res); } catch(err) {} }

        res.name = newName;
        res.recipientName = newName;
        res.phone = newPhone;
        res.recipientPhone = newPhone;
        res.address = newAddress;
        res.normalizedAddress = newAddress;

        const { error } = await sb
          .from('history')
          .update({
            customer_name: newName,
            phone: newPhone,
            address: newAddress,
            note: newNote,
            result: res
          })
          .eq('id', o.id);

        if (!error) updateCount++;
      }

      alert(`Đã cập nhật thành công thông tin cho khách hàng "${newName}" trên ${updateCount} đơn hàng!`);
      closeEditCustomerModal();
      fetchOrders();
    } catch(err) {
      alert("Lỗi khi cập nhật khách hàng: " + err.message);
    }
  });
}

function editCustomerNote(key, currentNote) {
  const newNote = prompt("✍️ Nhập ghi chú cho khách hàng:", currentNote || '');
  if (newNote !== null) {
    if (customerMap[key]) customerMap[key].note = newNote;
    alert("✅ Đã lưu ghi chú thành công!");
    renderCustomers();
  }
}

function filterCustomerOrders(query) {
  if (navTabOrders) navTabOrders.click();
  if (searchInput) {
    searchInput.value = query;
    renderOrders();
  }
}

if (searchCustomerInput) searchCustomerInput.addEventListener('input', renderCustomers);
if (custTierFilter) custTierFilter.addEventListener('change', renderCustomers);
if (custCarrierFilter) custCarrierFilter.addEventListener('change', renderCustomers);

if (btnCustClearFilter) {
  btnCustClearFilter.addEventListener('click', () => {
    if (searchCustomerInput) searchCustomerInput.value = '';
    if (custTierFilter) custTierFilter.value = 'ALL';
    if (custCarrierFilter) custCarrierFilter.value = 'ALL';
    renderCustomers();
  });
}

const custPerPageEl = document.getElementById('cust-per-page');
if (custPerPageEl) {
  custPerPageEl.addEventListener('change', (e) => {
    custPerPage = Number(e.target.value);
    custCurrentPage = 1;
    renderCustomers();
  });
}

const custBtnPrevEl = document.getElementById('cust-btn-prev');
if (custBtnPrevEl) {
  custBtnPrevEl.addEventListener('click', () => {
    if (custCurrentPage > 1) {
      custCurrentPage--;
      renderCustomers();
    }
  });
}

const custBtnNextEl = document.getElementById('cust-btn-next');
if (custBtnNextEl) {
  custBtnNextEl.addEventListener('click', () => {
    custCurrentPage++;
    renderCustomers();
  });
}

function updateDeviceFilterOptions(list) {
  if (!deviceFilter) return;
  const devices = new Set();
  list.forEach(item => {
    if (item.device_name) devices.add(item.device_name);
    if (item.deviceName) devices.add(item.deviceName);
  });

  const currentVal = deviceFilter.value;
  deviceFilter.innerHTML = '<option value="ALL">Tất cả máy</option>';
  devices.forEach(dev => {
    const opt = document.createElement('option');
    opt.value = dev.toLowerCase();
    opt.textContent = dev;
    deviceFilter.appendChild(opt);
  });
  deviceFilter.value = currentVal;
}

function renderOrders() {
  if (!searchInput || !desktopTableBody) return;
  const keyword = searchInput.value.toLowerCase().trim();
  const selectedDevice = deviceFilter && deviceFilter.value ? deviceFilter.value : 'ALL';
  const selectedPlatform = platformFilter && platformFilter.value ? platformFilter.value : 'ALL';
  const fromVal = dateFrom ? dateFrom.value : '';
  const toVal = dateTo ? dateTo.value : '';

  const filtered = allOrders.filter(item => {
    let res = item.result || {};
    if (typeof res === 'string') {
      try { res = JSON.parse(res); } catch(e) {}
    }

    const name = (item.customer_name || res.name || res.recipientName || res.hoTen || '').toLowerCase();
    const phone = (item.phone || res.phone || res.recipientPhone || res.sdt || '').toLowerCase();
    const address = (item.address || res.address || res.normalizedAddress || res.diaChi || '').toLowerCase();
    const orderCode = (res.orderCode || item.order_code || res.maDon || '').toLowerCase();
    const waybillCode = (res.waybillCode || res.maVanDon || res.trackingCode || '').toLowerCase();
    const devName = (item.device_name || item.deviceName || '').toLowerCase();
    const platform = (res.platform || item.platform || '').toLowerCase();

    const createdAt = item.created_at || '';
    const dateStr = createdAt.slice(0, 10);
    if (fromVal && dateStr < fromVal) return false;
    if (toVal && dateStr > toVal) return false;

    const matchKeyword = !keyword || 
      name.includes(keyword) || 
      phone.includes(keyword) || 
      orderCode.includes(keyword) ||
      waybillCode.includes(keyword) ||
      address.includes(keyword);

    const matchDevice = selectedDevice === 'ALL' || devName === selectedDevice;
    const matchPlatform = selectedPlatform === 'ALL' || platform === selectedPlatform;

    return matchKeyword && matchDevice && matchPlatform;
  });

  let totalCodSum = 0;
  filtered.forEach(item => {
    let res = item.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }
    const cod = res.codAmount || item.cod_amount || res.cod || 0;
    totalCodSum += Number(cod) || 0;
  });

  updateStats(filtered.length, totalCodSum);

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (mobileOrdersContainer) mobileOrdersContainer.innerHTML = '';
    desktopTableBody.innerHTML = '';
    if (pageInfo) pageInfo.textContent = 'Trang 1 / 1  Tổng: 0 đơn';
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * perPage;
  const pageItems = filtered.slice(start, start + perPage);

  if (pageInfo) pageInfo.textContent = `Trang ${currentPage} / ${totalPages}  Tổng: ${filtered.length} đơn`;
  if (btnPrev) btnPrev.disabled = currentPage <= 1;
  if (btnNext) btnNext.disabled = currentPage >= totalPages;

  desktopTableBody.innerHTML = pageItems.map(item => {
    let res = item.result || {};
    if (typeof res === 'string') {
      try { res = JSON.parse(res); } catch(e) {}
    }

    const name = item.customer_name || res.name || res.recipientName || res.hoTen || '';
    const phone = item.phone || res.phone || res.recipientPhone || res.sdt || '';
    const address = item.address || res.normalizedAddress || res.address || res.diaChi || '';
    
    let orderCode = item.order_code || res.orderCode || res.maDon || res.orderNo || res.ma_don || item.orderCode || '';
    if (!orderCode && (item.raw_text || item.note || res.extraNote || res.note)) {
      const textSearch = (item.raw_text || '') + ' ' + (item.note || '') + ' ' + (res.extraNote || '') + ' ' + (res.note || '');
      const Mã = textSearch.match(/Đơn hàng:\s*([A-Z0-9.\-_]+)/i) || textSearch.match(/Mã đơn:\s*([A-Z0-9.\-_]+)/i);
      if (Mã) orderCode = Mã[1];
    }
    if (!orderCode) orderCode = '';
    
    let waybillCode = item.waybill_code || item.ma_van_don || res.waybillCode || res.maVanDon || res.trackingCode || res.waybill || res.trackingNo || item.tracking_code || '';
    if (!waybillCode && (item.raw_text || item.note || res.extraNote || res.note)) {
      const textSearch = (item.raw_text || '') + ' ' + (item.note || '') + ' ' + (res.extraNote || '') + ' ' + (res.note || '');
      const Mã = textSearch.match(/(?:số\s*hiệu\s*bưu\s*gửi|Mã\s*vận\s*đơn|tracking)\s*[:;]?\s*([A-Z0-9]{8,20})/i);
      if (Mã) waybillCode = Mã[1];
    }
    if (!waybillCode || waybillCode.trim() === '') {
      waybillCode = '';
    }

    const codAmount = res.codAmount || item.cod_amount || res.cod || 0;
    const collectFee = res.collectFee ? 'C' : 'KHàng';
    const platform = res.platform || item.platform || 'vnpost';
    const device = item.device_name || item.deviceName || 'Hệ thống';
    const timeStr = formatDateShort(item.created_at_short || item.created_at);

    return `
      <tr class="hover:bg-[#F9F9F8] transition-colors border-b border-[#EAEAEA] whitespace-nowrap">
        <td class="py-3.5 px-3 text-center"><input type="checkbox" class="order-checkbox rounded border-[#EAEAEA] cursor-pointer" data-id="${item.id}" onchange="handleCheckboxChange()"></td>
        <td class="py-3.5 px-3">
          <div class="font-bold text-[#111111] text-xs max-w-[200px] truncate" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
          <div class="text-[11px] text-[#787774] font-medium mt-0.5">${escapeHtml(phone)}</div>
        </td>
        <td class="py-3.5 px-3">
          <div class="max-w-[150px] truncate text-[#2F3437] cursor-pointer hover:bg-slate-50 transition-all duration-200" onclick="this.classList.toggle('truncate'); this.classList.toggle('whitespace-normal'); this.classList.toggle('break-words');" title="Nhấn để xem đầy đủ">${escapeHtml(address)}</div>
        </td>
        <td class="py-3.5 px-3">
          <span class="inline-block font-semibold text-xs text-[#111111] bg-[#F7F6F3] px-2 py-0.5 rounded border border-[#EAEAEA]">${escapeHtml(orderCode)}</span>
        </td>
        <td class="py-3.5 px-3 align-middle">
          <div class="inline-flex items-center gap-1.5 align-middle">
            <span class="inline-block text-xs font-bold bg-pastel-blue px-2 py-0.5 rounded font-mono leading-tight">${escapeHtml(waybillCode)}</span>
            ${waybillCode && waybillCode !== '' ? `
              <button onclick="copyWaybillCode('${escapeHtml(waybillCode)}', '${escapeHtml(platform)}')" title="Sao chép: ${escapeHtml(waybillCode)} - ${platform.includes('jt') ? 'J&T' : 'VNPost'}" class="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer inline-flex items-center justify-center border-0 bg-transparent leading-none">
                <i class="ph ph-copy text-sm leading-none"></i>
              </button>
            ` : ''}
          </div>
        </td>
        <td class="py-3.5 px-3 font-extrabold text-emerald-800 text-right">
          ${codAmount > 0 ? Number(codAmount).toLocaleString('vi-VN') + ' đ' : '0 đ'}
        </td>
        <td class="py-3.5 px-3 text-center text-[11px] font-medium text-[#787774]">${escapeHtml(collectFee)}</td>
        <td class="py-3.5 px-3 text-center">${getPlatformBadge(platform)}</td>
        <td class="py-3.5 px-3 text-center">
          <span class="inline-block text-[11px] font-medium bg-[#F7F6F3] text-[#787774] px-2 py-0.5 rounded border border-[#EAEAEA]">${escapeHtml(device)}</span>
        </td>
        <td class="py-3.5 px-3 text-center text-xs text-[#787774] font-medium">${escapeHtml(timeStr)}</td>
        <td class="py-3.5 px-3 text-center">
          <div class="flex items-center justify-center gap-1.5 text-[#787774]">
            <button onclick="copyOrderData('${item.id}', '${escapeHtml(name)}', '${escapeHtml(phone)}', '${escapeHtml(waybillCode)}', '${escapeHtml(address)}')" title="Sao chép thông tin" class="p-1.5 hover:text-[#111111] hover:bg-[#F0EFEA] rounded transition-all">
              <i class="ph ph-copy text-base"></i>
            </button>
            <button onclick="viewOrderDetails('${item.id}')" title="Xem & Sửa đơn hàng" class="p-1.5 hover:text-[#1F6C9F] hover:bg-pastel-blue rounded transition-all">
              <i class="ph ph-pencil-simple text-base"></i>
            </button>
            <button onclick="deleteOrder('${item.id}')" title="Xa đơn hàng" class="p-1.5 hover:text-[#9F2F2D] hover:bg-pastel-rose rounded transition-all">
              <i class="ph ph-trash text-base"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (mobileOrdersContainer) {
    mobileOrdersContainer.innerHTML = pageItems.map(item => {
      let res = item.result || {};
      if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }

      const name = item.customer_name || res.name || res.recipientName || res.hoTen || '';
      const phone = item.phone || res.phone || res.recipientPhone || res.sdt || '';
      const address = item.address || res.normalizedAddress || res.address || res.diaChi || '';
      
      let orderCode = item.order_code || res.orderCode || res.maDon || res.orderNo || res.ma_don || item.orderCode || '';
      if (!orderCode && (item.raw_text || item.note || res.extraNote || res.note)) {
        const textSearch = (item.raw_text || '') + ' ' + (item.note || '') + ' ' + (res.extraNote || '') + ' ' + (res.note || '');
        const Mã = textSearch.match(/Đơn hàng:\s*([A-Z0-9.\-_]+)/i) || textSearch.match(/Mã đơn:\s*([A-Z0-9.\-_]+)/i);
        if (Mã) orderCode = Mã[1];
      }
      if (!orderCode) orderCode = '';
      
      let waybillCode = item.waybill_code || item.ma_van_don || res.waybillCode || res.maVanDon || res.trackingCode || res.waybill || res.trackingNo || item.tracking_code || '';
      if (!waybillCode && (item.raw_text || item.note || res.extraNote || res.note)) {
        const textSearch = (item.raw_text || '') + ' ' + (item.note || '') + ' ' + (res.extraNote || '') + ' ' + (res.note || '');
        const Mã = textSearch.match(/(?:số\s*hiệu\s*bưu\s*gửi|Mã\s*vận\s*đơn|tracking)\s*[:;]?\s*([A-Z0-9]{8,20})/i);
        if (Mã) waybillCode = Mã[1];
      }
      if (!waybillCode || waybillCode.trim() === '') {
        waybillCode = '';
      }

      const codAmount = res.codAmount || item.cod_amount || res.cod || 0;
      const platform = res.platform || item.platform || 'vnpost';
      const device = item.device_name || item.deviceName || '';
      const timeStr = formatDateShort(item.created_at_short || item.created_at);

      return `
        <div class="bg-white rounded-xl p-4 border border-[#EAEAEA] space-y-3">
          <div class="flex justify-between items-start">
            <div>
              <h4 class="font-bold text-[#111111] text-base">${escapeHtml(name)}</h4>
              <p class="text-xs text-[#787774] font-medium mt-0.5">${escapeHtml(phone)}</p>
            </div>
            ${getPlatformBadge(platform)}
          </div>
          
          <div class="grid grid-cols-2 gap-2 text-xs bg-[#F9F9F8] p-3 rounded-lg border border-[#EAEAEA]">
            <div>
              <span class="text-[#787774] font-medium text-[11px]">Mã đơn:</span>
              <div class="font-bold text-[#111111] text-xs mt-0.5">${escapeHtml(orderCode)}</div>
            </div>
            <div>
              <span class="text-[#1F6C9F] font-medium text-[11px]">Mã vận đơn:</span>
              <div class="inline-flex items-center gap-1 mt-0.5 align-middle">
                <span class="font-bold text-[#1F6C9F] text-xs leading-tight">${escapeHtml(waybillCode)}</span>
                ${waybillCode && waybillCode !== '' ? `
                  <button onclick="copyWaybillCode('${escapeHtml(waybillCode)}', '${escapeHtml(platform)}')" title="Sao chép" class="p-0.5 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer inline-flex items-center justify-center border-0 bg-transparent leading-none">
                    <i class="ph ph-copy text-sm leading-none"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>

          <div class="text-xs text-[#2F3437] leading-relaxed bg-[#F7F6F3] p-2.5 rounded-lg border border-[#EAEAEA]">
            <span class="text-[#787774]">Địa chỉ:</span> ${escapeHtml(address)}
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-[#EAEAEA] text-xs">
            <div>
              <span class="text-[#787774]">COD:</span>
              <span class="font-bold text-emerald-800 text-sm ml-1">${codAmount > 0 ? Number(codAmount).toLocaleString('vi-VN') + ' đ' : '0 đ'}</span>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="copyOrderData('${item.id}', '${escapeHtml(name)}', '${escapeHtml(phone)}', '${escapeHtml(waybillCode)}', '${escapeHtml(address)}')" title="Sao chép" class="p-1 text-[#787774] hover:text-[#111111]">
                <i class="ph ph-copy text-base"></i>
              </button>
              <button onclick="viewOrderDetails('${item.id}')" title="Sửa" class="p-1 text-[#1F6C9F]">
                <i class="ph ph-pencil-simple text-base"></i>
              </button>
              <button onclick="deleteOrder('${item.id}')" title="Xa" class="p-1 text-[#9F2F2D]">
                <i class="ph ph-trash text-base"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  const selectAllCb = document.getElementById('select-all');
  if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.onchange = function() {
      const checkboxes = document.querySelectorAll('.order-checkbox');
      checkboxes.forEach(cb => cb.checked = selectAllCb.checked);
      handleCheckboxChange();
    };
  }

  handleCheckboxChange();
  renderCharts(filtered);
}

// ==========================================
// 4. THAO TC Hàng LOẠT (BULK SELECTION & DELETE)
// ==========================================
function handleCheckboxChange() {
  const selectedBoxes = document.querySelectorAll('.order-checkbox:checked');
  const bulkBar = document.getElementById('bulk-actions-bar');
  const selectedCountEl = document.getElementById('selected-count');

  if (selectedBoxes && selectedBoxes.length > 0) {
    if (bulkBar) bulkBar.classList.remove('hidden');
    if (selectedCountEl) selectedCountEl.textContent = selectedBoxes.length;
  } else {
    if (bulkBar) bulkBar.classList.add('hidden');
  }
}

// ─── XA ĐƠN Hàng ĐƠN LẺ & Hàng LOẠT ───
async function deleteOrder(id) {
  if (!id) return;
  const item = (allOrders || []).find(o => String(o.id) === String(id));
  const orderInfo = item ? `đơn hàng của "${item.customer_name || 'Khách hàng'}" (${item.phone || ''})` : `đơn hàng này`;

  if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA vĩnh viễn ${orderInfo} khỏi Supabase?`)) return;

  const sb = initSupabase();
  if (!sb) return alert("Lỗi kết nối Supabase!");

  try {
    const [histRes, subRes] = await Promise.all([
      sb.from('history').delete().eq('id', id),
      sb.from('submitted_orders').delete().or(`id.eq.${id},saved_order_id.eq.${id}`)
    ]);

    if (histRes.error && subRes.error) {
      alert("Lỗi khi xóa đơn hàng: " + (histRes.error.message || subRes.error.message));
    } else {
      if (typeof writeAuditLog === 'function') {
        writeAuditLog('Xóa đơn hàng', `Đã xóa vĩnh viễn ${orderInfo} khỏi hệ thống.`);
      }
      alert("Đã xóa thành công đơn hàng!");
      fetchOrders();
    }
  } catch(e) {
    alert("Lỗi hệ thống khi xa đơn hàng: " + e.message);
  }
}

const btnBulkDelete = document.getElementById('btn-bulk-delete');
if (btnBulkDelete) {
  btnBulkDelete.addEventListener('click', async () => {
    const selectedBoxes = document.querySelectorAll('.order-checkbox:checked');
    const idsToDelete = Array.from(selectedBoxes).map(cb => cb.getAttribute('data-id'));

    if (idsToDelete.length === 0) return;

    if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA HÀNG LOẠT ${idsToDelete.length} đơn hàng đã chọn khỏi Supabase?`)) return;

    const sb = initSupabase();
    if (!sb) return alert("Lỗi kết nối Supabase!");

    try {
      await Promise.all([
        sb.from('history').delete().in('id', idsToDelete),
        sb.from('submitted_orders').delete().in('id', idsToDelete),
        sb.from('submitted_orders').delete().in('saved_order_id', idsToDelete)
      ]);

      if (typeof writeAuditLog === 'function') {
        writeAuditLog('Xóa hàng loạt', `Đã xóa vĩnh viễn ${idsToDelete.length} đơn hàng khỏi hệ thống.`);
      }
      alert(`Đã xóa thành công ${idsToDelete.length} đơn hàng!`);
      fetchOrders();
    } catch(e) {
      alert("Lỗi hệ thống: " + e.message);
    }
  });
}

// ─── XÓA KHÁCH HÀNG TRÊN DASHBOARD ───
window.deleteCustomer = async function(customerKey) {
  if (!customerKey) return;
  
  const cleanKey = String(customerKey).trim();
  const cleanP = cleanKey.replace(/\D/g, '');
  
  // Tìm khách hàng trong customerMap
  let targetKey = Object.keys(customerMap).find(ký => {
    const C = customerMap[ký];
    if (!C) return false;
    if (cleanP && (C.cleanPhone === cleanP || C.phone === cleanKey)) return true;
    if (C.name && C.name.toLowerCase() === cleanKey.toLowerCase()) return true;
    return ký === cleanKey || ký === cleanP;
  });

  const custObj = targetKey ? customerMap[targetKey] : null;
  const displayName = custObj ? custObj.name : cleanKey;

  if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA KHÁCH HÀNG "${displayName}" khỏi hệ thống?`)) return;

  const sb = initSupabase();
  if (sb) {
    try {
      if (cleanP && cleanP.length >= 8) {
        await Promise.all([
          sb.from('customers').delete().eq('phone', cleanP),
          sb.from('customers').delete().like('phone', `%${cleanP}%`),
          sb.from('submitted_orders').delete().eq('phone', cleanP),
          sb.from('submitted_orders').delete().like('phone', `%${cleanP}%`),
          sb.from('history').delete().eq('phone', cleanP),
          sb.from('history').delete().like('phone', `%${cleanP}%`)
        ]).catch(() => {});
      } else {
        const searchName = custObj ? custObj.name : cleanKey;
        await Promise.all([
          sb.from('customers').delete().ilike('name', `%${searchName}%`),
          sb.from('submitted_orders').delete().ilike('name', `%${searchName}%`),
          sb.from('submitted_orders').delete().ilike('customer_name', `%${searchName}%`),
          sb.from('history').delete().ilike('customer_name', `%${searchName}%`),
          sb.from('history').delete().ilike('name', `%${searchName}%`)
        ]).catch(() => {});
      }
    } catch (e) {
      console.warn("Lỗi xóa khách hàng trên Cloud:", e);
    }
  }

  if (targetKey) delete customerMap[targetKey];
  
  if (typeof writeAuditLog === 'function') {
    writeAuditLog('Xóa khách hàng', `Đã xóa khách hàng "${displayName}" khỏi hệ thống.`);
  }

  alert(`Đã xóa thành công khách hàng "${displayName}"!`);
  renderCustomers();
};

// Modal Edit Elements
const editModal = document.getElementById('edit-order-modal');
const editForm = document.getElementById('edit-order-form');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');

function viewOrderDetails(id) {
  const item = allOrders.find(o => String(o.id) === String(id));
  if (!item) return alert("Không tìm thấy đơn hàng!");

  let res = item.result || {};
  if (typeof res === 'string') {
    try { res = JSON.parse(res); } catch(e) {}
  }

  const waybill = item.waybill_code || item.tracking_code || item.ma_van_don || res.waybillCode || res.maVanDon || res.trackingCode || '';

  document.getElementById('edit-order-id').value = item.id;
  document.getElementById('edit-name').value = item.customer_name || res.name || res.recipientName || '';
  document.getElementById('edit-phone').value = item.phone || res.phone || res.recipientPhone || '';
  document.getElementById('edit-address').value = item.address || res.normalizedAddress || res.address || '';
  document.getElementById('edit-order-code').value = res.orderCode || item.order_code || res.maDon || '';
  document.getElementById('edit-waybill-code').value = waybill;
  document.getElementById('edit-cod-amount').value = res.codAmount || item.cod_amount || res.cod || 0;

  if (editModal) editModal.classList.remove('hidden');
}

function closeEditModal() {
  if (editModal) editModal.classList.add('hidden');
}

if (closeModalBtn) closeModalBtn.onclick = closeEditModal;
if (cancelModalBtn) cancelModalBtn.onclick = closeEditModal;

if (editForm) {
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('edit-order-id').value;
    const name = document.getElementById('edit-name').value;
    const phone = document.getElementById('edit-phone').value;
    const address = document.getElementById('edit-address').value;
    const orderCode = document.getElementById('edit-order-code').value;
    const waybillCode = document.getElementById('edit-waybill-code').value;
    const codAmount = Number(document.getElementById('edit-cod-amount').value) || 0;

    const originalItem = allOrders.find(o => String(o.id) === String(id));
    let res = originalItem?.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }

    res.name = name;
    res.recipientName = name;
    res.phone = phone;
    res.recipientPhone = phone;
    res.address = address;
    res.normalizedAddress = address;
    res.orderCode = orderCode;
    res.waybillCode = waybillCode;
    res.trackingCode = waybillCode;
    res.codAmount = codAmount;

    const sb = initSupabase();
    if (!sb) return alert("Lỗi kết nối Supabase!");

    try {
      const { error } = await sb
        .from('history')
        .update({
          result: res
        })
        .eq('id', id);

      // Cập nhật song song vào bảng submitted_orders nếu đơn hàng đã được lưu trên cloud
      const subUpdateObj = {
        name: name,
        phone: phone,
        address: address,
        order_code: orderCode,
        cod_amount: codAmount
      };
      if (waybillCode) {
        subUpdateObj.tracking_code = waybillCode;
        subUpdateObj.waybill_code = waybillCode;
      }
      await sb.from('submitted_orders').update(subUpdateObj).or(`id.eq.${id},saved_order_id.eq.${id}`).then(r => r, () => {});

      if (error) {
        alert("Lỗi khi lưu đơn hàng: " + error.message);
      } else {
        // Ghi nhận Nhật ký audit log
        if (typeof writeAuditLog === 'function') {
          writeAuditLog('Sửa đơn hàng', `Đã cập nhật thông tin đơn hàng của khách hàng: ${name}, SĐT: ${phone}, Mã vận đơn: ${waybillCode}, COD: ${codAmount.toLocaleString('vi-VN')}đ`);
        }
        alert("Đã cập nhật thông tin đơn hàng thành công!");
        closeEditModal();
        fetchOrders();
      }
    } catch(err) {
      alert("Lỗi hệ thống: " + err.message);
    }
  });
}

function updateStats(total, totalCod) {
  if (statTotalOrders) statTotalOrders.textContent = `${total}/${total}`;
  if (statTotalCod) statTotalCod.textContent = `${Number(totalCod).toLocaleString('vi-VN')} đ`;
  
  const ordersStatic = document.getElementById('stat-total-orders-static');
  const codStatic = document.getElementById('stat-total-cod-static');
  if (ordersStatic) ordersStatic.textContent = total;
  if (codStatic) codStatic.textContent = `${Number(totalCod).toLocaleString('vi-VN')} đ`;
}

// Quick Date Handlers
const btnToday = document.getElementById('btn-today');
if (btnToday) {
  btnToday.addEventListener('click', () => {
    const today = new Date().toISOString().slice(0, 10);
    if (dateFrom) dateFrom.value = today;
    if (dateTo) dateTo.value = today;
    renderOrders();
  });
}

const btn7Days = document.getElementById('btn-7days');
if (btn7Days) {
  btn7Days.addEventListener('click', () => {
    const d = new Date();
    if (dateTo) dateTo.value = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() - 7);
    if (dateFrom) dateFrom.value = d.toISOString().slice(0, 10);
    renderOrders();
  });
}

const btn30Days = document.getElementById('btn-30days');
if (btn30Days) {
  btn30Days.addEventListener('click', () => {
    const d = new Date();
    if (dateTo) dateTo.value = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() - 30);
    if (dateFrom) dateFrom.value = d.toISOString().slice(0, 10);
    renderOrders();
  });
}

const btnClearFilters = document.getElementById('btn-clear-filters');
if (btnClearFilters) {
  btnClearFilters.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (deviceFilter) deviceFilter.value = 'ALL';
    if (platformFilter) platformFilter.value = 'ALL';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    renderOrders();
  });
}

// Listeners
if (searchInput) searchInput.addEventListener('input', renderOrders);
if (deviceFilter) deviceFilter.addEventListener('change', renderOrders);
if (platformFilter) platformFilter.addEventListener('change', renderOrders);
if (dateFrom) dateFrom.addEventListener('change', renderOrders);
if (dateTo) dateTo.addEventListener('change', renderOrders);
if (refreshBtn) refreshBtn.addEventListener('click', fetchOrders);

if (perPageEl) {
  perPageEl.addEventListener('change', (e) => {
    perPage = Number(e.target.value);
    currentPage = 1;
    renderOrders();
  });
}

if (btnPrev) {
  btnPrev.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderOrders();
    }
  });
}

if (btnNext) {
  btnNext.addEventListener('click', () => {
    const filteredCount = allOrders.filter(item => {
      let res = item.result || {};
      if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }
      const name = (item.customer_name || res.name || res.recipientName || res.hoTen || '').toLowerCase();
      const phone = (item.phone || res.phone || res.recipientPhone || res.sdt || '').toLowerCase();
      const address = (item.address || res.address || res.normalizedAddress || res.diaChi || '').toLowerCase();
      const orderCode = (res.orderCode || item.order_code || res.maDon || '').toLowerCase();
      const waybillCode = (res.waybillCode || res.maVanDon || res.trackingCode || '').toLowerCase();
      const devName = (item.device_name || item.deviceName || '').toLowerCase();
      const platform = (res.platform || item.platform || '').toLowerCase();

      const createdAt = item.created_at || '';
      const dateStr = createdAt.slice(0, 10);
      const fromVal = dateFrom ? dateFrom.value : '';
      const toVal = dateTo ? dateTo.value : '';
      if (fromVal && dateStr < fromVal) return false;
      if (toVal && dateStr > toVal) return false;

      const matchKeyword = !searchInput.value.toLowerCase().trim() || 
        name.includes(searchInput.value.toLowerCase().trim()) || 
        phone.includes(searchInput.value.toLowerCase().trim()) || 
        orderCode.includes(searchInput.value.toLowerCase().trim()) ||
        waybillCode.includes(searchInput.value.toLowerCase().trim()) ||
        address.includes(searchInput.value.toLowerCase().trim());

      const matchDevice = deviceFilter.value === 'ALL' || devName === deviceFilter.value;
      const matchPlatform = platformFilter.value === 'ALL' || platform === platformFilter.value;

      return matchKeyword && matchDevice && matchPlatform;
    }).length;

    const totalPages = Math.max(1, Math.ceil(filteredCount / perPage));
    if (currentPage < totalPages) {
      currentPage++;
      renderOrders();
    }
  });
}

function getPlatformBadge(platform) {
  const p = (platform || '').toLowerCase();
  if (p.includes('vnpost') || p.includes('bưu điện')) {
    return `<span class="font-extrabold text-[#fdb813] text-xs">VNPost</span>`;
  }
  if (p.includes('jt') || p.includes('j&t')) {
    return `<span class="font-extrabold text-[#ff3333] text-xs">J&T Express</span>`;
  }
  return `<span class="font-semibold text-[#787774] text-xs">KhC</span>`;
}

// ─── SAO CHÉP MÃ VẬN ĐƠN & MÃ ĐƠN VỊ VẬN CHUYỂN (DVVC) ───
function copyWaybillCode(waybillCode, platform) {
  if (!waybillCode || waybillCode === '' || waybillCode === '-') {
    alert("Chưa có mã vận đơn để sao chép!");
    return;
  }
  const p = (platform || '').toLowerCase();
  const carrierName = (p.includes('jt') || p.includes('j&t')) ? 'J&T' : 'VNPost';
  const formattedText = `${waybillCode.trim()} - ${carrierName}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(formattedText).then(() => {
      if (typeof showToast === 'function') showToast(`Đã sao chép: ${formattedText}`, 'success');
      else alert(`Đã sao chép: ${formattedText}`);
    }).catch(() => fallbackCopyWaybillText(formattedText));
  } else {
    fallbackCopyWaybillText(formattedText);
  }
}

function fallbackCopyWaybillText(text) {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand('copy');
    if (typeof showToast === 'function') showToast(`Đã sao chép: ${text}`, 'success');
    else alert(`Đã sao chép: ${text}`);
  } catch (e) {
    alert("Lỗi sao chép: " + text);
  }
  document.body.removeChild(input);
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  if (dateStr.length <= 16 && dateStr.includes(' ')) return dateStr;
  try {
    const d = new Date(dateStr);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch(e) {
    return dateStr;
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Tải danh sách User (Chỉ Admin Mới có quyền Quản lý)
async function fetchUsers() {
  const sb = initSupabase();
  if (!sb) return;

  try {
    const { data, error } = await sb.rpc('admin_list_users');
    if (error) {
      console.warn("Lỗi admin_list_users, chuyển sang dùng danh sách dự phòng local:", error.message);
      let localUsers = localStorage.getItem('af_local_profiles');
      if (!localUsers) {
        allUsers = [{ id: 'admin_bypass_local', email: 'admin@luathuysinh.vn', role: 'admin' }];
        localStorage.setItem('af_local_profiles', JSON.stringify(allUsers));
      } else {
        allUsers = JSON.parse(localUsers);
      }
      return;
    }

    allUsers = (data || []).map(u => ({
      ...u,
      id: u.user_id,
      role: u.role_code === 'SYSTEM_ADMIN' ? 'admin' : 'member'
    }));
  } catch(err) {
    let localUsers = localStorage.getItem('af_local_profiles');
    allUsers = localUsers ? JSON.parse(localUsers) : [{ id: 'admin_bypass_local', email: 'admin@luathuysinh.vn', role: 'admin' }];
  }
}


// Hàm ghi nhận Nhật ký hệ thống
window.writeAuditLog = function(action, details) {
  let localLogs = JSON.parse(localStorage.getItem('af_audit_logs') || '[]');
  const storedUser = localStorage.getItem('af_logged_user');
  const email = storedUser ? JSON.parse(storedUser).email : 'Hệ thống';

  localLogs.unshift({
    actor: email,
    action: action,
    details: details,
    date: new Date().toISOString()
  });

  // giới hạn tối đa 50 log gần nhất
  if (localLogs.length > 50) localLogs.pop();
  localStorage.setItem('af_audit_logs', JSON.stringify(localLogs));
};


// Modal Add/Edit User Logic
const userModal = document.getElementById('user-manage-modal');
const userForm = document.getElementById('user-manage-form');
const btnAddUser = document.getElementById('btn-add-user');
const closeUserModalBtn = document.getElementById('close-user-modal-btn');
const cancelUserModalBtn = document.getElementById('cancel-user-modal-btn');

if (btnAddUser) {
  btnAddUser.onclick = () => {
    document.getElementById('user-modal-title').textContent = "ThMã người dùng";
    document.getElementById('user-modal-id').value = "";
    document.getElementById('user-modal-email').value = "";
    document.getElementById('user-modal-email').disabled = false;
    document.getElementById('user-modal-password').value = "";
    document.getElementById('user-modal-password').required = true;
    document.getElementById('user-modal-role').value = "member";
    if (userModal) userModal.classList.remove('hidden');
  };
}

function openUserModal(id) {
  const u = allUsers.find(user => user.id === id);
  if (!u) return;

  document.getElementById('user-modal-title').textContent = "Chỉnh sửa tài khoản";
  document.getElementById('user-modal-id').value = u.id;
  document.getElementById('user-modal-email').value = u.email;
  document.getElementById('user-modal-email').disabled = true;
  document.getElementById('user-modal-password').value = "";
  document.getElementById('user-modal-password').required = false;
  document.getElementById('user-modal-role').value = u.role || 'member';

  if (userModal) userModal.classList.remove('hidden');
}

function closeUserModal() {
  if (userModal) userModal.classList.add('hidden');
}

if (closeUserModalBtn) closeUserModalBtn.onclick = closeUserModal;
if (cancelUserModalBtn) cancelUserModalBtn.onclick = closeUserModal;

if (userForm) {
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('user-modal-id').value;
    const email = document.getElementById('user-modal-email').value.trim();
    const password = document.getElementById('user-modal-password').value.trim();
    const role = document.getElementById('user-modal-role').value;

    const sb = initSupabase();
    if (!sb) return;

    try {
      if (!id) {
        // Dùng RPC để tạo user trựC tiếp (bypass email rate limit)
        const { data: rpcData, error: rpcErr } = await sb.rpc('admin_create_user', {
          p_email: email,
          p_password: password,
          p_full_name: email.split('@')[0],
          p_role_code: role
        });

        if (!rpcErr && rpcData && rpcData.user_id) {
          // Role đã được gán trong RPC, không cần gọi thêm
        } else {
          throw new Error(rpcErr?.message || 'Tạo tài khoản thất bại');
        }

        let localUsers = localStorage.getItem('af_local_profiles');
        let list = localUsers ? JSON.parse(localUsers) : [{ id: 'admin_bypass_local', email: 'admin@luathuysinh.vn', role: 'admin' }];
        const newId = rpcData?.user_id || 'local_' + Date.now();
        list.push({ id: newId, email: email, role: role });
        localStorage.setItem('af_local_profiles', JSON.stringify(list));

        writeAuditLog('Tạo tài khoản', `Đã tạo tài khoản nhân viên Mới: ${email}`);
        alert(`Đã tạo thành công tài khoản: ${email}`);
      } else {
        const roleCode = role === 'admin' ? 'SYSTEM_ADMIN' : 'EXTENSION_USER';
        const { data: rpcSetData, error: rpcSetErr } = await sb.rpc('admin_set_user_role', {
          p_user_id: id,
          p_role_code: roleCode
        });
        if (rpcSetErr) throw new Error(rpcSetErr.message || 'Cập nhật Vai trò thất bại');

        let localUsers = localStorage.getItem('af_local_profiles');
        if (localUsers) {
          let list = JSON.parse(localUsers);
          const uIdx = list.findIndex(user => user.id === id);
          if (uIdx !== -1) {
            list[uIdx].role = role;
            localStorage.setItem('af_local_profiles', JSON.stringify(list));
          }
        }

        writeAuditLog('Cập nhật quyền', `Đã sửa đổi thông tin quyền cho tài khoản: ${email}`);
        if (password) {
          alert("⚠️ Đã lưu thay đổi. Mật khẩu cần được tự đặt lại qua email khi phục hồi hoặc qua chức năng Quản trị viên.");
        } else {
          alert("Đã cập nhật thành công thông tin người dùng!");
        }
      }

      closeUserModal();
      fetchUsers();
    } catch(err) {
      alert("Lỗi hệ thống: " + err.message);
    }
  });
}

async function deleteSystemUser(id, email) {
  if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA TÀI KHOẢN "${email}" khỏi hệ thống?`)) return;

  const sb = initSupabase();
  if (!sb) return;

  try {
    await sb.from('profiles').delete().eq('id', id);
    
    let localUsers = localStorage.getItem('af_local_profiles');
    if (localUsers) {
      let list = JSON.parse(localUsers);
      list = list.filter(user => user.id !== id);
      localStorage.setItem('af_local_profiles', JSON.stringify(list));
    }

    writeAuditLog('Xóa tài khoản', `Đã xóa vĩnh viễn tài khoản nhân viên: ${email}`);
    alert(`Đã xóa tài khoản "${email}" thành công!`);
    fetchUsers();
  } catch(e) {
    alert("Lỗi hệ thống: " + e.message);
  }
}

// ==========================================
// 6. BIỂU ĐỒ BÁO CÁO THỐNG KÊ (CHART.JS)
// ==========================================
// SYSTEM DASHBOARD CONTROLLER (UX-DASHBOARD-DEV-SPEC COMPLIANT)
// ==========================================
let revenueChartInstance = null;
let ordersChartInstance = null;

// State Machine Controller for Dashboard Components
function setDashboardState(state, errorMsg = '') {
  const skeletonEl = document.getElementById('stat-skeleton-screen');
  const errorEl = document.getElementById('stat-error-state');
  const emptyEl = document.getElementById('stat-empty-state');
  const mainEl = document.getElementById('stat-main-content');
  const errorMsgEl = document.getElementById('stat-error-msg');

  if (skeletonEl) skeletonEl.classList.toggle('hidden', state !== 'loading');
  if (errorEl) errorEl.classList.toggle('hidden', state !== 'error');
  if (emptyEl) emptyEl.classList.toggle('hidden', state !== 'empty');
  if (mainEl) mainEl.classList.toggle('hidden', state !== 'success');

  if (state === 'error' && errorMsgEl) {
    errorMsgEl.textContent = errorMsg || 'Vui lòng kiểm tra lại kết nối Supabase hoặc đường truyền mạng.';
  }
}

// Sync Dashboard Filters with URL Query Params
function syncDashboardFiltersToURL(range, carrier, shop) {
  try {
    const url = new URL(window.location.href);
    if (range) url.searchParams.set('range', range);
    if (carrier) url.searchParams.set('carrier', carrier);
    if (shop) url.searchParams.set('shop', shop);
    window.history.replaceState({}, '', url.toString());
  } catch(e) {
    console.warn('[Dashboard] Error syncing URL params:', e);
  }
}

// Load Initial Filters from URL Query Params
function loadDashboardFiltersFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const range = params.get('range') || '30d';
    const carrier = params.get('carrier') || 'ALL';
    const shop = params.get('shop') || 'ALL';

    const carrierSelect = document.getElementById('stat-carrier-select');
    const shopSelect = document.getElementById('stat-shop-select');

    if (carrierSelect && carrier) carrierSelect.value = carrier;
    if (shopSelect && shop) shopSelect.value = shop;

    return { range, carrier, shop };
  } catch(e) {
    return { range: '30d', carrier: 'ALL', shop: 'ALL' };
  }
}

// Render Recent Orders Live Stream Table
function renderRecentOrdersTable(orders) {
  const tbody = document.getElementById('stat-recent-orders-tbody');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-brand-darkText/50">Không có đơn hàng gần đây</td></tr>`;
    return;
  }

  const recentList = orders.slice(0, 10);
  tbody.innerHTML = recentList.map(item => {
    let res = item.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }
    
    const customerName = res.customerName || res.name || item.customer_name || 'Khch lẻ';
    const orderCode = item.tracking_number || item.order_code || res.orderCode || item.id?.slice(0,8) || 'N/A';
    const platform = (item.platform || res.platform || '').toLowerCase();
    const carrierName = platform.includes('jt') ? 'J&T Express' : 'VNPost Bưu Điện';
    const carrierBadge = platform.includes('jt') 
      ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">J&T Express</span>'
      : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">VNPost</span>';
    
    const codVal = Number(res.codAmount || item.cod_amount || res.cod || 0);
    const codFormatted = codVal ? codVal.toLocaleString('vi-VN') + ' đ' : '0 đ';

    const isAI = res.usedAI || item.used_ai || false;
    const parserBadge = isAI 
      ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">✨ AI Gemini</span>'
      : '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">⚡ Local Regex</span>';

    const isSuccess = !item.error_message && (!res.errors || res.errors.length === 0);
    const statusBadge = isSuccess
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Thành công</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Cần rà soát</span>';

    return `
      <tr class="hover:bg-brand-neutralBg/60 transition-colors cursor-pointer text-xs" data-order-id="${item.id || ''}">
        <td class="p-3 pl-4">
          <div class="font-bold text-[#111111]">${customerName}</div>
          <div class="text-[10px] font-mono-code text-brand-darkText/60">Mã: ${orderCode}</div>
        </td>
        <td class="p-3">${carrierBadge}</td>
        <td class="p-3 font-mono-code font-bold text-emerald-700">${codFormatted}</td>
        <td class="p-3">${parserBadge}</td>
        <td class="p-3">${statusBadge}</td>
        <td class="p-3 text-right pr-4">
          <button class="btn-drawer-trigger p-1 hover:bg-brand-borderLight rounded text-brand-primaryBlue font-semibold text-[11px]" title="Xem Chi tiết payload">
            Chi tiết &rarr;
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Wire Click Event to open Slide-over Drawer
  tbody.querySelectorAll('tr').forEach((row, idx) => {
    row.addEventListener('click', () => {
      openDashboardDetailDrawer(recentList[idx]);
    });
  });
}

// Drawer Controller
function openDashboardDetailDrawer(order) {
  const drawer = document.getElementById('stat-detail-drawer');
  const backdrop = document.getElementById('stat-drawer-backdrop');
  const panel = document.getElementById('stat-drawer-panel');
  const titleEl = document.getElementById('drawer-order-title');
  const rawEl = document.getElementById('drawer-raw-text');
  const parsedEl = document.getElementById('drawer-parsed-json');

  if (!drawer || !order) return;

  let res = order.result || {};
  if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }

  if (titleEl) titleEl.textContent = `Đơn hàng: ${order.tracking_number || order.id || 'N/A'}`;
  if (rawEl) rawEl.textContent = order.raw_text || order.rawText || res.rawText || 'Không có văn bản gốc';
  if (parsedEl) parsedEl.textContent = JSON.stringify(res, null, 2);

  drawer.classList.remove('hidden');
  setTimeout(() => {
    drawer.classList.remove('opacity-0', 'pointer-events-none');
    if (panel) panel.classList.remove('translate-x-full');
  }, 10);
}

function closeDashboardDetailDrawer() {
  const drawer = document.getElementById('stat-detail-drawer');
  const panel = document.getElementById('stat-drawer-panel');
  if (!drawer) return;

  if (panel) panel.classList.add('translate-x-full');
  drawer.classList.add('opacity-0', 'pointer-events-none');
  setTimeout(() => {
    drawer.classList.add('hidden');
  }, 200);
}

// Main Render Charts & Visualization Function
function renderCharts(orders) {
  // Check empty state
  if (!orders || orders.length === 0) {
    setDashboardState('empty');
    return;
  }

  setDashboardState('success');

  // Update Last Updated Timestamp
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const lastUpdatedEl = document.getElementById('stat-last-updated');
  if (lastUpdatedEl) lastUpdatedEl.textContent = `Cập nhật: ${timeStr}`;

  // Group Multi-series Data: VNPost vs J&T Express & Revenue
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const chartData = {};
  dates.forEach(date => {
    chartData[date] = { vnpost: 0, jt: 0, revenue: 0, localCount: 0, aiCount: 0 };
  });

  let totalCOD = 0;
  let totalLocal = 0;
  let totalAI = 0;
  let successCount = 0;

  orders.forEach(item => {
    let res = item.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }

    const dateStr = (item.created_at || new Date().toISOString()).slice(0, 10);
    const platform = (item.platform || res.platform || '').toLowerCase();
    const cod = Number(res.codAmount || item.cod_amount || res.cod || 0);
    const usedAI = res.usedAI || item.used_ai || false;

    totalCOD += cod;
    if (usedAI) totalAI++; else totalLocal++;
    if (!item.error_message) successCount++;

    if (chartData[dateStr]) {
      chartData[dateStr].revenue += cod;
      if (usedAI) chartData[dateStr].aiCount++; else chartData[dateStr].localCount++;
      if (platform.includes('jt')) {
        chartData[dateStr].jt += 1;
      } else {
        chartData[dateStr].vnpost += 1;
      }
    }
  });

  // Update Summary KPI Cards
  const totalOrdersStatic = document.getElementById('stat-total-orders-static');
  const totalCodStatic = document.getElementById('stat-total-cod-static');
  const successRateEl = document.getElementById('stat-kpi-success-rate');
  const latencyEl = document.getElementById('stat-kpi-latency');
  const aiRatioEl = document.getElementById('stat-kpi4-delta');

  if (totalOrdersStatic) totalOrdersStatic.textContent = orders.length.toLocaleString('vi-VN');
  if (totalCodStatic) totalCodStatic.textContent = totalCOD.toLocaleString('vi-VN') + ' đ';
  if (successRateEl) {
    const rate = orders.length ? ((successCount / orders.length) * 100).toFixed(1) : '100';
    successRateEl.textContent = `${rate}%`;
  }
  if (latencyEl) latencyEl.textContent = '180ms';
  if (aiRatioEl) {
    const aiPercent = orders.length ? ((totalAI / orders.length) * 100).toFixed(1) : '0';
    aiRatioEl.textContent = `AI Fallback: ${aiPercent}% (Tối ưu token)`;
  }

  // Populate Live Stream Table
  renderRecentOrdersTable(orders);

  if (typeof Chart === 'undefined') return;

  const labels = dates.map(d => {
    const parts = d.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
  });

  const revenueData = dates.map(d => chartData[d]?.revenue || 0);
  const localDataSum = dates.map(d => chartData[d]?.localCount || 0);
  const aiDataSum = dates.map(d => chartData[d]?.aiCount || 0);

  // Render Daily Revenue Trend Line Chart
  const ctxRev = document.getElementById('revenueChart');
  if (ctxRev) {
    if (revenueChartInstance) revenueChartInstance.destroy();
    revenueChartInstance = new Chart(ctxRev, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: ' Doanh thu COD (đ)',
            data: revenueData,
            borderColor: '#059669', // Emerald Green
            backgroundColor: 'rgba(5, 150, 105, 0.08)',
            borderWidth: 2.5,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#059669',
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#94A3B8', font: { size: 11, weight: 'bold' } } },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.parsed.y);
                }
                return label;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: {
              color: '#94A3B8',
              font: { size: 10 },
              callback: function(value) {
                if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
                if (value >= 1e3) return (value / 1e3).toFixed(0) + 'k';
                return value;
              }
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94A3B8', font: { size: 10 } }
          }
        }
      }
    });
  }

  // Render Donut Chart for Parser Engine Distribution (Local Regex vs AI Gemini)
  const ctxOrd = document.getElementById('ordersCountChart');
  if (ctxOrd) {
    if (ordersChartInstance) ordersChartInstance.destroy();
    ordersChartInstance = new Chart(ctxOrd, {
      type: 'doughnut',
      data: {
        labels: ['Local Regex Rules', 'AI Gemini Fallback'],
        datasets: [{
          data: [totalLocal || 1, totalAI || 0],
          backgroundColor: ['#3C7363', '#6366F1'],
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: '#94A3B8', font: { size: 10 } } }
        },
        cutout: '70%'
      }
    });
  }
}

// Wire Dashboard Interaction Buttons
document.addEventListener('DOMContentLoaded', () => {
  // Load initial filters from URL
  const { range, carrier, shop } = loadDashboardFiltersFromURL();

  // Refresh CTA Button
  const btnRefresh = document.getElementById('stat-btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      setDashboardState('loading');
      setTimeout(() => {
        renderCharts(allOrders);
      }, 400);
    });
  }

  // Retry Button on Error State
  const btnRetry = document.getElementById('btn-stat-retry');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      setDashboardState('loading');
      setTimeout(() => {
        renderCharts(allOrders);
      }, 400);
    });
  }

  // Clear Filter Button on Empty State & Filter Bar
  const btnClearEmpty = document.getElementById('btn-stat-clear-empty');
  const btnResetFilters = document.getElementById('stat-btn-reset-filters');
  const resetHandler = () => {
    const carrierSelect = document.getElementById('stat-carrier-select');
    const shopSelect = document.getElementById('stat-shop-select');
    if (carrierSelect) carrierSelect.value = 'ALL';
    if (shopSelect) shopSelect.value = 'ALL';
    syncDashboardFiltersToURL('30d', 'ALL', 'ALL');
    renderCharts(allOrders);
  };
  if (btnClearEmpty) btnClearEmpty.addEventListener('click', resetHandler);
  if (btnResetFilters) btnResetFilters.addEventListener('click', resetHandler);

  // Carrier & Shop Filter Event Handlers
  const carrierSelect = document.getElementById('stat-carrier-select');
  const shopSelect = document.getElementById('stat-shop-select');
  if (carrierSelect) {
    carrierSelect.addEventListener('change', () => {
      syncDashboardFiltersToURL(null, carrierSelect.value, null);
      const filtered = allOrders.filter(o => {
        if (carrierSelect.value === 'ALL') return true;
        const p = (o.platform || '').toLowerCase();
        return p.includes(carrierSelect.value);
      });
      renderCharts(filtered);
    });
  }

  // Drawer Close Button & Backdrop
  const drawerCloseBtn = document.getElementById('stat-drawer-close');
  const drawerBackdrop = document.getElementById('stat-drawer-backdrop');
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDashboardDetailDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDashboardDetailDrawer);

  // CSV Export CTA Button
  const btnExportCSV = document.getElementById('btn-export-stat-csv');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      if (!allOrders || allOrders.length === 0) {
        alert('Không có Dữ liệu đơn hàng để xuất CSV.');
        return;
      }
      const headers = ['Mã Đơn', 'Khách Hàng', 'SĐT', 'Địa Chỉ', 'COD', 'ĐVVC', 'Ngày Tạo'];
      const rows = allOrders.map(item => {
        let res = item.result || {};
        if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }
        return [
          item.tracking_number || item.id || '',
          res.customerName || item.customer_name || '',
          res.phone || '',
          `"${(res.address || '').replace(/"/g, '""')}"`,
          Number(res.codAmount || item.cod_amount || 0),
          item.platform || '',
          item.created_at || ''
        ].join(',');
      });
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Dashboard_Report_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
});


// ==========================================
// QUICK DATE HANDLERS CHO TAB THỐNG KÊ (STAT STATISTICS)
// ==========================================
const statDateFrom = document.getElementById('stat-date-from');
const statDateTo = document.getElementById('stat-date-to');
let activeStatFilter = null; // Theo dõi nút lọc đang được chọn ('today', '7days', '30days', 'month')

function handleStatDateChange() {
  if (!statDateFrom || !statDateTo) return;
  const fromVal = statDateFrom.value;
  const toVal = statDateTo.value;
  
  const filtered = allOrders.filter(item => {
    const createdAt = item.created_at || '';
    const dateStr = createdAt.slice(0, 10);
    if (fromVal && dateStr < fromVal) return false;
    if (toVal && dateStr > toVal) return false;
    return true;
  });
  renderCharts(filtered);
  
  let totalCodSum = 0;
  filtered.forEach(item => {
    let res = item.result || {};
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }
    const cod = res.codAmount || item.cod_amount || res.cod || 0;
    totalCodSum += Number(cod) || 0;
  });
  const ordersStatic = document.getElementById('stat-total-orders-static');
  const codStatic = document.getElementById('stat-total-cod-static');
  if (ordersStatic) ordersStatic.textContent = filtered.length;
  if (codStatic) codStatic.textContent = `${Number(totalCodSum).toLocaleString('vi-VN')} đ`;
}

if (statDateFrom) statDateFrom.addEventListener('change', () => {
  activeStatFilter = null;
  setStatBtnActive(null);
  handleStatDateChange();
});
if (statDateTo) statDateTo.addEventListener('change', () => {
  activeStatFilter = null;
  setStatBtnActive(null);
  handleStatDateChange();
});

function setStatBtnActive(activeBtnId) {
  const btns = ['stat-btn-today', 'stat-btn-7days', 'stat-btn-30days', 'stat-btn-month'];
  btns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      if (id === activeBtnId) {
        // Nút được chọn sẽ đậm màu hơn hẳn (nền xanh Sage đậm, chữ trắng)
        btn.className = "px-3.5 py-1.5 rounded-lg border border-[#3C7363] bg-[#3C7363] text-white text-xs font-bold transition-all shadow-sm";
      } else {
        // Nút bình thường
        btn.className = "px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] bg-white text-xs font-semibold text-brand-darkText hover:bg-brand-neutralBg hover:text-[#3C7363] transition-all";
      }
    }
  });
}

function clearStatDateFilters() {
  activeStatFilter = null;
  setStatBtnActive(null);
  if (statDateFrom) statDateFrom.value = '';
  if (statDateTo) statDateTo.value = '';
  handleStatDateChange();
}

const statBtnToday = document.getElementById('stat-btn-today');
if (statBtnToday) {
  statBtnToday.addEventListener('click', () => {
    if (activeStatFilter === 'today') {
      clearStatDateFilters();
    } else {
      activeStatFilter = 'today';
      setStatBtnActive('stat-btn-today');
      const today = new Date().toISOString().slice(0, 10);
      statDateFrom.value = today;
      statDateTo.value = today;
      handleStatDateChange();
    }
  });
}

const statBtn7Days = document.getElementById('stat-btn-7days');
if (statBtn7Days) {
  statBtn7Days.addEventListener('click', () => {
    if (activeStatFilter === '7days') {
      clearStatDateFilters();
    } else {
      activeStatFilter = '7days';
      setStatBtnActive('stat-btn-7days');
      const d = new Date();
      statDateTo.value = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() - 7);
      statDateFrom.value = d.toISOString().slice(0, 10);
      handleStatDateChange();
    }
  });
}

const statBtn30Days = document.getElementById('stat-btn-30days');
if (statBtn30Days) {
  statBtn30Days.addEventListener('click', () => {
    if (activeStatFilter === '30days') {
      clearStatDateFilters();
    } else {
      activeStatFilter = '30days';
      setStatBtnActive('stat-btn-30days');
      const d = new Date();
      statDateTo.value = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() - 30);
      statDateFrom.value = d.toISOString().slice(0, 10);
      handleStatDateChange();
    }
  });
}

const statBtnMonth = document.getElementById('stat-btn-month');
if (statBtnMonth) {
  statBtnMonth.addEventListener('click', () => {
    if (activeStatFilter === 'month') {
      clearStatDateFilters();
    } else {
      activeStatFilter = 'month';
      setStatBtnActive('stat-btn-month');
      const d = new Date();
      statDateTo.value = d.toISOString().slice(0, 10);
      d.setDate(1);
      statDateFrom.value = d.toISOString().slice(0, 10);
      handleStatDateChange();
    }
  });
}

// ─── LN ĐƠN NHP TRN MOBILE / WEB ───────────────────────────────────────
const btnOpenMobileDraftModal = document.getElementById('btn-open-mobile-draft-modal');
const mobileDraftModal = document.getElementById('mobile-draft-modal');
const closeMobileDraftModal = document.getElementById('close-mobile-draft-modal');
const cancelMobileDraftBtn = document.getElementById('cancel-mobile-draft-btn');
const mobileDraftForm = document.getElementById('mobile-draft-form');
const btnParseMobileRaw = document.getElementById('btn-parse-mobile-raw');

if (btnOpenMobileDraftModal) {
  btnOpenMobileDraftModal.addEventListener('click', () => {
    if (mobileDraftModal) mobileDraftModal.classList.remove('hidden');
  });
}

function closeMobileDraft() {
  if (mobileDraftModal) mobileDraftModal.classList.add('hidden');
}

if (closeMobileDraftModal) closeMobileDraftModal.addEventListener('click', closeMobileDraft);
if (cancelMobileDraftBtn) cancelMobileDraftBtn.addEventListener('click', closeMobileDraft);

if (btnParseMobileRaw) {
  btnParseMobileRaw.addEventListener('click', () => {
    const raw = (document.getElementById('mobile-raw-text')?.value || '').trim();
    if (!raw) return alert('Vui lòng dán văn bản chốt đơn vào trước!');

    let result = null;
    if (typeof runLocalComputerParser === 'function') {
      result = runLocalComputerParser(raw);
    }

    if (result) {
      document.getElementById('mobile-cust-name').value = result.name || '';
      document.getElementById('mobile-cust-phone').value = result.phone || '';
      document.getElementById('mobile-cust-address').value =
        result.address && result.address !== 'không tìm thấy' ? result.address : '';
      document.getElementById('mobile-order-code').value = result.orderCode || '';
      document.getElementById('mobile-cod-amount').value = result.codAmount || 0;
      if (result.extraNote) {
        document.getElementById('mobile-extra-note').value = result.extraNote;
      }
    } else {
      alert('Không thể bóc tách. Vui lòng kiểm tra lại nội dung dán.');
    }
  });
}

if (mobileDraftForm) {
  mobileDraftForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = (document.getElementById('mobile-cust-name')?.value || '').trim();
    const phone = (document.getElementById('mobile-cust-phone')?.value || '').trim();
    const address = (document.getElementById('mobile-cust-address')?.value || '').trim();
    const orderCode = (document.getElementById('mobile-order-code')?.value || '').trim();
    const codAmount = Number(document.getElementById('mobile-cod-amount')?.value || 0);
    const platform = document.getElementById('mobile-platform')?.value || 'vnpost';
    const extraNote = (document.getElementById('mobile-extra-note')?.value || '').trim();

    if (!name || !phone || !address) {
      return alert('Vui lòng điền đủ Tên, SĐT và Địa chỉ!');
    }

    const draftItem = {
      id: 'ord_mob_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name,
      phone,
      address,
      orderCode,
      codAmount,
      platform,
      extraNote,
      deviceName: 'Mobile Web App ',
      createdAt: new Date().toISOString()
    };

    try {
      if (window.supabaseClient) {
        await window.supabaseClient.from('orders').insert([{
          device_id: 'mobile_app',
          device_name: 'Mobile Web App ',
          customer_name: name,
          phone,
          address,
          cod_amount: codAmount,
          platform,
          order_code: orderCode,
          result: JSON.stringify(draftItem),
          created_at: new Date().toISOString()
        }]);
      }

      alert('Đã lên đơn nháp thành công! Đơn đã tự động đồng bộ sang Extension trên Máy tính.');
      mobileDraftForm.reset();
      closeMobileDraft();
      if (typeof fetchAllData === 'function') fetchAllData();
    } catch (err) {
      alert('❌ Lỗi khi gửi đơn nháp: ' + err.message);
    }
  });
}



// ==========================================
// GLOBAL ORDER PAYLOAD DETAIL DRAWER
// ==========================================

let _opdCurrentOrderId = null;

function openOrderPayloadDrawer(id) {
  const item = (allOrders || []).find(o => String(o.id) === String(id));
  if (!item) return;

  _opdCurrentOrderId = id;

  let res = item.result || {};
  if (typeof res === 'string') { try { res = JSON.parse(res); } catch(e) {} }

  const name     = item.customer_name || res.name || res.recipientName || res.hoTen || '';
  const phone    = item.phone || res.phone || res.recipientPhone || res.sdt || '';
  const address  = item.address || res.normalizedAddress || res.address || res.diaChi || '';
  const orderCode = item.order_code || res.orderCode || res.maDon || res.orderNo || '';
  const waybill  = item.waybill_code || item.tracking_code || item.ma_van_don || res.waybillCode || res.maVanDon || res.trackingCode || '';
  const cod      = Number(res.codAmount || item.cod_amount || res.cod || 0);
  const collectFee = res.collectFee ? 'Thu CướC: C' : 'Thu CướC: KHàng';
  const platform = (res.platform || item.platform || 'vnpost').toLowerCase();
  const platformLabel = platform.includes('jt') ? ' J&T Express' : ' VNPost Bưu Điện';
  const device   = item.device_name || item.deviceName || '';
  const rawText  = item.raw_text || item.rawText || res.rawText || '';
  const timeStr  = item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '';

  // Populate fields
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('opd-title',       `${name}  ${orderCode !== '' ? orderCode : 'Chưa C Mã'}`);
  set('opd-name',        name);
  set('opd-phone',       phone);
  set('opd-cod',         cod > 0 ? cod.toLocaleString('vi-VN') + ' đ' : '0 đ');
  set('opd-collectfee',  collectFee);
  set('opd-address',     address);
  set('opd-ordercode',   orderCode);
  set('opd-waybill',     waybill);
  set('opd-platform',    platformLabel);
  set('opd-time',        timeStr);
  set('opd-device',      device !== '' ? `Máy: ${device}` : '');
  set('opd-raw-text',    rawText);


  // Copy waybill button
  const copyWaybillBtn = document.getElementById('opd-copy-waybill');
  if (copyWaybillBtn) {
    const hasWaybill = waybill && waybill !== '';
    copyWaybillBtn.classList.toggle('hidden', !hasWaybill);
    copyWaybillBtn.onclick = () => {
      navigator.clipboard.writeText(waybill).then(() => {
        copyWaybillBtn.innerHTML = '<i class="ph ph-check text-sm text-emerald-500"></i>';
        setTimeout(() => { copyWaybillBtn.innerHTML = '<i class="ph ph-copy text-sm"></i>'; }, 1500);
      });
    };
  }

  // Wire footer buttons
  const editBtn = document.getElementById('opd-btn-edit');
  if (editBtn) editBtn.onclick = () => { closeOrderPayloadDrawer(); viewOrderDetails(id); };

  const copyAllBtn = document.getElementById('opd-btn-copy-all');
  if (copyAllBtn) {
    copyAllBtn.onclick = () => {
      const text = `Khách: ${name}\nSĐT: ${phone}\nĐịa chỉ: ${address}\nMã đơn: ${orderCode}\nMã vận đơn: ${waybill}\nCOD: ${cod > 0 ? cod.toLocaleString('vi-VN') : 0} đ`;
      navigator.clipboard.writeText(text).then(() => {
        copyAllBtn.innerHTML = '<i class="ph ph-check text-sm text-emerald-500"></i> Đã sao chép!';
        setTimeout(() => { copyAllBtn.innerHTML = '<i class="ph ph-copy text-sm"></i> Sao Chép Thông Tin'; }, 1800);
      });
    };
  }

  const deleteBtn = document.getElementById('opd-btn-delete');
  if (deleteBtn) deleteBtn.onclick = () => { closeOrderPayloadDrawer(); deleteOrder(id); };

  // Open animation
  const drawer = document.getElementById('order-payload-drawer');
  const backdrop = document.getElementById('order-payload-backdrop');
  const panel = document.getElementById('order-payload-panel');
  if (!drawer) return;

  drawer.classList.remove('hidden');
  drawer.removeAttribute('aria-hidden');
  requestAnimationFrame(() => {
    if (backdrop) backdrop.classList.remove('opacity-0');
    if (panel) panel.classList.remove('translate-x-full');
  });
}

function closeOrderPayloadDrawer() {
  const drawer = document.getElementById('order-payload-drawer');
  const backdrop = document.getElementById('order-payload-backdrop');
  const panel = document.getElementById('order-payload-panel');
  if (!drawer) return;

  if (backdrop) backdrop.classList.add('opacity-0');
  if (panel) panel.classList.add('translate-x-full');

  setTimeout(() => {
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    _opdCurrentOrderId = null;
  }, 300);
}

// Wire close button & backdrop click
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('order-payload-close');
  const backdrop = document.getElementById('order-payload-backdrop');
  if (closeBtn) closeBtn.addEventListener('click', closeOrderPayloadDrawer);
  if (backdrop) backdrop.addEventListener('click', closeOrderPayloadDrawer);

  // Keyboard: Escape closes drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _opdCurrentOrderId) closeOrderPayloadDrawer();
  });
});

// Patch renderOrders: add click-on-row to open drawer (after render)
// We intercept desktopTableBody row clicks (excluding interactive elements)
const _origRenderOrders = typeof renderOrders === 'function' ? renderOrders : null;
function _wireOrderRowClicks() {
  if (!desktopTableBody) return;
  desktopTableBody.addEventListener('click', (e) => {
    // Igánore clicks on buttons, checkboxes, inputs, anchors
    if (e.target.closest('button, input, a, select')) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    const id = tr.querySelector('.order-checkbox')?.dataset?.id;
    if (id) openOrderPayloadDrawer(id);
  });

  if (mobileOrdersContainer) {
    mobileOrdersContainer.addEventListener('click', (e) => {
      if (e.target.closest('button, input, a, select')) return;
      // Mobile cards don't have checkbox, find ID from nearest card's button onclick
      const card = e.target.closest('div[class*="rounded-xl"]');
      if (!card) return;
      const btn = card.querySelector('button[onclick*="viewOrderDetails"]');
      if (!btn) return;
      const Mã = btn.getAttribute('onclick')?.match(/viewOrderDetails\('([^']+)'\)/);
      if (Mã) openOrderPayloadDrawer(Mã[1]);
    });
  }
}
// Wire after DOM ready
document.addEventListener('DOMContentLoaded', _wireOrderRowClicks);


// Lắng nghe thay đổi theme (phục vụ dark mode toggle)
document.addEventListener('theme-changed', (e) => {
  const isDark = e.detail.isDark;
  
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = isDark ? '#94A3B8' : '#64748B';
    Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0';
    
    if (revenueChartInstance) {
       revenueChartInstance.options.scales.x.grid.color = isDark ? 'rgba(255, 255, 255, 0.05)' : '#E2E8F0';
       revenueChartInstance.options.scales.y.grid.color = isDark ? 'rgba(255, 255, 255, 0.05)' : '#E2E8F0';
       revenueChartInstance.options.scales.x.ticks.color = isDark ? '#94A3B8' : '#64748B';
       revenueChartInstance.options.scales.y.ticks.color = isDark ? '#94A3B8' : '#64748B';
       revenueChartInstance.update();
    }
    if (ordersChartInstance) {
       ordersChartInstance.options.plugins.legend.labels.color = isDark ? '#94A3B8' : '#64748B';
       ordersChartInstance.data.datasets[0].borderColor = isDark ? '#020617' : '#FFFFFF';
       ordersChartInstance.update();
    }
  }
});
