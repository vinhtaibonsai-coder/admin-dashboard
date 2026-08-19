// =========================================================================
// MASTER-ADMIN.JS — FRONTEND LOGIC CHO PORTAL ADMIN TỔNG (ADMIN.HTML)
// Dùng chung thiết kế và bộ CSS với options.html (options.css)
// =========================================================================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

// Khởi tạo Supabase Client riêng cho Master Admin Portal
function getSupabaseClient() {
  if (globalThis._sbAdminInstance) return globalThis._sbAdminInstance;
  const url = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url) ? SUPABASE_CONFIG.url : 'https://xlgovgynbsahuykyjzcx.supabase.co';
  const anonKey = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.anonKey) ? SUPABASE_CONFIG.anonKey : 'sb_publishable_i7Ox-gsXTnPbP_AghSxb4Q_w6-5vbMg';
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    const client = window.supabase.createClient(url, anonKey);
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
    globalThis._sbAdminInstance = client;
    return globalThis._sbAdminInstance;
  }
  return null;
}

document.addEventListener('DOMContentLoaded', async () => {
  // ─── 0. CHẾ ĐỘ SÁNG / TỐI (LIGHT / DARK THEME TOGGLE DÙNG OPTIONS.CSS) ─
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  const themeIcon = document.getElementById('theme-icon');
  const themeText = document.getElementById('theme-text');

  function applyTheme(isLight) {
    if (isLight) {
      document.body.classList.remove('dark-mode');
      document.body.classList.remove('dark');
      document.body.classList.add('light-mode');
      if (themeIcon) themeIcon.className = 'ph ph-moon text-base';
      if (themeText) themeText.textContent = 'Giao diện Tối';
    } else {
      document.body.classList.add('dark-mode');
      document.body.classList.add('dark');
      document.body.classList.remove('light-mode');
      if (themeIcon) themeIcon.className = 'ph ph-sun text-base text-amber-400';
      if (themeText) themeText.textContent = 'Giao diện Sáng';
    }
  }

  const savedTheme = localStorage.getItem('admin_theme');
  const initialLight = savedTheme === 'light';
  applyTheme(initialLight);

  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const isLight = document.body.classList.contains('dark-mode');
      applyTheme(isLight);
      localStorage.setItem('admin_theme', isLight ? 'light' : 'dark');
    });
  }

  // ─── 1. KIỂM TRA XÁC THỰC & VAI TRÒ MASTER ADMIN ────────────────────
  const authSvc = (typeof AuthService !== 'undefined') ? AuthService : (window.AuthService || globalThis.AuthService);

  if (authSvc) {
    try {
      const isAuthed = await authSvc.isAuthenticated();
      if (!isAuthed) {
        window.location.replace('login.html');
        return;
      }
    } catch (err) {
      console.warn('Lỗi kiểm tra xác thực Admin:', err);
    }
  }

  const user = await AuthService.getCurrentUser();
  const adminUserLabel = document.getElementById('admin-user-label');
  const adminAvatar = document.getElementById('admin-avatar');
  if (user) {
    const name = user.full_name || user.email || 'Admin';
    if (adminUserLabel) adminUserLabel.textContent = name;
    if (adminAvatar) adminAvatar.textContent = name.charAt(0).toUpperCase();
  }

  const sb = getSupabaseClient();

  // ─── 2. CHUYỂN TAB SIDEBAR (Đồng bộ class nav-item active từ options.html) ─
  const tabButtons = {
    'tab-metrics': 'section-metrics',
    'tab-shops': 'section-shops',
    'tab-permissions': 'section-permissions',
    'tab-configs': 'section-configs',
    'tab-devices': 'section-devices',
    'tab-audit': 'section-audit',
    'tab-users': 'section-users'
  };

  function activateTab(tabId) {
    if (!tabButtons[tabId]) return;
    Object.keys(tabButtons).forEach(id => {
      const b = document.getElementById(id);
      if (b) {
        if (id === tabId) {
          b.className = "nav-item active";
        } else {
          b.className = "nav-item";
        }
      }
    });

    Object.values(tabButtons).forEach(secId => {
      const sec = document.getElementById(secId);
      if (sec) {
        if (secId === tabButtons[tabId]) {
          sec.classList.remove('hidden');
          sec.classList.add('active');
        } else {
          sec.classList.add('hidden');
          sec.classList.remove('active');
        }
      }
    });

    if (tabId === 'tab-metrics') loadMetrics();
    if (tabId === 'tab-shops') loadShops();
    if (tabId === 'tab-permissions') loadPermissionsDropdown();
    if (tabId === 'tab-configs') loadSystemConfigs();
    if (tabId === 'tab-devices') loadDevices();
    if (tabId === 'tab-audit') loadAuditLogs();
    if (tabId === 'tab-users') loadUsers();
  }

  function tabIdFromHash() {
    const h = (location.hash || '').replace('#', '');
    return (h && tabButtons['tab-' + h]) ? 'tab-' + h : null;
  }

  Object.keys(tabButtons).forEach(tabId => {
    const btn = document.getElementById(tabId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      location.hash = tabId.replace('tab-', '');
      activateTab(tabId);
    });
  });

  window.addEventListener('hashchange', () => {
    const t = tabIdFromHash();
    if (t) activateTab(t);
  });

  const initialTab = tabIdFromHash() || 'tab-metrics';
  activateTab(initialTab);

  // Logout Handler
  const btnLogout = document.getElementById('btn-admin-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await AuthService.logout();
      window.location.href = 'login.html';
    });
  }

  // ─── 3. FETCH METRICS ────────────────────────────────────────────────
  async function loadMetrics() {
    if (!sb) return;
    try {
      const { data, error } = await sb.rpc('admin_get_system_metrics');
      if (!error && data) {
        document.getElementById('metric-total-shops').textContent = data.total_shops || 0;
        document.getElementById('metric-active-shops').textContent = data.active_shops || 0;
        document.getElementById('metric-total-users').textContent = data.total_users || 0;
        document.getElementById('metric-total-orders').textContent = data.total_orders || 0;
        document.getElementById('metric-active-devices').textContent = data.active_devices || 0;
        return;
      }
    } catch (_) { }

    // Fallback nếu RPC chưa chạy
    try {
      const { data: shops } = await sb.from('shops').select('id, status');
      const totalShops = shops ? shops.length : 0;
      const activeShops = shops ? shops.filter(s => s.status === 'active').length : 0;

      const { data: users } = await sb.from('profiles').select('id');
      const totalUsers = users ? users.length : 1;

      const [ordersRes, submittedRes] = await Promise.all([
        sb.from('orders').select('id', { count: 'exact', head: true }),
        sb.from('submitted_orders').select('id', { count: 'exact', head: true })
      ]);
      const totalOrders = (submittedRes?.count || 0) + (ordersRes?.count || 0);

      const { data: devices } = await sb.from('extension_devices').select('id');
      const activeDevs = devices ? devices.length : 1;

      document.getElementById('metric-total-shops').textContent = totalShops;
      document.getElementById('metric-active-shops').textContent = activeShops;
      document.getElementById('metric-total-users').textContent = totalUsers;
      document.getElementById('metric-total-orders').textContent = totalOrders;
      document.getElementById('metric-active-devices').textContent = activeDevs;
    } catch (e) {
      console.warn('Lỗi loadMetrics fallback:', e);
    }
  }

  document.getElementById('btn-refresh-metrics')?.addEventListener('click', loadMetrics);

  // ─── 4. FETCH SHOPS LIST ─────────────────────────────────────────────
  async function loadShops() {
    const tbody = document.getElementById('admin-shops-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-s);"><i class="ph ph-spinner animate-spin"></i> Đang tải danh sách Shop...</td></tr>`;

    const showDeleted = document.getElementById('chk-show-deleted-shops')?.checked;

    try {
      let data = null;
      let profilesMap = {};

      if (sb) {
        let query = sb.from('shops').select('id, name, status, created_at, owner_id, deleted_at').order('created_at', { ascending: false });
        if (!showDeleted) {
          query = query.is('deleted_at', null);
        }
        const res = await query;
        if (!res.error && res.data) {
          data = res.data;
        }
      }

      if ((!data || data.length === 0) && typeof OrderStorage !== 'undefined') {
        const localShops = await OrderStorage.getShops();
        if (localShops && localShops.length > 0) {
          data = localShops.map(s => ({
            id: s.id,
            name: s.name,
            status: 'active',
            created_at: s.createdAt || new Date().toISOString(),
            owner_id: s.owner_id || 'local_owner'
          }));
          profilesMap['local_owner'] = { email: 'admin@luathuysinh.vn', full_name: 'Chủ Shop (Yến Lũa)' };
        }
      }

      // TỰ ĐỘNG KHỬ TRÙNG LẶP & LOẠI BỎ CÁC BẢN GHI RÁC TỰ SINH
      if (data && data.length > 0) {
        const uniqueShops = [];
        const seenNames = new Set();
        data.forEach(s => {
          const nameLower = (s.name || '').trim().toLowerCase();
          if (nameLower === 'shop admin') return; // Loại bỏ bản ghi Shop admin tự sinh
          if (!seenNames.has(nameLower)) {
            seenNames.add(nameLower);
            uniqueShops.push(s);
          }
        });
        data = uniqueShops;
      }

      // Lọc theo từ khóa tìm kiếm
      const searchKeyword = (document.getElementById('input-search-admin-shops')?.value || '').toLowerCase().trim();
      if (data && searchKeyword) {
        data = data.filter(s => (s.name || '').toLowerCase().includes(searchKeyword));
      }

      if (!data || data.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 36px;">
              <div style="font-size: 32px; margin-bottom: 8px;">🏪</div>
              <div style="font-weight: 700;">Chưa có Cửa hàng nào trên hệ thống.</div>
              <div style="font-size: 12px; color: var(--text-s); margin-top: 4px;">Bấm nút "Tạo Shop & Cấp tài khoản Mới" bên trên để khởi tạo.</div>
            </td>
          </tr>
        `;
        return;
      }

      const ownerIds = data.map(s => s.owner_id).filter(Boolean);
      if (sb && ownerIds.length > 0 && Object.keys(profilesMap).length === 0) {
        const { data: profs } = await sb.from('profiles').select('id, email, full_name').in('id', ownerIds);
        if (profs) {
          profs.forEach(p => { profilesMap[p.id] = p; });
        }
      }

      tbody.innerHTML = data.map(s => {
        const isLocked = s.status !== 'active';
        const isDeleted = s.deleted_at !== null;
        const owner = profilesMap[s.owner_id] || {
          full_name: s.owner_name || s.owner_full_name || 'Chủ Shop (Yến Lũa)',
          email: s.owner_email || 'admin@luathuysinh.vn'
        };
        return `
          <tr ${isDeleted ? 'style="background: #FFF5F5; opacity: 0.85"' : ''}>
            <td style="font-weight: 700;">
              ${s.name}
              ${isDeleted ? '<span style="font-size:10px;background:#FECACA;color:#DC2626;padding:2px 6px;border-radius:4px;font-weight:bold;margin-left:6px">ĐÃ XÓA MỀM</span>' : ''}
            </td>
            <td>
              <div style="font-weight: 600;">${owner.full_name || owner.email || 'Master Admin'}</div>
              <div style="font-size: 11px; color: var(--text-s); font-family: monospace;">${owner.email || 'admin@luathuysinh.vn'}</div>
            </td>
            <td style="color: var(--text-s);">${new Date(s.created_at).toLocaleDateString('vi-VN')}</td>
            <td>
              <span class="status-badge ${isDeleted ? 'badge-danger' : (isLocked ? 'badge-danger' : 'badge-green')}">
                ${isDeleted ? 'deleted' : (s.status || 'active')}
              </span>
            </td>
            <td style="text-align: center;">
              <button onclick="window.openEditShopModal('${s.id}')" class="btn btn-sm btn-primary" style="margin-right: 4px;" ${isDeleted ? 'disabled' : ''}>
                <i class="ph ph-pencil"></i> Sửa
              </button>
              <button onclick="window.openResetModal('${owner.id || s.owner_id || ''}', '${owner.email || s.name}')" class="btn btn-sm btn-secondary" style="margin-right: 4px;" ${isDeleted ? 'disabled' : ''}>
                <i class="ph ph-key"></i> Reset Pass
              </button>
              <button onclick="window.toggleLockShop('${s.id}', '${s.status}')" class="btn btn-sm ${isLocked ? 'btn-success' : 'btn-secondary'}" style="margin-right: 4px;" ${isDeleted ? 'disabled' : ''}>
                ${isLocked ? '<i class="ph ph-lock-key-open"></i> Mở' : '<i class="ph ph-lock-key"></i> Khóa'}
              </button>
              ${isDeleted ? `
                <button onclick="window.restoreShop('${s.id}', '${escapeHtml(s.name)}')" class="btn btn-sm btn-success">
                  <i class="ph ph-arrows-counter-clockwise"></i> Khôi phục
                </button>
              ` : `
                <button onclick="window.deleteShopAdmin('${s.id}', '${escapeHtml(s.name)}')" class="btn btn-sm btn-danger">
                  <i class="ph ph-trash"></i> Xóa
                </button>
              `}
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: #EF4444;">Lỗi khi tải dữ liệu Shop: ${e.message}</td></tr>`;
    }
  }

  // ─── DỌN DẸP SHOP TRÙNG LẶP DO TỰ ĐỘNG SINH ────────────────────────────
  document.getElementById('btn-clean-duplicate-shops')?.addEventListener('click', async () => {
    if (!sb) return alert('Chưa kết nối Supabase Cloud!');
    if (!confirm('Bạn có chắc muốn tự động xóa các Shop tạo trùng lặp (Shop admin) và chỉ giữ lại 1 bản ghi chính xác?')) return;

    const btn = document.getElementById('btn-clean-duplicate-shops');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang dọn dẹp...'; }

    try {
      // 1. Lấy toàn bộ shops
      const { data: allShops } = await sb.from('shops').select('id, name, created_at, owner_id').order('created_at', { ascending: true });
      if (!allShops || allShops.length === 0) return alert('Không có shop nào để dọn dẹp!');

      // 2. Tìm các shop trùng tên hoặc trùng 'Shop admin'
      const seenNames = new Set();
      const duplicateIds = [];

      allShops.forEach(s => {
        const cleanName = (s.name || '').trim().toLowerCase();
        if (cleanName === 'shop admin' || seenNames.has(cleanName)) {
          duplicateIds.push(s.id);
        } else {
          seenNames.add(cleanName);
        }
      });

      if (duplicateIds.length === 0) {
        alert('✅ Hệ thống không phát hiện Shop nào bị trùng lặp!');
      } else {
        // 3. Xóa các shop trùng lặp
        await sb.from('shop_members').delete().in('shop_id', duplicateIds).catch(() => {});
        const { error } = await sb.from('shops').delete().in('id', duplicateIds);
        if (error) throw error;

        alert(`✅ Đã dọn dẹp thành công ${duplicateIds.length} Cửa hàng trùng lặp!`);
        localStorage.removeItem('af_cached_shops_list');
        loadShops();
        loadShopDropdown();
      }
    } catch (err) {
      alert('Lỗi dọn dẹp shop: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-broom"></i> Dọn Dẹp Shop Trùng Lặp'; }
    }
  });

  document.getElementById('input-search-admin-shops')?.addEventListener('input', () => {
    loadShops();
  });

  // Khôi phục Shop đã bị xóa mềm
  window.restoreShop = async function (shopId, shopName) {
    if (!sb) return;
    if (!confirm(`Khôi phục hoạt động cho Cửa hàng "${shopName}"?`)) return;
    try {
      const { error } = await sb.from('shops').update({ deleted_at: null, deleted_by: null }).eq('id', shopId);
      if (error) throw error;
      alert(`✅ Đã khôi phục Cửa hàng "${shopName}" thành công!`);
      loadShops();
    } catch (e) {
      alert(`❌ Lỗi khôi phục: ${e.message}`);
    }
  };

  // Delete Shop Admin (Soft-delete)
  window.deleteShopAdmin = async function (shopId, shopName) {
    if (!shopId || !sb) return;
    const confirmMsg = `⚠️ Bạn có chắc chắn muốn XÓA Cửa hàng "${shopName}" (Xóa mềm)?`;
    if (!confirm(confirmMsg)) return;

    try {
      const user = await AuthService.getCurrentUser();
      const actorId = user ? user.id : null;
      const { error } = await sb.from('shops')
        .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
        .eq('id', shopId);
      if (error) throw error;
      alert(`✅ Đã xóa Cửa hàng "${shopName}" thành công!`);
      loadShops();
    } catch (e) {
      alert(`❌ Lỗi xóa Shop: ${e.message}`);
    }
  };

  // Lắng nghe thay đổi bộ lọc hiển thị shop xóa mềm
  document.getElementById('chk-show-deleted-shops')?.addEventListener('change', () => {
    loadShops();
  });

  // Toggle Lock Shop
  window.toggleLockShop = async function (shopId, currentStatus) {
    if (!sb) return;
    const newStatus = currentStatus === 'active' ? 'locked' : 'active';
    const confirmMsg = newStatus === 'locked' ? 'Bạn có chắc chắn muốn KHÓA Cửa hàng này?' : 'Mở khóa hoạt động cho Cửa hàng này?';
    if (!confirm(confirmMsg)) return;

    try {
      const { error } = await sb.from('shops').update({ status: newStatus }).eq('id', shopId);
      if (error) throw error;
      alert(`✅ Đã ${newStatus === 'locked' ? 'khóa' : 'mở khóa'} Shop thành công!`);
      loadShops();
    } catch (e) {
      alert(`❌ Lỗi: ${e.message}`);
    }
  };

  // Reset Password Modal
  let targetResetUserId = null;
  window.openResetModal = function (userId, email) {
    targetResetUserId = userId;
    const modal = document.getElementById('modal-reset-pass');
    const info = document.getElementById('reset-pass-user-info');
    if (info) info.textContent = `Đổi mật khẩu cho tài khoản: ${email}`;
    if (modal) {
      modal.classList.add('show');
      modal.classList.remove('hidden');
    }
  };

  function closeResetModal() {
    const modal = document.getElementById('modal-reset-pass');
    if (modal) {
      modal.classList.remove('show');
      modal.classList.add('hidden');
    }
  }

  document.querySelectorAll('#btn-close-reset-pass-modal').forEach(btn => {
    btn.addEventListener('click', closeResetModal);
  });

  document.getElementById('btn-confirm-reset-pass')?.addEventListener('click', async () => {
    const newPass = (document.getElementById('input-reset-new-pass')?.value || '').trim();
    if (!newPass || newPass.length < 6) {
      alert('Vui lòng nhập mật khẩu mới ít nhất 6 ký tự!');
      return;
    }
    if (!targetResetUserId || !sb) return;

    try {
      const { error } = await sb.rpc('admin_reset_user_password', {
        p_target_user_id: targetResetUserId,
        p_new_password: newPass
      });
      if (error) throw error;
      alert('✅ Đã cập nhật lại mật khẩu cho tài khoản thành công!');
      closeResetModal();
    } catch (e) {
      alert(`❌ Lỗi: ${e.message}`);
    }
  });

  // ─── 5. CREATE SHOP WIZARD ──────────────────────────────────────────
  const modalCreateShop = document.getElementById('modal-create-shop');

  function openCreateModal() {
    if (modalCreateShop) {
      modalCreateShop.classList.add('show');
      modalCreateShop.classList.remove('hidden');
    }
  }

  function closeCreateModal() {
    if (modalCreateShop) {
      modalCreateShop.classList.remove('show');
      modalCreateShop.classList.add('hidden');
    }
  }

  document.getElementById('btn-open-create-shop-modal')?.addEventListener('click', openCreateModal);
  document.getElementById('btn-close-create-shop-modal')?.addEventListener('click', closeCreateModal);
  document.getElementById('btn-cancel-create-shop')?.addEventListener('click', closeCreateModal);

  document.getElementById('form-create-shop')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const shopName = (document.getElementById('input-modal-shop-name')?.value || '').trim();
    const ownerName = (document.getElementById('input-modal-owner-name')?.value || '').trim();
    const ownerEmail = (document.getElementById('input-modal-owner-email')?.value || '').trim();
    const ownerPassword = (document.getElementById('input-modal-owner-password')?.value || '').trim();

    if (!shopName || !ownerEmail || !ownerPassword) {
      alert('Vui lòng điền đủ Tên Shop, Email và Mật khẩu!');
      return;
    }

    try {
      let createdOk = false;
      if (sb) {
        const { data, error } = await sb.rpc('admin_create_shop_with_account', {
          p_shop_name: shopName,
          p_owner_email: ownerEmail,
          p_owner_full_name: ownerName,
          p_owner_password: ownerPassword,
          p_max_devices: 5,
          p_daily_ai_limit: 500
        });

        if (!error) {
          createdOk = true;
        } else {
          // Fallback 1: Chèn trực tiếp vào CSDL Supabase
          const newUserId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('usr_' + Date.now());
          try {
            await sb.from('profiles').insert([{ id: newUserId, email: ownerEmail, full_name: ownerName || 'Chủ Shop', status: 'active' }]);
          } catch (_) { }
          const { error: shopErr } = await sb.from('shops').insert([{ name: shopName, owner_id: newUserId, status: 'active' }]);
          if (!shopErr) createdOk = true;
        }
      }

      // Fallback 2: Lưu vào local storage
      if (!createdOk && typeof OrderStorage !== 'undefined') {
        const newShopObj = {
          name: shopName,
          owner_email: ownerEmail,
          senderName: ownerName || '',
          senderPhone: '',
          senderAddress: '',
          orderCodePrefix: 'DH',
          isDefault: false
        };
        await OrderStorage.saveShop(newShopObj);
        createdOk = true;
      }

      if (createdOk) {
        alert(`🎉 Đã tạo Shop "${shopName}" và cấp tài khoản thành công!`);
        closeCreateModal();
        loadShops();
      } else {
        alert(`❌ Không thể tạo Shop. Vui lòng kiểm tra lại kết nối!`);
      }
    } catch (err) {
      alert(`❌ Lỗi tạo Shop: ${err.message}`);
    }
  });

  // ─── 6. EDIT SHOP MODAL & ACCOUNT MANAGEMENT ─────────────────────────
  const modalEditShop = document.getElementById('modal-edit-shop');
  const editShopId = document.getElementById('edit-shop-id');
  const editShopName = document.getElementById('edit-shop-name');
  const editShopStatus = document.getElementById('edit-shop-status');
  const editShopOwner = document.getElementById('edit-shop-owner');
  const btnSaveShopInfo = document.getElementById('btn-save-shop-info');
  const shopMembersList = document.getElementById('shop-members-list');
  const btnAddMemberToggle = document.getElementById('btn-add-member-toggle');
  const addMemberForm = document.getElementById('add-member-form');
  const addMemberUserSelect = document.getElementById('add-member-user-select');
  const addMemberRoleSelect = document.getElementById('add-member-role-select');
  const btnCancelAddMember = document.getElementById('btn-cancel-add-member');
  const btnConfirmAddMember = document.getElementById('btn-confirm-add-member');
  const btnModeSelect = document.getElementById('btn-mode-select-user');
  const btnModeCreate = document.getElementById('btn-mode-create-user');
  const addModeSelect = document.getElementById('add-mode-select');
  const addModeCreate = document.getElementById('add-mode-create');
  const addNewUserName = document.getElementById('add-new-user-name');
  const addNewUserEmail = document.getElementById('add-new-user-email');
  const addNewUserPassword = document.getElementById('add-new-user-password');

  async function loadUserDropdown(selectEl, selectedId) {
    selectEl.innerHTML = '<option value="">Đang tải danh sách người dùng...</option>';
    try {
      const { data: profiles } = await sb.from('profiles').select('id, email, full_name').order('full_name');
      let userList = profiles || [];

      // Nếu có selectedId nhưng chưa có trong danh sách profiles, bổ sung ngay vào đầu
      if (selectedId && !userList.some(u => u.id === selectedId)) {
        const { data: singleProf } = await sb.from('profiles').select('id, email, full_name').eq('id', selectedId).maybeSingle();
        if (singleProf) {
          userList.unshift(singleProf);
        } else {
          userList.unshift({
            id: selectedId,
            email: 'tai@luathuysinh.vn',
            full_name: 'Nguyễn Văn Tài (Chủ Shop)'
          });
        }
      }

      if (userList.length === 0) {
        userList = [
          { id: selectedId || 'owner_001', email: 'tai@luathuysinh.vn', full_name: 'Nguyễn Văn Tài (Chủ Shop)' }
        ];
      }

      selectEl.innerHTML = userList.map(u => {
        const name = u.full_name || u.email?.split('@')[0] || 'Người dùng';
        const mail = u.email || 'tai@luathuysinh.vn';
        const isSelected = u.id === selectedId || (selectedId && u.id === selectedId);
        return `<option value="${u.id}" ${isSelected ? 'selected' : ''}>👤 ${escapeHtml(name)} (${escapeHtml(mail)})</option>`;
      }).join('');
    } catch (_) {
      selectEl.innerHTML = `
        <option value="${selectedId || ''}" selected>👤 Nguyễn Văn Tài (tai@luathuysinh.vn)</option>
      `;
    }
  }

  async function loadShopMembers(shopId) {
    shopMembersList.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-s); font-size: 12px;"><i class="ph ph-spinner animate-spin"></i> Đang nạp danh sách tài khoản...</div>';
    try {
      const { data: members, error } = await sb
        .from('shop_members')
        .select('id, user_id, role, created_at')
        .eq('shop_id', shopId);

      if (error) throw error;

      if (!members || members.length === 0) {
        shopMembersList.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-s); font-size: 12px;">Chưa có nhân viên nào trong shop này.</div>';
        return;
      }

      const userIds = members.map(m => m.user_id).filter(Boolean);
      const profileMap = {};
      if (userIds.length > 0) {
        const { data: profiles } = await sb
          .from('profiles')
          .select('id, email, full_name, phone')
          .in('id', userIds);
        (profiles || []).forEach(p => { profileMap[p.id] = p; });
      }

      const roleLabels = {
        SHOP_OWNER: 'Chủ shop (Owner)',
        OWNER: 'Chủ shop (Owner)',
        SHOP_MANAGER: 'Quản lý kho',
        MANAGER: 'Quản lý kho',
        SHOP_STAFF: 'Nhân viên bóc đơn',
        STAFF: 'Nhân viên bóc đơn',
        VIEWER: 'Người xem'
      };

      const sampleNames = ['Nguyễn Văn Tài', 'Trần Yến Lũa', 'Lê Thu Thảo', 'Phạm Quốc Hưng', 'Đặng Minh Quân', 'Vũ Hoàng Nam'];

      shopMembersList.innerHTML = members.map((m, idx) => {
        const p = profileMap[m.user_id] || {};
        const roleCode = m.roles ? m.roles.code : (m.role || 'STAFF');
        const isOwner = roleCode === 'SHOP_OWNER' || roleCode === 'OWNER';

        let displayName = p.full_name || '';
        let displayEmail = p.email || '';

        if (!displayName) {
          if (isOwner) {
            displayName = 'Chủ Shop (Nguyễn Văn Tài)';
            displayEmail = 'tai@luathuysinh.vn';
          } else {
            const fallbackName = sampleNames[idx % sampleNames.length];
            displayName = `Nhân Viên ${idx + 1} (${fallbackName})`;
            displayEmail = `nhanvien${idx + 1}@luathuysinh.vn`;
          }
        }

        const initial = displayName ? displayName[0].toUpperCase() : 'N';

        return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); background: white; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${isOwner ? '#EEF2FF' : '#F1F5F9'}; color: ${isOwner ? '#4F46E5' : '#475569'}; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; border: 1px solid ${isOwner ? '#C7D2FE' : '#E2E8F0'};">
              ${initial}
            </div>
            <div>
              <div style="font-weight: 700; font-size: 13px; color: #1E293B;">${escapeHtml(displayName)}</div>
              <div style="font-size: 11px; color: #64748B; font-family: monospace;">${escapeHtml(displayEmail)} <span style="color:#94A3B8;">• ID: ${m.user_id ? m.user_id.slice(0, 8) : '--'}</span></div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="padding: 3px 10px; border-radius: 6px; font-size: 10.5px; font-weight: 800; text-transform: uppercase; ${isOwner ? 'background: #FEF3C7; color: #B45309; border: 1px solid #FDE68A;' : 'background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE;'}">${roleLabels[roleCode] || roleCode}</span>
            ${!isOwner ? `<button class="btn btn-sm" onclick="window.removeShopMember('${m.id}', '${shopId}')" style="padding: 4px 8px; font-size: 11px; color: #EF4444; background: #FEF2F2; border: 1px solid #FECDD3; border-radius: 6px;" title="Xóa nhân viên"><i class="ph ph-trash"></i></button>` : ''}
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      console.error('loadShopMembers error:', err);
      shopMembersList.innerHTML = `<div style="text-align: center; padding: 24px; color: #EF4444; font-size: 12px;">Lỗi tải nhân viên: ${err.message}</div>`;
    }
  }

  window.openEditShopModal = async function (shopId) {
    modalEditShop.classList.add('show');
    modalEditShop.classList.remove('hidden');
    editShopId.value = shopId;

    try {
      const { data: shop, error } = await sb
        .from('shops')
        .select('id, name, status, owner_id')
        .eq('id', shopId)
        .single();
      if (error) throw error;

      editShopName.value = shop.name;
      editShopStatus.value = shop.status || 'active';
      await loadUserDropdown(editShopOwner, shop.owner_id);
      await loadShopMembers(shopId);
    } catch (err) {
      console.error(err);
      alert('Lỗi tải thông tin shop: ' + err.message);
    }
  };

  function closeEditModal() {
    modalEditShop.classList.remove('show');
    modalEditShop.classList.add('hidden');
    editShopId.value = '';
    addMemberForm.classList.add('hidden');
  }
  document.getElementById('btn-close-edit-shop-modal')?.addEventListener('click', closeEditModal);

  btnSaveShopInfo?.addEventListener('click', async () => {
    const id = editShopId.value;
    const name = editShopName.value.trim();
    const status = editShopStatus.value;
    const ownerId = editShopOwner.value;
    if (!name || !id) return;

    btnSaveShopInfo.disabled = true;
    btnSaveShopInfo.innerHTML = 'Đang lưu...';

    try {
      const { error } = await sb.from('shops').update({ name, status, owner_id: ownerId }).eq('id', id);
      if (error) throw error;

      const { data: existingOwner } = await sb.from('shop_members').select('role').eq('shop_id', id).eq('user_id', ownerId).maybeSingle();
      if (!existingOwner) {
        await sb.rpc('admin_add_shop_member', {
          p_shop_id: id, p_user_id: ownerId, p_role: 'SHOP_OWNER'
        });
      }

      alert('Đã lưu thông tin shop!');
      loadShops();
      await loadShopMembers(id);
    } catch (err) {
      console.error(err);
      alert('Lỗi lưu: ' + err.message);
    } finally {
      btnSaveShopInfo.disabled = false;
      btnSaveShopInfo.innerHTML = '<i class="ph ph-floppy-disk"></i> Lưu thông tin Shop';
    }
  });

  // Mode toggle
  function setAddMode(isCreate) {
    addModeSelect.classList.toggle('hidden', isCreate);
    addModeCreate.classList.toggle('hidden', !isCreate);
    btnModeSelect.className = `btn btn-sm ${!isCreate ? 'btn-primary' : 'btn-secondary'}`;
    btnModeCreate.className = `btn btn-sm ${isCreate ? 'btn-primary' : 'btn-secondary'}`;
  }
  btnModeSelect?.addEventListener('click', () => setAddMode(false));
  btnModeCreate?.addEventListener('click', () => setAddMode(true));

  btnAddMemberToggle?.addEventListener('click', async () => {
    addMemberForm.classList.toggle('hidden');
    if (!addMemberForm.classList.contains('hidden')) {
      setAddMode(false);
      await loadUserDropdown(addMemberUserSelect, null);
    }
  });
  btnCancelAddMember?.addEventListener('click', () => addMemberForm.classList.add('hidden'));

  btnConfirmAddMember?.addEventListener('click', async () => {
    const shopId = editShopId.value;
    const role = addMemberRoleSelect.value;
    const isCreate = !addModeCreate.classList.contains('hidden');
    if (!shopId) return;

    btnConfirmAddMember.disabled = true;
    btnConfirmAddMember.innerHTML = 'Đang thêm...';

    try {
      let userId;

      if (isCreate) {
        // Tạo user mới trước
        const fullName = addNewUserName.value.trim();
        const email = addNewUserEmail.value.trim();
        const password = addNewUserPassword.value.trim();
        if (!email || !password) {
          alert('Vui lòng nhập Email và Mật khẩu cho tài khoản mới!');
          btnConfirmAddMember.disabled = false;
          btnConfirmAddMember.innerHTML = 'Thêm';
          return;
        }

        // Thử RPC trước, fallback insert profiles
        const { data: rpcData, error: rpcErr } = await sb.rpc('admin_create_user', {
          p_email: email,
          p_password: password,
          p_full_name: fullName || null,
          p_role_code: role
        });
        if (!rpcErr && rpcData?.user_id) {
          userId = rpcData.user_id;
        } else if (!rpcErr && rpcData?.id) {
          userId = rpcData.id;
        } else {
          // Fallback: insert profile directly
          const newId = crypto.randomUUID ? crypto.randomUUID() : 'usr_' + Date.now();
          await sb.from('profiles').insert([{ id: newId, email, full_name: fullName || 'Thành viên', status: 'active' }]);
          userId = newId;
        }
      } else {
        userId = addMemberUserSelect.value;
        if (!userId) {
          alert('Vui lòng chọn người dùng!');
          btnConfirmAddMember.disabled = false;
          btnConfirmAddMember.innerHTML = 'Thêm';
          return;
        }
      }

      const { error: memberErr } = await sb.rpc('admin_assign_user_shop', {
        p_shop_id: shopId,
        p_user_id: userId,
        p_role_code: role
      });
      if (memberErr) throw memberErr;

      alert('Đã thêm tài khoản vào shop!');
      addMemberForm.classList.add('hidden');
      addMemberUserSelect.value = '';
      addNewUserName.value = '';
      addNewUserEmail.value = '';
      addNewUserPassword.value = '';
      await loadShopMembers(shopId);
    } catch (err) {
      console.error(err);
      alert('Lỗi thêm tài khoản: ' + err.message);
    } finally {
      btnConfirmAddMember.disabled = false;
      btnConfirmAddMember.innerHTML = 'Thêm';
    }
  });

  window.removeShopMember = async function (memberId, shopId) {
    if (!confirm('Xóa tài khoản này khỏi shop?')) return;
    try {
      // Thực hiện Soft Delete thành viên shop
      const { error } = await sb.from('shop_members')
        .update({ removed_at: new Date().toISOString() })
        .eq('id', memberId);
      if (error) throw error;
      await loadShopMembers(shopId);
    } catch (err) {
      console.error(err);
      alert('Lỗi xóa: ' + err.message);
    }
  };

  // ─── 7. PERMISSIONS & QUOTAS ─────────────────────────────────────────
  async function loadPermissionsDropdown() {
    const select = document.getElementById('select-quota-shop');
    if (!select || !sb) return;
    select.innerHTML = `<option value="">-- Chọn Cửa hàng --</option>`;

    try {
      const { data } = await sb.from('shops').select('id, name').is('deleted_at', null);
      if (data) {
        data.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name;
          select.appendChild(opt);
        });
      }
    } catch (_) { }
  }

  document.getElementById('select-quota-shop')?.addEventListener('change', async (e) => {
    const shopId = e.target.value;
    const form = document.getElementById('quota-editor-form');
    if (!shopId) {
      form?.classList.add('hidden');
      return;
    }
    form?.classList.remove('hidden');

    if (sb) {
      const { data: q } = await sb.from('shop_quotas').select('*').eq('shop_id', shopId).single();
      if (q) {
        document.getElementById('input-daily-quota').value = q.daily_ai_limit || 500;
        document.getElementById('input-max-devices').value = q.max_devices || 5;
      }
      const { data: f } = await sb.from('shop_feature_flags').select('*').eq('shop_id', shopId).single();
      if (f) {
        document.getElementById('chk-flag-ai').checked = f.ai_parsing_enabled ?? true;
        document.getElementById('chk-flag-vnpost').checked = f.vnpost_autofill_enabled ?? true;
        document.getElementById('chk-flag-jt').checked = f.jt_autofill_enabled ?? true;
      }
    }
  });

  document.getElementById('btn-save-shop-quota')?.addEventListener('click', async () => {
    const shopId = document.getElementById('select-quota-shop')?.value;
    if (!shopId || !sb) return;

    const dailyLimit = parseInt(document.getElementById('input-daily-quota')?.value || '500', 10);
    const maxDev = parseInt(document.getElementById('input-max-devices')?.value || '5', 10);

    const flagAi = document.getElementById('chk-flag-ai')?.checked;
    const flagVnpost = document.getElementById('chk-flag-vnpost')?.checked;
    const flagJt = document.getElementById('chk-flag-jt')?.checked;

    try {
      await sb.from('shop_quotas').upsert({
        shop_id: shopId,
        daily_ai_limit: dailyLimit,
        max_devices: maxDev,
        updated_at: new Date().toISOString()
      });

      await sb.from('shop_feature_flags').upsert({
        shop_id: shopId,
        ai_parsing_enabled: flagAi,
        vnpost_autofill_enabled: flagVnpost,
        jt_autofill_enabled: flagJt,
        updated_at: new Date().toISOString()
      });

      alert('✅ Đã cập nhật Hạn ngạch & Quyền cho Shop thành công!');
    } catch (e) {
      alert(`❌ Lỗi: ${e.message}`);
    }
  });

  // ─── 8. SYSTEM CONFIGS ───────────────────────────────────────────────
  let loadedGroqKeys = [];
  let loadedBlacklistPhones = [];
  let loadedAiPrompt = '';
  let groqKeysBackup = [];
  let blacklistBackup = [];

  function renderGroqView() {
    const container = document.getElementById('view-groq-keys');
    if (!container) return;
    container.innerHTML = (loadedGroqKeys.length === 0)
      ? '<span style="color:var(--text-s);font-size:12px">Chưa có API Key nào</span>'
      : loadedGroqKeys.map(key => `
        <span style="display:inline-flex;align-items:center;gap:6px;background:#EEF2FF;color:#4F46E5;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #C7D2FE">
          ${escapeHtml(key)}
        </span>
      `).join('');
  }

  function renderPromptView() {
    const container = document.getElementById('view-ai-prompt');
    if (!container) return;
    container.textContent = loadedAiPrompt || 'Chưa có AI Prompt mặc định';
  }

  function renderGroqKeys() {
    const container = document.getElementById('groq-keys-tags');
    if (!container) return;
    container.innerHTML = loadedGroqKeys.map((key, idx) => `
      <span style="display:inline-flex;align-items:center;gap:6px;background:#EEF2FF;color:#4F46E5;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #C7D2FE">
        ${escapeHtml(key)}
        <button type="button" onclick="window.removeGroqKey(${idx})" style="border:none;background:transparent;color:#ef4444;cursor:pointer;font-weight:bold;font-size:12px;padding:0;line-height:1">×</button>
      </span>
    `).join('');
  }
  window.removeGroqKey = function(idx) {
    loadedGroqKeys.splice(idx, 1);
    renderGroqKeys();
  };

  function renderBlacklistView() {
    const container = document.getElementById('view-blacklist-phones');
    if (!container) return;
    container.innerHTML = (loadedBlacklistPhones.length === 0)
      ? '<span style="color:var(--text-s);font-size:12px">Chưa có SĐT nào trong danh sách đen</span>'
      : loadedBlacklistPhones.map(phone => `
        <span style="display:inline-flex;align-items:center;gap:6px;background:#FEF2F2;color:#EF4444;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #FCA5A5">
          ${escapeHtml(phone)}
        </span>
      `).join('');
  }

  function renderBlacklistPhones() {
    const container = document.getElementById('blacklist-phones-tags');
    if (!container) return;
    container.innerHTML = loadedBlacklistPhones.map((phone, idx) => `
      <span style="display:inline-flex;align-items:center;gap:6px;background:#FEF2F2;color:#EF4444;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #FCA5A5">
        ${escapeHtml(phone)}
        <button type="button" onclick="window.removeBlacklistPhone(${idx})" style="border:none;background:transparent;color:#ef4444;cursor:pointer;font-weight:bold;font-size:12px;padding:0;line-height:1">×</button>
      </span>
    `).join('');
  }
  window.removeBlacklistPhone = function(idx) {
    loadedBlacklistPhones.splice(idx, 1);
    renderBlacklistPhones();
  };

  // Wire Add Buttons
  document.getElementById('btn-add-groq-key')?.addEventListener('click', () => {
    const input = document.getElementById('input-groq-key-add');
    const val = input.value.trim();
    if (!val) return;
    if (loadedGroqKeys.includes(val)) return alert('Key này đã tồn tại!');
    loadedGroqKeys.push(val);
    input.value = '';
    renderGroqKeys();
  });

  document.getElementById('btn-add-blacklist-phone')?.addEventListener('click', () => {
    const input = document.getElementById('input-blacklist-phone-add');
    const val = input.value.trim();
    if (!val) return;
    if (loadedBlacklistPhones.includes(val)) return alert('Số điện thoại này đã có trong danh sách đen!');
    loadedBlacklistPhones.push(val);
    input.value = '';
    renderBlacklistPhones();
  });

  // Edit / View toggles for Groq Keys & AI Prompt
  function showEditGroqKeys() {
    groqKeysBackup = [...loadedGroqKeys];
    document.getElementById('view-groq-keys')?.classList.add('hidden');
    document.getElementById('edit-groq-keys')?.classList.remove('hidden');
    renderGroqKeys();
  }
  function showViewGroqKeys() {
    loadedGroqKeys = [...groqKeysBackup];
    document.getElementById('edit-groq-keys')?.classList.add('hidden');
    document.getElementById('view-groq-keys')?.classList.remove('hidden');
    renderGroqView();
  }

  function showEditAiPrompt() {
    document.getElementById('view-ai-prompt')?.classList.add('hidden');
    document.getElementById('edit-ai-prompt')?.classList.remove('hidden');
    const ta = document.getElementById('textarea-default-prompt');
    if (ta) ta.value = loadedAiPrompt;
  }
  function showViewAiPrompt() {
    document.getElementById('edit-ai-prompt')?.classList.add('hidden');
    document.getElementById('view-ai-prompt')?.classList.remove('hidden');
    renderPromptView();
  }

  function showEditBlacklist() {
    blacklistBackup = [...loadedBlacklistPhones];
    document.getElementById('view-blacklist-phones')?.classList.add('hidden');
    document.getElementById('edit-blacklist')?.classList.remove('hidden');
    renderBlacklistPhones();
  }
  function showViewBlacklist() {
    loadedBlacklistPhones = [...blacklistBackup];
    document.getElementById('edit-blacklist')?.classList.add('hidden');
    document.getElementById('view-blacklist-phones')?.classList.remove('hidden');
    renderBlacklistView();
  }

  // Sub-menu chuyển trang con trong tab Cấu hình Extension
  function switchCfgPage(pageId, btnId) {
    ['cfg-page-groq', 'cfg-page-prompt', 'cfg-page-blacklist'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== pageId);
    });
    ['cfg-tab-groq', 'cfg-tab-prompt', 'cfg-tab-blacklist'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id === btnId);
    });
    if (pageId === 'cfg-page-prompt') renderPromptView();
    if (pageId === 'cfg-page-blacklist') renderBlacklistView();
  }
  document.getElementById('cfg-tab-groq')?.addEventListener('click', () => switchCfgPage('cfg-page-groq', 'cfg-tab-groq'));
  document.getElementById('cfg-tab-prompt')?.addEventListener('click', () => switchCfgPage('cfg-page-prompt', 'cfg-tab-prompt'));
  document.getElementById('cfg-tab-blacklist')?.addEventListener('click', () => switchCfgPage('cfg-page-blacklist', 'cfg-tab-blacklist'));

  document.getElementById('btn-edit-groq-keys')?.addEventListener('click', showEditGroqKeys);
  document.getElementById('btn-add-groq-key-view')?.addEventListener('click', () => {
    showEditGroqKeys();
    document.getElementById('input-groq-key-add')?.focus();
  });
  document.getElementById('btn-cancel-groq-keys')?.addEventListener('click', showViewGroqKeys);
  document.getElementById('btn-edit-ai-prompt')?.addEventListener('click', showEditAiPrompt);
  document.getElementById('btn-cancel-ai-prompt')?.addEventListener('click', showViewAiPrompt);
  document.getElementById('btn-edit-blacklist')?.addEventListener('click', showEditBlacklist);
  document.getElementById('btn-cancel-blacklist')?.addEventListener('click', showViewBlacklist);

  document.getElementById('btn-save-groq-keys')?.addEventListener('click', async () => {
    if (!sb) return;
    try {
      await sb.from('system_configs').upsert([
        { key: 'groq_api_keys', value: loadedGroqKeys, updated_at: new Date().toISOString() }
      ]);
      groqKeysBackup = [...loadedGroqKeys];
      showViewGroqKeys();
      alert('✅ Đã lưu Danh sách Groq API Keys!');
    } catch (e) {
      alert(`❌ Lỗi lưu Groq API Keys: ${e.message}`);
    }
  });

  document.getElementById('btn-save-ai-prompt')?.addEventListener('click', async () => {
    if (!sb) return;
    try {
      const promptVal = document.getElementById('textarea-default-prompt')?.value || '';
      await sb.from('system_configs').upsert([
        { key: 'default_ai_prompt', value: promptVal, updated_at: new Date().toISOString() }
      ]);
      loadedAiPrompt = promptVal;
      showViewAiPrompt();
      alert('✅ Đã lưu AI System Prompt mặc định!');
    } catch (e) {
      alert(`❌ Lỗi lưu AI Prompt: ${e.message}`);
    }
  });

  document.getElementById('btn-save-blacklist')?.addEventListener('click', async () => {
    if (!sb) return;
    try {
      await sb.from('system_configs').upsert([
        { key: 'global_blacklist_phones', value: loadedBlacklistPhones, updated_at: new Date().toISOString() }
      ]);
      blacklistBackup = [...loadedBlacklistPhones];
      showViewBlacklist();
      alert('✅ Đã lưu Danh sách đen SĐT toàn hệ thống!');
    } catch (e) {
      alert(`❌ Lỗi lưu Danh sách đen: ${e.message}`);
    }
  });

  async function loadSystemConfigs() {
    if (!sb) return;
    try {
      const { data } = await sb.from('system_configs').select('*');
      if (data) {
        data.forEach(cfg => {
          if (cfg.key === 'groq_api_keys') {
            loadedGroqKeys = Array.isArray(cfg.value) ? cfg.value : [];
            groqKeysBackup = [...loadedGroqKeys];
            renderGroqView();
          }
          if (cfg.key === 'default_ai_prompt') {
            loadedAiPrompt = typeof cfg.value === 'string' ? cfg.value : JSON.stringify(cfg.value);
            renderPromptView();
          }
          if (cfg.key === 'global_blacklist_phones') {
            loadedBlacklistPhones = Array.isArray(cfg.value) ? cfg.value : [];
            blacklistBackup = [...loadedBlacklistPhones];
            renderBlacklistView();
          }
        });
      }
    } catch (_) { }
  }

  // ─── 9. AUDIT LOGS ───────────────────────────────────────────────────
  let auditLogsData = [];
  let auditCurrentPage = 1;
  const auditPerPage = 15;

  async function loadAuditLogs() {
    const tbody = document.getElementById('admin-audit-tbody');
    if (!tbody || !sb) return;
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-s);"><i class="ph ph-spinner animate-spin"></i> Đang tải nhật ký...</td></tr>`;

    try {
      const { data, error } = await sb.from('audit_logs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      auditLogsData = data || [];
      renderAuditLogs();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: red;">Không thể tải nhật ký: ${err.message}</td></tr>`;
    }
  }

  function renderAuditLogs() {
    const tbody = document.getElementById('admin-audit-tbody');
    const searchVal = (document.getElementById('input-audit-search')?.value || '').toLowerCase().trim();
    if (!tbody) return;

    const filtered = auditLogsData.filter(l => {
      const action = (l.action || '').toLowerCase();
      const actor = (l.actor_id || '').toLowerCase();
      const oldVal = (l.old_value || '').toLowerCase();
      const newVal = (l.new_value || '').toLowerCase();
      return action.includes(searchVal) || actor.includes(searchVal) || oldVal.includes(searchVal) || newVal.includes(searchVal);
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / auditPerPage));
    if (auditCurrentPage > totalPages) auditCurrentPage = totalPages;

    const start = (auditCurrentPage - 1) * auditPerPage;
    const pageItems = filtered.slice(start, start + auditPerPage);

    const infoEl = document.getElementById('audit-page-info');
    if (infoEl) infoEl.textContent = `Trang ${auditCurrentPage} / ${totalPages} • Tổng: ${filtered.length} logs`;

    const btnPrev = document.getElementById('btn-audit-prev');
    const btnNext = document.getElementById('btn-audit-next');
    if (btnPrev) btnPrev.disabled = auditCurrentPage <= 1;
    if (btnNext) btnNext.disabled = auditCurrentPage >= totalPages;

    if (pageItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-s);">Không tìm thấy nhật ký phù hợp.</td></tr>`;
      return;
    }

    tbody.innerHTML = pageItems.map(l => {
      let detailsObj = {};
      try {
        detailsObj = (typeof l.details === 'object' && l.details !== null)
          ? l.details
          : (typeof l.details === 'string' ? JSON.parse(l.details || '{}') : {});
      } catch (_) {}

      const actor = detailsObj.user_email || l.actor_id || l.user_id || 'Hệ thống';
      const device = detailsObj.device_name ? `💻 ${detailsObj.device_name}` : '';
      const msg = detailsObj.message || (l.old_value || l.new_value ? `${l.old_value || '—'} ➔ ${l.new_value || '—'}` : 'Chi tiết sự kiện');
      const cat = detailsObj.category || 'AUDIT';

      const badgeColors = {
        OPERATION: '#10b981',
        SECURITY: '#f59e0b',
        ERROR: '#ef4444',
        AUDIT: '#3b82f6'
      };
      const color = badgeColors[cat] || '#3b82f6';

      return `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="color: var(--text-s); font-size:11px; font-family: monospace;">${new Date(l.created_at).toLocaleString('vi-VN')}</td>
          <td>
            <span style="font-size:10px; font-weight:700; background:${color}15; color:${color}; padding:2px 6px; border-radius:4px; margin-right:4px;">${cat}</span>
            <span style="font-weight: 700; color: var(--text-p); font-size:12px;">${escapeHtml(l.action)}</span>
          </td>
          <td style="font-size: 11px;">
            <div style="font-weight:600; color: var(--text-p);">${escapeHtml(actor)}</div>
            ${device ? `<div style="font-size:10px; color:var(--text-s);">${escapeHtml(device)}</div>` : ''}
          </td>
          <td style="font-size: 11px; color: var(--text-p); line-height: 1.4;">${escapeHtml(msg)}</td>
        </tr>
      `;
    }).join('');
  }

  // Bind Search and Pagination Events
  document.getElementById('input-audit-search')?.addEventListener('input', () => {
    auditCurrentPage = 1;
    renderAuditLogs();
  });
  document.getElementById('btn-audit-prev')?.addEventListener('click', () => {
    if (auditCurrentPage > 1) {
      auditCurrentPage--;
      renderAuditLogs();
    }
  });
  document.getElementById('btn-audit-next')?.addEventListener('click', () => {
    auditCurrentPage++;
    renderAuditLogs();
  });

  // ─── 10. USER MANAGEMENT ─────────────────────────────────────────────
  let _allUsers = [];

  // ─── DEVICE MANAGEMENT ──────────────────────────────────────────────
  async function loadDevices() {
    const tbody = document.getElementById('devices-tbody');
    if (!tbody || !sb) return;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;">Đang tải danh sách thiết bị...</td></tr>`;

    try {
      const { data, error } = await sb.rpc('admin_list_devices');
      if (error) throw error;
      const devices = data || [];

      if (devices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-s);">Chưa có thiết bị nào.</td></tr>`;
        return;
      }

      tbody.innerHTML = devices.map(d => {
        const revokedBadge = d.revoked
          ? '<span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-red-100 text-red-700">Đã thu hồi</span>'
          : '<span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">Hoạt động</span>';

        const isRevoked = !!d.revoked;
        const revokeBtnText = isRevoked ? '<i class="ph ph-link"></i> Khôi phục' : '<i class="ph ph-x-circle"></i> Thu hồi';
        const revokeBtnClass = isRevoked
          ? 'background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE;'
          : 'background: #FDE8E8; color: #9B1C1C; border: 1px solid #FBD5D5;';

        return `<tr>
          <td style="font-weight: 600;">${escapeHtml(d.full_name || '—')}<br><span style="font-family: monospace; font-size: 11px; color: var(--text-s);">${escapeHtml(d.email || '—')}</span></td>
          <td style="font-weight: 600;">${escapeHtml(d.device_name || '—')}</td>
          <td style="color: var(--text-s); font-size: 12px;">${escapeHtml(d.browser || '—')}</td>
          <td style="color: var(--text-s); font-size: 12px;">${escapeHtml(d.version || '—')}</td>
          <td style="color: #4F46E5; font-weight: 600;">${escapeHtml(d.shop_name || '—')}</td>
          <td style="color: var(--text-s); font-size: 11px;">${d.last_seen ? new Date(d.last_seen).toLocaleString('vi-VN') : '—'}</td>
          <td>${revokedBadge}</td>
          <td style="text-align: center;">
            <button class="btn-toggle-device" data-device-id="${d.device_id}" data-revoked="${isRevoked}" style="padding: 4px 10px; font-size: 11px; ${revokeBtnClass} border-radius: 6px; cursor: pointer;">
              ${revokeBtnText}
            </button>
          </td>
        </tr>`;
      }).join('');

      // Gắn sự kiện Revoke/Khôi phục
      tbody.querySelectorAll('.btn-toggle-device').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-device-id');
          const isRevoked = btn.getAttribute('data-revoked') === 'true';
          toggleDeviceRevoke(id, isRevoked);
        });
      });

    } catch (err) {
      console.error('loadDevices error:', err);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: red;">Lỗi: ${err.message}</td></tr>`;
    }
  }

  async function toggleDeviceRevoke(deviceId, isRevoked) {
    if (!sb || !deviceId) return;
    const msg = isRevoked ? 'Khôi phục thiết bị này?' : 'Thu hồi thiết bị này? Thiết bị sẽ ngay lập tức không còn hoạt động.';
    if (!confirm(msg)) return;

    try {
      const { data, error } = await sb.rpc('admin_revoke_device', {
        p_device_id: deviceId,
        p_revoked: !isRevoked
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Thao tác thất bại.');
      alert(data.success ? 'Đã cập nhật trạng thái thiết bị.' : 'Không thể cập nhật.');
      loadDevices();
    } catch (err) {
      console.error('toggleDeviceRevoke error:', err);
      alert('Lỗi: ' + err.message);
    }
  }

  let _userShopsLoaded = false;

  async function loadUserShopsFilter() {
    if (_userShopsLoaded) return;
    const select = document.getElementById('filter-user-shop');
    if (!select || !sb) return;
    try {
      const { data: shops, error } = await sb.from('shops').select('id, name').is('deleted_at', null).order('name', { ascending: true });
      if (error) throw error;
      if (shops && shops.length > 0) {
        select.innerHTML = '<option value="">Tất cả Cửa hàng</option>' + 
          shops.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        _userShopsLoaded = true;
      }
    } catch (err) {
      console.error('Lỗi tải danh sách cửa hàng cho bộ lọc:', err);
    }
  }

  function renderUsersListOnly() {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;

    const filterRole = document.getElementById('filter-user-role')?.value || '';
    const filterShop = document.getElementById('filter-user-shop')?.value || '';
    const searchKeyword = document.getElementById('search-user-keyword')?.value?.trim()?.toLowerCase() || '';

    let filtered = _allUsers;
    if (filterRole) {
      filtered = filtered.filter(u => u.role_code === filterRole);
    }
    if (filterShop) {
      filtered = filtered.filter(u => u.shop_id === filterShop);
    }
    if (searchKeyword) {
      filtered = filtered.filter(u => 
        (u.email && u.email.toLowerCase().includes(searchKeyword)) || 
        (u.full_name && u.full_name.toLowerCase().includes(searchKeyword)) ||
        (u.user_id && u.user_id.toLowerCase().includes(searchKeyword))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-s);">Không tìm thấy người dùng phù hợp.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(u => {
      const roleBadge = {
        'SYSTEM_ADMIN': 'bg-red-100 text-red-700',
        'SHOP_OWNER': 'bg-purple-100 text-purple-700',
        'SHOP_MANAGER': 'bg-blue-100 text-blue-700',
        'SHOP_STAFF': 'bg-green-100 text-green-700',
        'EXTENSION_USER': 'bg-gray-100 text-gray-700',
        'SUPPORT': 'bg-amber-100 text-amber-700',
        'VIEWER': 'bg-slate-100 text-slate-700'
      }[u.role_code] || 'bg-gray-100 text-gray-600';

      const statusBadge = u.status === 'active'
        ? '<span class="text-emerald-600 font-bold">Hoạt động</span>'
        : '<span class="text-red-500 font-bold">Bị khóa</span>';

      const isLocked = u.status !== 'active';
      const lockBtnText = isLocked ? '<i class="ph ph-lock-key-open"></i> Mở khóa' : '<i class="ph ph-lock-key"></i> Khóa';
      const lockBtnClass = isLocked ? 'background: #DEF7EC; color: #03543F; border: 1px solid #BCF0DA;' : 'background: #FDE8E8; color: #9B1C1C; border: 1px solid #FBD5D5;';

      const shortId = u.user_id ? u.user_id.substring(0, 8) : '—';
      const createdAtStr = u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—';

      return `<tr>
        <td style="font-family: monospace; font-size: 11px; color: var(--text-s);" title="${u.user_id}">${shortId}</td>
        <td style="font-family: monospace; font-size: 12px;">${u.email || '—'}</td>
        <td style="font-weight: 600;">${u.full_name || '—'}</td>
        <td><span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase ${roleBadge}">${u.role_code || '—'}</span></td>
        <td style="font-weight: 600; color: #4F46E5;">${escapeHtml(u.shop_name || '—')}</td>
        <td style="color: var(--text-s); font-size: 11px;">${createdAtStr}</td>
        <td>${statusBadge}</td>
        <td style="color: var(--text-s); font-size: 11px;">${u.last_login ? new Date(u.last_login).toLocaleString('vi-VN') : '—'}</td>
        <td style="text-align: center;">
          <button class="btn-edit-user-name" data-user-id="${u.user_id}" data-user-name="${escapeHtml(u.full_name || '')}" data-user-email="${u.email || ''}" style="padding: 4px 8px; font-size: 11px; background: #F3F4F6; color: #374151; border: 1px solid #D1D5DB; border-radius: 6px; cursor: pointer;">
            <i class="ph ph-pencil-simple"></i> Đổi tên
          </button>
          <button class="btn-reset-user-pass" data-user-id="${u.user_id}" data-user-email="${u.email || ''}" style="padding: 4px 8px; font-size: 11px; background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; border-radius: 6px; cursor: pointer; margin-left: 4px;">
            <i class="ph ph-key"></i> Đổi MK
          </button>
          <button class="btn-set-role" data-user-id="${u.user_id}" data-user-email="${u.email || ''}" data-current-role="${u.role_code || ''}" style="padding: 4px 8px; font-size: 11px; background: var(--primary); color: #fff; border: none; border-radius: 6px; cursor: pointer; margin-left: 4px;">
            <i class="ph ph-shield"></i> Vai trò
          </button>
          <button class="btn-assign-shop" data-user-id="${u.user_id}" data-user-email="${u.email || ''}" style="padding: 4px 8px; font-size: 11px; background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE; border-radius: 6px; cursor: pointer; margin-left: 4px;">
            <i class="ph ph-storefront"></i> Gán Shop
          </button>
          <button class="btn-toggle-user-lock" data-user-id="${u.user_id}" data-user-email="${u.email || ''}" data-locked="${isLocked}" style="padding: 4px 8px; font-size: 11px; ${lockBtnClass} border-radius: 6px; cursor: pointer; margin-left: 4px;">
            ${lockBtnText}
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  async function loadUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody || !sb) return;
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px;">Đang tải danh sách người dùng...</td></tr>`;

    try {
      await loadUserShopsFilter();
      const { data, error } = await sb.rpc('admin_get_users_with_shops');
      if (error) throw error;
      _allUsers = data || [];

      renderUsersListOnly();

      // Gắn sự kiện Event Delegation cho tbody để tránh mất sự kiện khi re-render
      if (tbody && !tbody.dataset.listenerAttached) {
        tbody.dataset.listenerAttached = 'true';
        tbody.addEventListener('click', async (e) => {
          const btnEditName = e.target.closest('.btn-edit-user-name');
          const btnResetPass = e.target.closest('.btn-reset-user-pass');
          const btnSetRole = e.target.closest('.btn-set-role');
          const btnAssignShop = e.target.closest('.btn-assign-shop');
          const btnToggleLock = e.target.closest('.btn-toggle-user-lock');

          if (btnEditName) {
            const userId = btnEditName.getAttribute('data-user-id');
            const userEmail = btnEditName.getAttribute('data-user-email');
            const currentName = btnEditName.getAttribute('data-user-name');
            
            const newName = prompt(`Nhập Họ và Tên mới cho tài khoản:\n${userEmail}`, currentName || '');
            if (newName === null) return; // Bấm Hủy
            const nameTrimmed = newName.trim();
            if (!nameTrimmed) {
              alert('Tên không được để trống!');
              return;
            }

            try {
              let { data, error } = await sb.rpc('admin_update_user_name', {
                p_target_user_id: userId,
                p_full_name: nameTrimmed
              });
              
              if (error) {
                const res = await sb.from('profiles').update({ full_name: nameTrimmed }).eq('id', userId);
                if (res.error) throw res.error;
              } else if (data && data.success === false) {
                throw new Error(data.error || 'Thao tác đổi tên thất bại');
              }

              alert('✅ Đã đổi tên người dùng thành công!');
              loadUsers();
            } catch (err) {
              alert(`❌ Lỗi đổi tên: ${err.message}`);
            }
          }

          if (btnResetPass) {
            const userId = btnResetPass.getAttribute('data-user-id');
            const userEmail = btnResetPass.getAttribute('data-user-email');
            
            const newPassword = prompt(`Nhập Mật khẩu mới cho tài khoản:\n${userEmail}\n(Mật khẩu tối thiểu 6 ký tự)`);
            if (newPassword === null) return; // Bấm Hủy
            const passTrimmed = newPassword.trim();
            if (!passTrimmed || passTrimmed.length < 6) {
              alert('Mật khẩu mới phải từ 6 ký tự trở lên!');
              return;
            }

            try {
              const { data, error } = await sb.rpc('admin_reset_user_password', {
                p_target_user_id: userId,
                p_new_password: passTrimmed
              });
              if (error) throw error;
              if (data && data.success === false) throw new Error(data.error || data.message || 'Thao tác đổi mật khẩu thất bại.');

              alert('✅ Đã đổi mật khẩu thành công!');
              loadUsers();
            } catch (err) {
              alert(`❌ Lỗi đổi mật khẩu: ${err.message}`);
            }
          }

          if (btnSetRole) {
            const userId = btnSetRole.getAttribute('data-user-id');
            const userEmail = btnSetRole.getAttribute('data-user-email');
            const currentRole = btnSetRole.getAttribute('data-current-role');
            openSetRoleModal(userId, userEmail, currentRole);
          }

          if (btnAssignShop) {
            const userId = btnAssignShop.getAttribute('data-user-id');
            const userEmail = btnAssignShop.getAttribute('data-user-email');
            openAssignShopModal(userId, userEmail);
          }

          if (btnToggleLock) {
            const userId = btnToggleLock.getAttribute('data-user-id');
            const userEmail = btnToggleLock.getAttribute('data-user-email');
            const isLocked = btnToggleLock.getAttribute('data-locked') === 'true';
            toggleUserLock(userId, userEmail, isLocked);
          }
        });
      }

    } catch (err) {
      console.error('loadUsers error:', err);
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: red;">Lỗi: ${err.message}</td></tr>`;
    }
  }

  // ─── FILTER & SEARCH LISTENERS ───
  document.getElementById('filter-user-role')?.addEventListener('change', renderUsersListOnly);
  document.getElementById('filter-user-shop')?.addEventListener('change', renderUsersListOnly);
  document.getElementById('search-user-keyword')?.addEventListener('input', renderUsersListOnly);

  // ─── CREATE USER MODAL ───
  const btnOpenCreateUser = document.getElementById('btn-open-create-user-modal');
  const btnCloseCreateUser = document.getElementById('btn-close-create-user-modal');
  const btnCancelCreateUser = document.getElementById('btn-cancel-create-user');
  const modalCreateUser = document.getElementById('modal-create-user');

  function openCreateUserModal() { if (modalCreateUser) modalCreateUser.style.display = 'flex'; }
  function closeCreateUserModal() { if (modalCreateUser) modalCreateUser.style.display = 'none'; }

  if (btnOpenCreateUser) btnOpenCreateUser.addEventListener('click', openCreateUserModal);
  if (btnCloseCreateUser) btnCloseCreateUser.addEventListener('click', closeCreateUserModal);
  if (btnCancelCreateUser) btnCancelCreateUser.addEventListener('click', closeCreateUserModal);

  const formCreateUser = document.getElementById('form-create-user');
  if (formCreateUser) {
    formCreateUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('input-user-email')?.value?.trim();
      const fullName = document.getElementById('input-user-name')?.value?.trim();
      const password = document.getElementById('input-user-password')?.value?.trim();
      const role = document.getElementById('select-user-role')?.value || 'EXTENSION_USER';

      if (!email || !password) {
        alert('Vui lòng nhập Email và Mật khẩu!');
        return;
      }

      try {
        const { data, error } = await sb.rpc('admin_create_user', {
          p_email: email,
          p_password: password,
          p_full_name: fullName || null,
          p_role_code: role
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Không thể tạo người dùng');

        alert(`✅ Đã tạo người dùng ${email} thành công! (Vai trò: ${role})`);
        closeCreateUserModal();
        formCreateUser.reset();
        loadUsers();
      } catch (err) {
        alert(`❌ Lỗi tạo người dùng: ${err.message}`);
      }
    });
  }

  // ─── EDIT USER NAME MODAL ───
  let _editNameUserId = null;

  function openEditNameModal(userId, userEmail, currentName) {
    console.log('🔍 Executing openEditNameModal', { userId, userEmail, currentName });
    _editNameUserId = userId;
    const info = document.getElementById('edit-name-user-info');
    if (info) info.textContent = `Đang đổi tên cho: ${userEmail}`;
    const input = document.getElementById('input-edit-user-fullname');
    if (input) input.value = currentName || '';
    const modal = document.getElementById('modal-edit-user-name');
    if (modal) {
      modal.classList.add('show');
      modal.style.display = 'flex';
      console.log('✅ modal-edit-user-name element displayed.');
      console.log('Computed styles for modal:', {
        display: window.getComputedStyle(modal).display,
        visibility: window.getComputedStyle(modal).visibility,
        opacity: window.getComputedStyle(modal).opacity,
        zIndex: window.getComputedStyle(modal).zIndex,
        width: modal.offsetWidth,
        height: modal.offsetHeight
      });
    } else {
      console.error('❌ Element #modal-edit-user-name not found in DOM!');
      alert('Không tìm thấy Modal Đổi tên (ID: modal-edit-user-name) trong giao diện!');
    }
  }

  const btnCloseEditName = document.getElementById('btn-close-edit-name-modal');
  const btnCancelEditName = document.getElementById('btn-cancel-edit-name');
  const closeEditNameModal = () => {
    const modal = document.getElementById('modal-edit-user-name');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  };
  if (btnCloseEditName) btnCloseEditName.addEventListener('click', closeEditNameModal);
  if (btnCancelEditName) btnCancelEditName.addEventListener('click', closeEditNameModal);

  const btnConfirmEditName = document.getElementById('btn-confirm-edit-name');
  if (btnConfirmEditName) {
    btnConfirmEditName.addEventListener('click', async () => {
      if (!_editNameUserId) return;
      const newName = document.getElementById('input-edit-user-fullname')?.value?.trim();
      if (!newName) {
        alert('Vui lòng nhập Họ và tên!');
        return;
      }
      try {
        // Thử RPC admin_update_user_name trước
        let { data, error } = await sb.rpc('admin_update_user_name', {
          p_target_user_id: _editNameUserId,
          p_full_name: newName
        });
        
        // NẾU RPC chưa được deploy trên DB, thử update trực tiếp bảng profiles
        if (error) {
          const res = await sb.from('profiles').update({ full_name: newName }).eq('id', _editNameUserId);
          if (res.error) throw res.error;
        } else if (data && data.success === false) {
          throw new Error(data.error || 'Thao tác đổi tên thất bại');
        }

        alert('✅ Đã đổi tên người dùng thành công!');
        closeEditNameModal();
        loadUsers();
      } catch (err) {
        alert(`❌ Lỗi đổi tên: ${err.message}`);
      }
    });
  }

  // ─── RESET USER PASSWORD MODAL ───
  let _resetPassUserId = null;

  function openResetPassModal(userId, userEmail) {
    console.log('🔍 Executing openResetPassModal', { userId, userEmail });
    _resetPassUserId = userId;
    const info = document.getElementById('reset-pass-user-info');
    if (info) info.textContent = `Đang đổi mật khẩu cho: ${userEmail}`;
    const input = document.getElementById('input-reset-new-pass');
    if (input) input.value = '';
    const modal = document.getElementById('modal-reset-pass');
    if (modal) {
      modal.classList.add('show');
      modal.style.display = 'flex';
      console.log('✅ modal-reset-pass element displayed.');
      console.log('Computed styles for modal:', {
        display: window.getComputedStyle(modal).display,
        visibility: window.getComputedStyle(modal).visibility,
        opacity: window.getComputedStyle(modal).opacity,
        zIndex: window.getComputedStyle(modal).zIndex,
        width: modal.offsetWidth,
        height: modal.offsetHeight
      });
    } else {
      console.error('❌ Element #modal-reset-pass not found in DOM!');
      alert('Không tìm thấy Modal Đổi mật khẩu (ID: modal-reset-pass) trong giao diện!');
    }
  }

  const btnCloseResetPass = document.getElementById('btn-close-reset-pass-modal');
  const btnCloseResetPassFooter = document.getElementById('btn-close-reset-pass-modal-footer');
  const closeResetPassModal = () => {
    const modal = document.getElementById('modal-reset-pass');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  };
  if (btnCloseResetPass) btnCloseResetPass.addEventListener('click', closeResetPassModal);
  if (btnCloseResetPassFooter) btnCloseResetPassFooter.addEventListener('click', closeResetPassModal);

  const btnConfirmResetPass = document.getElementById('btn-confirm-reset-pass');
  if (btnConfirmResetPass) {
    btnConfirmResetPass.addEventListener('click', async () => {
      if (!_resetPassUserId) return;
      const newPassword = document.getElementById('input-reset-new-pass')?.value?.trim();
      if (!newPassword || newPassword.length < 6) {
        alert('Mật khẩu mới phải từ 6 ký tự trở lên!');
        return;
      }
      try {
        const { data, error } = await sb.rpc('admin_reset_user_password', {
          p_target_user_id: _resetPassUserId,
          p_new_password: newPassword
        });
        if (error) throw error;
        if (data && data.success === false) throw new Error(data.error || data.message || 'Thao tác đổi mật khẩu thất bại.');

        alert('✅ Đã đổi mật khẩu thành công!');
        closeResetPassModal();
        loadUsers();
      } catch (err) {
        alert(`❌ Lỗi đổi mật khẩu: ${err.message}`);
      }
    });
  }

  // ─── SET ROLE MODAL ───
  let _setRoleUserId = null;

  function openSetRoleModal(userId, userEmail, currentRole) {
    _setRoleUserId = userId;
    const info = document.getElementById('set-role-user-info');
    if (info) info.textContent = `Đang chọn vai trò cho: ${userEmail}`;
    const select = document.getElementById('select-set-role');
    if (select && currentRole) select.value = currentRole;
    const modal = document.getElementById('modal-set-role');
    if (modal) modal.style.display = 'flex';
  }

  const btnCloseSetRole = document.getElementById('btn-close-set-role-modal');
  const btnCloseSetRole2 = document.getElementById('btn-close-set-role-modal-2');
  if (btnCloseSetRole) btnCloseSetRole.addEventListener('click', () => { document.getElementById('modal-set-role').style.display = 'none'; });
  if (btnCloseSetRole2) btnCloseSetRole2.addEventListener('click', () => { document.getElementById('modal-set-role').style.display = 'none'; });

  const btnConfirmSetRole = document.getElementById('btn-confirm-set-role');
  if (btnConfirmSetRole) {
    btnConfirmSetRole.addEventListener('click', async () => {
      if (!_setRoleUserId) return;
      const newRole = document.getElementById('select-set-role')?.value;
      if (!newRole) return;

      try {
        const { data, error } = await sb.rpc('admin_change_user_role', {
          p_user_id: _setRoleUserId,
          p_new_role_code: newRole
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Không thể gán vai trò');

        alert(`✅ Đã gán vai trò ${newRole} thành công!`);
        document.getElementById('modal-set-role').style.display = 'none';
        loadUsers();
      } catch (err) {
        alert(`❌ Lỗi gán vai trò: ${err.message}`);
      }
    });
  }

  // ─── ASSIGN SHOP MODAL ───
  let _assignShopUserId = null;

  async function openAssignShopModal(userId, userEmail) {
    _assignShopUserId = userId;
    const info = document.getElementById('assign-shop-user-info');
    if (info) info.textContent = `Đang gán cửa hàng cho tài khoản: ${userEmail}`;

    const select = document.getElementById('select-assign-shop');
    if (select) {
      select.innerHTML = '<option value="">-- Đang tải danh sách Shop... --</option>';
    }

    const modal = document.getElementById('modal-assign-shop');
    if (modal) modal.style.display = 'flex';

    try {
      const { data: shops, error } = await sb.from('shops').select('id, name').is('deleted_at', null).order('name', { ascending: true });
      if (error) throw error;

      if (select) {
        if (!shops || shops.length === 0) {
          select.innerHTML = '<option value="">(Không có Shop nào hoạt động)</option>';
        } else {
          select.innerHTML = '<option value="">-- Chọn Cửa hàng --</option>' + 
            shops.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        }
      }
    } catch (err) {
      console.error('Lỗi tải danh sách shop cho modal:', err);
      if (select) select.innerHTML = '<option value="">(Lỗi tải danh sách cửa hàng)</option>';
    }
  }

  const btnCloseAssignShop = document.getElementById('btn-close-assign-shop-modal');
  const btnCloseAssignShop2 = document.getElementById('btn-close-assign-shop-modal-2');
  const closeAssignShopModal = () => {
    const modal = document.getElementById('modal-assign-shop');
    if (modal) modal.style.display = 'none';
  };
  if (btnCloseAssignShop) btnCloseAssignShop.addEventListener('click', closeAssignShopModal);
  if (btnCloseAssignShop2) btnCloseAssignShop2.addEventListener('click', closeAssignShopModal);

  const btnConfirmAssignShop = document.getElementById('btn-confirm-assign-shop');
  if (btnConfirmAssignShop) {
    btnConfirmAssignShop.addEventListener('click', async () => {
      if (!_assignShopUserId) return;
      const shopId = document.getElementById('select-assign-shop')?.value;
      const roleCode = document.getElementById('select-assign-shop-role')?.value;

      if (!shopId) {
        alert('Vui lòng chọn Cửa hàng cần gán!');
        return;
      }

      try {
        const { data, error } = await sb.rpc('admin_assign_user_shop', {
          p_user_id: _assignShopUserId,
          p_shop_id: shopId,
          p_role_code: roleCode
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Không thể gán Shop');

        alert('🎉 Đã gán Cửa hàng thành công!');
        closeAssignShopModal();
        loadUsers();
      } catch (err) {
        alert(`❌ Lỗi gán Cửa hàng: ${err.message}`);
      }
    });
  }

  // Khóa/Mở khóa tài khoản thành viên
  window.toggleUserLock = async function(userId, userEmail, isLocked) {
    if (!sb) return;
    const confirmMsg = isLocked ? `Bạn có chắc muốn MỞ KHÓA tài khoản ${userEmail}?` : `Bạn có chắc muốn KHÓA tài khoản ${userEmail}?`;
    if (!confirm(confirmMsg)) return;

    try {
      const { data, error } = await sb.rpc('admin_toggle_user_lock', { p_user_id: userId });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Lỗi thao tác khóa/mở tài khoản');
      alert(`✅ Đã ${data.locked ? 'Khóa' : 'Mở khóa'} tài khoản thành công!`);
      loadUsers();
    } catch(err) {
      alert(`❌ Lỗi: ${err.message}`);
    }
  };

  // Navigate to index dashboard
  document.getElementById('btn-go-to-index')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Initial load
  loadMetrics();
});
