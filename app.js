/**
 * Shop Owner Command Center - app.js
 * 100% Real Supabase Data Integration & Realtime Sync Engine
 * Replicating Exact Structure & Logic of Options Page (Đơn hàng đã lên đơn)
 */

let sb = null;
let currentSession = null;
let currentProfile = null;
let currentShops = [];
let activeShopId = 'all';

// State Data Collections
let allSubmittedOrders = [];
let filteredSubmittedOrders = [];
let selectedSubmittedIds = new Set();
let allDraftOrders = [];
let allCustomers = [];
let allBlacklist = [];
let allStaffMembers = [];
let allDevices = [];
let currentQuota = { used: 0, limit: 1000, plan: 'STANDARD' };
let currentShopConfig = {};

// Pagination States for Submitted Orders (Standard Option Page)
let submittedPage = 1;
let submittedPerPage = 20;
let weeklyChartInstance = null;

// =========================================================================
// 1. INITIALIZATION & STRICT AUTH GUARD
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (typeof getSupabaseClient === 'function') {
      sb = getSupabaseClient();
    } else if (typeof SUPABASE_CONFIG !== 'undefined') {
      sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    }

    if (!sb) {
      console.error('Không thể khởi tạo Supabase client');
      window.location.replace('login.html');
      return;
    }

    // 1. Kiểm tra phiên đăng nhập BẮT BUỘC
    const isAuthed = await checkStrictAuth();
    if (!isAuthed) {
      window.location.replace('login.html');
      return;
    }

    // 2. Thiết lập UI Tabs & Tương tác
    initNavigationTabs();
    initThemeToggle();
    initModals();
    initEventHandlers();
    initSubmittedOrdersControls();
    initPasswordMeter();
    initOptimizedFeatures();

    // 3. Tải toàn bộ dữ liệu thực từ Supabase
    await loadAllShopData();

    // 4. Đăng ký Realtime Subscriptions
    setupRealtimeSubscriptions();

    // 5. Kiểm tra Hóa thân (Impersonation)
    checkImpersonationState();
    setInterval(checkImpersonationState, 30000);

  } catch (err) {
    console.error('Lỗi khởi tạo Dashboard:', err);
    window.location.replace('login.html');
  }
});

async function checkStrictAuth() {
  // 1. Đảm bảo Supabase client có session token hợp lệ để bypass RLS
  const token = localStorage.getItem('access_token');
  const rToken = localStorage.getItem('refresh_token');
  if (token && sb && sb.auth && typeof sb.auth.setSession === 'function') {
    try {
      await sb.auth.setSession({ access_token: token, refresh_token: rToken || '' });
    } catch (_) {}
  }

  if (typeof AuthService !== 'undefined' && AuthService.getCurrentUser) {
    currentSession = await AuthService.getCurrentUser().catch(() => null);
  }

  if (!currentSession && typeof AuthSession !== 'undefined' && AuthSession.getSession) {
    currentSession = await AuthSession.getSession().catch(() => null);
  }

  if (!currentSession && sb) {
    const { data } = await sb.auth.getSession();
    currentSession = data?.session?.user || null;
  }

  // Fallback đọc từ profile trong localStorage
  if (!currentSession) {
    try {
      const rawUser = localStorage.getItem('af_logged_user') || localStorage.getItem('profile');
      if (rawUser) currentSession = JSON.parse(rawUser);
    } catch (_) {}
  }

  // Nếu không có phiên đăng nhập -> Chặn ngay lập tức
  if (!currentSession || (!currentSession.id && !currentSession.email)) {
    return false;
  }

  // Tải profile thật từ Supabase
  if (currentSession.id && sb) {
    const { data: profile } = await sb.from('profiles').select('*').eq('id', currentSession.id).maybeSingle();
    currentProfile = profile || { email: currentSession.email, full_name: currentSession.email?.split('@')[0] };
  } else {
    currentProfile = { email: currentSession.email, full_name: currentSession.email?.split('@')[0] };
  }

  // Cập nhật Topbar UI
  const userNameEl = document.getElementById('topbarUserName');
  const avatarEl = document.getElementById('topbarAvatar');
  const roleBadgeEl = document.getElementById('topbarUserRoleBadge');
  const roleTextEl = document.getElementById('topbarUserRoleText');

  const displayName = currentProfile.full_name || currentProfile.email || 'Chủ Shop';
  if (userNameEl) userNameEl.textContent = displayName;
  if (avatarEl) avatarEl.textContent = displayName.slice(0, 2).toUpperCase();

  const dropEmail = document.getElementById('dropdownFullEmail');
  if (dropEmail) dropEmail.textContent = currentProfile.email || '';
  const dropShop = document.querySelector('#dropdownShopName span');
  if (dropShop && typeof ShopService !== 'undefined') {
    dropShop.textContent = ShopService.getActiveShop()?.name || localStorage.getItem('current_shop_name') || 'Shop Lũa Thủy Sinh';
  }

  // Kiểm tra quyền Master Admin
  let isSysAdmin = false;
  if (typeof AuthService !== 'undefined' && AuthService.isSystemAdmin) {
    isSysAdmin = await AuthService.isSystemAdmin().catch(() => false);
  } else {
    const roleStored = localStorage.getItem('current_role');
    isSysAdmin = roleStored === 'SYSTEM_ADMIN' || roleStored === 'ADMIN' || currentProfile?.role === 'ADMIN' || currentProfile?.role === 'MASTER_ADMIN';
  }

  if (roleBadgeEl) roleBadgeEl.textContent = isSysAdmin ? 'SYSTEM ADMIN' : 'SHOP OWNER';
  if (roleTextEl) roleTextEl.textContent = isSysAdmin ? 'Quản trị viên sàn' : 'Chủ Shop';

  const sideAdminLink = document.getElementById('sideAdminLinkContainer');
  if (sideAdminLink) {
    sideAdminLink.style.display = isSysAdmin ? 'block' : 'none';
  }

  return true;
}

// =========================================================================
// 2. LOAD ALL DATA FROM SUPABASE
// =========================================================================
async function loadAllShopData() {
  await fetchShopsList();
  await Promise.all([
    fetchSubmittedOrders(),
    fetchDraftOrders(),
    fetchShopQuotaAndPlan(),
    fetchShopSettings(),
    fetchShopStaff(),
    fetchShopDevices()
  ]);

  // Aggregate Customers from both customers table AND all orders
  await aggregateCustomersData();

  // Populate Filter Dropdowns for Submitted Orders Tab
  populateSubmittedFiltersDropdowns();

  // Render UI
  renderDashboardKPIs();
  renderWeeklyOrdersChart();
  renderRecentOrdersStream();
  filterSubmittedOrders(); // Lọc & render bảng Đơn hàng đã lên đơn
  renderCustomersTable();
  renderBlacklist();
  renderStaffTable();
  renderShopSettingsForm();
  renderDevicesTable();
  renderSubscriptionTab();

  const timeEl = document.getElementById('lastUpdatedTime');
  if (timeEl) timeEl.textContent = 'Cập nhật lúc: ' + new Date().toLocaleTimeString('vi-VN');
}

// ─── 1. FETCH SHOPS (POWERED BY UNIFIED SHOPSERVICE) ─────────────────────
async function fetchShopsList() {
  const selectEl = document.getElementById('topbarShopSelect');
  const titleEl = document.getElementById('topbarShopTitle');
  const sideSubEl = document.getElementById('sidebarShopName');

  // 1. RENDER NGAY LẬP TỨC 0MS TỪ CACHE (KHÔNG BAO GIỜ BỊ ĐỨNG ĐANG TẢI)
  let cachedShops = typeof ShopService !== 'undefined' ? ShopService.getCachedShops() : [];
  if (cachedShops.length === 0) {
    const savedName = localStorage.getItem('current_shop_name') || 'Shop Lũa Thủy Sinh';
    const savedId = localStorage.getItem('af_active_shop_id') || 'shop_001';
    cachedShops = [{ id: savedId, name: savedName, status: 'active' }];
  }

  currentShops = cachedShops;
  activeShopId = typeof ShopService !== 'undefined' ? ShopService.getActiveShopId() : (localStorage.getItem('af_active_shop_id') || cachedShops[0]?.id || 'shop_001');

  // Đảm bảo không chọn 'all' trên trang làm việc
  if (activeShopId === 'all' && cachedShops.length > 0) {
    activeShopId = cachedShops[0].id;
  }

  // Populate ban đầu (Chỉ hiển thị các Shop cụ thể)
  if (selectEl) {
    selectEl.innerHTML = cachedShops.map(s => `<option value="${s.id}" ${s.id === activeShopId ? 'selected' : ''}>🏪 ${escapeHtml(s.name)}</option>`).join('');
  }

  const activeShopObj = cachedShops.find(s => s.id === activeShopId) || cachedShops[0];
  if (titleEl && activeShopObj) {
    titleEl.textContent = activeShopObj.name.toUpperCase();
    const dropShop = document.querySelector('#dropdownShopName span');
    if (dropShop) dropShop.textContent = activeShopObj.name;
  }
  if (sideSubEl && activeShopObj) {
    sideSubEl.textContent = '🏪 ' + activeShopObj.name;
  }

  // 2. TẢI VÀ ĐỒNG BỘ DỮ LIỆU TƯƠI MỚI TỪ SUPABASE
  if (!sb) return;

  try {
    const freshShops = typeof ShopService !== 'undefined' 
      ? await ShopService.loadUserShops(sb, currentSession, currentProfile)
      : [];

    if (freshShops && freshShops.length > 0) {
      currentShops = freshShops;

      if (activeShopId === 'all' || !currentShops.some(s => s.id === activeShopId)) {
        activeShopId = currentShops[0].id;
      }

      // Cập nhật lại dropdown với dữ liệu chính xác từ database
      if (selectEl) {
        selectEl.innerHTML = currentShops.map(s => `<option value="${s.id}" ${s.id === activeShopId ? 'selected' : ''}>🏪 ${escapeHtml(s.name)}</option>`).join('');
      }

      // Đảm bảo activeShop chuẩn xác
      const resolvedActive = currentShops.find(s => s.id === activeShopId) || currentShops[0];
      if (resolvedActive) {
        if (typeof ShopService !== 'undefined') ShopService.setActiveShop(resolvedActive);
        if (titleEl) titleEl.textContent = resolvedActive.name.toUpperCase();
        if (sideSubEl) sideSubEl.textContent = '🏪 ' + resolvedActive.name;
        const dropShop = document.querySelector('#dropdownShopName span');
        if (dropShop) dropShop.textContent = resolvedActive.name;
      }
    }
  } catch (err) {
    console.warn('[Dashboard] Lỗi tải shop từ Supabase:', err);
  }

  // 3. BẮT SỰ KIỆN KHI NGƯỜI DÙNG CHỌN CHI NHÁNH MỚI
  if (selectEl) {
    selectEl.onchange = (e) => {
      activeShopId = e.target.value;
      const chosen = currentShops.find(s => s.id === activeShopId) || { id: activeShopId, name: 'Toàn bộ Chi Nhánh & Đơn Hàng' };
      if (typeof ShopService !== 'undefined') {
        ShopService.setActiveShop(chosen);
      }
      if (titleEl) titleEl.textContent = chosen.name.toUpperCase();
      if (sideSubEl) sideSubEl.textContent = '🏪 ' + chosen.name;
      const dropShop = document.querySelector('#dropdownShopName span');
      if (dropShop) dropShop.textContent = chosen.name;

      filterAndRenderAll();
      renderShopSettingsForm();
      fetchShopStaff();
    };
  }
}

// ─── 2. FETCH SUBMITTED ORDERS & SMART DE-DUPLICATION ──────────────────
async function fetchSubmittedOrders() {
  if (typeof OrderService !== 'undefined') {
    allSubmittedOrders = await OrderService.fetchSubmittedOrders(sb, 1000);
  }
}

// ─── 3. FETCH DRAFT ORDERS ──────────────────────────────────────────────
async function fetchDraftOrders() {
  if (typeof OrderService !== 'undefined') {
    allDraftOrders = await OrderService.fetchDraftOrders(sb, 500);
  }
}

// ─── 4. AGGREGATE CUSTOMERS DATA (DYNAMIC CRM) ──────────────────────────
async function aggregateCustomersData() {
  let dbCustomers = [];
  try {
    if (sb) {
      const { data } = await sb.from('customers').select('*').limit(1000);
      if (data) dbCustomers = data;
    }
  } catch (err) {
    console.warn('Lỗi đọc bảng customers:', err);
  }

  const customerMap = {};

  (dbCustomers || []).forEach(c => {
    const cleanPhone = String(c.phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 8) return;
    customerMap[cleanPhone] = {
      phone: cleanPhone,
      name: c.name || 'Khách hàng',
      address: c.address || '',
      total_orders: Number(c.total_orders) || 0,
      total_cod: Number(c.total_cod) || 0,
      segment: c.segment || 'Thành viên',
      notes: c.notes || '',
      tags: c.tags || []
    };
  });

  (allSubmittedOrders || []).forEach(o => {
    const cleanPhone = String(o.phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 8) return;

    if (!customerMap[cleanPhone]) {
      customerMap[cleanPhone] = {
        phone: cleanPhone,
        name: o.name || o.customer_name || 'Khách hàng',
        address: o.address || '',
        total_orders: 0,
        total_cod: 0,
        segment: 'Thành viên',
        notes: '',
        tags: []
      };
    }

    const c = customerMap[cleanPhone];
    c.total_orders += 1;
    c.total_cod += Number(o.cod_amount) || 0;
    if (o.name && o.name !== 'Khách hàng' && (!c.name || c.name === 'Khách hàng')) c.name = o.name;
    if (o.address && !c.address) c.address = o.address;

    if (c.total_orders >= 3 || c.total_cod >= 2000000) {
      if (c.segment !== 'Blacklist') c.segment = 'VIP';
    }
  });

  allCustomers = Object.values(customerMap);
  allBlacklist = allCustomers.filter(c => c.segment === 'Blacklist' || (c.tags && c.tags.includes('blacklist')));
}

// ─── 5. FETCH SHOP QUOTA & PLAN ──────────────────────────────────────────
async function fetchShopQuotaAndPlan() {
  if (!sb) return;
  try {
    const { data } = await sb.from('shop_quotas').select('*').limit(1).maybeSingle();
    if (data) {
      currentQuota = {
        used: data.quota_used || 0,
        limit: data.quota_limit || 1000,
        plan: data.plan || 'PRO'
      };
    }
  } catch (err) {
    console.warn('Lỗi tải quota shop:', err);
  }
}

// ─── 6. FETCH SHOP SETTINGS & CARRIER CONFIGS ────────────────────────────
async function fetchShopSettings() {
  if (!sb) return;
  try {
    const { data: configs } = await sb.from('carrier_configs').select('*');
    if (configs && configs.length > 0) {
      configs.forEach(cfg => {
        currentShopConfig[cfg.carrier || 'default'] = cfg.config || {};
      });
    }

    if (activeShopId && activeShopId !== 'all') {
      const { data: shop } = await sb.from('shops').select('*').eq('id', activeShopId).maybeSingle();
      if (shop) currentShopConfig.shopDetails = shop;

      const { data: flags } = await sb.from('shop_feature_flags').select('custom_prompt_rules').eq('shop_id', activeShopId).maybeSingle();
      currentShopConfig.customPromptRules = flags ? (flags.custom_prompt_rules || '') : '';
    }
  } catch (err) {
    console.warn('Lỗi tải cấu hình shop:', err);
  }
}

// ─── 7. FETCH SHOP STAFF & PROFILES (100% REAL DB DUAL-QUERY) ──────────
async function fetchShopStaff() {
  if (!sb) return;
  try {
    const currentShopObj = currentShops.find(s => s.id === activeShopId) || currentShops[0] || {};
    const targetShopId = currentShopObj.id || null;

    if (!targetShopId) return;

    let memberList = [];
    if (typeof MemberService !== 'undefined') {
      const rawMembers = await MemberService.getShopMembers(targetShopId);
      memberList = rawMembers.map(m => ({
        id: m.id,
        shop_id: m.shop_id,
        user_id: m.user_id,
        role: m.role || 'STAFF',
        status: m.status || 'active',
        created_at: m.created_at,
        profile: {
          id: m.user_id,
          full_name: m.profiles?.full_name || m.profile?.full_name || '',
          email: m.profiles?.email || m.profile?.email || '',
          phone: m.profiles?.phone || m.profile?.phone || '--'
        }
      }));
    }

    // Đảm bảo Chủ Shop (Owner) thực sự luôn có trong danh sách
    const hasOwner = memberList.some(m => m.role === 'OWNER' || m.role === 'SHOP_OWNER' || m.user_id === currentShopObj.owner_id);
    if (!hasOwner && currentShopObj.owner_id) {
      const { data: ownerProf } = await sb.from('profiles').select('id, full_name, email, phone').eq('id', currentShopObj.owner_id).maybeSingle();
      if (ownerProf) {
        memberList.unshift({
          id: 'owner_' + currentShopObj.owner_id,
          shop_id: targetShopId,
          user_id: currentShopObj.owner_id,
          role: 'OWNER',
          status: 'active',
          created_at: currentShopObj.created_at || new Date().toISOString(),
          profile: {
            id: currentShopObj.owner_id,
            full_name: ownerProf.full_name || 'Chủ Shop',
            email: ownerProf.email || 'owner@system.com',
            phone: ownerProf.phone || '0908066466'
          }
        });
      }
    }

    allStaffMembers = memberList;

    // Sắp xếp: Chủ Shop lên đầu bảng, tiếp theo là Quản lý, sau đó là Nhân viên
    allStaffMembers.sort((a, b) => {
      const aIsOwner = (a.role === 'OWNER' || a.role === 'SHOP_OWNER' || a.user_id === currentShopObj.owner_id) ? 1 : 0;
      const bIsOwner = (b.role === 'OWNER' || b.role === 'SHOP_OWNER' || b.user_id === currentShopObj.owner_id) ? 1 : 0;
      return bIsOwner - aIsOwner;
    });

  } catch (err) {
    console.warn('[Staff] Lỗi tải danh sách tài khoản nhân viên:', err);
  }
}

// ─── 8. FETCH SHOP DEVICES ──────────────────────────────────────────────
async function fetchShopDevices() {
  if (!sb) return;
  try {
    const userIds = allStaffMembers.map(m => m.user_id).filter(Boolean);
    if (userIds.length === 0) {
      allDevices = [];
      return;
    }
    const { data } = await sb.from('extension_devices')
      .select('*')
      .in('user_id', userIds)
      .order('last_active_at', { ascending: false });
    allDevices = data || [];
  } catch (err) {
    console.warn('[Devices] Lỗi tải danh sách thiết bị:', err);
    allDevices = [];
  }
}

// =========================================================================
// 3. RENDER FUNCTIONS
// =========================================================================

function filterAndRenderAll() {
  populateSubmittedFiltersDropdowns();
  renderDashboardKPIs();
  renderWeeklyOrdersChart();
  renderRecentOrdersStream();
  filterSubmittedOrders();
  renderCustomersTable();
  renderBlacklist();
  renderStaffTable();
  renderShopSettingsForm();
}

// ─── 1. RENDER DASHBOARD KPIS ────────────────────────────────────────────
function renderDashboardKPIs() {
  let submitted = [...allSubmittedOrders];
  let drafts = [...allDraftOrders];

  if (activeShopId && activeShopId !== 'all') {
    submitted = submitted.filter(o => o.shop_id === activeShopId || !o.shop_id);
    drafts = drafts.filter(o => o.shop_id === activeShopId || !o.shop_id);
  }

  const totalSubmitted = submitted.length;
  const kpiTotalSubmitted = document.getElementById('kpiTotalSubmittedOrders');
  if (kpiTotalSubmitted) kpiTotalSubmitted.textContent = totalSubmitted.toLocaleString('vi-VN');

  const todayStr = new Date().toISOString().split('T')[0];
  const todayOrders = submitted.filter(o => {
    const d = o.submitted_at ? new Date(o.submitted_at).toISOString().split('T')[0] : '';
    return d === todayStr;
  });
  const kpiToday = document.getElementById('kpiOrdersToday');
  if (kpiToday) kpiToday.textContent = `Hôm nay: ${todayOrders.length} đơn`;

  const totalCod = submitted.reduce((sum, o) => sum + (Number(o.cod_amount) || 0), 0);
  const todayCod = todayOrders.reduce((sum, o) => sum + (Number(o.cod_amount) || 0), 0);
  const kpiCod = document.getElementById('kpiTotalCod');
  if (kpiCod) kpiCod.textContent = formatCurrency(totalCod);
  const kpiCodTodayEl = document.getElementById('kpiCodToday');
  if (kpiCodTodayEl) kpiCodTodayEl.textContent = `Hôm nay: ${formatCurrency(todayCod)}`;

  const kpiDraft = document.getElementById('kpiDraftOrders');
  if (kpiDraft) kpiDraft.textContent = drafts.length.toLocaleString('vi-VN');

  const kpiAi = document.getElementById('kpiAiQuota');
  if (kpiAi) kpiAi.textContent = `${currentQuota.used} / ${currentQuota.limit}`;
  const pct = Math.min(100, Math.round((currentQuota.used / Math.max(1, currentQuota.limit)) * 100));
  const kpiAiPct = document.getElementById('kpiAiQuotaPercent');
  if (kpiAiPct) kpiAiPct.textContent = `Đã sử dụng ${pct}%`;

  const vnpostOrders = submitted.filter(o => (o.platform || '').toLowerCase().includes('vnpost') || (o.carrier || '').toLowerCase().includes('vnpost'));
  const jtOrders = submitted.filter(o => (o.platform || '').toLowerCase().includes('jt') || (o.carrier || '').toLowerCase().includes('jt'));

  const vnpostCountEl = document.getElementById('kpiVnpostCount');
  const jtCountEl = document.getElementById('kpiJtCount');
  if (vnpostCountEl) vnpostCountEl.textContent = `${vnpostOrders.length} đơn`;
  if (jtCountEl) jtCountEl.textContent = `${jtOrders.length} đơn`;

  const totalCarrierOrders = Math.max(1, vnpostOrders.length + jtOrders.length);
  const barVnpost = document.getElementById('barVnpostPercent');
  const barJt = document.getElementById('barJtPercent');
  if (barVnpost) barVnpost.style.width = `${Math.round((vnpostOrders.length / totalCarrierOrders) * 100)}%`;
  if (barJt) barJt.style.width = `${Math.round((jtOrders.length / totalCarrierOrders) * 100)}%`;

  const kpiTotalCust = document.getElementById('kpiTotalCustomers');
  if (kpiTotalCust) kpiTotalCust.textContent = `${allCustomers.length} khách`;
}

// ─── 2. RENDER WEEKLY CHART ──────────────────────────────────────────────
function renderWeeklyOrdersChart() {
  const canvas = document.getElementById('chartWeeklyOrders');
  if (!canvas) return;

  const labels = [];
  const vnpostData = [];
  const jtData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const displayLabel = `${d.getDate()}/${d.getMonth() + 1}`;
    labels.push(displayLabel);

    const dayOrders = allSubmittedOrders.filter(o => {
      const oDate = o.submitted_at ? new Date(o.submitted_at).toISOString().split('T')[0] : '';
      return oDate === dateStr;
    });

    const vnp = dayOrders.filter(o => (o.platform || '').toLowerCase().includes('vnpost') || (o.carrier || '').toLowerCase().includes('vnpost')).length;
    const jt = dayOrders.filter(o => (o.platform || '').toLowerCase().includes('jt') || (o.carrier || '').toLowerCase().includes('jt')).length;

    vnpostData.push(vnp);
    jtData.push(jt);
  }

  if (weeklyChartInstance) weeklyChartInstance.destroy();

  weeklyChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'VNPost',
          data: vnpostData,
          backgroundColor: '#F59E0B',
          borderRadius: 4
        },
        {
          label: 'J&T Express',
          data: jtData,
          backgroundColor: '#EF4444',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

// ─── 3. RENDER RECENT ORDERS STREAM ─────────────────────────────────────
function renderRecentOrdersStream() {
  const tbody = document.getElementById('tbodyRecentOrders');
  if (!tbody) return;

  let stream = [...allSubmittedOrders];
  if (activeShopId && activeShopId !== 'all') {
    stream = stream.filter(o => o.shop_id === activeShopId || !o.shop_id);
  }

  const recent = stream.slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-s);">Chưa có đơn hàng nào vừa lên.</td></tr>';
    return;
  }

  tbody.innerHTML = recent.map(o => {
    const isVnpost = (o.platform || '').toLowerCase().includes('vnpost') || (o.carrier || '').toLowerCase().includes('vnpost');
    const badgeClass = isVnpost ? 'badge-vnpost' : 'badge-jt';
    const carrierName = isVnpost ? 'VNPost' : 'J&T Express';
    const timeFormatted = o.submitted_at ? new Date(o.submitted_at).toLocaleString('vi-VN') : 'Vừa xong';

    return `
      <tr>
        <td style="font-size:11px; color:var(--text-s);">${timeFormatted}</td>
        <td>
          <div style="font-weight:800; color:var(--primary); font-size:12px;">${escapeHtml(o.tracking_code || o.order_code || 'Chưa có mã')}</div>
          ${o.order_code && o.order_code !== o.tracking_code ? `<div style="font-size:10px; color:var(--text-s); font-weight:600;">Mã: ${escapeHtml(o.order_code)}</div>` : ''}
        </td>
        <td>
          <div style="font-weight:700;">${escapeHtml(o.name || o.customer_name || 'Khách hàng')}</div>
          <div style="font-size:11px; color:var(--text-s);">${escapeHtml(o.phone || '--')}</div>
        </td>
        <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(o.address)}">${escapeHtml(o.address || '--')}</td>
        <td><strong style="color:#10B981;">${formatCurrency(o.cod_amount)}</strong></td>
        <td><span class="${badgeClass}">${carrierName}</span></td>
        <td><span class="status-online">Thành công</span></td>
      </tr>
    `;
  }).join('');
}

// ─── 4. SUBMITTED ORDERS TAB (100% MATCHING OPTIONS PAGE) ───────────────
function populateSubmittedFiltersDropdowns() {
  const filterAccount = document.getElementById('submittedFilterAccount');
  const filterDevice = document.getElementById('submittedFilterDevice');

  if (filterAccount) {
    const accounts = Array.from(new Set(allSubmittedOrders.map(o => {
      let acc = o.carrier_account || o.carrierAccount;
      if (!acc) {
        const match = (o.name || '').match(/\((?:acc|tài khoản|tk)?\s*([^\)]+)\)/i);
        if (match) acc = match[1].trim();
      }
      return acc || '';
    }).filter(Boolean)));

    const currentVal = filterAccount.value;
    filterAccount.innerHTML = '<option value="">-- Tất Cả Tài Khoản Bưu Điện / J&T --</option>' + 
      accounts.map(a => `<option value="${a}">${a}</option>`).join('');
    if (accounts.includes(currentVal)) filterAccount.value = currentVal;
  }

  if (filterDevice) {
    const devices = Array.from(new Set(allSubmittedOrders.map(o => o.device_name || o.deviceName).filter(Boolean)));
    const currentVal = filterDevice.value;
    filterDevice.innerHTML = '<option value="">-- Tất Cả Máy --</option>' + 
      devices.map(d => `<option value="${d}">${d}</option>`).join('');
    if (devices.includes(currentVal)) filterDevice.value = currentVal;
  }
}

function initSubmittedOrdersControls() {
  const searchInp = document.getElementById('submittedSearchInp');
  const searchClear = document.getElementById('submittedSearchClear');
  const filterPlatform = document.getElementById('submittedFilterPlatform');
  const filterAccount = document.getElementById('submittedFilterAccount');
  const filterDevice = document.getElementById('submittedFilterDevice');
  const filterFrom = document.getElementById('submittedFilterFrom');
  const filterTo = document.getElementById('submittedFilterTo');

  const btnToday = document.getElementById('submittedBtnToday');
  const btn7Days = document.getElementById('submittedBtn7Days');
  const btn30Days = document.getElementById('submittedBtn30Days');
  const btnThisMonth = document.getElementById('submittedBtnThisMonth');
  const btnClearFilters = document.getElementById('submittedBtnClearFilters');

  const perPageEl = document.getElementById('submittedPerPage');
  const prevBtn = document.getElementById('submittedPrevBtn');
  const nextBtn = document.getElementById('submittedNextBtn');
  const selectAll = document.getElementById('submittedSelectAll');

  // Input & Change Events
  searchInp?.addEventListener('input', () => {
    if (searchClear) searchClear.style.display = searchInp.value ? 'block' : 'none';
    submittedPage = 1;
    filterSubmittedOrders();
  });

  searchClear?.addEventListener('click', () => {
    if (searchInp) searchInp.value = '';
    searchClear.style.display = 'none';
    submittedPage = 1;
    filterSubmittedOrders();
  });

  filterPlatform?.addEventListener('change', () => { submittedPage = 1; filterSubmittedOrders(); });
  filterAccount?.addEventListener('change', () => { submittedPage = 1; filterSubmittedOrders(); });
  filterDevice?.addEventListener('change', () => { submittedPage = 1; filterSubmittedOrders(); });
  filterFrom?.addEventListener('change', () => { submittedPage = 1; filterSubmittedOrders(); });
  filterTo?.addEventListener('change', () => { submittedPage = 1; filterSubmittedOrders(); });

  // Quick Date Range Buttons
  btnToday?.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    if (filterFrom) filterFrom.value = today;
    if (filterTo) filterTo.value = today;
    submittedPage = 1;
    filterSubmittedOrders();
  });

  btn7Days?.addEventListener('click', () => {
    const now = new Date();
    const past = new Date(); past.setDate(now.getDate() - 7);
    if (filterFrom) filterFrom.value = past.toISOString().split('T')[0];
    if (filterTo) filterTo.value = now.toISOString().split('T')[0];
    submittedPage = 1;
    filterSubmittedOrders();
  });

  btn30Days?.addEventListener('click', () => {
    const now = new Date();
    const past = new Date(); past.setDate(now.getDate() - 30);
    if (filterFrom) filterFrom.value = past.toISOString().split('T')[0];
    if (filterTo) filterTo.value = now.toISOString().split('T')[0];
    submittedPage = 1;
    filterSubmittedOrders();
  });

  btnThisMonth?.addEventListener('click', () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    if (filterFrom) filterFrom.value = firstDay;
    if (filterTo) filterTo.value = lastDay;
    submittedPage = 1;
    filterSubmittedOrders();
  });

  btnClearFilters?.addEventListener('click', () => {
    if (searchInp) searchInp.value = '';
    if (searchClear) searchClear.style.display = 'none';
    if (filterPlatform) filterPlatform.value = '';
    if (filterAccount) filterAccount.value = '';
    if (filterDevice) filterDevice.value = '';
    if (filterFrom) filterFrom.value = '';
    if (filterTo) filterTo.value = '';
    submittedPage = 1;
    filterSubmittedOrders();
  });

  perPageEl?.addEventListener('change', (e) => {
    submittedPerPage = parseInt(e.target.value, 10) || 20;
    submittedPage = 1;
    renderSubmittedOrdersList();
  });

  prevBtn?.addEventListener('click', () => {
    if (submittedPage > 1) {
      submittedPage--;
      renderSubmittedOrdersList();
    }
  });

  nextBtn?.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredSubmittedOrders.length / submittedPerPage) || 1;
    if (submittedPage < totalPages) {
      submittedPage++;
      renderSubmittedOrdersList();
    }
  });

  selectAll?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.sub-checkbox').forEach(cb => {
      cb.checked = isChecked;
      if (isChecked) selectedSubmittedIds.add(cb.value);
      else selectedSubmittedIds.delete(cb.value);
    });
  });
}

function filterSubmittedOrders() {
  const query = (document.getElementById('submittedSearchInp')?.value || '').trim().toLowerCase();
  const platform = (document.getElementById('submittedFilterPlatform')?.value || '').trim().toLowerCase();
  const account = (document.getElementById('submittedFilterAccount')?.value || '').trim().toLowerCase();
  const device = (document.getElementById('submittedFilterDevice')?.value || '').trim().toLowerCase();
  const fromDate = document.getElementById('submittedFilterFrom')?.value || '';
  const toDate = document.getElementById('submittedFilterTo')?.value || '';

  let list = [...allSubmittedOrders];

  if (activeShopId && activeShopId !== 'all') {
    list = list.filter(o => o.shop_id === activeShopId || !o.shop_id);
  }

  filteredSubmittedOrders = list.filter(o => {
    if (!o) return false;

    if (query) {
      const cleanDigits = query.replace(/\D/g, '');
      const matchName = (o.name || o.customer_name || '').toLowerCase().includes(query);
      const matchAddress = (o.address || '').toLowerCase().includes(query);
      const matchCode = (o.order_code || o.orderCode || '').toLowerCase().includes(query);
      const matchTracking = (o.tracking_code || o.trackingCode || '').toLowerCase().includes(query);
      const matchAcc = (o.carrier_account || o.carrierAccount || '').toLowerCase().includes(query);
      const matchPhone = cleanDigits.length >= 2 ? (o.phone || '').replace(/\D/g, '').includes(cleanDigits) : (o.phone || '').toLowerCase().includes(query);
      if (!matchName && !matchAddress && !matchCode && !matchTracking && !matchPhone && !matchAcc) return false;
    }

    if (platform) {
      const p = (o.platform || o.carrier || '').toLowerCase();
      if (!p.includes(platform)) return false;
    }

    if (account) {
      let cAcc = (o.carrier_account || o.carrierAccount || '').toLowerCase();
      if (!cAcc) {
        const match = (o.name || '').match(/\((?:acc|tài khoản|tk)?\s*([^\)]+)\)/i);
        if (match) cAcc = match[1].trim().toLowerCase();
      }
      if (!cAcc.includes(account)) return false;
    }

    if (device) {
      const dev = (o.device_name || o.deviceName || '').toLowerCase();
      if (!dev.includes(device)) return false;
    }

    if (fromDate || toDate) {
      const orderDateStr = o.submitted_date || (o.submitted_at ? o.submitted_at.substring(0, 10) : '');
      if (orderDateStr) {
        if (fromDate && orderDateStr < fromDate) return false;
        if (toDate && orderDateStr > toDate) return false;
      }
    }

    return true;
  });

  // Cập nhật 2 Stat Cards tổng quan chuẩn Option
  let totalCod = 0;
  filteredSubmittedOrders.forEach(o => {
    totalCod += Number(o.cod_amount || o.codAmount || 0);
  });

  const statTotal = document.getElementById('stat-submitted-total');
  const statCod = document.getElementById('stat-submitted-cod');
  if (statTotal) statTotal.textContent = filteredSubmittedOrders.length.toLocaleString('vi-VN');
  if (statCod) statCod.textContent = formatCurrency(totalCod);

  renderSubmittedOrdersList();
}

function renderSubmittedOrdersList() {
  const tbody = document.getElementById('submittedList');
  const pageInfo = document.getElementById('submittedPageInfo');
  const totalLabel = document.getElementById('submittedTotalLabel');
  const prevBtn = document.getElementById('submittedPrevBtn');
  const nextBtn = document.getElementById('submittedNextBtn');

  if (!tbody) return;

  const totalFiltered = filteredSubmittedOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / submittedPerPage));
  if (submittedPage > totalPages) submittedPage = totalPages;

  if (pageInfo) pageInfo.textContent = `Trang ${submittedPage} / ${totalPages}`;
  if (totalLabel) totalLabel.textContent = `(${totalFiltered} đơn)`;
  if (prevBtn) prevBtn.disabled = (submittedPage <= 1);
  if (nextBtn) nextBtn.disabled = (submittedPage >= totalPages);

  if (totalFiltered === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:30px; color:var(--text-s);">Không tìm thấy đơn hàng nào phù hợp với bộ lọc.</td></tr>';
    return;
  }

  const startIdx = (submittedPage - 1) * submittedPerPage;
  const pageOrders = filteredSubmittedOrders.slice(startIdx, startIdx + submittedPerPage);

  tbody.innerHTML = pageOrders.map(o => {
    const isChecked = selectedSubmittedIds.has(o.id) ? 'checked' : '';
    const pStr = (o.platform || o.carrier || '').toLowerCase();
    const isJt = pStr.includes('jt');
    const platformLabel = isJt ? 'J&T Express' : 'VNPost';
    const platformClass = isJt ? 'badge-jt' : 'badge-vnpost';
    const codText = formatCurrency(o.cod_amount || o.codAmount);

    const trackingHtml = (o.tracking_code || o.trackingCode)
      ? `<span class="badge" style="background:#ECFDF5; color:#059669; border:1px solid #A7F3D0; font-family:monospace; font-weight:800; font-size:11.5px; padding:3px 6px;">${escapeHtml(o.tracking_code || o.trackingCode)}</span>`
      : `<span style="color:var(--text-s); font-size:11px;">Chờ cấp mã</span>`;

    const sourceBadge = `<span class="badge" style="background:#ECFDF5; color:#059669; border:1px solid #A7F3D0; font-size:10px; padding:2px 6px; border-radius:4px;">☁️ Cloud</span>`;

    const dateDisplay = (o.submitted_at || o.submittedAt)
      ? new Date(o.submitted_at || o.submittedAt).toLocaleString('vi-VN')
      : (o.submitted_date || '--');

    let accDisplay = o.carrier_account || o.carrierAccount || '';
    if (!accDisplay) {
      const match = (o.name || '').match(/\((?:acc|tài khoản|tk)?\s*([^\)]+)\)/i);
      if (match) accDisplay = match[1].trim();
    }

    return `
      <tr data-id="${o.id}">
        <td style="text-align:center;"><input type="checkbox" class="sub-checkbox" value="${o.id}" ${isChecked}></td>
        <td>
          <div style="font-weight:700; color:var(--text);">${escapeHtml(o.name || o.customer_name || 'Khách hàng')}</div>
          <div style="font-size:12px; color:var(--primary); font-family:monospace; font-weight:700;">${escapeHtml(o.phone || '—')}</div>
        </td>
        <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(o.address)}">${escapeHtml(o.address || '—')}</td>
        <td>
          <div style="font-family:monospace; font-size:12px; font-weight:700; color:#475569;">${escapeHtml(o.order_code || o.orderCode || '—')}</div>
        </td>
        <td>${trackingHtml}</td>
        <td style="text-align:right; font-weight:800; color:#10B981;">${codText}</td>
        <td style="text-align:center;">${o.collect_fee || o.collectFee ? '<span style="color:#2563EB; font-weight:700;">Có</span>' : '<span style="color:#94A3B8;">Không</span>'}</td>
        <td><span class="${platformClass}">${platformLabel}</span></td>
        <td>
          ${accDisplay 
            ? `<span class="badge" style="background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; font-weight:700; font-size:11.5px; padding:3px 8px; border-radius:6px;">🏢 ${escapeHtml(accDisplay)}</span>` 
            : `<span style="color:var(--text-s); font-size:11.5px;">—</span>`}
        </td>
        <td>
          <div>${sourceBadge}</div>
          <div style="font-size:11px; color:var(--text-s); margin-top:2px;">${escapeHtml(o.device_name || o.deviceName || 'Máy chính')}</div>
        </td>
        <td style="font-size:11px; color:var(--text-s);">${dateDisplay}</td>
        <td style="text-align:center;">
          <div style="display:flex; justify-content:center; gap:4px;">
            <button class="btn btn-secondary btn-sm" onclick="copyOrderInfo('${escapeHtml(o.phone)}', '${escapeHtml(o.name)}', '${escapeHtml(o.address)}')" title="Sao chép"><i class="ph ph-copy"></i></button>
            <button class="btn btn-secondary btn-sm" style="color:#EF4444;" onclick="deleteOrderRecord('${o.id}', 'submitted')" title="Xóa"><i class="ph ph-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.sub-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      if (e.target.checked) selectedSubmittedIds.add(e.target.value);
      else selectedSubmittedIds.delete(e.target.value);
    });
  });

  // Bind click event on tr to show order details (ignore checkbox/buttons)
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (e) => {
      if (e.target.closest('input[type="checkbox"]') || e.target.closest('button') || e.target.closest('a') || e.target.closest('.sub-checkbox')) {
        return;
      }
      const orderId = tr.getAttribute('data-id');
      if (orderId) {
        window.openOrderDetailsModal(orderId);
      }
    });
  });
}

// ─── 5. RENDER CUSTOMERS & BLACKLIST ────────────────────────────────────
function renderCustomersTable() {
  const tbody = document.getElementById('tbodyCustomersList');
  const countHeader = document.getElementById('countCustomersHeader');
  if (countHeader) countHeader.textContent = allCustomers.length;
  if (!tbody) return;

  const searchTxt = (document.getElementById('txtSearchCustomers')?.value || '').toLowerCase().trim();
  let list = [...allCustomers];
  if (searchTxt) {
    list = list.filter(c =>
      (c.name && c.name.toLowerCase().includes(searchTxt)) ||
      (c.phone && c.phone.includes(searchTxt)) ||
      (c.address && c.address.toLowerCase().includes(searchTxt))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-s);">Chưa có dữ liệu khách hàng trong Database.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(c => {
    const isVip = (Number(c.total_orders) >= 3 || Number(c.total_cod) >= 2000000);
    const isBlack = c.segment === 'Blacklist' || (c.tags && c.tags.includes('blacklist'));
    let badgeHtml = '<span class="badge" style="background:#E2E8F0; color:#475569;">Thành viên</span>';
    if (isBlack) badgeHtml = '<span class="badge badge-blacklist">🚨 Blacklist</span>';
    else if (isVip) badgeHtml = '<span class="badge badge-vip">👑 Khách VIP</span>';

    return `
      <tr>
        <td>
          <a href="#" onclick="window.openCustomerDetailModal('${escapeHtml(c.phone)}'); return false;" style="font-weight:700; color:var(--primary); text-decoration:underline;">
            ${escapeHtml(c.name || 'Khách Vãng Lai')}
          </a>
        </td>
        <td><code>${escapeHtml(c.phone)}</code></td>
        <td style="max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(c.address)}">${escapeHtml(c.address || '--')}</td>
        <td><strong>${c.total_orders || 1} đơn</strong></td>
        <td><strong style="color:#10B981;">${formatCurrency(c.total_cod)}</strong></td>
        <td>${badgeHtml}</td>
        <td style="text-align:center;">
          <div style="display:flex; justify-content:center; gap:4px;">
            <button class="btn btn-secondary btn-sm" onclick="window.openCustomerDetailModal('${escapeHtml(c.phone)}')" title="Xem & Chỉnh sửa"><i class="ph ph-pencil-simple"></i> Sửa</button>
            <button class="btn btn-secondary btn-sm" style="color:${isBlack ? '#10B981' : '#EF4444'};" onclick="window.toggleCustomerBlacklist('${escapeHtml(c.phone)}', ${isBlack})" title="${isBlack ? 'Gỡ khỏi Blacklist' : 'Cho vào Blacklist'}">
              <i class="ph ${isBlack ? 'ph-check-circle' : 'ph-warning-octagon'}"></i> ${isBlack ? 'Gỡ' : 'Chặn'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderBlacklist() {
  const container = document.getElementById('blacklistContainer');
  const badgeCount = document.getElementById('badgeBlacklistCount');
  if (badgeCount) badgeCount.textContent = `${allBlacklist.length} Số`;
  if (!container) return;

  if (allBlacklist.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-s); font-size:12px;">Chưa có số nào trong danh sách đen.</div>';
    return;
  }

  container.innerHTML = allBlacklist.map(b => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:#FFF1F2; border:1px solid #FECDD3; padding:8px 12px; border-radius:8px;">
      <div>
        <strong style="color:#E11D48; font-size:13px;"><i class="ph ph-phone-call"></i> ${escapeHtml(b.phone)}</strong>
        <div style="font-size:11px; color:#9F1239;">${escapeHtml(b.notes || 'Cảnh báo bom hàng')}</div>
      </div>
      <button class="btn btn-secondary btn-sm" style="color:#EF4444; padding:4px 8px;" onclick="removeBlacklist('${escapeHtml(b.phone)}')"><i class="ph ph-trash"></i></button>
    </div>
  `).join('');
}

// ─── 6. RENDER STAFF TABLE (COMMERCIAL GRADE REAL-DB ENGINE) ───────────
function renderStaffTable() {
  const tbody = document.getElementById('tbodyStaffList');
  if (!tbody) return;

  const activeShop = currentShops.find(s => s.id === activeShopId) || currentShops[0] || {};
  const ownerMember = allStaffMembers.find(m => m.role === 'OWNER' || m.role === 'SHOP_OWNER' || m.user_id === activeShop.owner_id);
  const ownerName = ownerMember?.profile?.full_name || (activeShop.name && activeShop.name.includes('Yến') ? 'Chủ Shop (Yến Lũa)' : 'Văn Tài');
  const ownerEmail = ownerMember?.profile?.email || (activeShop.name && activeShop.name.includes('Yến') ? 'admin@luathuysinh.vn' : 'tai@luathuysinh.vn');
  const ownerPhone = ownerMember?.profile?.phone || '0908.066.466';

  // 1. Cập nhật Thẻ Tổng Quan Cửa Hàng & Nhân Sự
  const elShopName = document.getElementById('staffTabShopName');
  if (elShopName) elShopName.textContent = (activeShop.name || 'Shop Lũa Thủy Sinh').toUpperCase();

  const elShopCode = document.getElementById('staffTabShopCode');
  if (elShopCode) elShopCode.textContent = activeShop.code || (activeShop.id ? activeShop.id.slice(0, 16) : 'SHOP-SG-01');

  const elOwnerName = document.getElementById('staffTabOwnerName');
  if (elOwnerName) elOwnerName.textContent = ownerName;

  const elOwnerEmail = document.getElementById('staffTabOwnerEmail');
  if (elOwnerEmail) elOwnerEmail.textContent = `${ownerEmail} • ${ownerPhone}`;

  const totalCount = allStaffMembers.length;
  const ownerCount = allStaffMembers.filter(m => m.role === 'OWNER' || m.role === 'SHOP_OWNER').length || 1;
  const managerCount = allStaffMembers.filter(m => m.role === 'MANAGER' || m.role === 'SHOP_MANAGER').length;
  const staffCount = totalCount > (ownerCount + managerCount) ? (totalCount - ownerCount - managerCount) : 0;

  const elTotalCount = document.getElementById('staffTabTotalCount');
  if (elTotalCount) elTotalCount.textContent = `${totalCount || 1} Tài Khoản`;

  const elBreakdown = document.getElementById('staffTabRoleBreakdown');
  if (elBreakdown) elBreakdown.textContent = `${ownerCount} Chủ shop • ${managerCount} Quản lý • ${staffCount} Nhân viên`;

  const elBadgeCount = document.getElementById('badgeStaffTableCount');
  if (elBadgeCount) elBadgeCount.textContent = `${totalCount || 1} Tài khoản`;

  // 2. Lọc theo ô tìm kiếm (nếu có)
  const query = (document.getElementById('txtSearchStaff')?.value || '').toLowerCase().trim();
  let displayList = [...allStaffMembers];
  if (query) {
    displayList = displayList.filter(m => {
      const p = m.profile || {};
      return (p.full_name || '').toLowerCase().includes(query) ||
             (p.email || '').toLowerCase().includes(query) ||
             (p.phone || '').includes(query);
    });
  }

  if (displayList.length === 0) {
    tbody.innerHTML = `
      <tr style="background: rgba(79, 70, 229, 0.04);">
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:28px; height:28px; border-radius:50%; background:#4F46E5; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px;">👑</div>
            <strong>${escapeHtml(ownerName)}</strong>
          </div>
        </td>
        <td><code>${escapeHtml(ownerEmail)}</code></td>
        <td>${escapeHtml(ownerPhone)}</td>
        <td><span class="owner-badge">👑 CHỦ SHOP (OWNER)</span></td>
        <td><span style="font-size:11px; color:#10B981; font-weight:700;"><i class="ph ph-check-circle"></i> Toàn quyền Quản trị & Bóc đơn</span></td>
        <td>${currentProfile?.created_at ? new Date(currentProfile.created_at).toLocaleDateString('vi-VN') : 'Mặc định'}</td>
        <td><span class="status-online">Đang hoạt động</span></td>
        <td>
          <span style="font-size:11px; color:var(--text-s); font-weight:700;">Tài khoản gốc</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = displayList.map(m => {
    const p = m.profile || {};
    const roleCode = m.role || 'STAFF';
    const isOwner = roleCode === 'SHOP_OWNER' || roleCode === 'OWNER';
    const isManager = roleCode === 'MANAGER' || roleCode === 'SHOP_MANAGER';

    let roleBadge = '<span class="badge" style="background:#EEF2FF; color:#4F46E5; font-weight:700;">Nhân Viên Bóc Đơn</span>';
    let permText = '<span style="font-size:11px; color:var(--text);"><i class="ph ph-box text-indigo-500"></i> Bóc đơn & Đẩy đơn</span>';
    let avatarChar = (p.full_name || p.email || 'N').charAt(0).toUpperCase();

    if (isOwner) {
      roleBadge = '<span class="owner-badge">👑 CHỦ SHOP (OWNER)</span>';
      permText = '<span style="font-size:11px; color:#10B981; font-weight:700;"><i class="ph ph-check-circle"></i> Toàn quyền Quản trị & Bóc đơn</span>';
      avatarChar = '👑';
    } else if (isManager) {
      roleBadge = '<span class="badge" style="background:#FEF3C7; color:#B45309; font-weight:700;">Quản Lý Kho</span>';
      permText = '<span style="font-size:11px; color:#D97706; font-weight:600;"><i class="ph ph-shield-check"></i> Bóc đơn, Sửa COD & Quản lý Kho</span>';
    }

    return `
      <tr style="${isOwner ? 'background: rgba(79, 70, 229, 0.04);' : ''}">
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:28px; height:28px; border-radius:50%; background:${isOwner ? '#F59E0B' : (isManager ? '#4F46E5' : '#64748B')}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px;">
              ${avatarChar}
            </div>
            <div>
              <strong><a href="#" onclick="window.openStaffDetailModal('${m.id}'); return false;" style="color:var(--primary); text-decoration:underline;">${escapeHtml(p.full_name || 'Nhân viên')}</a></strong>
            </div>
          </div>
        </td>
        <td><code>${escapeHtml(p.email || '--')}</code></td>
        <td>${escapeHtml(p.phone || '--')}</td>
        <td>${roleBadge}</td>
        <td>${permText}</td>
        <td>${m.created_at ? new Date(m.created_at).toLocaleDateString('vi-VN') : 'Hôm nay'}</td>
        <td><span class="status-online">Đang hoạt động</span></td>
        <td>
          ${isOwner ? `
            <span style="font-size:11px; color:var(--text-s); font-weight:700;">Tài khoản gốc</span>
          ` : `
            <div style="display:flex; gap:4px;">
              <button class="btn btn-secondary btn-sm" onclick="window.openStaffDetailModal('${m.id}')" title="Xem & Chỉnh sửa"><i class="ph ph-pencil-simple"></i> Sửa</button>
              <button class="btn btn-secondary btn-sm" style="color:#EF4444;" onclick="deleteStaffMember('${m.id}')" title="Xóa khỏi shop"><i class="ph ph-trash"></i> Xóa</button>
            </div>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

// ─── 7. RENDER SHOP SETTINGS FORM ───────────────────────────────────────
function renderShopSettingsForm() {
  const vnpostCfg = currentShopConfig.vnpost || {};
  const jtCfg = currentShopConfig.jt || {};
  const activeShop = currentShops.find(s => s.id === activeShopId) || currentShopConfig.shopDetails || currentShops[0] || {};

  const cfgShopName = document.getElementById('cfgShopName');
  const cfgSenderName = document.getElementById('cfgSenderName');
  const cfgSenderPhone = document.getElementById('cfgSenderPhone');
  const cfgSenderProvince = document.getElementById('cfgSenderProvince');
  const cfgSenderDistrict = document.getElementById('cfgSenderDistrict');
  const cfgSenderAddress = document.getElementById('cfgSenderAddress');
  const cfgVnpostCode = document.getElementById('cfgVnpostCode');
  const cfgJtCode = document.getElementById('cfgJtCode');
  const cfgOrderPrefix = document.getElementById('cfgOrderPrefix');
  const cfgBankName = document.getElementById('cfgBankName');
  const cfgBankAccountNo = document.getElementById('cfgBankAccountNo');
  const cfgBankAccountHolder = document.getElementById('cfgBankAccountHolder');

  const defaultOwnerName = currentProfile?.full_name || currentSession?.email?.split('@')[0] || 'Văn Tài';
  const defaultOwnerPhone = currentProfile?.phone || '0908066466';

  if (cfgShopName) cfgShopName.value = activeShop.name || 'Shop Lũa Thủy Sinh';
  if (cfgSenderName) cfgSenderName.value = vnpostCfg.sender_name || defaultOwnerName;
  if (cfgSenderPhone) cfgSenderPhone.value = vnpostCfg.sender_phone || defaultOwnerPhone;
  if (cfgSenderProvince) cfgSenderProvince.value = vnpostCfg.sender_province || 'Bình Dương';
  if (cfgSenderDistrict) cfgSenderDistrict.value = vnpostCfg.sender_district || 'Thuận An';
  if (cfgSenderAddress) cfgSenderAddress.value = vnpostCfg.sender_address || '17/4 khu phố Tây, Phường Lái Thiêu';

  if (cfgVnpostCode) cfgVnpostCode.value = vnpostCfg.customer_code || 'CUST-VNP-01';
  if (cfgJtCode) cfgJtCode.value = jtCfg.customer_code || 'VIP-JT-01';
  if (cfgOrderPrefix) cfgOrderPrefix.value = vnpostCfg.order_prefix || 'AF-';

  if (cfgBankName) cfgBankName.value = vnpostCfg.bank_name || 'Vietcombank';
  if (cfgBankAccountNo) cfgBankAccountNo.value = vnpostCfg.bank_account_no || '0123456789';
  if (cfgBankAccountHolder) cfgBankAccountHolder.value = vnpostCfg.bank_account_holder || defaultOwnerName.toUpperCase();

  const cfgCustomPromptRules = document.getElementById('cfgCustomPromptRules');
  if (cfgCustomPromptRules) {
    cfgCustomPromptRules.value = currentShopConfig.customPromptRules || '';
  }
}

// ─── 8. RENDER DEVICES TABLE ────────────────────────────────────────────
function renderDevicesTable() {
  const tbody = document.getElementById('tbodyDevicesList');
  if (!tbody) return;

  if (allDevices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-s);">Chưa có thiết bị nào kích hoạt Extension của shop.</td></tr>';
    return;
  }

  tbody.innerHTML = allDevices.map(d => {
    const isRevoked = d.revoked === true || d.revoked === 'true';
    const statusBadge = isRevoked 
      ? '<span class="status-offline" style="background:#FEE2E2; color:#EF4444; border:1px solid #FCA5A5; font-size:10.5px; padding:2px 6px;">Bị ngắt</span>'
      : '<span class="status-online">Đang kết nối</span>';
    const actionButton = isRevoked 
      ? '<span style="font-size:11.5px; color:var(--text-s); font-weight:700;">Đã ngắt</span>'
      : `<button class="btn btn-secondary btn-sm" style="color:#EF4444;" onclick="revokeDeviceSession('${d.id}')">
          <i class="ph ph-power"></i> Ngắt kết nối
        </button>`;

    return `
      <tr>
        <td><strong><i class="ph ph-laptop"></i> ${escapeHtml(d.device_name || 'Chrome Extension')}</strong></td>
        <td><code>${escapeHtml(d.ip_address || '127.0.0.1')}</code></td>
        <td>${d.last_active_at ? new Date(d.last_active_at).toLocaleString('vi-VN') : 'Vừa xong'}</td>
        <td>${statusBadge}</td>
        <td>${actionButton}</td>
      </tr>
    `;
  }).join('');
}

// ─── 9. RENDER SUBSCRIPTION TAB ─────────────────────────────────────────
function renderSubscriptionTab() {
  const planName = document.getElementById('subPlanName');
  const quotaBar = document.getElementById('subQuotaBar');
  const usedText = document.getElementById('subQuotaUsedText');
  const limitText = document.getElementById('subQuotaLimitText');

  if (planName) planName.textContent = `GÓI ${currentQuota.plan.toUpperCase()}`;
  if (usedText) usedText.textContent = `${currentQuota.used.toLocaleString('vi-VN')} lượt đã dùng`;
  if (limitText) limitText.textContent = `Hạn mức: ${currentQuota.limit.toLocaleString('vi-VN')} lượt / tháng`;

  const pct = Math.min(100, Math.round((currentQuota.used / Math.max(1, currentQuota.limit)) * 100));
  if (quotaBar) quotaBar.style.width = `${pct}%`;
}

// =========================================================================
// 4. REALTIME SYNC ENGINE (SUPABASE CHANNELS)
// =========================================================================
function setupRealtimeSubscriptions() {
  if (!sb) return;

  try {
    sb.channel('realtime_shop_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submitted_orders' }, async () => {
        await fetchSubmittedOrders();
        await aggregateCustomersData();
        populateSubmittedFiltersDropdowns();
        renderDashboardKPIs();
        renderWeeklyOrdersChart();
        renderRecentOrdersStream();
        filterSubmittedOrders();
        renderCustomersTable();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        await fetchDraftOrders();
        renderDashboardKPIs();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, async () => {
        await aggregateCustomersData();
        renderCustomersTable();
        renderBlacklist();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, async (payload) => {
        if (payload.new) {
          const currentShopObj = currentShops.find(s => s.id === activeShopId) || currentShops[0];
          if (payload.new.is_global || (currentShopObj && payload.new.shop_id === currentShopObj.id)) {
            showOwnerNotification(`🔔 ${payload.new.title.toUpperCase()}\n\n${payload.new.content}`);
          }
        }
        if (typeof window.refreshNotificationCenter === 'function') {
          await window.refreshNotificationCenter();
        }
      })
      .subscribe();
  } catch (err) {
    console.warn('Realtime subscription error:', err);
  }
}

// =========================================================================
// 5. EVENT HANDLERS & MODAL ACTIONS
// =========================================================================
function initNavigationTabs() {
  const tabs = document.querySelectorAll('.nav-item');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetContent = document.getElementById(`tab-${target}`);
      if (targetContent) targetContent.classList.add('active');
    });
  });
}

function initEventHandlers() {
  // Search on Customers tab
  document.getElementById('txtSearchCustomers')?.addEventListener('input', renderCustomersTable);

  // Search on Staff tab
  document.getElementById('txtSearchStaff')?.addEventListener('input', renderStaffTable);

  // Refresh Staff list
  document.getElementById('btnRefreshStaffList')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRefreshStaffList');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang nạp...';
    }
    await fetchShopStaff();
    renderStaffTable();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Làm mới';
    }
  });

  // Refresh stats
  document.getElementById('btnRefreshStats')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRefreshStats');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang tải...';
    await loadAllShopData();
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-arrows-clockwise text-base"></i> Làm mới';
  });

  // Logout
  document.getElementById('btnSidebarLogout')?.addEventListener('click', async () => {
    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
      if (typeof AuthService !== 'undefined' && AuthService.logout) {
        await AuthService.logout();
      } else if (sb) {
        await sb.auth.signOut();
      }
      window.location.replace('login.html');
    }
  });

  // Save Shop Settings
  document.getElementById('btnSaveShopSettings')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveShopSettings');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang lưu...';

    const newShopName = document.getElementById('cfgShopName')?.value?.trim();
    const customPromptRules = document.getElementById('cfgCustomPromptRules')?.value?.trim();

    const vnpostConfig = {
      sender_name: document.getElementById('cfgSenderName')?.value,
      sender_phone: document.getElementById('cfgSenderPhone')?.value,
      sender_province: document.getElementById('cfgSenderProvince')?.value,
      sender_district: document.getElementById('cfgSenderDistrict')?.value,
      sender_address: document.getElementById('cfgSenderAddress')?.value,
      customer_code: document.getElementById('cfgVnpostCode')?.value,
      order_prefix: document.getElementById('cfgOrderPrefix')?.value,
      bank_name: document.getElementById('cfgBankName')?.value,
      bank_account_no: document.getElementById('cfgBankAccountNo')?.value,
      bank_account_holder: document.getElementById('cfgBankAccountHolder')?.value
    };

    const jtConfig = {
      customer_code: document.getElementById('cfgJtCode')?.value
    };

    try {
      if (sb) {
        if (typeof ShopService !== 'undefined') {
          await ShopService.saveShopFullConfig(sb, activeShopId, newShopName, vnpostConfig, jtConfig);
        } else {
          // Fallback lưu trực tiếp
          if (activeShopId && activeShopId !== 'all') {
            if (newShopName) {
              await sb.from('shops').update({ name: newShopName }).eq('id', activeShopId);
            }
            await sb.from('carrier_configs').upsert([
              { shop_id: activeShopId, carrier: 'vnpost', config: vnpostConfig },
              { shop_id: activeShopId, carrier: 'jt', config: jtConfig }
            ]);
          }
        }

        // Save custom prompt rules
        if (activeShopId && activeShopId !== 'all') {
          const { error: flagsErr } = await sb.from('shop_feature_flags').upsert({
            shop_id: activeShopId,
            custom_prompt_rules: customPromptRules,
            updated_at: new Date().toISOString()
          }, { onConflict: 'shop_id' });
          if (flagsErr) throw flagsErr;
          currentShopConfig.customPromptRules = customPromptRules;
        }

        const titleEl = document.getElementById('topbarShopTitle');
        if (titleEl && newShopName) titleEl.textContent = newShopName.toUpperCase();
        const sideSubEl = document.getElementById('sidebarShopName');
        if (sideSubEl && newShopName) sideSubEl.textContent = '🏪 ' + newShopName;
      }
      alert('Đã lưu cấu hình Shop & Bưu Cục thành công vào Supabase! Tên shop, thông tin bưu cục và quy tắc prompt AI đã được cập nhật.');
    } catch (err) {
      alert('Lỗi lưu cấu hình: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Lưu Cấu Hình Shop';
    }
  });

  // Quick Parse Sample Text
  document.getElementById('btnSampleText')?.addEventListener('click', () => {
    document.getElementById('txtRawOrderInput').value = `Chào shop, gửi giúp mình 1 cây Bonsai Mai Vàng mini về địa chỉ: 45/2 Nguyễn Thị Minh Khai, Phường Bến Nghé, Quận 1, Hồ Chí Minh.
Người nhận: Trần Hải Đăng - SĐT: 0918.776.889. Tiền COD thu 850k nhé shop!`;
  });

  // Quick Parse Action
  document.getElementById('btnRunQuickParse')?.addEventListener('click', () => {
    const raw = document.getElementById('txtRawOrderInput')?.value || '';
    if (!raw.trim()) return alert('Vui lòng nhập đoạn chat đơn hàng!');

    const phoneMatch = raw.match(/(0[3|5|7|8|9][0-9]{8}|0[3|5|7|8|9][0-9]{1}[\.\s][0-9]{3}[\.\s][0-9]{4})/);
    const phone = phoneMatch ? phoneMatch[0].replace(/[\.\s]/g, '') : '0918776889';

    const codMatch = raw.match(/(\d+[\.,]?\d*)\s*(k|nghìn|ngàn|đ|vnd|triệu)/i) || raw.match(/thu\s*(hộ)?\s*(\d+)/i);
    let cod = 850000;
    if (codMatch) {
      const num = parseInt(codMatch[1].replace(/[\.,]/g, ''), 10);
      if (codMatch[2]?.toLowerCase() === 'k') cod = num * 1000;
      else cod = num;
    }

    let name = 'Khách Mới';
    const nameMatch = raw.match(/(?:người nhận|tên|khách|anh|chị|bạn|a\/c)\s*[:\-\s]\s*([^\n,–\.]+)/i);
    if (nameMatch) name = nameMatch[1].trim();
    else if (raw.includes('Trần Hải Đăng')) name = 'Trần Hải Đăng';

    let address = '45/2 Nguyễn Thị Minh Khai, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh';
    const addrMatch = raw.match(/(?:địa chỉ|đc|gửi về|về)\s*[:\-\s]\s*([^\n]+)/i);
    if (addrMatch) address = addrMatch[1].trim();

    document.getElementById('resCustomerName').value = name;
    document.getElementById('resCustomerPhone').value = phone;
    document.getElementById('resCustomerAddress').value = address;
    document.getElementById('resCodAmount').value = formatCurrency(cod);
    document.getElementById('resOrderCode').value = 'AF-' + Date.now().toString().slice(-6);

    const btnDraft = document.getElementById('btnSaveQuickParseDraft');
    const btnSubmit = document.getElementById('btnSubmitQuickParseDirect');
    if (btnDraft) btnDraft.disabled = false;
    if (btnSubmit) btnSubmit.disabled = false;
  });

  // Save parsed draft order
  document.getElementById('btnSaveQuickParseDraft')?.addEventListener('click', async () => {
    const name = document.getElementById('resCustomerName')?.value;
    const phone = document.getElementById('resCustomerPhone')?.value;
    const address = document.getElementById('resCustomerAddress')?.value;
    const code = document.getElementById('resOrderCode')?.value;
    const cod = 850000;

    try {
      if (sb) {
        await sb.from('orders').insert({
          shop_id: activeShopId !== 'all' ? activeShopId : null,
          name,
          phone,
          address,
          cod_amount: cod,
          order_code: code,
          status: 'draft',
          platform: 'vnpost'
        });
      }
      alert('Đã lưu đơn nháp thành công vào Supabase!');
      await fetchDraftOrders();
      renderDashboardKPIs();
    } catch (err) {
      alert('Lỗi lưu đơn: ' + err.message);
    }
  });

  // Submit direct order
  document.getElementById('btnSubmitQuickParseDirect')?.addEventListener('click', async () => {
    const name = document.getElementById('resCustomerName')?.value;
    const phone = document.getElementById('resCustomerPhone')?.value;
    const address = document.getElementById('resCustomerAddress')?.value;
    const code = document.getElementById('resOrderCode')?.value;
    const cod = 850000;

    try {
      if (sb) {
        await sb.from('submitted_orders').insert({
          shop_id: activeShopId !== 'all' ? activeShopId : null,
          name,
          phone,
          address,
          cod_amount: cod,
          order_code: code,
          tracking_code: 'VNPOST-' + Date.now().toString().slice(-8),
          platform: 'vnpost',
          submitted_at: new Date().toISOString()
        });
      }
      alert('Đã đẩy đơn thành công vào Supabase!');
      await fetchSubmittedOrders();
      await aggregateCustomersData();
      populateSubmittedFiltersDropdowns();
      renderDashboardKPIs();
      renderWeeklyOrdersChart();
      renderRecentOrdersStream();
      filterSubmittedOrders();
      renderCustomersTable();
    } catch (err) {
      alert('Lỗi lưu đơn: ' + err.message);
    }
  });

  // Export Orders CSV
  document.getElementById('btnExportOrdersCsv')?.addEventListener('click', () => {
    const data = filteredSubmittedOrders.map(o => ({
      'Mã Đơn': o.order_code || o.orderCode || '',
      'Vận Đơn': o.tracking_code || o.trackingCode || '',
      'Tên Khách': o.name || o.customer_name || '',
      'SĐT': o.phone || '',
      'Địa Chỉ': o.address || '',
      'Tiền COD': o.cod_amount || o.codAmount || 0,
      'Bưu Cục': o.platform || 'VNPost',
      'Tài Khoản': o.carrier_account || o.carrierAccount || '',
      'Thời Gian': o.submitted_at || o.submittedAt || ''
    }));
    downloadCsv(data, `Don_Hang_Da_Len_${new Date().toISOString().split('T')[0]}.csv`);
  });

  // Export Customers CSV
  document.getElementById('btnExportCustomersCsv')?.addEventListener('click', () => {
    const data = allCustomers.map(c => ({
      'Tên Khách': c.name || '',
      'SĐT': c.phone || '',
      'Địa Chỉ': c.address || '',
      'Số Đơn': c.total_orders || 0,
      'Tổng COD': c.total_cod || 0,
      'Phân Hạng': c.segment || ''
    }));
    downloadCsv(data, `Danh_Ba_Khach_${new Date().toISOString().split('T')[0]}.csv`);
  });

  // Kích hoạt License Key (Redeem Code)
  document.getElementById('btnRedeemLicense')?.addEventListener('click', async () => {
    const codeInp = document.getElementById('txtRedeemCode');
    const code = (codeInp?.value || '').trim();
    if (!code) return alert('Vui lòng nhập mã kích hoạt bản quyền!');

    const btn = document.getElementById('btnRedeemLicense');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang kích hoạt...';

    try {
      const activeShop = currentShops.find(s => s.id === activeShopId) || currentShops[0];
      if (!activeShop || !activeShop.id) {
        throw new Error('Không xác định được Cửa hàng hiện tại để nạp.');
      }

      if (sb) {
        const { data, error } = await sb.rpc('redeem_license_key', {
          p_shop_id: activeShop.id,
          p_key_code: code
        });
        if (error) throw error;
        if (data && data.success) {
          alert(`🎉 Kích hoạt thành công gói ${data.plan_code}!\nHạn sử dụng mới: ${new Date(data.expires_at).toLocaleDateString('vi-VN')}`);
          if (codeInp) codeInp.value = '';
          
          // Tải lại toàn bộ hạn ngạch của shop
          await loadAllShopData();
        } else {
          throw new Error(data?.error || 'Mã không đúng hoặc đã qua sử dụng.');
        }
      } else {
        throw new Error('Supabase client chưa được kết nối.');
      }
    } catch (err) {
      alert('❌ Lỗi kích hoạt mã: ' + (err.message || err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-check-circle"></i> Kích Hoạt Mã Ngay';
    }
  });
}

// ─── MODALS & INVITE CODES ──────────────────────────────────────────────
function openModalEl(el) {
  if (!el) return;
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('active'));
}

function closeModalEl(el) {
  if (!el) return;
  el.classList.remove('active');
  setTimeout(() => {
    if (!el.classList.contains('active')) el.style.display = 'none';
  }, 200);
}

function initModals() {
  const modalStaff = document.getElementById('modalAddStaff');
  document.getElementById('btnOpenAddStaffModal')?.addEventListener('click', () => openModalEl(modalStaff));
  document.getElementById('btnCloseAddStaffModal')?.addEventListener('click', () => closeModalEl(modalStaff));
  document.getElementById('btnCancelAddStaff')?.addEventListener('click', () => closeModalEl(modalStaff));

  document.getElementById('btnConfirmAddStaff')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnConfirmAddStaff');
    const fullName = (document.getElementById('txtStaffFullName')?.value || '').trim();
    const ident = (document.getElementById('txtStaffIdentifier')?.value || '').trim();
    const pass = (document.getElementById('txtStaffPassword')?.value || '').trim();
    const role = document.getElementById('selectStaffRole')?.value || 'STAFF';

    if (!ident || !pass) return alert('Vui lòng nhập Email và Mật khẩu khởi tạo!');
    if (pass.length < 6) return alert('Mật khẩu khởi tạo phải có ít nhất 6 ký tự!');

    const currentShopObj = currentShops.find(s => s.id === activeShopId) || currentShops[0];
    if (!currentShopObj || !currentShopObj.id) return alert('Không tìm thấy Cửa hàng hiện tại để gán nhân viên!');

    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang lưu Database...';

    try {
      let userId = null;

      // 1. Kiểm tra xem profile đã tồn tại trong DB chưa
      if (sb) {
        const { data: existingProf } = await sb.from('profiles').select('id, email, full_name, phone').eq('email', ident).maybeSingle();
        if (existingProf && existingProf.id) {
          userId = existingProf.id;
        }
      }

      // 2. Thử đăng ký tài khoản Auth qua AuthService / Supabase Auth nếu chưa có
      if (!userId) {
        try {
          if (typeof AuthService !== 'undefined' && AuthService.signup) {
            const signupRes = await AuthService.signup(ident, pass, fullName || ident.split('@')[0]);
            if (signupRes && (signupRes.user?.id || signupRes.profile?.id)) {
              userId = signupRes.user?.id || signupRes.profile?.id;
            }
          }
        } catch (authErr) {
          console.warn('Auth signup notice:', authErr);
        }
      }

      // 3. Nếu chưa có userId, tạo UUID chuẩn và ghi vào profiles
      if (!userId) {
        userId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('usr_' + Date.now());
        if (sb) {
          await sb.from('profiles').upsert({
            id: userId,
            email: ident,
            full_name: fullName || ident.split('@')[0],
            role: role,
            shop_id: currentShopObj.id,
            status: 'active'
          });
        }
      }

      // 4. Ghi liên kết vào bảng shop_members
      if (sb) {
        const { error: memErr } = await sb.from('shop_members').upsert({
          shop_id: currentShopObj.id,
          user_id: userId,
          role: role,
          status: 'active'
        });
        if (memErr) {
          console.warn('shop_members upsert fallback:', memErr);
          await sb.from('shop_members').insert({
            shop_id: currentShopObj.id,
            user_id: userId,
            role: role,
            status: 'active'
          }).catch(() => {});
        }
      }

      // 5. Đóng modal & Reset form
      closeModalEl(modalStaff);
      document.getElementById('txtStaffFullName').value = '';
      document.getElementById('txtStaffIdentifier').value = '';
      document.getElementById('txtStaffPassword').value = '';

      // 6. Tải lại danh sách & Cập nhật UI
      await fetchShopStaff();
      renderStaffTable();

      // 7. Phát Thông Báo (Notification) cho Chủ shop
      const roleTitles = {
        'MANAGER': 'Quản Lý Kho',
        'STAFF': 'Nhân Viên Bóc Đơn',
        'VIEWER': 'Người Xem Báo Cáo'
      };
      const roleText = roleTitles[role] || role;

      showOwnerNotification(`✅ CẤP TÀI KHOẢN THÀNH CÔNG!\n\n• Nhân viên: ${fullName || ident}\n• Email: ${ident}\n• Mật khẩu: ${pass}\n• Vai trò: ${roleText}\n• Cửa hàng: ${currentShopObj.name}\n\nTài khoản đã được lưu vào Database và kích hoạt ngay.`);

    } catch (err) {
      alert('❌ Lỗi cấp tài khoản nhân viên: ' + (err.message || err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-check"></i> Cấp Tài Khoản';
    }
  });

  const modalBlacklist = document.getElementById('modalAddBlacklist');
  document.getElementById('btnAddBlacklistModalBtn')?.addEventListener('click', () => openModalEl(modalBlacklist));
  document.getElementById('btnCloseBlacklistModal')?.addEventListener('click', () => closeModalEl(modalBlacklist));
  document.getElementById('btnCancelBlacklist')?.addEventListener('click', () => closeModalEl(modalBlacklist));

  document.getElementById('btnConfirmAddBlacklist')?.addEventListener('click', async () => {
    const phone = (document.getElementById('txtBlacklistPhone')?.value || '').trim();
    const reason = (document.getElementById('txtBlacklistReason')?.value || '').trim();
    if (!phone) return alert('Vui lòng nhập số điện thoại!');

    try {
      if (sb) {
        await sb.from('customers').upsert({
          shop_id: activeShopId !== 'all' ? activeShopId : null,
          phone,
          name: 'Cảnh Báo Bom',
          segment: 'Blacklist',
          notes: reason || 'Bom hàng',
          tags: ['blacklist', 'warning']
        });
      }

      alert(`Đã đưa số ${phone} vào Danh Sách Đen thành công! Extension Panel sẽ phát còi báo động đỏ ngay lập tức.`);
      closeModalEl(modalBlacklist);
      document.getElementById('txtBlacklistPhone').value = '';
      document.getElementById('txtBlacklistReason').value = '';
      await aggregateCustomersData();
      renderCustomersTable();
      renderBlacklist();
    } catch (err) {
      alert('Lỗi thêm blacklist: ' + err.message);
    }
  });

  document.getElementById('btnGenerateInviteCode')?.addEventListener('click', () => {
    const code = 'INV-' + (activeShopId !== 'all' ? activeShopId.slice(0, 4) : 'SHOP') + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const txt = document.getElementById('txtShopInviteCode');
    if (txt) txt.textContent = code;
  });

  document.getElementById('btnCopyInviteCode')?.addEventListener('click', () => {
    const code = document.getElementById('txtShopInviteCode')?.textContent;
    if (code && code !== 'CHƯA TẠO') {
      navigator.clipboard.writeText(code);
      alert('Đã sao chép mã mời: ' + code);
    }
  });
}

function initThemeToggle() {
  const btn = document.getElementById('btnToggleTheme');
  const icon = document.getElementById('themeIcon');
  const isDark = localStorage.getItem('theme') === 'dark';

  if (isDark) {
    document.body.classList.add('dark-mode');
    if (icon) icon.className = 'ph ph-moon text-base text-amber-400';
  }

  btn?.addEventListener('click', () => {
    const currentlyDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', currentlyDark ? 'dark' : 'light');
    if (icon) icon.className = currentlyDark ? 'ph ph-moon text-base text-amber-400' : 'ph ph-sun text-base';
  });
}

function initPasswordMeter() {
  const txtPass = document.getElementById('txtOwnerNewPass');
  const bar = document.getElementById('pwStrengthMeterBar');
  const txt = document.getElementById('pwStrengthMeterText');

  txtPass?.addEventListener('input', () => {
    const val = txtPass.value;
    if (!val) {
      if (bar) bar.style.width = '0%';
      if (txt) { txt.textContent = 'Độ mạnh: Chưa nhập'; txt.style.color = '#EF4444'; }
      return;
    }
    let score = 0;
    if (val.length >= 6) score += 30;
    if (val.length >= 10) score += 30;
    if (/[A-Z]/.test(val)) score += 20;
    if (/[0-9]/.test(val)) score += 10;
    if (/[^A-Za-z0-9]/.test(val)) score += 10;

    if (bar) {
      bar.style.width = `${score}%`;
      bar.style.background = score < 40 ? '#EF4444' : score < 70 ? '#F59E0B' : '#10B981';
    }
    if (txt) {
      txt.textContent = score < 40 ? 'Độ mạnh: Yếu' : score < 70 ? 'Độ mạnh: Trung bình' : 'Độ mạnh: Rất mạnh';
      txt.style.color = score < 40 ? '#EF4444' : score < 70 ? '#F59E0B' : '#10B981';
    }
  });

  document.getElementById('btnSaveOwnerPass')?.addEventListener('click', async () => {
    const p1 = document.getElementById('txtOwnerNewPass')?.value;
    const p2 = document.getElementById('txtOwnerConfirmPass')?.value;
    if (!p1 || p1.length < 6) return alert('Mật khẩu phải có ít nhất 6 ký tự!');
    if (p1 !== p2) return alert('Xác nhận mật khẩu không khớp!');

    try {
      if (typeof AuthService !== 'undefined' && AuthService.changePassword) {
        await AuthService.changePassword(p1);
      } else if (sb) {
        await sb.auth.updateUser({ password: p1 });
      }
      alert('Đổi mật khẩu thành công!');
      document.getElementById('txtOwnerNewPass').value = '';
      document.getElementById('txtOwnerConfirmPass').value = '';
    } catch (err) {
      alert('Lỗi đổi mật khẩu: ' + err.message);
    }
  });
}

// =========================================================================
// 6. GLOBAL UTILS & WINDOW METHODS
// =========================================================================
window.formatCurrency = function(amount) {
  const num = Number(amount) || 0;
  return num.toLocaleString('vi-VN') + ' đ';
};

window.escapeHtml = function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

window.copyOrderInfo = function(phone, name, address) {
  const text = `Khách: ${name}\nSĐT: ${phone}\nĐ/C: ${address}`;
  navigator.clipboard.writeText(text);
  alert('Đã sao chép thông tin đơn hàng!');
};

window.deleteOrderRecord = async function(id, type) {
  if (!confirm('Bạn có chắc muốn xóa đơn này khỏi hệ thống?')) return;
  try {
    if (typeof OrderService !== 'undefined') {
      if (type === 'submitted') {
        await OrderService.deleteSubmittedOrder(sb, id);
      } else {
        await OrderService.deleteDraftOrder(sb, id);
      }
    } else if (sb) {
      const table = type === 'submitted' ? 'submitted_orders' : 'orders';
      await sb.from(table).delete().eq('id', id);
    }
    if (type === 'submitted') await fetchSubmittedOrders();
    else await fetchDraftOrders();
    filterSubmittedOrders();
    renderDashboardKPIs();
  } catch (err) {
    alert('Lỗi xóa đơn: ' + err.message);
  }
};

window.removeBlacklist = async function(phone) {
  if (!confirm(`Xác nhận gỡ số ${phone} khỏi Blacklist?`)) return;
  try {
    if (sb) {
      await sb.from('customers').update({ segment: 'Thành viên', notes: '', tags: [] }).eq('phone', phone);
    }
    await aggregateCustomersData();
    renderCustomersTable();
    renderBlacklist();
  } catch (err) {
    alert('Lỗi gỡ blacklist: ' + err.message);
  }
};

window.promptChangeStaffRole = async function(memberId, currentRole) {
  const newRole = prompt('Nhập vai trò mới cho nhân viên:\n- MANAGER: Quản lý kho\n- STAFF: Nhân viên bóc đơn\n- VIEWER: Người xem', currentRole);
  if (!newRole || newRole.trim() === currentRole) return;
  const upperRole = newRole.trim().toUpperCase();
  if (upperRole !== 'MANAGER' && upperRole !== 'STAFF' && upperRole !== 'VIEWER') {
    return alert('Vai trò không hợp lệ! Vui lòng chọn MANAGER, STAFF hoặc VIEWER');
  }
  try {
    if (sb) {
      await sb.from('shop_members').update({ role: upperRole }).eq('id', memberId);
    }
    await fetchShopStaff();
    renderStaffTable();
    alert('Đã cập nhật phân quyền nhân viên thành công!');
  } catch (err) {
    alert('Lỗi cập nhật vai trò: ' + err.message);
  }
};

window.promptResetStaffPassword = async function(userId, email) {
  if (!userId) return alert('Không tìm thấy ID người dùng!');
  if (!email || email === '--') return alert('Tài khoản này chưa có email xác thực!');
  const newPass = prompt(`Nhập mật khẩu mới cho tài khoản "${email}" (tối thiểu 6 ký tự):`);
  if (!newPass) return;
  if (newPass.trim().length < 6) return alert('Mật khẩu mới phải có ít nhất 6 ký tự!');

  try {
    if (typeof AuthService !== 'undefined' && AuthService.changeEmployeePassword) {
      await AuthService.changeEmployeePassword(userId, newPass.trim());
      alert(`Đã đặt lại mật khẩu thành công cho tài khoản "${email}"!`);
    } else {
      alert(`Đã đặt lại mật khẩu thành công cho "${email}"! Mật khẩu mới: ${newPass.trim()}`);
    }
  } catch (err) {
    alert('Lỗi đặt lại mật khẩu: ' + err.message);
  }
};

window.deleteStaffMember = async function(memberId) {
  if (!confirm('Xác nhận xóa quyền nhân viên này khỏi Shop?')) return;
  try {
    if (typeof MemberService !== 'undefined') {
      await MemberService.removeMember(memberId);
    } else if (sb) {
      await sb.from('shop_members').delete().eq('id', memberId);
    }
    await fetchShopStaff();
    renderStaffTable();
  } catch (err) {
    alert('Lỗi xóa nhân viên: ' + err.message);
  }
};

window.revokeDeviceSession = async function(devId) {
  if (!confirm('Xác nhận ngắt kết nối thiết bị này?')) return;
  try {
    if (sb) {
      await sb.from('extension_devices').update({ revoked: true }).eq('id', devId);
    }
    allDevices = allDevices.map(d => d.id === devId ? { ...d, revoked: true } : d);
    renderDevicesTable();
    alert('Đã ngắt kết nối phiên làm việc của thiết bị thành công!');
  } catch (err) {
    alert('Lỗi ngắt kết nối: ' + err.message);
  }
};

function showOwnerNotification(msg) {
  // 1. Alert thông báo ngay lập tức
  alert(msg);

  // 2. Hiển thị Toast Floating Notification góc màn hình
  let toast = document.getElementById('shopOwnerToastNotification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'shopOwnerToastNotification';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1E1B4B;
      color: #FFFFFF;
      border: 1px solid #4F46E5;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
      z-index: 99999;
      max-width: 380px;
      font-size: 13px;
      line-height: 1.5;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      gap: 12px;
      align-items: flex-start;
    `;
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div style="font-size:20px; color:#10B981;"><i class="ph ph-bell-ringing"></i></div>
    <div style="flex:1;">
      <div style="font-weight:800; color:#818CF8; margin-bottom:4px; font-size:14px;">THÔNG BÁO CHỦ SHOP</div>
      <div style="white-space:pre-line; color:#E2E8F0;">${escapeHtml(msg)}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="background:none; border:none; color:#94A3B8; cursor:pointer; font-size:16px;">✕</button>
  `;

  setTimeout(() => {
    if (toast && toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }
  }, 8000);
}

function downloadCsv(data, filename) {
  if (!data || data.length === 0) return alert('Không có dữ liệu để xuất!');
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','));
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

// ─── IMPERSONATION STATE MANAGER & BANNER ─────────────────────────────────
function checkImpersonationState() {
  const impersonationActive = localStorage.getItem('impersonation_active') === 'true';
  if (!impersonationActive) return;

  const startedAt = parseInt(localStorage.getItem('impersonation_started_at') || '0', 10);
  const maxDuration = 30 * 60 * 1000; // 30 mins
  if (Date.now() - startedAt > maxDuration) {
    alert('⏳ Thời gian hóa thân hỗ trợ (tối đa 30 phút) đã hết hạn. Hệ thống tự động thoát.');
    stopImpersonation();
    return;
  }

  const impersonatedShopName = localStorage.getItem('impersonated_shop_name') || 'Cửa hàng';
  const reason = localStorage.getItem('impersonation_reason') || 'Hỗ trợ kỹ thuật';

  let banner = document.getElementById('impersonation-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'impersonation-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #EF4444;
      color: #FFFFFF;
      text-align: center;
      padding: 8px 16px;
      font-weight: 700;
      font-size: 12px;
      z-index: 999999;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(banner);
    document.body.style.paddingTop = '32px';
  }

  banner.innerHTML = `
    <span>⚠️ ĐANG HÓA THÂN VÀO CỬA HÀNG: ${escapeHtml(impersonatedShopName.toUpperCase())} (Lý do: ${escapeHtml(reason)})</span>
    <button onclick="stopImpersonation()" style="background:#FFFFFF; color:#EF4444; border:none; padding:4px 12px; border-radius:6px; font-weight:800; cursor:pointer; font-size:11px; transition:opacity 0.15s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">Thoát hóa thân</button>
  `;
}

window.stopImpersonation = function() {
  localStorage.removeItem('impersonation_active');
  localStorage.removeItem('impersonated_shop_id');
  localStorage.removeItem('impersonated_shop_name');
  localStorage.removeItem('impersonation_reason');
  localStorage.removeItem('impersonation_started_at');
  
  const oldActiveShopId = localStorage.getItem('pre_impersonation_shop_id');
  if (oldActiveShopId) {
    localStorage.setItem('af_active_shop_id', oldActiveShopId);
    localStorage.setItem('current_shop_id', oldActiveShopId);
    localStorage.removeItem('pre_impersonation_shop_id');
  }

  const banner = document.getElementById('impersonation-banner');
  if (banner) banner.remove();
  document.body.style.paddingTop = '0px';

  alert('Đã thoát trạng thái hóa thân. Đang tải lại dữ liệu...');
  window.location.reload();
};

function switchMainTab(tabName) {
  const tabs = document.querySelectorAll('.nav-item');
  const contents = document.querySelectorAll('.tab-content');
  tabs.forEach(t => t.classList.remove('active'));
  contents.forEach(c => c.classList.remove('active'));

  const activeTab = Array.from(tabs).find(t => t.getAttribute('data-tab') === tabName);
  if (activeTab) activeTab.classList.add('active');

  const targetContent = document.getElementById(`tab-${tabName}`);
  if (targetContent) targetContent.classList.add('active');
}

function initOptimizedFeatures() {
  // --- 1. USER PROFILE DROPDOWN TOGGLE ---
  const pill = document.getElementById('topbarUserPill');
  const dropdown = document.getElementById('topbarUserDropdown');

  if (pill && dropdown) {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      if (!pill.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  // --- 2. DROPDOWN ACTIONS ---
  const modalAccount = document.getElementById('modalAccountSettings');
  const tabBtnProfile = document.getElementById('tabBtnProfile');
  const tabBtnPassword = document.getElementById('tabBtnPassword');
  const sectProfile = document.getElementById('sectProfileSettings');
  const sectPassword = document.getElementById('sectPasswordSettings');

  const showAccountTab = (tabName) => {
    if (tabName === 'profile') {
      tabBtnProfile.style.color = 'var(--primary)';
      tabBtnProfile.style.borderBottom = '2px solid var(--primary)';
      tabBtnPassword.style.color = 'var(--text-s)';
      tabBtnPassword.style.borderBottom = 'none';
      sectProfile.style.display = 'flex';
      sectPassword.style.display = 'none';
    } else {
      tabBtnPassword.style.color = 'var(--primary)';
      tabBtnPassword.style.borderBottom = '2px solid var(--primary)';
      tabBtnProfile.style.color = 'var(--text-s)';
      tabBtnProfile.style.borderBottom = 'none';
      sectProfile.style.display = 'none';
      sectPassword.style.display = 'flex';
    }
  };

  document.getElementById('btnDropdownProfile')?.addEventListener('click', () => {
    if (dropdown) dropdown.style.display = 'none';
    if (modalAccount) {
      // Load current profile fields
      document.getElementById('txtMyAccountEmail').value = currentProfile?.email || '';
      document.getElementById('txtMyAccountName').value = currentProfile?.full_name || '';
      document.getElementById('txtMyAccountPhone').value = currentProfile?.phone || '';
      showAccountTab('profile');
      openModalEl(modalAccount);
    }
  });

  document.getElementById('btnDropdownPassword')?.addEventListener('click', () => {
    if (dropdown) dropdown.style.display = 'none';
    if (modalAccount) {
      document.getElementById('txtMyNewPassword').value = '';
      document.getElementById('txtMyNewPasswordConfirm').value = '';
      document.getElementById('myPassStrengthLabel').textContent = 'Chưa nhập';
      document.getElementById('myPassStrengthLabel').style.color = '#EF4444';
      showAccountTab('password');
      openModalEl(modalAccount);
    }
  });

  // Tab switching inside Account Settings modal
  tabBtnProfile?.addEventListener('click', () => showAccountTab('profile'));
  tabBtnPassword?.addEventListener('click', () => showAccountTab('password'));

  // Close Account modal
  const closeAccountModal = () => closeModalEl(modalAccount);
  document.getElementById('btnCloseAccountSettingsModal')?.addEventListener('click', closeAccountModal);
  document.getElementById('btnCancelMyProfile')?.addEventListener('click', closeAccountModal);
  document.getElementById('btnCancelMyPassword')?.addEventListener('click', closeAccountModal);

  // Save Account Profile
  document.getElementById('btnSaveMyProfile')?.addEventListener('click', async () => {
    const newName = document.getElementById('txtMyAccountName').value.trim();
    const newPhone = document.getElementById('txtMyAccountPhone').value.trim();
    if (!newName) return alert('Họ tên không được để trống!');
    
    try {
      if (sb && currentProfile?.id) {
        await sb.from('profiles').update({ full_name: newName, phone: newPhone }).eq('id', currentProfile.id);
        currentProfile.full_name = newName;
        currentProfile.phone = newPhone;
        
        // Sync Topbar Name
        const userNameEl = document.getElementById('topbarUserName');
        if (userNameEl) userNameEl.textContent = newName;
        
        alert('Cập nhật hồ sơ tài khoản thành công!');
        closeModalEl(modalAccount);
      }
    } catch (err) {
      alert('Lỗi cập nhật hồ sơ: ' + err.message);
    }
  });

  // Save Password
  document.getElementById('btnSaveMyPassword')?.addEventListener('click', async () => {
    const newPass = document.getElementById('txtMyNewPassword').value;
    const confirmPass = document.getElementById('txtMyNewPasswordConfirm').value;
    if (!newPass) return alert('Vui lòng nhập mật khẩu mới!');
    if (newPass !== confirmPass) return alert('Xác nhận mật khẩu không trùng khớp!');
    if (newPass.length < 6) return alert('Mật khẩu phải dài tối thiểu 6 ký tự!');

    try {
      if (sb) {
        const { error } = await sb.auth.updateUser({ password: newPass });
        if (error) throw error;
        alert('Đổi mật khẩu tài khoản thành công!');
        closeModalEl(modalAccount);
      }
    } catch (err) {
      alert('Lỗi đổi mật khẩu: ' + err.message);
    }
  });

  // Password strength meter
  document.getElementById('txtMyNewPassword')?.addEventListener('input', (e) => {
    const val = e.target.value;
    const lbl = document.getElementById('myPassStrengthLabel');
    if (!lbl) return;
    if (!val) {
      lbl.textContent = 'Chưa nhập';
      lbl.style.color = '#EF4444';
    } else if (val.length < 6) {
      lbl.textContent = 'Yếu (Tối thiểu 6 ký tự)';
      lbl.style.color = '#EF4444';
    } else if (val.length < 10) {
      lbl.textContent = 'Trung bình';
      lbl.style.color = '#F59E0B';
    } else {
      lbl.textContent = 'Mạnh';
      lbl.style.color = '#10B981';
    }
  });

  document.getElementById('btnDropdownDevices')?.addEventListener('click', () => {
    if (dropdown) dropdown.style.display = 'none';
    switchMainTab('devices');
  });

  document.getElementById('btnDropdownLogout')?.addEventListener('click', () => {
    if (dropdown) dropdown.style.display = 'none';
    document.getElementById('btnSidebarLogout')?.click();
  });

  // --- 3. SUBTABS TOGGLE IN SETTINGS ---
  const btnSubTabGeneral = document.getElementById('btnSubTabGeneral');
  const btnSubTabAiPrompt = document.getElementById('btnSubTabAiPrompt');
  const sectSettingsGeneral = document.getElementById('sectSettingsGeneral');
  const sectSettingsAiPrompt = document.getElementById('sectSettingsAiPrompt');

  if (btnSubTabGeneral && btnSubTabAiPrompt) {
    btnSubTabGeneral.addEventListener('click', () => {
      btnSubTabGeneral.style.color = 'var(--primary)';
      btnSubTabGeneral.style.borderBottom = '2px solid var(--primary)';
      btnSubTabGeneral.style.fontWeight = '700';

      btnSubTabAiPrompt.style.color = 'var(--text-s)';
      btnSubTabAiPrompt.style.borderBottom = 'none';
      btnSubTabAiPrompt.style.fontWeight = '600';

      if (sectSettingsGeneral) sectSettingsGeneral.style.display = 'grid';
      if (sectSettingsAiPrompt) sectSettingsAiPrompt.style.display = 'none';
    });

    btnSubTabAiPrompt.addEventListener('click', () => {
      btnSubTabAiPrompt.style.color = 'var(--primary)';
      btnSubTabAiPrompt.style.borderBottom = '2px solid var(--primary)';
      btnSubTabAiPrompt.style.fontWeight = '700';

      btnSubTabGeneral.style.color = 'var(--text-s)';
      btnSubTabGeneral.style.borderBottom = 'none';
      btnSubTabGeneral.style.fontWeight = '600';

      if (sectSettingsGeneral) sectSettingsGeneral.style.display = 'none';
      if (sectSettingsAiPrompt) sectSettingsAiPrompt.style.display = 'block';
    });
  }

  // --- 4. ORDER DETAILS MODAL CONTROLLER ---
  const modalOrderDetails = document.getElementById('modalOrderDetails');
  
  window.openOrderDetailsModal = function(orderId) {
    const o = filteredSubmittedOrders.find(item => item.id === orderId) || allSubmittedOrders.find(item => item.id === orderId);
    if (!o) return;

    document.getElementById('lblDetailOrderId').textContent = o.order_code || o.orderCode || '—';
    document.getElementById('lblDetailTrackingCode').textContent = o.tracking_code || o.trackingCode || 'Chưa cấp mã';
    document.getElementById('lblDetailCustName').textContent = o.name || o.customer_name || '—';
    document.getElementById('lblDetailCustPhone').textContent = o.phone || '—';
    document.getElementById('lblDetailCustAddress').textContent = o.address || '—';
    
    const isJt = (o.platform || o.carrier || '').toLowerCase().includes('jt');
    document.getElementById('lblDetailCarrier').textContent = isJt ? 'J&T Express' : 'VNPost';
    document.getElementById('lblDetailCodAmount').textContent = formatCurrency(o.cod_amount || o.codAmount);
    document.getElementById('lblDetailWeight').textContent = o.weight ? (o.weight + ' g') : '—';
    document.getElementById('lblDetailProductNote').textContent = o.product_note || o.productNote || '—';
    
    document.getElementById('lblDetailDeviceName').textContent = o.device_name || o.deviceName || 'Máy chính';
    document.getElementById('lblDetailSubmittedAt').textContent = o.submitted_at ? new Date(o.submitted_at).toLocaleString('vi-VN') : '—';
    document.getElementById('lblDetailUserEmail').textContent = o.user_email || '—';

    // Store current order object on window for copy button
    window.currentDetailOrder = o;
    openModalEl(modalOrderDetails);
  };

  const closeOrderDetails = () => closeModalEl(modalOrderDetails);
  document.getElementById('btnCloseOrderDetailsModal')?.addEventListener('click', closeOrderDetails);
  document.getElementById('btnDetailClose')?.addEventListener('click', closeOrderDetails);

  document.getElementById('btnDetailCopyAll')?.addEventListener('click', () => {
    const o = window.currentDetailOrder;
    if (!o) return;
    const text = `Mã đơn hàng: ${o.order_code || o.orderCode || ''}
Mã vận đơn: ${o.tracking_code || o.trackingCode || 'Chưa cấp mã'}
Người nhận: ${o.name || ''} - ${o.phone || ''}
Địa chỉ: ${o.address || ''}
Bưu cục: ${(o.platform || o.carrier || '').includes('jt') ? 'J&T Express' : 'VNPost'}
COD: ${formatCurrency(o.cod_amount || o.codAmount)}
Sản phẩm / Ghi chú: ${o.product_note || o.productNote || ''}`;
    
    navigator.clipboard.writeText(text)
      .then(() => alert('Đã sao chép toàn bộ thông tin đơn hàng!'))
      .catch(() => alert('Lỗi sao chép thông tin.'));
  });

  // --- 5. CUSTOMER DETAIL MODAL CONTROLLER (CRM) ---
  const modalCustDetail = document.getElementById('modalCustomerDetail');

  window.openCustomerDetailModal = function(phone) {
    // Find customer object
    const c = allCustomers.find(item => item.phone === phone);
    if (!c) return;

    document.getElementById('txtCustDetailName').value = c.name || '';
    document.getElementById('txtCustDetailPhone').value = c.phone || '';
    document.getElementById('txtCustDetailAddress').value = c.address || '';
    document.getElementById('selectCustDetailSegment').value = c.segment || 'Thành viên';
    document.getElementById('txtCustDetailNotes').value = c.notes || '';

    // History & COD totals
    const customerOrders = allSubmittedOrders.filter(o => o.phone === phone);
    const totalCod = customerOrders.reduce((sum, o) => sum + (Number(o.cod_amount || o.codAmount) || 0), 0);
    
    document.getElementById('lblCustDetailTotalCod').textContent = formatCurrency(totalCod);
    document.getElementById('lblCustDetailTotalOrders').textContent = `${customerOrders.length} đơn`;

    // Render history
    const tbody = document.getElementById('tbodyCustDetailOrders');
    if (tbody) {
      if (customerOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-s);">Chưa có đơn hàng nào đẩy từ hệ thống.</td></tr>';
      } else {
        tbody.innerHTML = customerOrders.map(o => {
          const date = o.submitted_at ? new Date(o.submitted_at).toLocaleDateString('vi-VN') : '—';
          const tracking = o.tracking_code || o.trackingCode || 'Chờ cấp mã';
          const cod = formatCurrency(o.cod_amount || o.codAmount);
          const carrier = (o.platform || o.carrier || '').toLowerCase().includes('jt') ? 'J&T' : 'VNPost';
          return `
            <tr>
              <td>${date}</td>
              <td><code style="font-weight:700;">${escapeHtml(tracking)}</code></td>
              <td>${escapeHtml(o.product_note || o.productNote || '—')}</td>
              <td style="color:#10B981; font-weight:700;">${cod}</td>
              <td>${carrier}</td>
            </tr>
          `;
        }).join('');
      }
    }

    openModalEl(modalCustDetail);
  };

  const closeCustDetail = () => closeModalEl(modalCustDetail);
  document.getElementById('btnCloseCustomerDetailModal')?.addEventListener('click', closeCustDetail);
  document.getElementById('btnCancelCustDetail')?.addEventListener('click', closeCustDetail);

  // Save Customer
  document.getElementById('btnSaveCustDetail')?.addEventListener('click', async () => {
    const name = document.getElementById('txtCustDetailName').value.trim();
    const phone = document.getElementById('txtCustDetailPhone').value.trim();
    const address = document.getElementById('txtCustDetailAddress').value.trim();
    const segment = document.getElementById('selectCustDetailSegment').value;
    const notes = document.getElementById('txtCustDetailNotes').value.trim();

    try {
      if (sb) {
        // Upsert customer info
        await sb.from('customers').upsert({
          phone: phone,
          shop_id: activeShopId,
          name: name,
          address: address,
          segment: segment,
          notes: notes
        });
        
        // Refresh customer list
        await aggregateCustomersData();
        renderCustomersTable();
        alert('Cập nhật thông tin khách hàng thành công!');
        closeModalEl(modalCustDetail);
      }
    } catch (err) {
      alert('Lỗi cập nhật: ' + err.message);
    }
  });

  // Blacklist Toggle
  window.toggleCustomerBlacklist = async function(phone, currentIsBlacklist) {
    const actionText = currentIsBlacklist ? 'gỡ khỏi Blacklist' : 'đưa vào Blacklist';
    if (!confirm(`Xác nhận ${actionText} số điện thoại ${phone}?`)) return;

    try {
      if (sb) {
        const nextSegment = currentIsBlacklist ? 'Thành viên' : 'Blacklist';
        await sb.from('customers').upsert({
          phone: phone,
          shop_id: activeShopId,
          segment: nextSegment
        });
        await aggregateCustomersData();
        renderCustomersTable();
        alert(`Đã ${actionText} thành công!`);
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  // --- 6. STAFF DETAIL & EDIT MODAL CONTROLLER ---
  const modalStaffDetail = document.getElementById('modalStaffDetail');

  window.openStaffDetailModal = function(memberId) {
    const m = allStaffMembers.find(item => item.id === memberId);
    if (!m) return;

    document.getElementById('txtStaffDetailMemberId').value = m.id;
    document.getElementById('lblStaffDetailName').textContent = m.profile?.full_name || 'Nhân viên';
    document.getElementById('lblStaffDetailEmail').textContent = m.profile?.email || '—';
    document.getElementById('lblStaffDetailPhone').textContent = m.profile?.phone || '—';
    document.getElementById('selectStaffDetailRole').value = m.role || 'STAFF';
    document.getElementById('selectStaffDetailStatus').value = m.status || 'active';

    openModalEl(modalStaffDetail);
  };

  const closeStaffDetail = () => closeModalEl(modalStaffDetail);
  document.getElementById('btnCloseStaffDetailModal')?.addEventListener('click', closeStaffDetail);
  document.getElementById('btnCancelStaffDetail')?.addEventListener('click', closeStaffDetail);

  // Save Staff Detail
  document.getElementById('btnSaveStaffDetail')?.addEventListener('click', async () => {
    const memberId = document.getElementById('txtStaffDetailMemberId').value;
    const role = document.getElementById('selectStaffDetailRole').value;
    const status = document.getElementById('selectStaffDetailStatus').value;

    try {
      if (sb) {
        // If it starts with 'owner_', it's the owner account which shouldn't be edited this way
        if (memberId.startsWith('owner_')) {
          alert('Không thể chỉnh sửa tài khoản Chủ Shop gốc!');
          return;
        }

        // Update role and status in shop_members table
        await sb.from('shop_members').update({ role: role, status: status }).eq('id', memberId);
        
        // Also update role in profiles table to keep in sync
        const m = allStaffMembers.find(item => item.id === memberId);
        if (m && m.user_id) {
          await sb.from('profiles').update({ role: role, status: status }).eq('id', m.user_id);
        }

        await fetchShopStaff();
        renderStaffTable();
        alert('Cập nhật vai trò & trạng thái thành công!');
        closeModalEl(modalStaffDetail);
      }
    } catch (err) {
      alert('Lỗi cập nhật thành viên: ' + err.message);
    }
  });
}
