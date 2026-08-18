// options-init.js — extracted from options.js
// Đồng bộ giao diện sáng/tối
(function initTheme() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['theme'], (res) => {
      if (res && res.theme === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.theme) {
        if (changes.theme.newValue === 'dark') {
          document.body.classList.add('dark-mode');
        } else {
          document.body.classList.remove('dark-mode');
        }
      }
    });
  } else {
    const theme = localStorage.getItem('theme') || 'light';
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }
})();

function onDOMReady(fn) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}
globalThis.onDOMReady = onDOMReady;

function showQuickToast(message, type = 'success', duration = 3000) {
  let toastContainer = document.getElementById('appToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'appToastContainer';
    toastContainer.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bgColors = {
    success: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    error: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
    warning: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
    info: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)'
  };
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  toast.style.cssText = `
    background: ${bgColors[type] || bgColors.info};
    color: #ffffff;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25), 0 4px 10px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 10px;
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: auto;
    max-width: 420px;
    letter-spacing: 0.2px;
  `;

  const hasLeadingIcon = message.startsWith('✅') || message.startsWith('❌') || message.startsWith('⚠️') || message.startsWith('ℹ️') || message.startsWith('🚫') || message.startsWith('🔓') || message.startsWith('🏪') || message.startsWith('☁️');
  toast.innerHTML = `<span>${hasLeadingIcon ? '' : (icons[type] + ' ')}${message}</span>`;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0) scale(1)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-15px) scale(0.95)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, duration);
}
globalThis.showQuickToast = showQuickToast;
window.showQuickToast = showQuickToast;

function safePlatformStr(p) {
  if (!p) return '';
  if (typeof p === 'string') return p.toLowerCase();
  if (typeof p === 'object') return (p.name || p.code || p.id || '').toLowerCase();
  return String(p).toLowerCase();
}
globalThis.safePlatformStr = safePlatformStr;

// Khởi tạo các Element UI
const tabItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Elements cho Tab API Key
const apiKeyInput = document.getElementById('apiKey');
const apiModelSelect = document.getElementById('apiModel');
const btnSaveApi = document.getElementById('btnSaveApi');
const btnTestApi = document.getElementById('btnTestApi');
const statusEl = document.getElementById('status');

// Elements cho Tab Orders
const statTotalOrders = document.getElementById('stat-total-orders');
const statTotalCod = document.getElementById('stat-total-cod');
const searchInp = document.getElementById('searchInp');
const searchClearOrders = document.getElementById('searchClearOrders');
const filterPlatform = document.getElementById('filterPlatform');
const filterDevice = document.getElementById('filterDevice');
const filterFrom = document.getElementById('filterFrom');
const filterTo = document.getElementById('filterTo');
const btnClearFilters = document.getElementById('btnClearFilters');
const btnOpenAddModal = document.getElementById('btnOpenAddModal');
const ordersListEl = document.getElementById('ordersList');
const emptyStateEl = document.getElementById('emptyState');

// Elements cho Modal Add/Edit
const orderModal = document.getElementById('orderModal');
const orderForm = document.getElementById('orderForm');
const modalTitle = document.getElementById('modalTitle');
const orderIdInput = document.getElementById('orderId');
const formName = document.getElementById('formName');
const formPhone = document.getElementById('formPhone');
const formCode = document.getElementById('formCode');
const formCod = document.getElementById('formCod');
const formDate = document.getElementById('formDate');
const formPlatform = document.getElementById('formPlatform');
const formCollectFee = document.getElementById('formCollectFee');
const formAddress = document.getElementById('formAddress');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnCloseModal = document.getElementById('btnCloseModal');

// Elements cho Modal Delete
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const btnCancelDelModal = document.getElementById('btnCancelDelModal');
const btnCloseDelModal = document.getElementById('btnCloseDelModal');
const btnConfirmDelOrder = document.getElementById('btnConfirmDelOrder');

// Elements cho Bulk Delete
const btnBulkDelete = document.getElementById('btnBulkDelete');
const selectedCountEl = document.getElementById('selectedCount');
const bulkDeleteConfirmModal = document.getElementById('bulkDeleteConfirmModal');
const bulkDeleteCountEl = document.getElementById('bulkDeleteCount');
const btnCloseBulkDelModal = document.getElementById('btnCloseBulkDelModal');
const btnCancelBulkDelModal = document.getElementById('btnCancelBulkDelModal');
const btnConfirmBulkDelete = document.getElementById('btnConfirmBulkDelete');

// Elements cho Quick Time Filters
const btnFilterToday = document.getElementById('btnFilterToday');
const btnFilter7Days = document.getElementById('btnFilter7Days');
const btnFilter30Days = document.getElementById('btnFilter30Days');
const btnFilterThisMonth = document.getElementById('btnFilterThisMonth');
const selectAllOrders = document.getElementById('selectAllOrders');

// Danh sách nút lọc nhanh để quản lý active state
const quickFilterBtns = [btnFilterToday, btnFilter7Days, btnFilter30Days, btnFilterThisMonth];

// Đánh dấu nút active, bỏ active các nút khác
function setActiveFilterBtn(activeBtn) {
  quickFilterBtns.forEach(btn => {
    btn.classList.remove('btn-filter-active');
  });
  if (activeBtn) activeBtn.classList.add('btn-filter-active');
}

// State của trang
// Pagination elements
const ordersPagination = document.getElementById('ordersPagination');
const ordersPageInfo = document.getElementById('ordersPageInfo');
const ordersTotalLabel = document.getElementById('ordersTotalLabel');
const ordersPerPageEl = document.getElementById('ordersPerPage');
const ordersPrevBtn = document.getElementById('ordersPrevBtn');
const ordersNextBtn = document.getElementById('ordersNextBtn');

let allOrders = [];
let filteredOrders = [];
let selectedOrderIds = new Set();
let activeDeleteId = null;
let ordersPage = 1;
let ordersPerPage = 20;

async function loadOrders() {
  const loadingEl = document.getElementById('ordersLoading');
  const emptyEl = document.getElementById('emptyState');
  const tbody = document.getElementById('ordersList');
  if (loadingEl) loadingEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';
  if (tbody && allOrders.length === 0) tbody.innerHTML = '';

  try {
    let orders = [];
    if (typeof OrderStorage !== 'undefined' && typeof OrderStorage.getOrders === 'function') {
      orders = await OrderStorage.getOrders();
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const key = (typeof OrderStorage !== 'undefined' && OrderStorage._getSavedOrdersKey)
        ? await OrderStorage._getSavedOrdersKey()
        : 'savedOrders';
      orders = await new Promise(r => chrome.storage.local.get([key, 'savedOrders'], res => r(res[key] || res.savedOrders || [])));
    }

    allOrders = Array.isArray(orders) ? orders : [];
  } catch (err) {
    console.error('Lỗi khi tải danh sách Đơn nháp:', err);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    filterOrders();
  }
}

function filterOrders() {
  const searchInpEl = document.getElementById('searchInp');
  const filterPlatformEl = document.getElementById('filterPlatform');

  const query = (searchInpEl?.value || '').trim().toLowerCase();
  const platform = (filterPlatformEl?.value || '').trim().toLowerCase();

  filteredOrders = allOrders.filter(o => {
    if (!o) return false;
    if (query) {
      const cleanDigits = query.replace(/\D/g, '');
      const matchName = (o.name || '').toLowerCase().includes(query);
      const matchAddress = (o.address || '').toLowerCase().includes(query);
      const matchCode = (o.orderCode || '').toLowerCase().includes(query);
      const matchPhone = cleanDigits.length >= 2 ? (o.phone || '').replace(/\D/g, '').includes(cleanDigits) : (o.phone || '').toLowerCase().includes(query);
      if (!matchName && !matchAddress && !matchCode && !matchPhone) return false;
    }
    if (platform) {
      const p = safePlatformStr(o.platform);
      if (!p.includes(platform)) return false;
    }
    return true;
  });

  // Calculate totals
  let totalCod = 0;
  filteredOrders.forEach(o => {
    totalCod += Number(o.codAmount || 0);
  });

  if (statTotalOrders) statTotalOrders.textContent = filteredOrders.length;
  if (statTotalCod) statTotalCod.textContent = totalCod.toLocaleString('vi-VN') + 'đ';

  ordersPage = 1;
  renderOrdersList();
}

function renderOrdersList() {
  const tbody = document.getElementById('ordersList');
  const emptyEl = document.getElementById('emptyState');
  if (!tbody) return;

  if (filteredOrders.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (ordersPagination) ordersPagination.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (ordersPagination) ordersPagination.style.display = 'flex';

  const startIndex = (ordersPage - 1) * ordersPerPage;
  const pageOrders = filteredOrders.slice(startIndex, startIndex + ordersPerPage);

  let html = '';
  pageOrders.forEach(o => {
    const isChecked = selectedOrderIds.has(o.id) ? 'checked' : '';
    const pStr = safePlatformStr(o.platform);
    const platformLabel = pStr.includes('jt') ? 'J&T Express' : 'VNPost';
    const platformClass = pStr.includes('jt') ? 'badge-jt' : 'badge-vnpost';
    const codText = o.codAmount ? Number(o.codAmount).toLocaleString('vi-VN') + 'đ' : '0đ';

    const dateDisplay = o.createdAt
      ? (o.createdAt.length > 16 ? o.createdAt.substring(0, 16) : o.createdAt)
      : '—';

    html += `
      <tr data-id="${o.id}">
        <td style="text-align:center"><input type="checkbox" class="order-checkbox" value="${o.id}" ${isChecked}></td>
        <td>
          <div style="font-weight:700;color:var(--text-p)">${o.name || '—'}</div>
          <div style="font-size:12px;color:var(--primary);font-family:monospace">${o.phone || '—'}</div>
        </td>
        <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.address || ''}">${o.address || '—'}</td>
        <td>
          <div style="font-family:monospace;font-size:12px;font-weight:600">${o.orderCode || '—'}</div>
        </td>
        <td style="text-align:right;font-weight:700;color:#059669">${codText}</td>
        <td style="text-align:center">${o.collectFee ? '<span style="color:#2563eb;font-weight:700">Có</span>' : '<span style="color:#94a3b8">Không</span>'}</td>
        <td><span class="badge ${platformClass}">${platformLabel}</span></td>
        <td style="font-size:11px;color:var(--text-s)">${o.deviceName || 'Máy cục bộ'}</td>
        <td style="font-size:11px;color:var(--text-s)">${dateDisplay}</td>
        <td style="text-align:center">
          <button class="btn btn-primary btn-sm btn-fill-order" data-id="${o.id}" title="Nhập đơn lên trang web">🚀 Nhập đơn</button>
          <button class="btn btn-secondary btn-sm btn-view-order" data-id="${o.id}" title="Xem chi tiết">👁️</button>
          <button class="btn btn-danger btn-sm btn-del-order" data-id="${o.id}" title="Xóa">🗑️</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Pagination info
  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage) || 1;
  if (ordersPageInfo) ordersPageInfo.textContent = `Trang ${ordersPage} / ${totalPages}`;
  if (ordersTotalLabel) ordersTotalLabel.textContent = `(${filteredOrders.length} đơn)`;
}

window.loadOrders = loadOrders;

// Elements cho Tab Submitted Orders (Đơn hàng đã lên đơn)
const subStatTotal = document.getElementById('stat-submitted-total');
const subStatCod = document.getElementById('stat-submitted-cod');
const subSearchInp = document.getElementById('submittedSearchInp');
const subSearchClear = document.getElementById('submittedSearchClear');
const subFilterPlatform = document.getElementById('submittedFilterPlatform');
const subFilterAccount = document.getElementById('submittedFilterAccount');
const subFilterDevice = document.getElementById('submittedFilterDevice');
const subFilterFrom = document.getElementById('submittedFilterFrom');
const subFilterTo = document.getElementById('submittedFilterTo');
const subBtnClearFilters = document.getElementById('submittedBtnClearFilters');
const subBtnBulkDelete = document.getElementById('submittedBtnBulkDelete');
const subSelectedCount = document.getElementById('submittedSelectedCount');
const subListEl = document.getElementById('submittedList');
const subEmptyEl = document.getElementById('submittedEmpty');
const subSelectAll = document.getElementById('submittedSelectAll');
const subPagination = document.getElementById('submittedPagination');
const subPageInfo = document.getElementById('submittedPageInfo');
const subTotalLabel = document.getElementById('submittedTotalLabel');
const subPerPageEl = document.getElementById('submittedPerPage');
const subPrevBtn = document.getElementById('submittedPrevBtn');
const subNextBtn = document.getElementById('submittedNextBtn');
const subBtnToday = document.getElementById('submittedBtnToday');
const subBtn7Days = document.getElementById('submittedBtn7Days');
const subBtn30Days = document.getElementById('submittedBtn30Days');
const subBtnThisMonth = document.getElementById('submittedBtnThisMonth');

let allSubmittedOrders = [];
let filteredSubmittedOrders = [];
let selectedSubmittedIds = new Set();
let submittedPage = 1;
let submittedPerPage = 20;

async function loadSubmittedOrders(silent = false) {
  const loadingEl = document.getElementById('submittedLoading');
  const emptyEl = document.getElementById('submittedEmpty');
  const tbody = document.getElementById('submittedList');
  if (!silent && loadingEl && allSubmittedOrders.length === 0) loadingEl.style.display = 'flex';
  if (emptyEl && allSubmittedOrders.length === 0) emptyEl.style.display = 'none';
  if (tbody && allSubmittedOrders.length === 0) tbody.innerHTML = '';

  try {
    let orders = [];
    if (typeof OrderStorage !== 'undefined' && typeof OrderStorage.getSubmittedOrders === 'function') {
      orders = await OrderStorage.getSubmittedOrders();
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const key = (typeof OrderStorage !== 'undefined' && OrderStorage._getSubmittedKey)
        ? await OrderStorage._getSubmittedKey()
        : 'submittedOrders';
      orders = await new Promise(r => chrome.storage.local.get([key, 'submittedOrders'], res => r(res[key] || res.submittedOrders || [])));
    }

    allSubmittedOrders = Array.isArray(orders) ? orders : [];

    // Tự động điền danh sách Tài khoản bưu điện / J&T vào dropdown lọc
    if (subFilterAccount) {
      const accounts = Array.from(new Set(allSubmittedOrders.map(o => {
        let acc = o.carrierAccount || o.carrier_account;
        if (!acc) {
          const match = (o.name || '').match(/\((?:acc|tài khoản|tk)?\s*([^\)]+)\)/i);
          if (match) acc = match[1].trim();
        }
        return acc || '';
      }).filter(Boolean)));

      const currentVal = subFilterAccount.value;
      subFilterAccount.innerHTML = '<option value="">-- Tất Cả Tài Khoản Bưu Điện / J&T --</option>' + 
        accounts.map(a => `<option value="${a}">${a}</option>`).join('');
      if (accounts.includes(currentVal)) subFilterAccount.value = currentVal;
    }

    // Tự động điền danh sách thiết bị vào dropdown lọc máy
    if (subFilterDevice) {
      const devices = Array.from(new Set(allSubmittedOrders.map(o => o.deviceName).filter(Boolean)));
      const currentVal = subFilterDevice.value;
      subFilterDevice.innerHTML = '<option value="">-- Tất Cả Máy --</option>' + 
        devices.map(d => `<option value="${d}">${d}</option>`).join('');
      if (devices.includes(currentVal)) subFilterDevice.value = currentVal;
    }
  } catch (err) {
    console.error('Lỗi khi tải danh sách Đơn đã lên đơn:', err);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    filterSubmittedOrders();
  }
}

function filterSubmittedOrders() {
  const query = (subSearchInp?.value || '').trim().toLowerCase();
  const platform = (subFilterPlatform?.value || '').trim().toLowerCase();
  const account = (subFilterAccount?.value || '').trim().toLowerCase();
  const device = (subFilterDevice?.value || '').trim().toLowerCase();
  const fromDate = subFilterFrom?.value || '';
  const toDate = subFilterTo?.value || '';

  filteredSubmittedOrders = allSubmittedOrders.filter(o => {
    if (!o) return false;
    if (query) {
      const cleanDigits = query.replace(/\D/g, '');
      const matchName = (o.name || '').toLowerCase().includes(query);
      const matchAddress = (o.address || '').toLowerCase().includes(query);
      const matchCode = (o.orderCode || '').toLowerCase().includes(query);
      const matchTracking = (o.trackingCode || '').toLowerCase().includes(query);
      const matchAcc = (o.carrierAccount || o.carrier_account || '').toLowerCase().includes(query);
      const matchPhone = cleanDigits.length >= 2 ? (o.phone || '').replace(/\D/g, '').includes(cleanDigits) : (o.phone || '').toLowerCase().includes(query);
      if (!matchName && !matchAddress && !matchCode && !matchTracking && !matchPhone && !matchAcc) return false;
    }
    if (platform) {
      const p = safePlatformStr(o.platform);
      if (!p.includes(platform)) return false;
    }
    if (account) {
      let cAcc = (o.carrierAccount || o.carrier_account || '').toLowerCase();
      if (!cAcc) {
        const match = (o.name || '').match(/\((?:acc|tài khoản|tk)?\s*([^\)]+)\)/i);
        if (match) cAcc = match[1].trim().toLowerCase();
      }
      if (!cAcc.includes(account)) return false;
    }
    if (device) {
      const dev = (o.deviceName || '').toLowerCase();
      if (!dev.includes(device)) return false;
    }
    if (fromDate || toDate) {
      const orderDateStr = o.submittedDate || (o.submittedAt ? o.submittedAt.substring(0, 10) : '');
      if (orderDateStr) {
        if (fromDate && orderDateStr < fromDate) return false;
        if (toDate && orderDateStr > toDate) return false;
      }
    }
    return true;
  });

  // Calculate totals
  let totalCod = 0;
  filteredSubmittedOrders.forEach(o => {
    totalCod += Number(o.codAmount || 0);
  });

  if (subStatTotal) subStatTotal.textContent = filteredSubmittedOrders.length;
  if (subStatCod) subStatCod.textContent = totalCod.toLocaleString('vi-VN') + 'đ';

  submittedPage = 1;
  renderSubmittedOrdersList();
}

function renderSubmittedOrdersList() {
  const tbody = document.getElementById('submittedList');
  const emptyEl = document.getElementById('submittedEmpty');
  if (!tbody) return;

  if (filteredSubmittedOrders.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (subPagination) subPagination.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (subPagination) subPagination.style.display = 'flex';

  const startIndex = (submittedPage - 1) * submittedPerPage;
  const pageOrders = filteredSubmittedOrders.slice(startIndex, startIndex + submittedPerPage);

  let html = '';
  pageOrders.forEach(o => {
    const isChecked = selectedSubmittedIds.has(o.id) ? 'checked' : '';
    const pStr = safePlatformStr(o.platform);
    const platformLabel = pStr.includes('jt') ? 'J&T Express' : 'VNPost';
    const platformClass = pStr.includes('jt') ? 'badge-jt' : 'badge-vnpost';
    const codText = o.codAmount ? Number(o.codAmount).toLocaleString('vi-VN') + 'đ' : '0đ';
    const trackingHtml = o.trackingCode && o.trackingCode !== '—'
      ? `<span class="badge badge-success" style="font-family:monospace;font-size:11px">${o.trackingCode}</span>`
      : `<span style="color:var(--text-s);font-size:11px">Chờ cấp mã</span>`;

    const sourceBadge = o.isCloud
      ? `<span class="badge" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;font-size:10px;padding:2px 6px;border-radius:4px">☁️ Cloud</span>`
      : `<span class="badge" style="background:#fffbeb;color:#d97706;border:1px solid #fde68a;font-size:10px;padding:2px 6px;border-radius:4px">💻 Máy</span>`;

    const dateDisplay = o.submittedAt
      ? new Date(o.submittedAt).toLocaleString('vi-VN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : (o.submittedDate || '—');

    // Trích xuất tài khoản bưu điện / J&T
    let accDisplay = o.carrierAccount || o.carrier_account || '';
    if (!accDisplay) {
      const match = (o.name || '').match(/\((?:acc|tài khoản|tk)?\s*([^\)]+)\)/i);
      if (match) accDisplay = match[1].trim();
    }

    html += `
      <tr data-id="${o.id}">
        <td style="text-align:center"><input type="checkbox" class="sub-checkbox" value="${o.id}" ${isChecked}></td>
        <td>
          <div style="font-weight:700;color:var(--text-p)">${o.name || '—'}</div>
          <div style="font-size:12px;color:var(--primary);font-family:monospace">${o.phone || '—'}</div>
        </td>
        <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.address || ''}">${o.address || '—'}</td>
        <td>
          <div style="font-family:monospace;font-size:12px;font-weight:600">${o.orderCode || '—'}</div>
        </td>
        <td>${trackingHtml}</td>
        <td style="text-align:right;font-weight:700;color:#059669">${codText}</td>
        <td style="text-align:center">${o.collectFee ? '<span style="color:#2563eb;font-weight:700">Có</span>' : '<span style="color:#94a3b8">Không</span>'}</td>
        <td><span class="badge ${platformClass}">${platformLabel}</span></td>
        <td>
          ${accDisplay 
            ? `<span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-weight:700;font-size:11.5px;padding:3px 8px;border-radius:6px">🏢 ${accDisplay}</span>` 
            : `<span style="color:var(--text-s);font-size:11.5px">—</span>`}
        </td>
        <td>
          <div>${sourceBadge}</div>
          <div style="font-size:11px;color:var(--text-s);margin-top:2px">${o.deviceName || 'Máy này'}</div>
        </td>
        <td style="font-size:11px;color:var(--text-s)">${dateDisplay}</td>
        <td style="text-align:center">
          <button class="btn btn-secondary btn-sm btn-view-sub" data-id="${o.id}" title="Xem chi tiết">👁️</button>
          <button class="btn btn-danger btn-sm btn-del-sub" data-id="${o.id}" title="Xóa">🗑️</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Pagination info
  const totalPages = Math.ceil(filteredSubmittedOrders.length / submittedPerPage) || 1;
  if (subPageInfo) subPageInfo.textContent = `Trang ${submittedPage} / ${totalPages}`;
  if (subTotalLabel) subTotalLabel.textContent = `(${filteredSubmittedOrders.length} đơn)`;
}

window.loadSubmittedOrders = loadSubmittedOrders;

// Elements cho Tab Customers
const statTotalCustomers = document.getElementById('stat-total-customers');
const statVipCustomers = document.getElementById('stat-vip-customers');
const customerSearch = document.getElementById('customerSearch');
const searchClearCustomers = document.getElementById('searchClearCustomers');
const filterCustomerSegment = document.getElementById('filterCustomerSegment');
const filterCustomerCarrier = document.getElementById('filterCustomerCarrier');
const btnClearCustomerFilters = document.getElementById('btnClearCustomerFilters');
const customersTable = document.getElementById('customersTable');
const customersList = document.getElementById('customersList');
const customersEmpty = document.getElementById('customersEmpty');
const customersPagination = document.getElementById('customersPagination');
const customersTotalLabel = document.getElementById('customersTotalLabel');
const customersPerPageEl = document.getElementById('customersPerPage');
const customersPrevBtn = document.getElementById('customersPrevBtn');
const customersPageNumbers = document.getElementById('customersPageNumbers');
const customersNextBtn = document.getElementById('customersNextBtn');

// Elements cho Customer Modal
const customerModal = document.getElementById('customerModal');
const btnCloseCustomerModal = document.getElementById('btnCloseCustomerModal');
const custPhoneHidden = document.getElementById('custPhoneHidden');
const custNameInput = document.getElementById('custNameInput');
const custPhoneInput = document.getElementById('custPhoneInput');
const custFbInput = document.getElementById('custFbInput');
const custTagsSelect = document.getElementById('custTagsSelect');
const custNotesInput = document.getElementById('custNotesInput');
const btnCancelCustomerModal = document.getElementById('btnCancelCustomerModal');
const btnSaveCustomerModal = document.getElementById('btnSaveCustomerModal');

let customerMap = {};
let allCustomersList = [];
let filteredCustomersList = [];
let customerPage = 1;
let customerPerPage = 20;

async function renderCustomers() {
  try {
    let savedOrders = [];
    let submittedOrders = [];
    let customerMeta = {};

    if (typeof OrderStorage !== 'undefined') {
      if (typeof OrderStorage.getOrders === 'function') savedOrders = await OrderStorage.getOrders();
      if (typeof OrderStorage.getSubmittedOrders === 'function') submittedOrders = await OrderStorage.getSubmittedOrders();
      if (typeof OrderStorage.getCustomerMetadata === 'function') customerMeta = await OrderStorage.getCustomerMetadata();
    }

    customerMap = {};

    // 1. Process customer metadata map
    Object.entries(customerMeta || {}).forEach(([phoneKey, meta]) => {
      const cleanPhone = String(phoneKey).replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 8) return;
      customerMap[cleanPhone] = {
        phone: cleanPhone,
        name: meta.name || meta.fullName || 'Khách hàng',
        address: meta.address || '',
        totalOrders: meta.totalOrders || 0,
        totalCod: meta.totalCod || 0,
        lastOrderDate: meta.lastOrderDate || meta.updatedAt || '',
        platform: meta.platform || '',
        segment: meta.segment || (meta.totalOrders >= 3 ? 'vip' : 'new'),
        notes: meta.notes || ''
      };
    });

    // 2. Aggregate from saved draft orders
    (savedOrders || []).forEach(o => {
      if (!o || !o.phone) return;
      const cleanPhone = String(o.phone).replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 8) return;

      if (!customerMap[cleanPhone]) {
        customerMap[cleanPhone] = {
          phone: cleanPhone,
          name: o.name || 'Khách hàng',
          address: o.address || '',
          totalOrders: 0,
          totalCod: 0,
          lastOrderDate: o.createdAt || '',
          platform: o.platform || '',
          segment: 'new',
          notes: ''
        };
      }

      const c = customerMap[cleanPhone];
      c.totalOrders += 1;
      c.totalCod += Number(o.codAmount || 0);
      if (o.name && o.name !== 'Khách hàng' && (!c.name || c.name === 'Khách hàng')) c.name = o.name;
      if (o.address && !c.address) c.address = o.address;
      if (o.createdAt && (!c.lastOrderDate || o.createdAt > c.lastOrderDate)) c.lastOrderDate = o.createdAt;
      if (o.platform) c.platform = o.platform;
    });

    // 3. Aggregate from submitted orders
    (submittedOrders || []).forEach(o => {
      if (!o || !o.phone) return;
      const cleanPhone = String(o.phone).replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 8) return;

      if (!customerMap[cleanPhone]) {
        customerMap[cleanPhone] = {
          phone: cleanPhone,
          name: o.name || 'Khách hàng',
          address: o.address || '',
          totalOrders: 0,
          totalCod: 0,
          lastOrderDate: o.submittedAt || o.submittedDate || '',
          platform: o.platform || '',
          segment: 'new',
          notes: ''
        };
      }

      const c = customerMap[cleanPhone];
      c.totalOrders += 1;
      c.totalCod += Number(o.codAmount || 0);
      if (o.name && o.name !== 'Khách hàng' && (!c.name || c.name === 'Khách hàng')) c.name = o.name;
      if (o.address && !c.address) c.address = o.address;
      const orderDate = o.submittedAt || o.submittedDate || '';
      if (orderDate && (!c.lastOrderDate || orderDate > c.lastOrderDate)) c.lastOrderDate = orderDate;
      if (o.platform) c.platform = o.platform;
    });

    // Update Segment classification
    Object.values(customerMap).forEach(c => {
      if (c.totalOrders >= 3) c.segment = 'vip';
      else if (c.totalOrders === 2) c.segment = 'regular';
      else c.segment = 'new';
    });

    allCustomersList = Object.values(customerMap);
    allCustomersList.sort((a, b) => b.totalOrders - a.totalOrders || b.totalCod - a.totalCod);

    filterCustomersList();
  } catch (err) {
    console.error('Lỗi khi nạp danh sách Khách hàng:', err);
  }
}

function filterCustomersList() {
  const query = (customerSearch?.value || '').trim().toLowerCase();
  const segment = (filterCustomerSegment?.value || '').trim().toLowerCase();
  const carrier = (filterCustomerCarrier?.value || '').trim().toLowerCase();

  filteredCustomersList = allCustomersList.filter(c => {
    if (!c) return false;
    if (query) {
      const cleanDigits = query.replace(/\D/g, '');
      const matchName = (c.name || '').toLowerCase().includes(query);
      const matchPhone = cleanDigits.length >= 2 ? (c.phone || '').replace(/\D/g, '').includes(cleanDigits) : (c.phone || '').toLowerCase().includes(query);
      const matchAddress = (c.address || '').toLowerCase().includes(query);
      if (!matchName && !matchPhone && !matchAddress) return false;
    }
    if (segment) {
      if (c.segment !== segment) return false;
    }
    if (carrier) {
      const p = safePlatformStr(c.platform);
      if (!p.includes(carrier)) return false;
    }
    return true;
  });

  const vipCount = allCustomersList.filter(c => c.segment === 'vip' || c.totalOrders >= 3).length;
  if (statTotalCustomers) statTotalCustomers.textContent = allCustomersList.length;
  if (statVipCustomers) statVipCustomers.textContent = vipCount;

  customerPage = 1;
  renderCustomersTable();
}

function renderCustomersTable() {
  const tbody = document.getElementById('customersList');
  const emptyEl = document.getElementById('customersEmpty');
  if (!tbody) return;

  if (filteredCustomersList.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (customersPagination) customersPagination.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (customersPagination) customersPagination.style.display = 'flex';

  const startIndex = (customerPage - 1) * customerPerPage;
  const pageCustomers = filteredCustomersList.slice(startIndex, startIndex + customerPerPage);

  let html = '';
  pageCustomers.forEach(c => {
    const badgeSegment = c.segment === 'vip'
      ? '<span class="badge badge-success" style="font-weight:700;font-size:10px">⭐ VIP</span>'
      : (c.segment === 'regular'
        ? '<span class="badge badge-info" style="font-weight:700;font-size:10px">Thường xuyên</span>'
        : '<span class="badge badge-secondary" style="font-weight:600;font-size:10px">Mới</span>');

    const dateDisplay = c.lastOrderDate
      ? (c.lastOrderDate.length > 10 ? c.lastOrderDate.substring(0, 10) : c.lastOrderDate)
      : '—';

    const codDisplay = c.totalCod ? Number(c.totalCod).toLocaleString('vi-VN') + 'đ' : '0đ';

    html += `
      <tr data-phone="${c.phone}">
        <td>
          <div style="font-weight:700;color:var(--text-p)">${c.name || 'Khách hàng'}</div>
          <div style="margin-top:2px">${badgeSegment}</div>
        </td>
        <td>
          <div style="font-size:12.5px;color:var(--primary);font-family:monospace;font-weight:600">${c.phone || '—'}</div>
        </td>
        <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.address || ''}">${c.address || '—'}</td>
        <td style="text-align:center;font-weight:700;color:var(--text-p)">${c.totalOrders || 0}</td>
        <td style="text-align:right;font-weight:700;color:#059669">${codDisplay}</td>
        <td style="font-size:11px;color:var(--text-s)">${dateDisplay}</td>
        <td style="text-align:center">
          <button class="btn btn-secondary btn-sm btn-edit-customer" data-phone="${c.phone}" title="Sửa ghi chú/gán thẻ">✏️ Ghi chú</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Pagination info
  const totalPages = Math.ceil(filteredCustomersList.length / customerPerPage) || 1;
  if (customersTotalLabel) customersTotalLabel.textContent = `(${filteredCustomersList.length} khách hàng)`;
}

window.renderCustomers = renderCustomers;

async function renderAnalytics() {
  try {
    let savedOrders = [];
    let submittedOrders = [];

    if (typeof OrderStorage !== 'undefined') {
      if (typeof OrderStorage.getOrders === 'function') savedOrders = await OrderStorage.getOrders();
      if (typeof OrderStorage.getSubmittedOrders === 'function') submittedOrders = await OrderStorage.getSubmittedOrders();
    }

    const allCombined = [...(savedOrders || []), ...(submittedOrders || [])];
    const currentMonthPrefix = new Date().toISOString().substring(0, 7);

    let monthTotalCount = 0;
    let monthTotalCod = 0;
    let vnpostCount = 0;
    let jtCount = 0;
    let submittedCount = (submittedOrders || []).length;
    let draftsCount = (savedOrders || []).length;

    allCombined.forEach(o => {
      if (!o) return;
      const platform = safePlatformStr(o.platform);
      if (platform.includes('jt')) jtCount++;
      else vnpostCount++;

      const dateStr = o.submittedAt || o.createdAt || o.submittedDate || '';
      if (dateStr && dateStr.startsWith(currentMonthPrefix)) {
        monthTotalCount++;
        monthTotalCod += Number(o.codAmount || 0);
      } else if (!dateStr) {
        monthTotalCount++;
        monthTotalCod += Number(o.codAmount || 0);
      }
    });

    const totalOrdersCount = allCombined.length || 1;
    const vnpostPct = Math.round((vnpostCount / totalOrdersCount) * 100);
    const jtPct = Math.round((jtCount / totalOrdersCount) * 100);

    const submittedPct = Math.round((submittedCount / totalOrdersCount) * 100);
    const draftsPct = Math.round((draftsCount / totalOrdersCount) * 100);

    // Update DOM
    const elMonthTotal = document.getElementById('stat-analytics-month-total');
    const elMonthCod = document.getElementById('stat-analytics-month-cod');
    const elVnpostCount = document.getElementById('stat-analytics-vnpost-count');
    const elJtCount = document.getElementById('stat-analytics-jt-count');

    if (elMonthTotal) elMonthTotal.textContent = monthTotalCount;
    if (elMonthCod) elMonthCod.textContent = monthTotalCod.toLocaleString('vi-VN') + 'đ';
    if (elVnpostCount) elVnpostCount.textContent = vnpostCount;
    if (elJtCount) elJtCount.textContent = jtCount;

    // Carrier Progress Bars
    const elVnpostPct = document.getElementById('analyticsVnpostPercent');
    const elVnpostBar = document.getElementById('analyticsVnpostBar');
    const elJtPct = document.getElementById('analyticsJtPercent');
    const elJtBar = document.getElementById('analyticsJtBar');

    if (elVnpostPct) elVnpostPct.textContent = `${vnpostPct}% (${vnpostCount} đơn)`;
    if (elVnpostBar) elVnpostBar.style.width = `${vnpostPct}%`;
    if (elJtPct) elJtPct.textContent = `${jtPct}% (${jtCount} đơn)`;
    if (elJtBar) elJtBar.style.width = `${jtPct}%`;

    // Status Progress Bars
    const elSubPct = document.getElementById('analyticsSubmittedPercent');
    const elSubBar = document.getElementById('analyticsSubmittedBar');
    const elDraftPct = document.getElementById('analyticsDraftsPercent');
    const elDraftBar = document.getElementById('analyticsDraftsBar');

    if (elSubPct) elSubPct.textContent = `${submittedPct}% (${submittedCount} đơn)`;
    if (elSubBar) elSubBar.style.width = `${submittedPct}%`;
    if (elDraftPct) elDraftPct.textContent = `${draftsPct}% (${draftsCount} đơn)`;
    if (elDraftBar) elDraftBar.style.width = `${draftsPct}%`;

  } catch (err) {
    console.error('Lỗi khi nạp dữ liệu Thống kê & Báo cáo:', err);
  }
}

window.renderAnalytics = renderAnalytics;

function initSubmittedOrdersEvents() {
  if (subSearchInp) {
    subSearchInp.addEventListener('input', () => {
      if (subSearchClear) subSearchClear.style.display = subSearchInp.value ? 'block' : 'none';
      filterSubmittedOrders();
    });
  }
  if (subSearchClear) {
    subSearchClear.addEventListener('click', () => {
      if (subSearchInp) subSearchInp.value = '';
      subSearchClear.style.display = 'none';
      filterSubmittedOrders();
    });
  }

  if (subFilterPlatform) subFilterPlatform.addEventListener('change', filterSubmittedOrders);
  if (subFilterAccount) subFilterAccount.addEventListener('change', filterSubmittedOrders);
  if (subFilterDevice) subFilterDevice.addEventListener('change', filterSubmittedOrders);
  if (subFilterFrom) subFilterFrom.addEventListener('change', filterSubmittedOrders);
  if (subFilterTo) subFilterTo.addEventListener('change', filterSubmittedOrders);

  const subQuickBtns = [subBtnToday, subBtn7Days, subBtn30Days, subBtnThisMonth];
  function setSubActiveBtn(activeBtn) {
    subQuickBtns.forEach(b => { if (b) b.classList.remove('btn-filter-active'); });
    if (activeBtn) activeBtn.classList.add('btn-filter-active');
  }

  if (subBtnToday) {
    subBtnToday.addEventListener('click', () => {
      const today = new Date().toISOString().substring(0, 10);
      if (subFilterFrom) subFilterFrom.value = today;
      if (subFilterTo) subFilterTo.value = today;
      setSubActiveBtn(subBtnToday);
      filterSubmittedOrders();
    });
  }
  if (subBtn7Days) {
    subBtn7Days.addEventListener('click', () => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      if (subFilterFrom) subFilterFrom.value = d.toISOString().substring(0, 10);
      if (subFilterTo) subFilterTo.value = new Date().toISOString().substring(0, 10);
      setSubActiveBtn(subBtn7Days);
      filterSubmittedOrders();
    });
  }
  if (subBtn30Days) {
    subBtn30Days.addEventListener('click', () => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      if (subFilterFrom) subFilterFrom.value = d.toISOString().substring(0, 10);
      if (subFilterTo) subFilterTo.value = new Date().toISOString().substring(0, 10);
      setSubActiveBtn(subBtn30Days);
      filterSubmittedOrders();
    });
  }
  if (subBtnThisMonth) {
    subBtnThisMonth.addEventListener('click', () => {
      const d = new Date();
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().substring(0, 10);
      if (subFilterFrom) subFilterFrom.value = firstDay;
      if (subFilterTo) subFilterTo.value = d.toISOString().substring(0, 10);
      setSubActiveBtn(subBtnThisMonth);
      filterSubmittedOrders();
    });
  }
  if (subBtnClearFilters) {
    subBtnClearFilters.addEventListener('click', () => {
      if (subSearchInp) subSearchInp.value = '';
      if (subSearchClear) subSearchClear.style.display = 'none';
      if (subFilterPlatform) subFilterPlatform.value = '';
      if (subFilterAccount) subFilterAccount.value = '';
      if (subFilterDevice) subFilterDevice.value = '';
      if (subFilterFrom) subFilterFrom.value = '';
      if (subFilterTo) subFilterTo.value = '';
      setSubActiveBtn(null);
      filterSubmittedOrders();
    });
  }

  if (subPerPageEl) {
    subPerPageEl.addEventListener('change', (e) => {
      submittedPerPage = parseInt(e.target.value) || 20;
      submittedPage = 1;
      renderSubmittedOrdersList();
    });
  }
  if (subPrevBtn) {
    subPrevBtn.addEventListener('click', () => {
      if (submittedPage > 1) {
        submittedPage--;
        renderSubmittedOrdersList();
      }
    });
  }
  if (subNextBtn) {
    subNextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredSubmittedOrders.length / submittedPerPage) || 1;
      if (submittedPage < totalPages) {
        submittedPage++;
        renderSubmittedOrdersList();
      }
    });
  }

  function updateSubBulkDeleteUI() {
    if (subSelectedCount) subSelectedCount.textContent = selectedSubmittedIds.size;
    if (subBtnBulkDelete) subBtnBulkDelete.style.display = selectedSubmittedIds.size > 0 ? 'inline-flex' : 'none';
    if (subSelectAll) {
      const pageIds = filteredSubmittedOrders.slice((submittedPage - 1) * submittedPerPage, submittedPage * submittedPerPage).map(o => o.id);
      subSelectAll.checked = pageIds.length > 0 && pageIds.every(id => selectedSubmittedIds.has(id));
    }
  }

  if (subSelectAll) {
    subSelectAll.addEventListener('change', (e) => {
      const pageOrders = filteredSubmittedOrders.slice((submittedPage - 1) * submittedPerPage, submittedPage * submittedPerPage);
      pageOrders.forEach(o => {
        if (e.target.checked) selectedSubmittedIds.add(o.id);
        else selectedSubmittedIds.delete(o.id);
      });
      renderSubmittedOrdersList();
      updateSubBulkDeleteUI();
    });
  }

  if (subBtnBulkDelete) {
    subBtnBulkDelete.addEventListener('click', async () => {
      if (selectedSubmittedIds.size === 0) return;
      if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedSubmittedIds.size} đơn hàng đã lên đã chọn?`)) return;
      try {
        if (typeof OrderStorage !== 'undefined' && typeof OrderStorage.deleteSubmittedOrder === 'function') {
          for (const id of selectedSubmittedIds) {
            await OrderStorage.deleteSubmittedOrder(id);
          }
        }
        selectedSubmittedIds.clear();
        updateSubBulkDeleteUI();
        await loadSubmittedOrders();
        if (typeof showQuickToast === 'function') showQuickToast('Đã xóa các đơn đã chọn thành công!', 'success');
      } catch (err) {
        console.error('Lỗi xóa nhiều đơn đã lên:', err);
      }
    });
  }

  if (subListEl) {
    subListEl.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('.btn-del-sub');
      if (delBtn) {
        const id = delBtn.dataset.id;
        if (!id) return;
        if (confirm('Bạn có chắc chắn muốn xóa đơn hàng đã lên đơn này?')) {
          try {
            if (typeof OrderStorage !== 'undefined' && typeof OrderStorage.deleteSubmittedOrder === 'function') {
              await OrderStorage.deleteSubmittedOrder(id);
            }
            selectedSubmittedIds.delete(id);
            updateSubBulkDeleteUI();
            await loadSubmittedOrders();
            if (typeof showQuickToast === 'function') showQuickToast('Đã xóa đơn thành công!', 'success');
          } catch (err) {
            console.error('Lỗi khi xóa đơn đã lên:', err);
          }
        }
        return;
      }

      const viewBtn = e.target.closest('.btn-view-sub');
      if (viewBtn) {
        const id = viewBtn.dataset.id;
        const order = allSubmittedOrders.find(o => o.id === id);
        if (order) {
          alert(`Thông tin đơn hàng:\n- Tên: ${order.name}\n- SĐT: ${order.phone}\n- Địa chỉ: ${order.address}\n- Mã đơn: ${order.orderCode || '—'}\n- Mã vận đơn: ${order.trackingCode || '—'}\n- Tiền COD: ${Number(order.codAmount || 0).toLocaleString('vi-VN')}đ\n- ĐVVC: ${order.platform || '—'}\n- Nguồn: ${order.isCloud ? '☁️ Database' : '💻 Cục bộ'}`);
        }
        return;
      }
    });

    subListEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('sub-checkbox')) {
        const id = e.target.value;
        if (e.target.checked) selectedSubmittedIds.add(id);
        else selectedSubmittedIds.delete(id);
        updateSubBulkDeleteUI();
      }
    });
  }
}

function initDraftOrdersEvents() {
  const searchInpEl = document.getElementById('searchInp');
  const searchClearEl = document.getElementById('searchClear');
  const filterPlatformEl = document.getElementById('filterPlatform');

  if (searchInpEl) {
    searchInpEl.addEventListener('input', () => {
      if (searchClearEl) searchClearEl.style.display = searchInpEl.value ? 'block' : 'none';
      filterOrders();
    });
  }
  if (searchClearEl) {
    searchClearEl.addEventListener('click', () => {
      if (searchInpEl) searchInpEl.value = '';
      searchClearEl.style.display = 'none';
      filterOrders();
    });
  }
  if (filterPlatformEl) filterPlatformEl.addEventListener('change', filterOrders);

  if (btnFilterToday) {
    btnFilterToday.addEventListener('click', () => {
      setActiveFilterBtn(btnFilterToday);
      filterOrders();
    });
  }
  if (btnFilter7Days) {
    btnFilter7Days.addEventListener('click', () => {
      setActiveFilterBtn(btnFilter7Days);
      filterOrders();
    });
  }
  if (btnFilter30Days) {
    btnFilter30Days.addEventListener('click', () => {
      setActiveFilterBtn(btnFilter30Days);
      filterOrders();
    });
  }
  if (btnFilterThisMonth) {
    btnFilterThisMonth.addEventListener('click', () => {
      setActiveFilterBtn(btnFilterThisMonth);
      filterOrders();
    });
  }

  const btnClearFiltersEl = document.getElementById('btnClearFilters');
  if (btnClearFiltersEl) {
    btnClearFiltersEl.addEventListener('click', () => {
      if (searchInpEl) searchInpEl.value = '';
      if (searchClearEl) searchClearEl.style.display = 'none';
      if (filterPlatformEl) filterPlatformEl.value = '';
      setActiveFilterBtn(null);
      filterOrders();
    });
  }

  if (ordersPerPageEl) {
    ordersPerPageEl.addEventListener('change', (e) => {
      ordersPerPage = parseInt(e.target.value) || 20;
      ordersPage = 1;
      renderOrdersList();
    });
  }
  if (ordersPrevBtn) {
    ordersPrevBtn.addEventListener('click', () => {
      if (ordersPage > 1) {
        ordersPage--;
        renderOrdersList();
      }
    });
  }
  if (ordersNextBtn) {
    ordersNextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredOrders.length / ordersPerPage) || 1;
      if (ordersPage < totalPages) {
        ordersPage++;
        renderOrdersList();
      }
    });
  }

  function updateDraftBulkDeleteUI() {
    if (selectedCountEl) selectedCountEl.textContent = selectedOrderIds.size;
    if (btnBulkDelete) btnBulkDelete.style.display = selectedOrderIds.size > 0 ? 'inline-flex' : 'none';
    if (selectAllOrders) {
      const pageIds = filteredOrders.slice((ordersPage - 1) * ordersPerPage, ordersPage * ordersPerPage).map(o => o.id);
      selectAllOrders.checked = pageIds.length > 0 && pageIds.every(id => selectedOrderIds.has(id));
    }
  }

  if (selectAllOrders) {
    selectAllOrders.addEventListener('change', (e) => {
      const pageOrders = filteredOrders.slice((ordersPage - 1) * ordersPerPage, ordersPage * ordersPerPage);
      pageOrders.forEach(o => {
        if (e.target.checked) selectedOrderIds.add(o.id);
        else selectedOrderIds.delete(o.id);
      });
      renderOrdersList();
      updateDraftBulkDeleteUI();
    });
  }

  const ordersListEl = document.getElementById('ordersList');
  if (ordersListEl) {
    ordersListEl.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('.btn-del-order');
      if (delBtn) {
        const id = delBtn.dataset.id;
        if (!id) return;
        if (confirm('Bạn có chắc chắn muốn xóa đơn nháp này?')) {
          try {
            if (typeof OrderStorage !== 'undefined' && typeof OrderStorage.deleteOrder === 'function') {
              await OrderStorage.deleteOrder(id);
            }
            selectedOrderIds.delete(id);
            updateDraftBulkDeleteUI();
            await loadOrders();
            if (typeof showQuickToast === 'function') showQuickToast('Đã xóa đơn nháp thành công!', 'success');
          } catch (err) {
            console.error('Lỗi khi xóa đơn nháp:', err);
          }
        }
        return;
      }
    });

    ordersListEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('order-checkbox')) {
        const id = e.target.value;
        if (e.target.checked) selectedOrderIds.add(id);
        else selectedOrderIds.delete(id);
        updateDraftBulkDeleteUI();
      }
    });
  }
}

function initCustomersEvents() {
  if (customerSearch) {
    customerSearch.addEventListener('input', () => {
      if (searchClearCustomers) searchClearCustomers.style.display = customerSearch.value ? 'block' : 'none';
      filterCustomersList();
    });
  }
  if (searchClearCustomers) {
    searchClearCustomers.addEventListener('click', () => {
      if (customerSearch) customerSearch.value = '';
      searchClearCustomers.style.display = 'none';
      filterCustomersList();
    });
  }
  if (filterCustomerSegment) filterCustomerSegment.addEventListener('change', filterCustomersList);
  if (filterCustomerCarrier) filterCustomerCarrier.addEventListener('change', filterCustomersList);
  if (btnClearCustomerFilters) {
    btnClearCustomerFilters.addEventListener('click', () => {
      if (customerSearch) customerSearch.value = '';
      if (searchClearCustomers) searchClearCustomers.style.display = 'none';
      if (filterCustomerSegment) filterCustomerSegment.value = '';
      if (filterCustomerCarrier) filterCustomerCarrier.value = '';
      filterCustomersList();
    });
  }
  if (customersPerPageEl) {
    customersPerPageEl.addEventListener('change', (e) => {
      customerPerPage = parseInt(e.target.value) || 20;
      customerPage = 1;
      renderCustomersTable();
    });
  }
  if (customersPrevBtn) {
    customersPrevBtn.addEventListener('click', () => {
      if (customerPage > 1) {
        customerPage--;
        renderCustomersTable();
      }
    });
  }
  if (customersNextBtn) {
    customersNextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredCustomersList.length / customerPerPage) || 1;
      if (customerPage < totalPages) {
        customerPage++;
        renderCustomersTable();
      }
    });
  }
}

onDOMReady(async () => {
  // Gắn toàn bộ sự kiện cho các tab chức năng
  initSubmittedOrdersEvents();
  initDraftOrdersEvents();
  initCustomersEvents();

  // Lắng nghe trạng thái đăng nhập để tải/xoá dữ liệu tương ứng
  if (typeof AuthEvents !== 'undefined') {
    AuthEvents.on('AUTH_STATE_CHANGED', async (event) => {
      if (event.isAuthenticated) {
        if (typeof loadOrders === 'function') loadOrders();
        if (typeof loadSubmittedOrders === 'function') loadSubmittedOrders();
        if (typeof renderCustomers === 'function') renderCustomers();
        if (typeof renderAnalytics === 'function') renderAnalytics();
      } else {
        // Xoá dữ liệu cũ khi đăng xuất
        allOrders = [];
        filteredOrders = [];
        allSubmittedOrders = [];
        filteredSubmittedOrders = [];
        allCustomersList = [];
        filteredCustomersList = [];
        if (typeof renderOrdersList === 'function') renderOrdersList();
        if (typeof renderSubmittedOrdersList === 'function') renderSubmittedOrdersList();
        if (typeof renderCustomersTable === 'function') renderCustomersTable();
      }
    });
  }

  // Khởi chạy dữ liệu ban đầu nếu đã đăng nhập sẵn
  if (typeof AuthService !== 'undefined') {
    const isAuthed = await AuthService.isAuthenticated().catch(() => false);
    if (isAuthed) {
      if (typeof loadOrders === 'function') loadOrders();
      if (typeof loadSubmittedOrders === 'function') loadSubmittedOrders();
      if (typeof renderCustomers === 'function') renderCustomers();
      if (typeof renderAnalytics === 'function') renderAnalytics();
    }
  } else {
    // Dự phòng khi chạy chế độ độc lập không nạp AuthService
    if (typeof loadOrders === 'function') loadOrders();
    if (typeof loadSubmittedOrders === 'function') loadSubmittedOrders();
    if (typeof renderCustomers === 'function') renderCustomers();
    if (typeof renderAnalytics === 'function') renderAnalytics();
  }

  const btn = document.getElementById('btnOpenDashboard');
  if (btn) {
    btn.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ action: 'openDashboard' });
      }
    });
  }

  // Khởi tạo phân quyền và hiển thị đầy đủ các tab chức năng
  let role = null;
  if (typeof AuthSession !== 'undefined') {
    const session = await AuthSession.getSession().catch(() => null);
    role = session?.role || localStorage.getItem('current_role') || 'SYSTEM_ADMIN';
  } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const res = await new Promise(r => chrome.storage.local.get(['current_role'], r));
    role = res?.current_role || localStorage.getItem('current_role') || 'SYSTEM_ADMIN';
  }

  // Trong Extension Options, luôn đảm bảo các tab Cài đặt, Địa chỉ, Tách đơn, Thống kê, v.v. được hiển thị đầy đủ
  const staffRestrictedTabs = ['shops', 'devices'];
  let tabsToHide = [];
  if (role === 'SHOP_STAFF') {
    tabsToHide = staffRestrictedTabs;
  }

  tabItems.forEach(item => {
    const tabName = item.getAttribute('data-tab');
    if (tabsToHide.includes(tabName)) {
      item.style.display = 'none';
    } else {
      item.style.display = 'flex';
    }
  });

  // ─── TỰ ĐỘNG ĐỒNG BỘ REALTIME GIỮA CÁC TRÌNH DUYỆT & THIẾT BỊ ───
  function triggerRealtimeSync() {
    const activeTab = document.querySelector('.tab-content.active');
    const tabId = activeTab ? activeTab.id : '';
    if (tabId === 'tab-submitted') {
      if (typeof loadSubmittedOrders === 'function') loadSubmittedOrders(true);
    } else if (tabId === 'tab-orders') {
      if (typeof loadOrders === 'function') loadOrders();
    } else if (tabId === 'tab-customers') {
      if (typeof renderCustomers === 'function') renderCustomers();
    }
  }

  // 1. Tự động làm mới khi người dùng chuyển tab trình duyệt quay lại trang Options
  window.addEventListener('focus', () => {
    triggerRealtimeSync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      triggerRealtimeSync();
    }
  });

  // 2. Chạy ngầm định kỳ mỗi 5 giây để bắt các thay đổi từ trình duyệt khác tức thì
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      triggerRealtimeSync();
    }
  }, 5000);

  // Lắng nghe tín hiệu thiết bị bị thu hồi từ Service Worker → tự đăng xuất
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request && (request.type === 'deviceRevoked' || request.action === 'deviceRevoked')) {
        try {
          if (typeof AuthService !== 'undefined' && typeof AuthService.logout === 'function') AuthService.logout();
          else AuthSession.clearSession();
        } catch (_) {}
        chrome.storage.session?.remove(['fbAuthTokens', 'fbDeviceId', 'fbDeviceName'])?.catch?.(() => {});
        chrome.storage.local?.remove(['vnpost_session', 'fbAuthTokens', 'fbDeviceId', 'fbDeviceName'], () => {
          if (typeof showQuickToast === 'function') {
            showQuickToast('⚠️ Thiết bị này đã bị thu hồi. Vui lòng đăng nhập lại bằng thiết bị được phép.', 'error', 6000);
          } else {
            alert('Thiết bị này đã bị thu hồi. Bạn sẽ được chuyển đến trang đăng nhập.');
          }
          setTimeout(() => { window.location.href = 'options.html'; }, 2000);
        });
        if (sendResponse) sendResponse({ ok: true });
      }
    });
  }
});
