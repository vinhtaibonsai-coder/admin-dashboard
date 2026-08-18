/**
 * options-logs.js - Quản lý Notification Center & Audit Logs Dashboard
 * Thiết kế chuẩn thương mại cho Options Page
 */

import { NotificationService } from '../../src/domain/notification/notification.service.js';

let allAuditLogs = [];
let filteredAuditLogs = [];

// ─── 1. NOTIFICATION CENTER (CHUÔNG THÔNG BÁO) ───────────────────────────
function initNotificationCenter() {
  const btnNotifBell = document.getElementById('btnNotifBell');
  const notifDropdown = document.getElementById('notifDropdown');
  const notifBadge = document.getElementById('notifBadge');
  const notifHeaderCount = document.getElementById('notifHeaderCount');
  const notifListContainer = document.getElementById('notifListContainer');
  const btnMarkAllNotifsRead = document.getElementById('btnMarkAllNotifsRead');
  const btnClearAllNotifs = document.getElementById('btnClearAllNotifs');
  const btnViewAuditLogsTab = document.getElementById('btnViewAuditLogsTab');

  if (!btnNotifBell || !notifDropdown) return;

  btnNotifBell.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShown = notifDropdown.style.display === 'block';
    notifDropdown.style.display = isShown ? 'none' : 'block';
    if (!isShown) {
      loadAndRenderNotifications();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.notification-center-wrapper')) {
      notifDropdown.style.display = 'none';
    }
  });

  if (btnMarkAllNotifsRead) {
    btnMarkAllNotifsRead.addEventListener('click', async () => {
      await NotificationService.markAllAsRead();
      await loadAndRenderNotifications();
      if (typeof showQuickToast === 'function') showQuickToast('Đã đánh dấu đọc tất cả thông báo', 'info', 2000);
    });
  }

  if (btnClearAllNotifs) {
    btnClearAllNotifs.addEventListener('click', async () => {
      if (confirm('Xóa toàn bộ thông báo?')) {
        await NotificationService.clearAll();
        await loadAndRenderNotifications();
      }
    });
  }

  if (btnViewAuditLogsTab) {
    btnViewAuditLogsTab.addEventListener('click', () => {
      notifDropdown.style.display = 'none';
      const logNav = document.querySelector('.nav-item[data-tab="logs"]');
      if (logNav) logNav.click();
    });
  }

  // Lắng nghe thay đổi từ NotificationService
  NotificationService.subscribe((list) => {
    renderNotifsList(list);
  });

  // Tải dữ liệu ban đầu
  loadAndRenderNotifications();
}

async function loadAndRenderNotifications() {
  try {
    const list = await NotificationService.getNotifications();
    renderNotifsList(list);
  } catch (err) {
    console.error('Lỗi nạp thông báo:', err);
  }
}

function renderNotifsList(list) {
  const notifBadge = document.getElementById('notifBadge');
  const notifHeaderCount = document.getElementById('notifHeaderCount');
  const notifListContainer = document.getElementById('notifListContainer');
  if (!notifListContainer) return;

  const notifs = Array.isArray(list) ? list : [];
  const unreadCount = notifs.filter(n => !n.is_read).length;

  if (notifBadge) {
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      notifBadge.style.display = 'block';
    } else {
      notifBadge.style.display = 'none';
    }
  }

  if (notifHeaderCount) {
    notifHeaderCount.textContent = unreadCount;
  }

  if (notifs.length === 0) {
    notifListContainer.innerHTML = `
      <div style="padding: 30px 20px; text-align: center; color: var(--text-sub);">
        <div style="font-size: 28px; margin-bottom: 6px;">🔔</div>
        <div style="font-size: 13px; font-weight: 600;">Không có thông báo mới</div>
        <div style="font-size: 11px; margin-top: 2px;">Các sự kiện quan trọng sẽ xuất hiện ở đây.</div>
      </div>
    `;
    return;
  }

  const categoryIcons = {
    ORDERS: '📦',
    SECURITY: '🔒',
    SYSTEM: '⚙️',
    ANNOUNCEMENT: '📢'
  };

  const levelColors = {
    SUCCESS: '#10b981',
    WARNING: '#f59e0b',
    ERROR: '#ef4444',
    INFO: '#3b82f6'
  };

  notifListContainer.innerHTML = notifs.map(n => {
    const icon = categoryIcons[n.type] || '🔔';
    const color = levelColors[n.level] || '#3b82f6';
    const isUnread = !n.is_read;
    const timeStr = n.created_at ? new Date(n.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';

    return `
      <div class="notif-item ${isUnread ? 'unread' : ''}" data-id="${n.id}" style="padding: 10px 14px; border-bottom: 1px solid var(--border); display: flex; gap: 10px; cursor: pointer; background: ${isUnread ? 'rgba(99, 102, 241, 0.05)' : 'transparent'}; transition: background 0.15s;">
        <div style="font-size: 18px; width: 28px; height: 28px; border-radius: 50%; background: ${color}15; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${icon}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 6px;">
            <span style="font-size: 13px; font-weight: ${isUnread ? '700' : '600'}; color: var(--text-p); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHTML(n.title)}
            </span>
            <span style="font-size: 10px; color: var(--text-sub); flex-shrink: 0;">${timeStr}</span>
          </div>
          <div style="font-size: 12px; color: var(--text-sub); margin-top: 2px; line-height: 1.4; word-break: break-word;">
            ${escapeHTML(n.message || '')}
          </div>
        </div>
        ${isUnread ? `<div style="width: 6px; height: 6px; border-radius: 50%; background: #6366f1; margin-top: 6px; flex-shrink: 0;"></div>` : ''}
      </div>
    `;
  }).join('');

  // Gắn sự kiện click item
  notifListContainer.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.getAttribute('data-id');
      if (id) {
        await NotificationService.markAsRead(id);
        el.classList.remove('unread');
        el.style.background = 'transparent';
        const dot = el.querySelector('div:last-child');
        if (dot && dot.style.borderRadius === '50%') dot.remove();
        loadAndRenderNotifications();
      }
    });
  });
}

// ─── 2. AUDIT & OPERATION LOGS DASHBOARD ─────────────────────────────────
function initAuditLogsDashboard() {
  const logsSearch = document.getElementById('logsSearch');
  const logsFilterCategory = document.getElementById('logsFilterCategory');
  const logsFilterDevice = document.getElementById('logsFilterDevice');
  const logsFilterFrom = document.getElementById('logsFilterFrom');
  const logsFilterTo = document.getElementById('logsFilterTo');
  const btnLogsClearFilters = document.getElementById('btnLogsClearFilters');
  const btnRefreshLogs = document.getElementById('btnRefreshLogs');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const btnExportLogsCSV = document.getElementById('btnExportLogsCSV');
  const btnExportLogsJSON = document.getElementById('btnExportLogsJSON');

  if (logsSearch) logsSearch.addEventListener('input', filterAuditLogs);
  if (logsFilterCategory) logsFilterCategory.addEventListener('change', filterAuditLogs);
  if (logsFilterDevice) logsFilterDevice.addEventListener('change', filterAuditLogs);
  if (logsFilterFrom) logsFilterFrom.addEventListener('change', filterAuditLogs);
  if (logsFilterTo) logsFilterTo.addEventListener('change', filterAuditLogs);

  if (btnLogsClearFilters) {
    btnLogsClearFilters.addEventListener('click', () => {
      if (logsSearch) logsSearch.value = '';
      if (logsFilterCategory) logsFilterCategory.value = '';
      if (logsFilterDevice) logsFilterDevice.value = '';
      if (logsFilterFrom) logsFilterFrom.value = '';
      if (logsFilterTo) logsFilterTo.value = '';
      filterAuditLogs();
    });
  }

  if (btnRefreshLogs) {
    btnRefreshLogs.addEventListener('click', async () => {
      btnRefreshLogs.textContent = '⏳ Đang tải...';
      await loadAuditLogs(true);
      btnRefreshLogs.textContent = '🔄 Làm mới';
      if (typeof showQuickToast === 'function') showQuickToast('Đã làm mới Nhật ký từ Cloud!', 'success');
    });
  }

  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', async () => {
      if (confirm('Bạn có chắc chắn muốn xóa toàn bộ Nhật ký kiểm toán?')) {
        if (typeof AuditLogger !== 'undefined') {
          await AuditLogger.clearLogs();
          await loadAuditLogs();
          if (typeof showQuickToast === 'function') showQuickToast('Đã xóa sạch nhật ký!', 'success');
        }
      }
    });
  }

  if (btnExportLogsCSV) {
    btnExportLogsCSV.addEventListener('click', exportAuditLogsCSV);
  }

  if (btnExportLogsJSON) {
    btnExportLogsJSON.addEventListener('click', exportAuditLogsJSON);
  }

  // Khởi tạo Modal xem chi tiết log
  initLogDetailModal();

  // Tải dữ liệu ban đầu
  loadAuditLogs();
}

async function loadAuditLogs(forceCloud = false) {
  try {
    if (typeof AuditLogger !== 'undefined' && typeof AuditLogger.getLogs === 'function') {
      allAuditLogs = await AuditLogger.getLogs(forceCloud);
    } else {
      allAuditLogs = [];
    }

    // Tự động nạp danh sách thiết bị vào dropdown lọc
    const logsFilterDevice = document.getElementById('logsFilterDevice');
    if (logsFilterDevice) {
      const devices = Array.from(new Set(allAuditLogs.map(l => l.device_name).filter(Boolean)));
      const cur = logsFilterDevice.value;
      logsFilterDevice.innerHTML = '<option value="">-- Tất cả Máy --</option>' +
        devices.map(d => `<option value="${d}">${d}</option>`).join('');
      if (devices.includes(cur)) logsFilterDevice.value = cur;
    }
  } catch (err) {
    console.error('Lỗi khi tải Audit Logs:', err);
  } finally {
    filterAuditLogs();
  }
}

function filterAuditLogs() {
  const query = (document.getElementById('logsSearch')?.value || '').trim().toLowerCase();
  const category = (document.getElementById('logsFilterCategory')?.value || '').trim();
  const device = (document.getElementById('logsFilterDevice')?.value || '').trim().toLowerCase();
  const fromDate = document.getElementById('logsFilterFrom')?.value || '';
  const toDate = document.getElementById('logsFilterTo')?.value || '';

  filteredAuditLogs = allAuditLogs.filter(log => {
    if (!log) return false;
    if (category && log.category !== category) return false;
    if (device && !(log.device_name || '').toLowerCase().includes(device)) return false;
    if (query) {
      const text = `${log.action} ${log.message} ${log.user_email} ${log.device_name}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    if (fromDate || toDate) {
      const logDate = log.created_at ? log.created_at.substring(0, 10) : '';
      if (logDate) {
        if (fromDate && logDate < fromDate) return false;
        if (toDate && logDate > toDate) return false;
      }
    }
    return true;
  });

  // Cập nhật KPI
  const logStatTotal = document.getElementById('logStatTotal');
  const logStatAudit = document.getElementById('logStatAudit');
  const logStatOperation = document.getElementById('logStatOperation');
  const logStatError = document.getElementById('logStatError');

  if (logStatTotal) logStatTotal.textContent = allAuditLogs.length;
  if (logStatAudit) logStatAudit.textContent = allAuditLogs.filter(l => l.category === 'AUDIT').length;
  if (logStatOperation) logStatOperation.textContent = allAuditLogs.filter(l => l.category === 'OPERATION').length;
  if (logStatError) logStatError.textContent = allAuditLogs.filter(l => l.category === 'ERROR' || l.level === 'ERROR').length;

  renderAuditLogsTable();
}

function renderAuditLogsTable() {
  const tbody = document.getElementById('logsList');
  const emptyEl = document.getElementById('logsEmpty');
  if (!tbody) return;

  if (filteredAuditLogs.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  const categoryBadges = {
    AUDIT: { text: '🛡️ Audit', bg: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' },
    OPERATION: { text: '🚀 Vận hành', bg: 'rgba(16, 185, 129, 0.1)', color: '#059669' },
    SECURITY: { text: '🔒 Bảo mật', bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706' },
    ERROR: { text: '❌ Lỗi sự cố', bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' }
  };

  tbody.innerHTML = filteredAuditLogs.map(log => {
    const time = log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—';
    const badge = categoryBadges[log.category] || categoryBadges.AUDIT;

    return `
      <tr style="border-bottom: 1px solid var(--border); font-size: 13px;">
        <td style="padding: 10px; color: var(--text-sub); font-family: monospace; font-size: 12px;">${time}</td>
        <td style="padding: 10px;">
          <span style="background: ${badge.bg}; color: ${badge.color}; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; display: inline-block;">
            ${badge.text}
          </span>
        </td>
        <td style="padding: 10px; font-weight: 600; color: var(--text-p); font-family: monospace; font-size: 12px;">
          ${escapeHTML(log.action || 'ACTION')}
        </td>
        <td style="padding: 10px;">
          <div style="font-weight: 600; color: var(--text-p); font-size: 12px;">${escapeHTML(log.user_email || 'Ẩn danh')}</div>
          <div style="font-size: 11px; color: var(--text-sub);">💻 ${escapeHTML(log.device_name || 'Máy cục bộ')}</div>
        </td>
        <td style="padding: 10px; color: var(--text-p); line-height: 1.4;">
          ${escapeHTML(log.message || '')}
        </td>
        <td style="padding: 10px; text-align: center;">
          <button class="btn btn-secondary btn-view-log-detail" data-id="${log.id}" style="padding: 3px 8px; font-size: 11px;">
            👁️ Chi tiết
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Gán sự kiện xem chi tiết
  tbody.querySelectorAll('.btn-view-log-detail').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const log = allAuditLogs.find(l => l.id === id);
      if (log) showLogDetailModal(log);
    });
  });
}

function initLogDetailModal() {
  if (document.getElementById('logDetailModal')) return;
  const modal = document.createElement('div');
  modal.id = 'logDetailModal';
  modal.style.cssText = `
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    z-index: 999999; align-items: center; justify-content: center; backdrop-filter: blur(3px);
  `;
  modal.innerHTML = `
    <div style="background: var(--card); border: 1px solid var(--border); border-radius: 12px; width: 90%; max-width: 650px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
      <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
        <h3 id="logModalTitle" style="margin:0; font-size: 16px;">Chi tiết Sự kiện Nhật ký</h3>
        <button id="btnCloseLogModal" style="background:none; border:none; font-size: 20px; cursor:pointer; color:var(--text-sub);">&times;</button>
      </div>
      <div id="logModalBody" style="padding: 20px; overflow-y: auto; font-size: 13px; line-height: 1.5;"></div>
      <div style="padding: 12px 20px; border-top: 1px solid var(--border); background: var(--bg-subtle, rgba(0,0,0,0.02)); display: flex; justify-content: flex-end; gap: 8px;">
        <button id="btnCopyLogJSON" class="btn btn-secondary" style="font-size:12px; padding:6px 14px;">📋 Sao chép JSON</button>
        <button id="btnCloseLogModalBtn" class="btn btn-primary" style="font-size:12px; padding:6px 14px;">Đóng</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => { modal.style.display = 'none'; };
  modal.querySelector('#btnCloseLogModal').addEventListener('click', close);
  modal.querySelector('#btnCloseLogModalBtn').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

function showLogDetailModal(log) {
  const modal = document.getElementById('logDetailModal');
  const body = document.getElementById('logModalBody');
  const btnCopy = document.getElementById('btnCopyLogJSON');
  if (!modal || !body) return;

  const jsonStr = JSON.stringify(log, null, 2);

  body.innerHTML = `
    <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px 12px; margin-bottom: 16px; background: rgba(0,0,0,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
      <div style="font-weight: 600; color: var(--text-sub);">Hành động:</div>
      <div style="font-weight: 700; font-family: monospace;">${escapeHTML(log.action)}</div>
      <div style="font-weight: 600; color: var(--text-sub);">Thời gian:</div>
      <div>${log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—'}</div>
      <div style="font-weight: 600; color: var(--text-sub);">Người thực hiện:</div>
      <div>${escapeHTML(log.user_email || 'Ẩn danh')}</div>
      <div style="font-weight: 600; color: var(--text-sub);">Thiết bị máy:</div>
      <div>💻 ${escapeHTML(log.device_name || 'Máy cục bộ')}</div>
      <div style="font-weight: 600; color: var(--text-sub);">Nội dung:</div>
      <div style="color: var(--primary); font-weight: 600;">${escapeHTML(log.message)}</div>
    </div>
    <div style="font-weight: 700; margin-bottom: 6px;">Metadata & Bối cảnh (JSON Payload):</div>
    <pre style="background: #0f172a; color: #f8fafc; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 12px; overflow-x: auto; max-height: 250px;">${escapeHTML(jsonStr)}</pre>
  `;

  if (btnCopy) {
    btnCopy.onclick = () => {
      navigator.clipboard.writeText(jsonStr);
      if (typeof showQuickToast === 'function') showQuickToast('Đã sao chép chi tiết JSON vào Clipboard!', 'success');
    };
  }

  modal.style.display = 'flex';
}

function exportAuditLogsCSV() {
  if (filteredAuditLogs.length === 0) {
    alert('Không có dữ liệu nhật ký để xuất!');
    return;
  }
  const headers = ['Thời gian', 'Phân loại', 'Cấp độ', 'Hành động', 'Người dùng', 'Máy tính', 'Nội dung', 'Metadata'];
  const rows = filteredAuditLogs.map(l => [
    `"${l.created_at || ''}"`,
    `"${l.category || ''}"`,
    `"${l.level || ''}"`,
    `"${l.action || ''}"`,
    `"${l.user_email || ''}"`,
    `"${l.device_name || ''}"`,
    `"${(l.message || '').replace(/"/g, '""')}"`,
    `"${JSON.stringify(l.metadata || {}).replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_logs_${new Date().toISOString().substring(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAuditLogsJSON() {
  if (filteredAuditLogs.length === 0) {
    alert('Không có dữ liệu nhật ký để xuất!');
    return;
  }
  const blob = new Blob([JSON.stringify(filteredAuditLogs, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_logs_${new Date().toISOString().substring(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Khởi chạy khi DOM sẵn sàng
if (typeof onDOMReady === 'function') {
  onDOMReady(() => {
    initNotificationCenter();
    initAuditLogsDashboard();
  });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    initNotificationCenter();
    initAuditLogsDashboard();
  });
}

export { initNotificationCenter, initAuditLogsDashboard, loadAuditLogs };
