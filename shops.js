// shops.js - Xử lý logic Quản lý Shop & Phân quyền User

document.addEventListener('DOMContentLoaded', () => {
  const sectionShops = document.getElementById('section-shops');
  if (!sectionShops || sectionShops.closest('#dummy-container')) return;

  const sb = initSupabase();
  if (!sb) return;

  const rightNavShops = document.getElementById('right-nav-shops');
  const shopsTbody = document.getElementById('shops-tbody');

  const createShopBtn = document.getElementById('create-shop-btn');
  const createShopModal = document.getElementById('create-shop-modal');
  const closeShopModalBtn = document.getElementById('close-shop-modal-btn');
  const cancelShopModalBtn = document.getElementById('cancel-shop-modal-btn');
  const createShopForm = document.getElementById('create-shop-form');
  const shopOwnerSelect = document.getElementById('shop-owner-select');

  const userRoleModal = document.getElementById('user-role-modal');
  const closeRoleModalBtn = document.getElementById('close-role-modal-btn');
  const cancelRoleModalBtn = document.getElementById('cancel-role-modal-btn');
  const userRoleForm = document.getElementById('user-role-form');

  const editShopModal = document.getElementById('edit-shop-modal');
  const closeEditModalBtn = document.getElementById('close-edit-shop-modal-btn');
  const editShopId = document.getElementById('edit-shop-id');
  const editShopName = document.getElementById('edit-shop-name');
  const editShopStatus = document.getElementById('edit-shop-status');
  const editShopOwner = document.getElementById('edit-shop-owner');
  const btnSaveShopInfo = document.getElementById('btn-save-shop-info');
  const shopMembersList = document.getElementById('shop-members-list');
  const btnAddMemberToShop = document.getElementById('btn-add-member-to-shop');
  const addMemberForm = document.getElementById('add-member-form');
  const addMemberUserSelect = document.getElementById('add-member-user-select');
  const addMemberRoleSelect = document.getElementById('add-member-role-select');
  const btnCancelAddMember = document.getElementById('btn-cancel-add-member');
  const btnConfirmAddMember = document.getElementById('btn-confirm-add-member');

  const statusBadge = (s) => {
    const v = (s || '').toLowerCase();
    if (v === 'active' || v === '') return 'bg-green-100 text-green-700';
    if (v === 'suspended') return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const navTabShops = document.getElementById('nav-tab-shops');
  if (rightNavShops && navTabShops) {
    rightNavShops.addEventListener('click', () => { navTabShops.click(); document.getElementById('right-user-menu')?.classList.add('hidden', 'opacity-0', 'pointer-events-none'); });
  }

  if (navTabShops) {
    navTabShops.addEventListener('click', () => {
      document.querySelectorAll('main').forEach(el => {
        if(el.id !== 'section-shops') el.classList.add('hidden');
      });
      if (sectionShops) sectionShops.classList.remove('hidden');

      if (typeof setActiveTab === 'function') setActiveTab(navTabShops);

      window.fetchShops();
    });
  }

  const otherTabs = ['nav-tab-statistics', 'nav-tab-orders', 'nav-tab-drafts', 'nav-tab-customers', 'nav-tab-users', 'nav-tab-audit'];
  otherTabs.forEach(id => {
    const tab = document.getElementById(id);
    if (tab) {
      tab.addEventListener('click', () => {
        if (sectionShops) sectionShops.classList.add('hidden');
      });
    }
  });

  // ==========================================
  // FETCH SHOPS
  // ==========================================
  window.fetchShops = async function() {
    if (!shopsTbody) return;
    shopsTbody.innerHTML = `<tr><td colspan="5" class="text-center p-4"><i class="ph ph-spinner animate-spin text-xl text-brand-primaryBlue"></i> Đang tải danh sách...</td></tr>`;

    try {
      const [shopsRes, profilesRes] = await Promise.all([
        sb.from('shops').select('id, name, status, created_at, owner_id').is('deleted_at', null).order('created_at', { ascending: false }).limit(100),
        sb.from('profiles').select('id, email, full_name')
      ]);

      if (shopsRes.error) throw shopsRes.error;
      const data = shopsRes.data || [];

      if (data.length === 0) {
        shopsTbody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-gray-400 font-medium">Chưa có cửa hàng nào.</td></tr>`;
        return;
      }

      const profileMap = {};
      (profilesRes.data || []).forEach(p => { profileMap[p.id] = p; });

      shopsTbody.innerHTML = data.map(s => {
        const owner = profileMap[s.owner_id] || {};
        return `
        <tr class="hover:bg-brand-neutralBg/50 transition-colors">
          <td class="p-4 font-bold text-[#111111]">${s.name}</td>
          <td class="p-4">
            <div class="font-medium text-brand-darkText">${owner.full_name || 'Owner'}</div>
            <div class="text-[10px] text-gray-500 font-mono-code">${owner.email || 'N/A'}</div>
          </td>
          <td class="p-4 text-gray-500">${new Date(s.created_at).toLocaleDateString('vi-VN')}</td>
          <td class="p-4">
            <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${statusBadge(s.status)}">${s.status || 'Active'}</span>
          </td>
          <td class="p-4 text-center">
            <button class="text-brand-primaryBlue hover:underline text-xs font-bold" onclick="window.openEditShopModal('${s.id}')">Sửa</button>
          </td>
        </tr>`;
      }).join('');
    } catch (err) {
      console.error('fetchShops error:', err);
      shopsTbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-red-500">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
    }
  };

  // ==========================================
  // CREATE SHOP MODAL
  // ==========================================
  if (createShopBtn) {
    createShopBtn.addEventListener('click', async () => {
      shopOwnerSelect.innerHTML = `<option value="">Đang tải user...</option>`;
      createShopModal.classList.remove('hidden');
      const { data } = await sb.from('profiles').select('id, email').order('email');
      if (data) {
        shopOwnerSelect.innerHTML = data.map(u => `<option value="${u.id}">${u.email}</option>`).join('');
      }
    });
  }

  const closeCreateShop = () => { createShopModal.classList.add('hidden'); createShopForm.reset(); };
  if (closeShopModalBtn) closeShopModalBtn.addEventListener('click', closeCreateShop);
  if (cancelShopModalBtn) cancelShopModalBtn.addEventListener('click', closeCreateShop);

  if (createShopForm) {
    createShopForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('shop-name-input').value;
      const ownerId = shopOwnerSelect.value;
      if (!name || !ownerId) return;

      const submitBtn = createShopForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Đang tạo...";

      try {
        const { data: newShop, error: shopErr } = await sb.from('shops').insert([
          { name: name, owner_id: ownerId, status: 'active' }
        ]).select().single();
        if (shopErr) throw shopErr;

        const { error: memberErr } = await sb.rpc('admin_add_shop_member', {
          p_shop_id: newShop.id, p_user_id: ownerId, p_role: 'SHOP_OWNER'
        });
        if (memberErr) throw memberErr;

        if (typeof currentUser !== 'undefined' && currentUser) {
          await sb.from('audit_logs').insert([{
            user_id: currentUser.id,
            action: 'CREATE_SHOP',
            details: `Tạo shop mới: ${name} (Owner: ${ownerId})`,
            ip_address: '127.0.0.1'
          }]);
        }

        alert("Tạo Shop thành công!");
        closeCreateShop();
        window.fetchShops();
      } catch (err) {
        console.error(err);
        alert("Lỗi tạo shop: " + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Tạo Shop";
      }
    });
  }

  // ==========================================
  // USER ROLE MODAL (CALLED FROM APP.JS)
  // ==========================================
  window.openUserRoleModal = async function(userId, userEmail) {
    document.getElementById('role-modal-userid').value = userId;
    document.getElementById('role-modal-email').value = userEmail;
    userRoleModal.classList.remove('hidden');

    const roleSelect = document.getElementById('role-modal-role-select');
    const shopSelect = document.getElementById('role-modal-shop-select');

    roleSelect.innerHTML = `<option value="">Đang tải...</option>`;

    try {
      const { data: roles } = await sb.from('roles').select('id, code, name').order('code');
      if (roles) {
        roleSelect.innerHTML = roles.map(r => `<option value="${r.id}">${r.name} (${r.code})</option>`).join('');
      }

      const { data: shops } = await sb.from('shops').select('id, name').is('deleted_at', null).order('name');
      if (shops) {
        shopSelect.innerHTML = `<option value="">-- Không gán Shop --</option>` +
          shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      }

      const { data: currentRole } = await sb.from('user_roles').select('role_id').eq('user_id', userId).maybeSingle();
      if (currentRole) roleSelect.value = currentRole.role_id;

      const { data: currentShop } = await sb.from('shop_members').select('shop_id').eq('user_id', userId).maybeSingle();
      if (currentShop) shopSelect.value = currentShop.shop_id;
    } catch (err) {
      console.error(err);
    }
  };

  const closeRoleModal = () => userRoleModal.classList.add('hidden');
  if (closeRoleModalBtn) closeRoleModalBtn.addEventListener('click', closeRoleModal);
  if (cancelRoleModalBtn) cancelRoleModalBtn.addEventListener('click', closeRoleModal);

  if (userRoleForm) {
    userRoleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('role-modal-userid').value;
      const roleId = document.getElementById('role-modal-role-select').value;
      const shopId = document.getElementById('role-modal-shop-select').value;
      if (!userId || !roleId) return;

      const submitBtn = userRoleForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Đang lưu...";

      try {
        const { error: roleErr } = await sb.from('user_roles').upsert({ user_id: userId, role_id: roleId }, { onConflict: 'user_id' });
        if (roleErr) throw roleErr;

        if (shopId) {
          const { data: roleData } = await sb.from('roles').select('code').eq('id', roleId).single();
          // Đảm bảo profile tồn tại trước khi upsert shop_members (FK: user_id → profiles.id)
          const { data: profExists } = await sb.from('profiles').select('id').eq('id', userId).maybeSingle();
          if (!profExists) throw new Error('Tài khoản này chưa có Profile. Vui lòng tạo Profile trước khi gán Shop.');
          const { error: shopErr } = await sb.from('shop_members').upsert({ user_id: userId, shop_id: shopId, role: roleData.code || 'SHOP_STAFF' }, { onConflict: 'user_id, shop_id' });
          if (shopErr) throw shopErr;
        } else {
          await sb.from('shop_members').delete().eq('user_id', userId);
        }

        if (typeof currentUser !== 'undefined' && currentUser) {
          await sb.from('audit_logs').insert([{
            user_id: currentUser.id,
            action: 'UPDATE_USER_ROLE',
            details: `Cập nhật quyền cho user ${userId}`,
            ip_address: '127.0.0.1'
          }]);
        }

        alert("Cập nhật quyền thành công!");
        closeRoleModal();
        if (typeof window.fetchUsers === 'function') window.fetchUsers();
      } catch (err) {
        console.error(err);
        alert("Lỗi cập nhật quyền: " + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Lưu Thay Đổi";
      }
    });
  }

  // ==========================================
  // EDIT SHOP MODAL & ACCOUNT MANAGEMENT
  // ==========================================
  async function loadUserDropdown(selectEl, selectedId) {
    selectEl.innerHTML = '<option value="">Đang tải...</option>';
    const { data } = await sb.from('profiles').select('id, email, full_name').order('email');
    if (data) {
      selectEl.innerHTML = data.map(u =>
        `<option value="${u.id}" ${u.id === selectedId ? 'selected' : ''}>${u.full_name || u.email} (${u.email})</option>`
      ).join('');
    }
  }

  async function loadShopMembers(shopId) {
    shopMembersList.innerHTML = '<div class="text-xs text-gray-400 text-center py-4"><i class="ph ph-spinner animate-spin"></i> Đang tải...</div>';
    try {
      const { data: members, error } = await sb
        .from('shop_members')
        .select('id, user_id, role')
        .eq('shop_id', shopId);

      if (error) throw error;

      if (!members || members.length === 0) {
        shopMembersList.innerHTML = '<div class="text-xs text-gray-400 text-center py-4">Chưa có nhân viên nào trong shop này.</div>';
        return;
      }

      const userIds = members.map(m => m.user_id);
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

      const roleLabels = {
        SHOP_OWNER: 'Chủ shop',
        SHOP_MANAGER: 'Quản lý',
        SHOP_STAFF: 'Nhân viên',
        VIEWER: 'Người xem'
      };

      shopMembersList.innerHTML = members.map(m => {
        const p = profileMap[m.user_id] || {};
        const roleCode = m.roles ? m.roles.code : m.role;
        const isOwner = roleCode === 'SHOP_OWNER';
        const canRemove = !isOwner;
        return `
        <div class="flex items-center justify-between p-3 rounded-lg border border-brand-borderLight bg-white hover:bg-brand-neutralBg/50 transition-colors" data-member-id="${m.id}">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-brand-primaryBlueLight text-brand-primaryBlue flex items-center justify-center text-xs font-bold">${(p.full_name || p.email || '?')[0].toUpperCase()}</div>
            <div>
              <div class="text-xs font-bold text-brand-darkText">${p.full_name || 'Chưa có tên'}</div>
              <div class="text-[10px] text-gray-500 font-mono-code">${p.email || m.user_id}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isOwner ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}">${roleLabels[roleCode] || roleCode}</span>
            ${canRemove ? `<button class="text-red-500 hover:text-red-700 p-1" onclick="window.removeShopMember('${m.id}', '${shopId}')"><i class="ph ph-trash text-sm"></i></button>` : ''}
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      console.error('loadShopMembers error:', err);
      shopMembersList.innerHTML = `<div class="text-xs text-red-500 text-center py-4">Lỗi: ${err.message}</div>`;
    }
  }

  window.openEditShopModal = async function(shopId) {
    editShopModal.classList.remove('hidden');
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

  const closeEditModal = () => {
    editShopModal.classList.add('hidden');
    editShopId.value = '';
    addMemberForm.classList.add('hidden');
  };
  if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModal);
  document.getElementById('edit-shop-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  if (btnSaveShopInfo) {
    btnSaveShopInfo.addEventListener('click', async () => {
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

        if (typeof currentUser !== 'undefined' && currentUser) {
          await sb.from('audit_logs').insert([{
            user_id: currentUser.id,
            action: 'UPDATE_SHOP',
            details: `Cập nhật shop: ${name}`,
            ip_address: '127.0.0.1'
          }]);
        }

        alert('Đã lưu thông tin shop!');
        window.fetchShops();
        await loadShopMembers(id);
      } catch (err) {
        console.error(err);
        alert('Lỗi lưu: ' + err.message);
      } finally {
        btnSaveShopInfo.disabled = false;
        btnSaveShopInfo.innerHTML = '<i class="ph ph-floppy-disk"></i> Lưu thông tin Shop';
      }
    });
  }

  if (btnAddMemberToShop) {
    btnAddMemberToShop.addEventListener('click', async () => {
      addMemberForm.classList.toggle('hidden');
      if (!addMemberForm.classList.contains('hidden')) {
        await loadUserDropdown(addMemberUserSelect, null);
      }
    });
  }
  if (btnCancelAddMember) {
    btnCancelAddMember.addEventListener('click', () => {
      addMemberForm.classList.add('hidden');
    });
  }

  if (btnConfirmAddMember) {
    btnConfirmAddMember.addEventListener('click', async () => {
      const shopId = editShopId.value;
      const userId = addMemberUserSelect.value;
      const role = addMemberRoleSelect.value;
      if (!shopId || !userId) return;

      btnConfirmAddMember.disabled = true;
      btnConfirmAddMember.innerHTML = 'Đang thêm...';

      try {
        // Đảm bảo profile tồn tại trước khi gọi RPC (FK: user_id → profiles.id)
        const { data: profExists } = await sb.from('profiles').select('id').eq('id', userId).maybeSingle();
        if (!profExists) throw new Error('Tài khoản này chưa có Profile. Vui lòng tạo Profile trước khi thêm vào Shop.');

        const { error } = await sb.rpc('admin_add_shop_member', {
          p_shop_id: shopId, p_user_id: userId, p_role: role
        });
        if (error) throw error;

        alert('Đã thêm tài khoản vào shop!');
        addMemberForm.classList.add('hidden');
        addMemberUserSelect.value = '';
        await loadShopMembers(shopId);
      } catch (err) {
        console.error(err);
        alert('Lỗi thêm tài khoản: ' + err.message);
      } finally {
        btnConfirmAddMember.disabled = false;
        btnConfirmAddMember.innerHTML = 'Thêm';
      }
    });
  }

  window.removeShopMember = async function(memberId, shopId) {
    if (!confirm('Xóa tài khoản này khỏi shop?')) return;
    try {
      const { error } = await sb.rpc('admin_remove_shop_member', {
        p_member_id: parseInt(memberId),
        p_shop_id: shopId
      });
      if (error) throw error;
      await loadShopMembers(shopId);
    } catch (err) {
      console.error(err);
      alert('Lỗi xóa: ' + err.message);
    }
  };
});
