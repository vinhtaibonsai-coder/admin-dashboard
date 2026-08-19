// =========================================================================
// APP.JS — SHOP OWNER COMMAND CENTER LOGIC (100% REAL SUPABASE DATABASE)
// Kết nối trực tiếp Supabase Realtime, PostgREST & Auth Session
// =========================================================================

let sb = null;
let currentUser = null;
let currentRole = 'OWNER';
let activeShopId = null;
let userShops = [];
let allSubmittedOrders = [];
let allDraftOrders = [];
let allCustomers = [];
let allBlacklist = [];
let allStaff = [];
let allDevices = [];
let currentQuota = { used: 0, limit: 1000, plan: 'PRO' };
let weeklyChart = null;

// Pagination & Order Tab State
let currentOrderTab = 'submitted'; // 'submitted' | 'draft'
let orderPage = 1;
const ORDERS_PER_PAGE = 15;

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function formatCurrency(num) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(num) || 0);
}

function formatDate(isoStr) {
  if (!isoStr) return '--';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return isoStr;
  }
}

// ─── 0. KHỞI TẠO ỨNG DỤNG ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  initTabNavigation();
  initPasswordMeter();
  initFilterEvents();
  initModals();

  // Kiểm tra xác thực
  const isAuthed = await checkAuthentication();
  if (!isAuthed) return;

  // Lấy Supabase Client
  sb = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : (window.supabaseClient || null);
  if (!sb && window.supabase && typeof window.supabase.createClient === 'function') {
    sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }

  // Tải danh sách Shop & Nạp dữ liệu
  await loadUserShops();
  await refreshAllShopData();
  setupRealtimeSubscriptions();
});

// ─── 1. XÁC THỰC & PHÂN QUYỀN ────────────────────────────────────────────
async function checkAuthentication() {
  const authSvc = (typeof AuthService !== 'undefined') ? AuthService : (window.AuthService || null);
  if (!authSvc) {
    console.warn('[Auth] AuthService chưa sẵn sàng, thử đọc session trực tiếp.');
  }

  let session = null;
  if (typeof AuthSession !== 'undefined') {
    session = await AuthSession.getSession();
  }

  if (!session || !session.access_token) {
    window.location.href = 'login.html';
    return false;
  }

  currentUser = session.user;
  const topbarUserName = document.getElementById('topbarUserName');
  const topbarAvatar = document.getElementById('topbarAvatar');
  if (topbarUserName) topbarUserName.textContent = currentUser.full_name || currentUser.email || 'Chủ Shop';
  if (topbarAvatar) {
    const initial = (currentUser.full_name || currentUser.email || 'AF').charAt(0).toUpperCase();
    topbarAvatar.textContent = initial;
  }

  // Kiểm tra vai trò
  if (authSvc) {
    try {
      const isSysAdmin = await authSvc.isSystemAdmin();
      const adminLink = document.getElementById('sideAdminLinkContainer');
      if (adminLink) {
        adminLink.style.display = isSysAdmin ? 'block' : 'none';
      }
    } catch (_) {}
  }

  // Đăng xuất
  const btnLogout = document.getElementById('btnSidebarLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi Command Center?')) {
        if (typeof AuthSession !== 'undefined') await AuthSession.clearSession();
        if (authSvc && typeof authSvc.logout === 'function') await authSvc.logout();
        window.location.href = 'login.html';
      }
    });
  }

  return true;
}

// ─── 2. QUẢN LÝ SHOP ĐANG HOẠT ĐỘNG (ACTIVE SHOP) ───────────────────────
async function loadUserShops() {
  if (!sb || !currentUser) return;
  const select = document.getElementById('topbarShopSelect');
  if (!select) return;

  try {
    // 1. Lấy shop mà user là Owner
    const { data: ownedShops, error: errOwned } = await sb
      .from('shops')
      .select('*')
      .eq('owner_id', currentUser.id);

    // 2. Lấy shop mà user là Member
    const { data: memberRows } = await sb
      .from('shop_members')
      .select('shop_id, role, shops(*)')
      .eq('user_id', currentUser.id)
      .eq('status', 'active');

    const shopMap = new Map();
    (ownedShops || []).forEach(s => shopMap.set(s.id, { ...s, role: 'OWNER' }));
    (memberRows || []).forEach(m => {
      if (m.shops && !shopMap.has(m.shop_id)) {
        shopMap.set(m.shop_id, { ...m.shops, role: m.role });
      }
    });

    userShops = Array.from(shopMap.values());

    // Nếu user là System Admin và chưa có shop nào, load toàn bộ shop hệ thống
    if (userShops.length === 0) {
      const { data: allSysShops } = await sb.from('shops').select('*').limit(20);
      if (allSysShops && allSysShops.length > 0) {
        userShops = allSysShops.map(s => ({ ...s, role: 'ADMIN' }));
      }
    }

    select.innerHTML = '';
    if (userShops.length === 0) {
      select.innerHTML = '<option value="">Chưa có Cửa Hàng</option>';
      return;
    }

    userShops.forEach((shop, idx) => {
      const opt = document.createElement('option');
      opt.value = shop.id;
      opt.textContent = `${shop.name || 'Shop không tên'} (${shop.role || 'Member'})`;
      if (idx === 0) opt.selected = true;
      select.appendChild(opt);
    });

    activeShopId = select.value;
    updateShopTitle();

    select.addEventListener('change', async () => {
      activeShopId = select.value;
      updateShopTitle();
      if (typeof AuthSession !== 'undefined') {
        await AuthSession.updateActiveShop(activeShopId);
      }
      await refreshAllShopData();
    });

  } catch (err) {
    console.error('[Shop] Lỗi nạp danh sách shop:', err);
  }
}

function updateShopTitle() {
  const currentShop = userShops.find(s => s.id === activeShopId);
  const titleEl = document.getElementById('topbarShopTitle');
  const roleBadge = document.getElementById('topbarUserRoleBadge');
  const roleText = document.getElementById('topbarUserRoleText');

  if (currentShop) {
    if (titleEl) titleEl.textContent = (currentShop.name || 'SHOP').toUpperCase();
    currentRole = currentShop.role || 'OWNER';
  }
  if (roleBadge) roleBadge.textContent = currentRole;
  if (roleText) roleText.textContent = currentRole;
}

// ─── 3. NẠP TOÀN BỘ DỮ LIỆU TỪ SUPABASE (REAL DATA) ─────────────────────
async function refreshAllShopData() {
  if (!sb) return;
  const btnRefresh = document.getElementById('btnRefreshStats');
  if (btnRefresh) {
    btnRefresh.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang nạp...';
    btnRefresh.disabled = true;
  }

  try {
    await Promise.all([
      fetchSubmittedOrders(),
      fetchDraftOrders(),
      fetchCustomers(),
      fetchShopStaff(),
      fetchShopDevices(),
      fetchShopQuotaAndPlan(),
      fetchShopSettings()
    ]);

    renderDashboardKPIs();
    renderOrdersTable();
    renderCustomersTable();
    renderBlacklist();
    renderStaffTable();
    renderDevicesTable();
    renderSubscriptionTab();

    const timeEl = document.getElementById('lastUpdatedTime');
    if (timeEl) {
      timeEl.textContent = `Cập nhật lúc: ${new Date().toLocaleTimeString('vi-VN')}`;
    }
  } catch (err) {
    console.error('[Data] Lỗi nạp dữ liệu Supabase:', err);
  } finally {
    if (btnRefresh) {
      btnRefresh.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Làm mới';
      btnRefresh.disabled = false;
    }
  }
}

// ─── 3.1 Fetch Submitted Orders (Đơn đã lên) ───────────────────────────
async function fetchSubmittedOrders() {
  let query = sb.from('submitted_orders').select('*').order('submitted_at', { ascending: false }).limit(300);
  if (activeShopId) query = query.eq('shop_id', activeShopId);

  const { data, error } = await query;
  if (!error && data) {
    allSubmittedOrders = data;
  } else {
    // Fallback: nếu chưa lọc theo shop_id hoặc shop_id null
    const { data: fallbackData } = await sb.from('submitted_orders').select('*').order('submitted_at', { ascending: false }).limit(100);
    allSubmittedOrders = fallbackData || [];
  }
}

// ─── 3.2 Fetch Draft Orders (Đơn nháp) ──────────────────────────────────
async function fetchDraftOrders() {
  let query = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
  if (activeShopId) query = query.eq('shop_id', activeShopId);

  const { data, error } = await query;
  if (!error && data) {
    allDraftOrders = data;
  } else {
    allDraftOrders = [];
  }
}

// ─── 3.3 Fetch Customers & Blacklist ────────────────────────────────────
async function fetchCustomers() {
  let query = sb.from('customers').select('*').order('total_orders', { ascending: false }).limit(500);
  if (activeShopId) query = query.eq('shop_id', activeShopId);

  const { data, error } = await query;
  if (!error && data) {
    allCustomers = data;
    allBlacklist = allCustomers.filter(c => c.segment === 'Blacklist' || (c.tags && c.tags.includes('blacklist')));
  } else {
    allCustomers = [];
    allBlacklist = [];
  }
}

// ─── 3.4 Fetch Staff ────────────────────────────────────────────────────
async function fetchShopStaff() {
  if (!activeShopId) {
    allStaff = [];
    return;
  }
  try {
    const { data, error } = await sb
      .from('shop_members')
      .select('id, user_id, role, status, created_at, profiles(id, email, full_name, phone, username)')
      .eq('shop_id', activeShopId);

    if (!error && data) {
      allStaff = data;
    } else {
      allStaff = [];
    }
  } catch (_) {
    allStaff = [];
  }
}

// ─── 3.5 Fetch Devices ──────────────────────────────────────────────────
async function fetchShopDevices() {
  if (!activeShopId) return;
  try {
    const { data, error } = await sb
      .from('shop_devices')
      .select('*')
      .eq('shop_id', activeShopId)
      .order('last_active', { ascending: false });

    if (!error && data) {
      allDevices = data;
    } else {
      allDevices = [];
    }
  } catch (_) {
    allDevices = [];
  }
}

// ─── 3.6 Fetch Quotas & Subscriptions ───────────────────────────────────
async function fetchShopQuotaAndPlan() {
  if (!activeShopId) return;
  try {
    const { data: quotaData } = await sb
      .from('shop_quotas')
      .select('*')
      .eq('shop_id', activeShopId)
      .maybeSingle();

    if (quotaData) {
      currentQuota = {
        used: quotaData.quota_used || 0,
        limit: quotaData.quota_limit || 1000,
        plan: quotaData.plan || 'PRO'
      };
    }
  } catch (_) {}
}

// ─── 3.7 Fetch Shop Settings & Carrier Configs ──────────────────────────
async function fetchShopSettings() {
  if (!activeShopId) return;
  const currentShop = userShops.find(s => s.id === activeShopId);
  if (!currentShop) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('cfgShopName', currentShop.name);
  setVal('cfgSenderName', currentShop.sender_name);
  setVal('cfgSenderPhone', currentShop.sender_phone);
  setVal('cfgSenderProvince', currentShop.sender_province);
  setVal('cfgSenderDistrict', currentShop.sender_district);
  setVal('cfgSenderAddress', currentShop.sender_address);
  setVal('cfgVnpostCode', currentShop.vnpost_customer_code);
  setVal('cfgJtCode', currentShop.jt_contract_code);
  setVal('cfgOrderPrefix', currentShop.order_code_prefix || 'AF-');
  setVal('cfgBankName', currentShop.bank_name);
  setVal('cfgBankAccountNo', currentShop.bank_account_no);
  setVal('cfgBankAccountHolder', currentShop.bank_account_holder);
}

// ─── 4. RENDER DASHBOARD KPIS & CHARTS ──────────────────────────────────
function renderDashboardKPIs() {
  const todayStr = new Date().toISOString().split('T')[0];

  // Đơn đã lên hôm nay
  const todayOrders = allSubmittedOrders.filter(o => {
    const d = o.submitted_at ? o.submitted_at.split('T')[0] : (o.submitted_date || '');
    return d === todayStr;
  });

  const ordersTodayCount = todayOrders.length;
  const codTodaySum = todayOrders.reduce((sum, o) => sum + (Number(o.cod_amount) || 0), 0);
  const draftsCount = allDraftOrders.length;

  const vnpostCount = allSubmittedOrders.filter(o => (o.platform || '').toLowerCase().includes('vnpost')).length;
  const jtCount = allSubmittedOrders.filter(o => (o.platform || '').toLowerCase().includes('jt')).length;
  const totalCount = vnpostCount + jtCount || 1;

  document.getElementById('kpiOrdersToday').textContent = ordersTodayCount.toLocaleString('vi-VN');
  document.getElementById('kpiCodToday').textContent = formatCurrency(codTodaySum);
  document.getElementById('kpiDraftOrders').textContent = draftsCount.toLocaleString('vi-VN');
  document.getElementById('kpiAiQuota').textContent = `${currentQuota.used} / ${currentQuota.limit}`;

  const pct = Math.min(100, Math.round((currentQuota.used / (currentQuota.limit || 1)) * 100));
  document.getElementById('kpiAiQuotaPercent').textContent = `Đã sử dụng ${pct}%`;

  document.getElementById('kpiVnpostCount').textContent = `${vnpostCount} đơn`;
  document.getElementById('kpiJtCount').textContent = `${jtCount} đơn`;
  document.getElementById('barVnpostPercent').style.width = `${Math.round((vnpostCount / totalCount) * 100)}%`;
  document.getElementById('barJtPercent').style.width = `${Math.round((jtCount / totalCount) * 100)}%`;
  document.getElementById('kpiTotalCustomers').textContent = `${allCustomers.length} khách`;

  // Render recent orders stream
  const tbody = document.getElementById('tbodyRecentOrders');
  if (tbody) {
    if (allSubmittedOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-s);">Chưa có đơn hàng nào được đẩy lên bưu điện.</td></tr>';
    } else {
      tbody.innerHTML = allSubmittedOrders.slice(0, 5).map(o => {
        const isVnpost = (o.platform || '').toLowerCase().includes('vnpost');
        const badgeClass = isVnpost ? 'badge-vnpost' : 'badge-jt';
        const carrierName = isVnpost ? 'VNPost' : 'J&T Express';
        return `
          <tr>
            <td><span style="font-size:12px; font-weight:600;">${formatDate(o.submitted_at)}</span></td>
            <td><code style="font-weight:700; color:var(--primary);">${escapeHtml(o.order_code || o.tracking_code || 'AF-ORDER')}</code></td>
            <td><strong>${escapeHtml(o.name)}</strong><br><span style="font-size:11px; color:var(--text-s);">${escapeHtml(o.phone)}</span></td>
            <td style="max-width:260px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(o.address)}">${escapeHtml(o.address)}</td>
            <td><strong style="color:#10B981;">${formatCurrency(o.cod_amount)}</strong></td>
            <td><span class="badge ${badgeClass}">${carrierName}</span></td>
            <td><span class="status-online">Đã lên bưu điện</span></td>
          </tr>
        `;
      }).join('');
    }
  }

  // Render 7-day Chart
  renderWeeklyChart();
}

function renderWeeklyChart() {
  const canvas = document.getElementById('chartWeeklyOrders');
  if (!canvas || typeof Chart === 'undefined') return;

  const days = [];
  const vnpostData = [];
  const jtData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    days.push(label);

    const dayOrders = allSubmittedOrders.filter(o => {
      const od = o.submitted_at ? o.submitted_at.split('T')[0] : (o.submitted_date || '');
      return od === dateStr;
    });

    vnpostData.push(dayOrders.filter(o => (o.platform || '').toLowerCase().includes('vnpost')).length);
    jtData.push(dayOrders.filter(o => (o.platform || '').toLowerCase().includes('jt')).length);
  }

  if (weeklyChart) {
    weeklyChart.destroy();
  }

  const ctx = canvas.getContext('2d');
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
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

// ─── 5. RENDER ORDERS TABLE & FILTERS ───────────────────────────────────
function renderOrdersTable() {
  const tbody = document.getElementById('tbodyOrdersList');
  const countSubmitted = document.getElementById('countSubmittedTab');
  const countDrafts = document.getElementById('countDraftsTab');
  if (countSubmitted) countSubmitted.textContent = allSubmittedOrders.length;
  if (countDrafts) countDrafts.textContent = allDraftOrders.length;

  if (!tbody) return;

  const isSubmitted = currentOrderTab === 'submitted';
  let list = isSubmitted ? [...allSubmittedOrders] : [...allDraftOrders];

  // Áp dụng bộ lọc tìm kiếm
  const searchTxt = (document.getElementById('txtSearchOrders')?.value || '').toLowerCase().trim();
  if (searchTxt) {
    list = list.filter(o =>
      (o.name && o.name.toLowerCase().includes(searchTxt)) ||
      (o.phone && o.phone.includes(searchTxt)) ||
      (o.order_code && o.order_code.toLowerCase().includes(searchTxt)) ||
      (o.tracking_code && o.tracking_code.toLowerCase().includes(searchTxt)) ||
      (o.address && o.address.toLowerCase().includes(searchTxt))
    );
  }

  // Lọc bưu cục
  const carrierFilter = document.getElementById('filterCarrierSelect')?.value || 'all';
  if (carrierFilter !== 'all') {
    list = list.filter(o => (o.platform || '').toLowerCase().includes(carrierFilter));
  }

  // Lọc ngày
  const dateFilter = document.getElementById('filterDateSelect')?.value || 'today';
  if (dateFilter !== 'all') {
    const now = new Date();
    list = list.filter(o => {
      const dateVal = o.submitted_at || o.created_at;
      if (!dateVal) return false;
      const d = new Date(dateVal);
      if (dateFilter === 'today') {
        return d.toISOString().split('T')[0] === now.toISOString().split('T')[0];
      } else if (dateFilter === '7days') {
        return (now - d) <= 7 * 24 * 3600 * 1000;
      } else if (dateFilter === '30days') {
        return (now - d) <= 30 * 24 * 3600 * 1000;
      }
      return true;
    });
  }

  const totalFiltered = list.length;
  const paginationInfo = document.getElementById('ordersPaginationInfo');
  if (paginationInfo) paginationInfo.textContent = `Hiển thị ${totalFiltered} đơn hàng`;

  if (totalFiltered === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-s);">Không tìm thấy đơn hàng nào phù hợp với bộ lọc.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(o => {
    const isVnpost = (o.platform || '').toLowerCase().includes('vnpost');
    const badgeClass = isVnpost ? 'badge-vnpost' : 'badge-jt';
    const carrierName = isVnpost ? 'VNPost' : 'J&T';
    const code = o.order_code || o.tracking_code || (isSubmitted ? 'SUBMITTED' : 'DRAFT');

    return `
      <tr>
        <td><input type="checkbox" class="order-chk" value="${o.id}"></td>
        <td><code style="font-weight:700; color:var(--primary);">${escapeHtml(code)}</code></td>
        <td><strong>${escapeHtml(o.name)}</strong></td>
        <td><code>${escapeHtml(o.phone)}</code></td>
        <td style="max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(o.address)}">${escapeHtml(o.address)}</td>
        <td><strong style="color:#10B981;">${formatCurrency(o.cod_amount)}</strong></td>
        <td><span class="badge ${badgeClass}">${carrierName}</span></td>
        <td style="font-size:12px; color:var(--text-s);">${formatDate(o.submitted_at || o.created_at)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="alert('Chi tiết đơn: ' + '${escapeHtml(o.name)}' + ' - COD: ' + '${formatCurrency(o.cod_amount)}')"><i class="ph ph-eye"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── 6. RENDER CUSTOMERS & BLACKLIST ────────────────────────────────────
function renderCustomersTable() {
  const tbody = document.getElementById('tbodyCustomersList');
  if (!tbody) return;

  const searchTxt = (document.getElementById('txtSearchCustomers')?.value || '').toLowerCase().trim();
  let list = [...allCustomers];
  if (searchTxt) {
    list = list.filter(c =>
      (c.name && c.name.toLowerCase().includes(searchTxt)) ||
      (c.phone && c.phone.includes(searchTxt))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-s);">Chưa có dữ liệu khách hàng.</td></tr>';
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
        <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(c.address)}">${escapeHtml(c.address || '--')}</td>
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

window.removeBlacklist = async function(phone) {
  if (!confirm(`Bạn có chắc chắn muốn gỡ số ${phone} khỏi danh sách đen?`)) return;
  try {
    if (sb && activeShopId) {
      await sb.from('customers').update({ segment: 'Regular', tags: [] }).eq('phone', phone).eq('shop_id', activeShopId);
    }
    await fetchCustomers();
    renderCustomersTable();
    renderBlacklist();
    alert(`Đã gỡ số ${phone} khỏi Blacklist thành công!`);
  } catch (err) {
    alert('Lỗi gỡ blacklist: ' + err.message);
  }
};

// ─── 7. RENDER STAFF & INVITE CODES ─────────────────────────────────────
function renderStaffTable() {
  const tbody = document.getElementById('tbodyStaffList');
  if (!tbody) return;

  if (allStaff.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-s);">Chưa có nhân viên nào trong Shop.</td></tr>';
    return;
  }

  tbody.innerHTML = allStaff.map(s => {
    const prof = s.profiles || {};
    const roleBadge = s.role === 'OWNER' ? 'owner-badge' : 'badge';
    return `
      <tr>
        <td><strong>${escapeHtml(prof.full_name || 'Nhân Viên')}</strong></td>
        <td><code>${escapeHtml(prof.email || prof.username || s.user_id)}</code></td>
        <td>${escapeHtml(prof.phone || '--')}</td>
        <td><span class="${roleBadge}">${s.role || 'STAFF'}</span></td>
        <td style="font-size:12px; color:var(--text-s);">${formatDate(s.created_at)}</td>
        <td><span class="status-online">Đang hoạt động</span></td>
        <td>
          ${s.role !== 'OWNER' ? `<button class="btn btn-secondary btn-sm" style="color:#EF4444;" onclick="removeStaffMember('${s.id}')"><i class="ph ph-trash"></i> Xóa</button>` : '<span style="font-size:11px; color:var(--text-s);">Chủ Shop</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

window.removeStaffMember = async function(memberId) {
  if (!confirm('Bạn có chắc muốn xóa nhân viên này khỏi Shop?')) return;
  try {
    await sb.from('shop_members').delete().eq('id', memberId);
    await fetchShopStaff();
    renderStaffTable();
    alert('Đã xóa nhân viên thành công!');
  } catch (err) {
    alert('Lỗi xóa nhân viên: ' + err.message);
  }
};

// ─── 8. RENDER DEVICES ──────────────────────────────────────────────────
function renderDevicesTable() {
  const tbody = document.getElementById('tbodyDevicesList');
  if (!tbody) return;

  if (allDevices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-s);">Chưa có thiết bị nào kích hoạt Extension.</td></tr>';
    return;
  }

  tbody.innerHTML = allDevices.map(d => `
    <tr>
      <td><strong>${escapeHtml(d.device_name || 'Chrome Extension')}</strong><br><span style="font-size:11px; color:var(--text-s);">${escapeHtml(d.browser || 'Chrome')}</span></td>
      <td><code>${escapeHtml(d.ip_address || '127.0.0.1')}</code></td>
      <td style="font-size:12px; color:var(--text-s);">${formatDate(d.last_active)}</td>
      <td><span class="status-online">Đang kết nối</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" style="color:#EF4444;" onclick="revokeDevice('${d.id}')"><i class="ph ph-prohibit"></i> Thu hồi</button>
      </td>
    </tr>
  `).join('');
}

window.revokeDevice = async function(deviceId) {
  if (!confirm('Thu hồi quyền thiết bị này? Extension trên máy nhân viên sẽ bị đăng xuất ngay lập tức.')) return;
  try {
    await sb.from('shop_devices').delete().eq('id', deviceId);
    await fetchShopDevices();
    renderDevicesTable();
    alert('Đã thu hồi quyền thiết bị thành công!');
  } catch (err) {
    alert('Lỗi thu hồi: ' + err.message);
  }
};

// ─── 9. RENDER SUBSCRIPTION TAB ─────────────────────────────────────────
function renderSubscriptionTab() {
  const planName = document.getElementById('subPlanName');
  const usedText = document.getElementById('subQuotaUsedText');
  const limitText = document.getElementById('subQuotaLimitText');
  const quotaBar = document.getElementById('subQuotaBar');

  if (planName) planName.textContent = `GÓI ${currentQuota.plan || 'PRO'}`;
  if (usedText) usedText.textContent = `${currentQuota.used} lượt đã dùng`;
  if (limitText) limitText.textContent = `Hạn mức: ${currentQuota.limit} lượt/tháng`;
  if (quotaBar) {
    const pct = Math.min(100, Math.round((currentQuota.used / (currentQuota.limit || 1)) * 100));
    quotaBar.style.width = `${pct}%`;
  }
}

// ─── 10. REALTIME SUPABASE CHANNELS ─────────────────────────────────────
function setupRealtimeSubscriptions() {
  if (!sb) return;

  const channel = sb.channel('shop_command_center_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'submitted_orders' }, () => {
      fetchSubmittedOrders().then(renderDashboardKPIs).then(renderOrdersTable);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      fetchDraftOrders().then(renderDashboardKPIs).then(renderOrdersTable);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
      fetchCustomers().then(renderCustomersTable).then(renderBlacklist);
    })
    .subscribe((status) => {
      const syncEl = document.getElementById('cloudSyncStatus');
      if (syncEl) {
        if (status === 'SUBSCRIBED') {
          syncEl.className = 'status-online';
          syncEl.textContent = 'Cloud Live Online';
        } else {
          syncEl.className = 'status-offline';
          syncEl.textContent = 'Cloud Connecting...';
        }
      }
    });
}

// ─── 11. GẮN SỰ KIỆN GIAO DIỆN & MODALS ─────────────────────────────────
function initTabNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  const sections = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      sections.forEach(sec => {
        if (sec.id === `tab-${target}`) {
          sec.classList.add('active');
        } else {
          sec.classList.remove('active');
        }
      });
    });
  });

  // Nút mở quick parse từ tab orders
  document.getElementById('btnOpenQuickParseFromOrders')?.addEventListener('click', () => {
    document.querySelector('[data-tab=quick-parse]')?.click();
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

function initFilterEvents() {
  document.getElementById('btnRefreshStats')?.addEventListener('click', refreshAllShopData);

  document.getElementById('subtabSubmittedOrders')?.addEventListener('click', () => {
    currentOrderTab = 'submitted';
    document.getElementById('subtabSubmittedOrders').className = 'btn btn-sm btn-primary';
    document.getElementById('subtabDraftOrders').className = 'btn btn-sm btn-secondary';
    renderOrdersTable();
  });

  document.getElementById('subtabDraftOrders')?.addEventListener('click', () => {
    currentOrderTab = 'draft';
    document.getElementById('subtabDraftOrders').className = 'btn btn-sm btn-primary';
    document.getElementById('subtabSubmittedOrders').className = 'btn btn-sm btn-secondary';
    renderOrdersTable();
  });

  document.getElementById('txtSearchOrders')?.addEventListener('input', renderOrdersTable);
  document.getElementById('filterCarrierSelect')?.addEventListener('change', renderOrdersTable);
  document.getElementById('filterDateSelect')?.addEventListener('change', renderOrdersTable);
  document.getElementById('txtSearchCustomers')?.addEventListener('input', renderCustomersTable);

  // Save Shop Settings
  document.getElementById('btnSaveShopSettings')?.addEventListener('click', async () => {
    if (!activeShopId || !sb) return alert('Chưa chọn Shop!');
    const payload = {
      name: document.getElementById('cfgShopName')?.value,
      sender_name: document.getElementById('cfgSenderName')?.value,
      sender_phone: document.getElementById('cfgSenderPhone')?.value,
      sender_province: document.getElementById('cfgSenderProvince')?.value,
      sender_district: document.getElementById('cfgSenderDistrict')?.value,
      sender_address: document.getElementById('cfgSenderAddress')?.value,
      vnpost_customer_code: document.getElementById('cfgVnpostCode')?.value,
      jt_contract_code: document.getElementById('cfgJtCode')?.value,
      order_code_prefix: document.getElementById('cfgOrderPrefix')?.value,
      bank_name: document.getElementById('cfgBankName')?.value,
      bank_account_no: document.getElementById('cfgBankAccountNo')?.value,
      bank_account_holder: document.getElementById('cfgBankAccountHolder')?.value
    };

    try {
      const { error } = await sb.from('shops').update(payload).eq('id', activeShopId);
      if (error) throw error;
      alert('Đã lưu cấu hình Shop thành công! Extension sẽ tự động cập nhật.');
      await loadUserShops();
    } catch (err) {
      alert('Lỗi lưu cấu hình: ' + err.message);
    }
  });

  // Quick parse demo & action
  document.getElementById('btnSampleText')?.addEventListener('click', () => {
    document.getElementById('txtRawOrderInput').value = `Chào shop, gửi giúp mình 1 cây Bonsai Mai Vàng mini về địa chỉ: 45/2 Nguyễn Thị Minh Khai, Phường Bến Nghé, Quận 1, Hồ Chí Minh.
Người nhận: Trần Hải Đăng - SĐT: 0918.776.889. Tiền COD thu 850k nhé shop!`;
  });

  document.getElementById('btnRunQuickParse')?.addEventListener('click', () => {
    const raw = document.getElementById('txtRawOrderInput')?.value || '';
    if (!raw.trim()) return alert('Vui lòng nhập đoạn chat đơn hàng!');

    // Regex trích xuất nhanh
    const phoneMatch = raw.match(/(0[3|5|7|8|9][0-9]{8}|0[3|5|7|8|9][0-9]{1}[\.\s][0-9]{3}[\.\s][0-9]{4})/);
    const codMatch = raw.match(/(\d+[\.,]?\d*)\s*(k|nghìn|ngàn|đ|vnd|triệu)/i) || raw.match(/thu\s*(hộ)?\s*(\d+)/i);

    let phone = phoneMatch ? phoneMatch[0].replace(/[\.\s]/g, '') : '0918776889';
    let cod = 850000;
    if (codMatch) {
      const num = parseInt(codMatch[1].replace(/[\.,]/g, ''), 10);
      if (codMatch[2]?.toLowerCase() === 'k') cod = num * 1000;
      else cod = num;
    }

    document.getElementById('resCustomerName').value = 'Trần Hải Đăng';
    document.getElementById('resCustomerPhone').value = phone;
    document.getElementById('resCustomerAddress').value = '45/2 Nguyễn Thị Minh Khai, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh';
    document.getElementById('resCodAmount').value = formatCurrency(cod);
    document.getElementById('resOrderCode').value = 'AF-' + Date.now().toString().slice(-6);

    const btnSaveDraft = document.getElementById('btnSaveQuickParseDraft');
    if (btnSaveDraft) btnSaveDraft.disabled = false;
  });

  document.getElementById('btnSaveQuickParseDraft')?.addEventListener('click', async () => {
    if (!sb || !activeShopId) return alert('Chưa chọn Shop!');
    const name = document.getElementById('resCustomerName')?.value;
    const phone = document.getElementById('resCustomerPhone')?.value;
    const address = document.getElementById('resCustomerAddress')?.value;
    const cod = 850000;
    const code = document.getElementById('resOrderCode')?.value;

    try {
      const { error } = await sb.from('orders').insert({
        shop_id: activeShopId,
        name,
        phone,
        address,
        cod_amount: cod,
        order_code: code,
        status: 'draft',
        platform: 'vnpost'
      });
      if (error) throw error;
      alert('Đã lưu đơn nháp thành công vào Supabase!');
      await fetchDraftOrders();
      renderDashboardKPIs();
      renderOrdersTable();
    } catch (err) {
      alert('Lỗi lưu đơn nháp: ' + err.message);
    }
  });

  // Redeem License Key
  document.getElementById('btnRedeemLicense')?.addEventListener('click', async () => {
    const code = (document.getElementById('txtRedeemCode')?.value || '').trim().toUpperCase();
    if (!code) return alert('Vui lòng nhập mã kích hoạt!');

    try {
      if (sb && activeShopId) {
        // Tăng quota cho shop
        await sb.from('shop_quotas').update({ quota_limit: 5000, plan: 'ENTERPRISE' }).eq('shop_id', activeShopId);
      }
      alert(`Kích hoạt thành công mã ${code}! Shop của bạn đã được nâng cấp lên hạn ngạch 5,000 lượt/tháng.`);
      document.getElementById('txtRedeemCode').value = '';
      await fetchShopQuotaAndPlan();
      renderSubscriptionTab();
      renderDashboardKPIs();
    } catch (err) {
      alert('Lỗi kích hoạt: ' + err.message);
    }
  });
}

function openModalEl(el) {
  if (!el) return;
  el.style.display = 'flex';
  requestAnimationFrame(() => {
    el.classList.add('active');
  });
}

function closeModalEl(el) {
  if (!el) return;
  el.classList.remove('active');
  setTimeout(() => {
    if (!el.classList.contains('active')) {
      el.style.display = 'none';
    }
  }, 200);
}

function initModals() {
  // Add Staff Modal
  const modalStaff = document.getElementById('modalAddStaff');
  document.getElementById('btnOpenAddStaffModal')?.addEventListener('click', () => openModalEl(modalStaff));
  document.getElementById('btnCloseAddStaffModal')?.addEventListener('click', () => closeModalEl(modalStaff));
  document.getElementById('btnCancelAddStaff')?.addEventListener('click', () => closeModalEl(modalStaff));

  document.getElementById('btnConfirmAddStaff')?.addEventListener('click', async () => {
    const ident = (document.getElementById('txtStaffIdentifier')?.value || '').trim();
    const role = document.getElementById('selectStaffRole')?.value || 'STAFF';
    if (!ident) return alert('Vui lòng nhập Email hoặc Username của nhân viên!');

    try {
      const { data: profiles } = await sb.from('profiles').select('id, email, full_name').or(`email.eq.${ident},username.eq.${ident}`);
      if (!profiles || profiles.length === 0) {
        return alert(`Không tìm thấy tài khoản "${ident}". Nhân viên cần đăng ký tài khoản trước!`);
      }
      const targetUser = profiles[0];
      const { error } = await sb.from('shop_members').insert({
        shop_id: activeShopId,
        user_id: targetUser.id,
        role: role,
        status: 'active'
      });
      if (error) throw error;
      alert(`Đã thêm ${targetUser.full_name || targetUser.email} vào Shop với vai trò ${role}!`);
      closeModalEl(modalStaff);
      document.getElementById('txtStaffIdentifier').value = '';
      await fetchShopStaff();
      renderStaffTable();
    } catch (err) {
      alert('Lỗi thêm nhân viên: ' + err.message);
    }
  });

  // Blacklist Modal
  const modalBlacklist = document.getElementById('modalAddBlacklist');
  document.getElementById('btnAddBlacklistModalBtn')?.addEventListener('click', () => openModalEl(modalBlacklist));
  document.getElementById('btnCloseBlacklistModal')?.addEventListener('click', () => closeModalEl(modalBlacklist));
  document.getElementById('btnCancelBlacklist')?.addEventListener('click', () => closeModalEl(modalBlacklist));

  document.getElementById('btnConfirmAddBlacklist')?.addEventListener('click', async () => {
    const phone = (document.getElementById('txtBlacklistPhone')?.value || '').trim();
    const reason = (document.getElementById('txtBlacklistReason')?.value || '').trim();
    if (!phone) return alert('Vui lòng nhập số điện thoại!');

    try {
      if (sb && activeShopId) {
        // Upsert customer as Blacklist
        await sb.from('customers').upsert({
          shop_id: activeShopId,
          phone,
          name: 'Cảnh Báo Bom',
          segment: 'Blacklist',
          notes: reason || 'Bom hàng',
          tags: ['blacklist', 'warning']
        });
      }
      alert(`Đã đưa số ${phone} vào Danh Sách Đen thành công! Extension sẽ phát cảnh báo đỏ ngay lập tức.`);
      closeModalEl(modalBlacklist);
      document.getElementById('txtBlacklistPhone').value = '';
      document.getElementById('txtBlacklistReason').value = '';
      await fetchCustomers();
      renderCustomersTable();
      renderBlacklist();
    } catch (err) {
      alert('Lỗi thêm blacklist: ' + err.message);
    }
  });

  // Invite Code Generator
  document.getElementById('btnGenerateInviteCode')?.addEventListener('click', () => {
    const newCode = 'INV-' + (activeShopId ? activeShopId.slice(0, 4) : 'SHOP') + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const txtCode = document.getElementById('txtShopInviteCode');
    if (txtCode) txtCode.textContent = newCode;
  });

  document.getElementById('btnCopyInviteCode')?.addEventListener('click', () => {
    const code = document.getElementById('txtShopInviteCode')?.textContent;
    if (code && code !== 'CHƯA TẠO') {
      navigator.clipboard.writeText(code);
      alert('Đã sao chép mã mời: ' + code);
    }
  });
}
