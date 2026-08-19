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

    // 3. Tải toàn bộ dữ liệu thực từ Supabase
    await loadAllShopData();

    // 4. Đăng ký Realtime Subscriptions
    setupRealtimeSubscriptions();

  } catch (err) {
    console.error('Lỗi khởi tạo Dashboard:', err);
    window.location.replace('login.html');
  }
});

async function checkStrictAuth() {
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

  // Kiểm tra quyền Master Admin
  let isSysAdmin = false;
  if (typeof AuthService !== 'undefined' && AuthService.isSystemAdmin) {
    isSysAdmin = await AuthService.isSystemAdmin().catch(() => false);
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

// ─── 1. FETCH SHOPS ──────────────────────────────────────────────────────
async function fetchShopsList() {
  if (!sb) return;
  try {
    const { data: shops } = await sb.from('shops').select('id, name, code, is_active').order('name');
    currentShops = shops || [];

    const selectEl = document.getElementById('topbarShopSelect');
    if (selectEl) {
      selectEl.innerHTML = '<option value="all">🌐 Toàn bộ Chi Nhánh & Đơn Hàng</option>' +
        currentShops.map(s => `<option value="${s.id}" ${s.id === activeShopId ? 'selected' : ''}>🏪 ${escapeHtml(s.name)}</option>`).join('');

      selectEl.onchange = (e) => {
        activeShopId = e.target.value;
        const selectedShop = currentShops.find(s => s.id === activeShopId);
        const titleEl = document.getElementById('topbarShopTitle');
        if (titleEl) {
          titleEl.textContent = selectedShop ? selectedShop.name.toUpperCase() : 'SHOP COMMAND CENTER';
        }
        filterAndRenderAll();
      };
    }
  } catch (err) {
    console.warn('Lỗi tải danh sách shop:', err);
  }
}

// ─── 2. FETCH SUBMITTED ORDERS & SMART DE-DUPLICATION ──────────────────
async function fetchSubmittedOrders() {
  if (!sb) return;
  try {
    const { data, error } = await sb
      .from('submitted_orders')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(1000);

    if (!error && data) {
      // Smart De-duplication: Gom các bản ghi cùng 1 đơn hàng (trước & sau khi bưu điện cấp mã tracking)
      const uniqueMap = new Map();

      for (const order of data) {
        const phone = String(order.phone || '').replace(/\D/g, '');
        const name = (order.name || order.customer_name || '').trim().toLowerCase();
        const code = (order.order_code || '').trim().toLowerCase();
        const timeKey = order.submitted_at ? new Date(order.submitted_at).toISOString().slice(0, 16) : 'notime';

        const key = code && code !== '—' ? `code_${code}` : `np_${phone}_${name}_${timeKey}`;

        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, { ...order });
        } else {
          const existing = uniqueMap.get(key);
          if (!existing.tracking_code && order.tracking_code) {
            existing.tracking_code = order.tracking_code;
          }
          if (!existing.order_code && order.order_code) {
            existing.order_code = order.order_code;
          }
          if (!existing.cod_amount && order.cod_amount) {
            existing.cod_amount = order.cod_amount;
          }
          if (!existing.carrier_account && order.carrier_account) {
            existing.carrier_account = order.carrier_account;
          }
          if (!existing.device_name && order.device_name) {
            existing.device_name = order.device_name;
          }
        }
      }

      allSubmittedOrders = Array.from(uniqueMap.values());
    }
  } catch (err) {
    console.warn('Lỗi tải đơn đã lên:', err);
  }
}

// ─── 3. FETCH DRAFT ORDERS ──────────────────────────────────────────────
async function fetchDraftOrders() {
  if (!sb) return;
  try {
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (!error && data) {
      allDraftOrders = data;
    }
  } catch (err) {
    console.warn('Lỗi tải đơn nháp:', err);
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
    }
  } catch (err) {
    console.warn('Lỗi tải cấu hình shop:', err);
  }
}

// ─── 7. FETCH SHOP STAFF & PROFILES (100% REAL DB) ──────────────────────
async function fetchShopStaff() {
  if (!sb) return;
  try {
    let query = sb.from('shop_members').select('id, shop_id, user_id, role, status, created_at');
    if (activeShopId && activeShopId !== 'all') {
      query = query.eq('shop_id', activeShopId);
    }
    const { data: members } = await query;

    if (!members || members.length === 0) {
      allStaffMembers = [];
      return;
    }

    const userIds = members.map(m => m.user_id).filter(Boolean);
    const { data: profiles } = await sb.from('profiles').select('id, email, full_name, phone').in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    allStaffMembers = members.map(m => ({
      ...m,
      profile: profileMap[m.user_id] || { email: 'user@shop.vn', full_name: 'Nhân viên' }
    }));
  } catch (err) {
    console.warn('Lỗi tải nhân viên:', err);
  }
}

// ─── 8. FETCH SHOP DEVICES ──────────────────────────────────────────────
async function fetchShopDevices() {
  if (!sb) return;
  try {
    const { data } = await sb.from('shop_devices').select('*').order('last_active_at', { ascending: false });
    allDevices = data || [];
  } catch (err) {
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-s);">Chưa có dữ liệu khách hàng trong Database.</td></tr>';
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
        <td><strong>${escapeHtml(c.name || 'Khách Vãng Lai')}</strong></td>
        <td><code>${escapeHtml(c.phone)}</code></td>
        <td style="max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(c.address)}">${escapeHtml(c.address || '--')}</td>
        <td><strong>${c.total_orders || 1} đơn</strong></td>
        <td><strong style="color:#10B981;">${formatCurrency(c.total_cod)}</strong></td>
        <td>${badgeHtml}</td>
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

// ─── 6. RENDER STAFF TABLE (100% REAL DB DATA ONLY) ─────────────────────
function renderStaffTable() {
  const tbody = document.getElementById('tbodyStaffList');
  if (!tbody) return;

  if (allStaffMembers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-s);">Chưa có nhân viên nào được gán vào Shop này trong Database. Bấm nút phía trên để cấp tài khoản.</td></tr>`;
    return;
  }

  tbody.innerHTML = allStaffMembers.map(m => {
    const p = m.profile || {};
    const roleCode = m.role || 'STAFF';
    let roleBadge = '<span class="badge" style="background:#EEF2FF; color:#4F46E5; font-weight:700;">Nhân Viên Bóc Đơn</span>';
    if (roleCode === 'SHOP_OWNER' || roleCode === 'OWNER') roleBadge = '<span class="owner-badge">CHỦ SHOP</span>';
    else if (roleCode === 'MANAGER') roleBadge = '<span class="badge" style="background:#FEF3C7; color:#B45309; font-weight:700;">Quản Lý Kho</span>';

    return `
      <tr>
        <td><strong>${escapeHtml(p.full_name || p.email?.split('@')[0] || 'Nhân viên')}</strong></td>
        <td><code>${escapeHtml(p.email || '--')}</code></td>
        <td>${escapeHtml(p.phone || '--')}</td>
        <td>${roleBadge}</td>
        <td>${m.created_at ? new Date(m.created_at).toLocaleDateString('vi-VN') : '--'}</td>
        <td><span class="status-online">Hoạt động</span></td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-secondary btn-sm" onclick="promptChangeStaffRole('${m.id}', '${roleCode}')" title="Phân quyền"><i class="ph ph-shield"></i></button>
            <button class="btn btn-secondary btn-sm" style="color:#EF4444;" onclick="deleteStaffMember('${m.id}')" title="Xóa khỏi shop"><i class="ph ph-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── 7. RENDER SHOP SETTINGS FORM ───────────────────────────────────────
function renderShopSettingsForm() {
  const vnpostCfg = currentShopConfig.vnpost || {};
  const jtCfg = currentShopConfig.jt || {};
  const shop = currentShopConfig.shopDetails || {};

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

  if (cfgShopName) cfgShopName.value = shop.name || 'Shop Bonsai Tài Lộc';
  if (cfgSenderName) cfgSenderName.value = vnpostCfg.sender_name || 'Nguyễn Văn Tài';
  if (cfgSenderPhone) cfgSenderPhone.value = vnpostCfg.sender_phone || '0987654321';
  if (cfgSenderProvince) cfgSenderProvince.value = vnpostCfg.sender_province || 'TP. Hồ Chí Minh';
  if (cfgSenderDistrict) cfgSenderDistrict.value = vnpostCfg.sender_district || 'Quận Tân Bình';
  if (cfgSenderAddress) cfgSenderAddress.value = vnpostCfg.sender_address || '123 Hoàng Hoa Thám, Phường 13';

  if (cfgVnpostCode) cfgVnpostCode.value = vnpostCfg.customer_code || 'CUST-VNP-12345';
  if (cfgJtCode) cfgJtCode.value = jtCfg.customer_code || 'VIP-JT-998877';
  if (cfgOrderPrefix) cfgOrderPrefix.value = vnpostCfg.order_prefix || 'AF-';

  if (cfgBankName) cfgBankName.value = vnpostCfg.bank_name || 'Vietcombank';
  if (cfgBankAccountNo) cfgBankAccountNo.value = vnpostCfg.bank_account_no || '0123456789';
  if (cfgBankAccountHolder) cfgBankAccountHolder.value = vnpostCfg.bank_account_holder || 'NGUYEN VAN TAI';
}

// ─── 8. RENDER DEVICES TABLE ────────────────────────────────────────────
function renderDevicesTable() {
  const tbody = document.getElementById('tbodyDevicesList');
  if (!tbody) return;

  if (allDevices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-s);">Chưa có thiết bị nào kích hoạt Extension của shop.</td></tr>';
    return;
  }

  tbody.innerHTML = allDevices.map(d => `
    <tr>
      <td><strong><i class="ph ph-laptop"></i> ${escapeHtml(d.device_name || 'Chrome Extension')}</strong></td>
      <td><code>${escapeHtml(d.ip_address || '127.0.0.1')}</code></td>
      <td>${d.last_active_at ? new Date(d.last_active_at).toLocaleString('vi-VN') : 'Vừa xong'}</td>
      <td><span class="status-online">Đang kết nối</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" style="color:#EF4444;" onclick="revokeDeviceSession('${d.id}')">
          <i class="ph ph-power"></i> Ngắt kết nối
        </button>
      </td>
    </tr>
  `).join('');
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
        await sb.from('carrier_configs').upsert([
          { carrier: 'vnpost', config: vnpostConfig },
          { carrier: 'jt', config: jtConfig }
        ], { onConflict: 'carrier' });
      }
      alert('Đã lưu cấu hình Shop & Bưu Cục thành công vào Supabase! Extension Panel sẽ tự động nhận diện thông tin mới.');
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
    const fullName = (document.getElementById('txtStaffFullName')?.value || '').trim();
    const ident = (document.getElementById('txtStaffIdentifier')?.value || '').trim();
    const pass = (document.getElementById('txtStaffPassword')?.value || '').trim();
    const role = document.getElementById('selectStaffRole')?.value || 'STAFF';

    if (!ident || !pass) return alert('Vui lòng nhập Email và Mật khẩu khởi tạo!');

    try {
      if (sb) {
        let userId = null;
        const { data: existing } = await sb.from('profiles').select('id').eq('email', ident).maybeSingle();
        if (existing) {
          userId = existing.id;
        } else {
          userId = 'usr_' + Date.now().toString(36);
          await sb.from('profiles').insert({
            id: userId,
            email: ident,
            full_name: fullName || ident.split('@')[0],
            role: role
          });
        }

        await sb.from('shop_members').insert({
          shop_id: activeShopId !== 'all' ? activeShopId : (currentShops[0]?.id || null),
          user_id: userId,
          role: role,
          status: 'active'
        });
      }

      alert(`Cấp tài khoản nhân viên thành công cho "${ident}"!`);
      closeModalEl(modalStaff);
      document.getElementById('txtStaffFullName').value = '';
      document.getElementById('txtStaffIdentifier').value = '';
      document.getElementById('txtStaffPassword').value = '';
      await fetchShopStaff();
      renderStaffTable();
    } catch (err) {
      alert('Lỗi cấp tài khoản: ' + err.message);
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
    const table = type === 'submitted' ? 'submitted_orders' : 'orders';
    if (sb) {
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

window.deleteStaffMember = async function(memberId) {
  if (!confirm('Xác nhận xóa quyền nhân viên này khỏi Shop?')) return;
  try {
    if (sb) {
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
      await sb.from('shop_devices').delete().eq('id', devId);
    }
    allDevices = allDevices.filter(d => d.id !== devId);
    renderDevicesTable();
    alert('Đã ngắt kết nối phiên làm việc của thiết bị thành công!');
  } catch (err) {
    alert('Lỗi ngắt kết nối: ' + err.message);
  }
};

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
