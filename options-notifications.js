// options-notifications.js — Quản lý thông báo chuông hệ thống

(function () {
  let activeNotifications = [];
  let isPopoverOpen = false;

  async function getActiveShopId() {
    if (typeof OrderStorage !== 'undefined') {
      const shop = await OrderStorage.getActiveShop();
      return shop ? (shop.id || shop) : null;
    }
    return null;
  }

  async function fetchNotifications(shopId) {
    try {
      if (typeof AuthService === 'undefined') return [];
      let { url, anonKey } = await AuthService._getSupabaseUrlAndKey();
      if (!url || !anonKey) return [];
      
      // Normalize URL (ensure it starts with http/https to prevent Failed to fetch in extensions)
      url = url.trim();
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      
      let token = anonKey;
      if (typeof AuthSession !== 'undefined') {
        const session = await AuthSession.getSession();
        if (session && session.access_token && !session.access_token.startsWith('local_dev_token_')) {
          token = session.access_token;
        }
      }
      
      const resp = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/system_get_notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ p_shop_id: shopId || null })
      });
      
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      if (e.message && e.message.includes('Failed to fetch')) {
        // Network error or invalid URL, ignore silently
      } else {
        console.error('Lỗi khi tải thông báo:', e);
      }
    }
    return [];
  }

  // Khởi tạo giao diện chuông thông báo
  async function initNotifications() {
    const btnDraftsBell = document.getElementById('btnDraftsBell');
    if (!btnDraftsBell) return;

    // Thay thế SVG chuông gốc bằng icon Phosphor phong cách Sage Green
    btnDraftsBell.innerHTML = `
      <i class="ph ph-bell" style="font-size: 22px; color: var(--primary);"></i>
      <span id="notificationsBadge" style="position:absolute; top:-4px; right:-6px; background:#EF4444; color:white; font-size:9px; font-weight:bold; padding:1px 5px; border-radius:10px; display:none;">0</span>
    `;

    // Tạo Popover hiển thị thông báo
    const popover = document.createElement('div');
    popover.id = 'notificationsPopover';
    popover.style.cssText = `
      position: absolute;
      top: 50px;
      right: 10px;
      width: 320px;
      max-height: 400px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
      display: none;
      flex-direction: column;
      z-index: 10000;
      overflow: hidden;
      font-family: inherit;
    `;

    popover.innerHTML = `
      <div style="padding: 12px 16px; border-bottom: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: center; background: #F9FAFB;">
        <span style="font-weight: 700; color: #1F2937; font-size: 13px;">Thông báo hệ thống</span>
        <button id="btnMarkAllRead" style="background: none; border: none; color: #3C7363; font-size: 11px; font-weight: 600; cursor: pointer;">Đánh dấu đã đọc</button>
      </div>
      <div id="notificationsList" style="flex: 1; overflow-y: auto; padding: 8px 0; max-height: 320px;">
        <div style="padding: 16px; text-align: center; color: #9CA3AF; font-size: 12px;">Không có thông báo mới</div>
      </div>
    `;

    btnDraftsBell.parentNode.appendChild(popover);

    // Event toggler
    btnDraftsBell.addEventListener('click', (e) => {
      e.stopPropagation();
      isPopoverOpen = !isPopoverOpen;
      popover.style.display = isPopoverOpen ? 'flex' : 'none';
      if (isPopoverOpen) {
        refreshNotifications();
        markAllAsReadLocal();
      }
    });

    document.addEventListener('click', () => {
      isPopoverOpen = false;
      popover.style.display = 'none';
    });

    popover.addEventListener('click', (e) => e.stopPropagation());

    document.getElementById('btnMarkAllRead').addEventListener('click', () => {
      markAllAsReadLocal();
      popover.style.display = 'none';
      isPopoverOpen = false;
    });

    // Refresh định kỳ mỗi 1 phút
    refreshNotifications();
    setInterval(refreshNotifications, 60000);
  }

  async function markAllAsReadLocal() {
    const nowStr = new Date().toISOString();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ notification_last_read: nowStr }, () => {
        document.getElementById('notificationsBadge').style.display = 'none';
      });
    } else {
      localStorage.setItem('notification_last_read', nowStr);
      document.getElementById('notificationsBadge').style.display = 'none';
    }
  }

  async function refreshNotifications() {
    const shopId = await getActiveShopId();
    const list = await fetchNotifications(shopId);
    activeNotifications = list || [];

    const badge = document.getElementById('notificationsBadge');
    const listEl = document.getElementById('notificationsList');
    if (!listEl) return;

    // Đọc thời gian đọc cuối cùng
    let lastRead = null;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await new Promise(r => chrome.storage.local.get(['notification_last_read'], r));
      lastRead = res?.notification_last_read;
    } else {
      lastRead = localStorage.getItem('notification_last_read');
    }

    const lastReadTime = lastRead ? new Date(lastRead).getTime() : 0;
    let unreadCount = 0;

    if (activeNotifications.length === 0) {
      listEl.innerHTML = `<div style="padding: 16px; text-align: center; color: #9CA3AF; font-size: 12px;">Không có thông báo mới</div>`;
      if (badge) badge.style.display = 'none';
      return;
    }

    listEl.innerHTML = '';
    activeNotifications.forEach(item => {
      const itemTime = new Date(item.created_at).getTime();
      const isUnread = itemTime > lastReadTime;
      if (isUnread) unreadCount++;

      // Xác định màu sắc theo level
      let color = '#3C7363'; // INFO: Xanh lục xô thơm
      let bg = '#F1F7F5';
      let icon = 'ph-info';
      if (item.level === 'SUCCESS') {
        color = '#10B981'; // SUCCESS: Xanh lục
        bg = '#ECFDF5';
        icon = 'ph-check-circle';
      } else if (item.level === 'WARNING') {
        color = '#F59E0B'; // WARNING: Vàng cam
        bg = '#FFFBEB';
        icon = 'ph-warning';
      } else if (item.level === 'ERROR') {
        color = '#EF4444'; // ERROR: Đỏ
        bg = '#FEF2F2';
        icon = 'ph-x-circle';
      }

      const row = document.createElement('div');
      row.style.cssText = `
        padding: 10px 16px;
        border-bottom: 1px solid #F3F4F6;
        display: flex;
        gap: 10px;
        align-items: flex-start;
        background: ${isUnread ? bg : '#FFFFFF'};
        transition: background 0.2s;
      `;
      row.innerHTML = `
        <div style="color: ${color}; font-size: 18px; margin-top: 2px;">
          <i class="ph ${icon}"></i>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #1F2937; font-size: 12px; margin-bottom: 2px;">${item.title}</div>
          <div style="color: #4B5563; font-size: 11px; line-height: 1.4;">${item.content}</div>
          <div style="color: #9CA3AF; font-size: 9px; margin-top: 4px;">${new Date(item.created_at).toLocaleTimeString('vi-VN')}</div>
        </div>
      `;
      listEl.appendChild(row);
    });

    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initNotifications();
  });
})();
