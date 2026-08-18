// shop-settings.js
// Logic xử lý Cài đặt Shop & Quản lý Nhân sự cho Shop Owner

document.addEventListener('DOMContentLoaded', () => {
  const sb = typeof initSupabase === 'function' ? initSupabase() : null;
  if (!sb) return;

  const navTabSettings = document.getElementById('nav-tab-settings');
  const sectionSettings = document.getElementById('section-shop-settings');
  
  // Toggles
  const toggleAiParsing = document.getElementById('toggle-ai-parsing');
  const toggleSmartAddress = document.getElementById('toggle-smart-address');
  const btnSaveShopFeatures = document.getElementById('btn-save-shop-features');

  // Carrier Config
  const btnSaveCarrierTokens = document.getElementById('btn-save-carrier-tokens');
  const inputVnpostCustCode = document.getElementById('vnpost-cust-code');
  const inputVnpostApiToken = document.getElementById('vnpost-api-token');
  const inputJtCustCode = document.getElementById('jt-cust-code');
  const inputJtApiKey = document.getElementById('jt-api-key');

  // Members
  const shopMembersTbody = document.getElementById('shop-members-tbody');
  const btnAddShopMember = document.getElementById('btn-add-shop-member');
  const shopMemberModal = document.getElementById('shop-member-modal');
  const closeShopMemberModal = document.getElementById('close-shop-member-modal');
  const cancelShopMemberModal = document.getElementById('cancel-shop-member-modal');
  const shopMemberForm = document.getElementById('shop-member-form');
  const inputMemberEmail = document.getElementById('shop-member-email');
  const selectMemberRole = document.getElementById('shop-member-role');

  let currentShopId = localStorage.getItem('current_shop_id');
  let currentRole = localStorage.getItem('current_role');

  // Chỉ hiện tab Cài đặt nếu là SHOP_OWNER hoặc SHOP_MANAGER
  if (navTabSettings) {
    if (currentRole === 'SHOP_OWNER' || currentRole === 'SHOP_MANAGER' || currentRole === 'SYSTEM_ADMIN') {
      navTabSettings.classList.remove('hidden');
    }
  }

  // Hook vào Tab Navigation
  if (navTabSettings) {
    navTabSettings.addEventListener('click', () => {
      // Ẩn tất cả các section khác
      document.querySelectorAll('main').forEach(el => {
        if(el.id !== 'section-shop-settings') el.classList.add('hidden');
      });
      // Hiện section settings
      sectionSettings.classList.remove('hidden');

      // Đổi state active của tab
      if (typeof window.setActiveTab === 'function') {
        window.setActiveTab(navTabSettings);
      } else {
        // Fallback thủ công nếu setActiveTab không tồn tại
        document.querySelectorAll('nav button').forEach(btn => {
          btn.classList.remove('bg-brand-primaryBlue', 'text-white');
          btn.classList.add('text-brand-darkText/70');
        });
        navTabSettings.classList.remove('text-brand-darkText/70');
        navTabSettings.classList.add('bg-brand-primaryBlue', 'text-white');
      }

      loadShopSettings();
      loadShopMembers();
    });
  }

  // Helper check UUID
  function isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  // ==========================================
  // LOAD & SAVE SETTINGS
  // ==========================================
  async function loadShopSettings() {
    if (!currentShopId) return;
    
    if (!isValidUUID(currentShopId)) {
      console.warn("Chế độ Offline: Bỏ qua tải cài đặt từ Cloud.");
      return;
    }

    try {
      const { data, error } = await sb.from('shop_feature_flags').select('*').eq('shop_id', currentShopId).single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 là Not Found

      if (data) {
        toggleAiParsing.checked = data.ai_parsing_enabled !== false;
        toggleSmartAddress.checked = data.smart_address_enabled !== false;
        if (inputVnpostCustCode) inputVnpostCustCode.value = data.vnpost_customer_code || '';
        if (inputVnpostApiToken) inputVnpostApiToken.value = data.vnpost_api_token || '';
        if (inputJtCustCode) inputJtCustCode.value = data.jt_customer_code || '';
        if (inputJtApiKey) inputJtApiKey.value = data.jt_api_key || '';
      } else {
        toggleAiParsing.checked = true;
        toggleSmartAddress.checked = true;
      }
    } catch (err) {
      console.error('Lỗi tải cài đặt:', err);
    }
  }

  if (btnSaveShopFeatures) {
    btnSaveShopFeatures.addEventListener('click', async () => {
      if (!currentShopId) return;
      
      if (!isValidUUID(currentShopId)) {
        alert('❌ Tính năng cài đặt chỉ khả dụng ở chế độ Online (Đám mây)!');
        return;
      }

      btnSaveShopFeatures.innerHTML = 'Đang lưu...';
      btnSaveShopFeatures.disabled = true;

      try {
        const { error } = await sb.from('shop_feature_flags').upsert({
          shop_id: currentShopId,
          ai_parsing_enabled: toggleAiParsing.checked,
          smart_address_enabled: toggleSmartAddress.checked,
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
        alert('✅ Đã lưu cài đặt thành công!');
      } catch (err) {
        alert('❌ Lỗi lưu cài đặt: ' + err.message);
      } finally {
        btnSaveShopFeatures.innerHTML = 'Lưu Cài Đặt';
        btnSaveShopFeatures.disabled = false;
      }
    });
  }

  if (btnSaveCarrierTokens) {
    btnSaveCarrierTokens.addEventListener('click', async () => {
      if (!currentShopId) return;
      
      if (!isValidUUID(currentShopId)) {
        alert('❌ Cấu hình API chỉ khả dụng ở chế độ Online (Đám mây)!');
        return;
      }

      btnSaveCarrierTokens.innerHTML = 'Đang lưu...';
      btnSaveCarrierTokens.disabled = true;

      try {
        const { error } = await sb.from('shop_feature_flags').upsert({
          shop_id: currentShopId,
          vnpost_customer_code: inputVnpostCustCode ? inputVnpostCustCode.value.trim() : '',
          vnpost_api_token: inputVnpostApiToken ? inputVnpostApiToken.value.trim() : '',
          jt_customer_code: inputJtCustCode ? inputJtCustCode.value.trim() : '',
          jt_api_key: inputJtApiKey ? inputJtApiKey.value.trim() : '',
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
        alert('✅ Đã lưu cấu hình API thành công!');
      } catch (err) {
        alert('❌ Lỗi lưu cấu hình API: ' + err.message + '\n(Lưu ý: Đảm bảo bạn đã chạy file migration SQL để thêm các cột lưu trữ!)');
      } finally {
        btnSaveCarrierTokens.innerHTML = 'Lưu Cấu Hình API';
        btnSaveCarrierTokens.disabled = false;
      }
    });
  }

  // ==========================================
  // LOAD MEMBERS
  // ==========================================
  async function loadShopMembers() {
    if (!currentShopId || !shopMembersTbody) return;
    
    if (!isValidUUID(currentShopId)) {
      shopMembersTbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-brand-darkText/60">Tính năng này chỉ khả dụng ở chế độ Trực tuyến.</td></tr>`;
      return;
    }

    shopMembersTbody.innerHTML = `<tr><td colspan="5" class="text-center p-4"><i class="ph ph-spinner animate-spin"></i> Đang tải...</td></tr>`;

    try {
      const { data, error } = await sb
        .from('shop_members')
        .select(`
          id,
          status,
          user_id,
          role,
          profiles ( full_name, email )
        `)
        .eq('shop_id', currentShopId)
        .is('removed_at', null);

      if (error) throw error;

      if (!data || data.length === 0) {
        shopMembersTbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-gray-500">Chưa có nhân viên.</td></tr>`;
        return;
      }

      shopMembersTbody.innerHTML = data.map(m => {
        const email = m.profiles?.email || 'N/A';
        const name = m.profiles?.full_name || 'N/A';
        
        let roleName = 'Nhân viên';
        if (m.role === 'SHOP_OWNER') roleName = 'Chủ Shop';
        else if (m.role === 'SHOP_MANAGER') roleName = 'Quản lý Shop';
        else if (m.role === 'VIEWER') roleName = 'Khách xem';

        let statusBadge = 'bg-green-100 text-green-700';
        if (m.status === 'suspended') statusBadge = 'bg-yellow-100 text-yellow-700';
        
        return `
        <tr class="hover:bg-brand-neutralBg transition-colors">
          <td class="p-4 font-bold text-brand-darkText">${name}</td>
          <td class="p-4 font-mono-code text-brand-primaryBlue">${email}</td>
          <td class="p-4 font-medium">${roleName}</td>
          <td class="p-4"><span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${statusBadge}">${m.status}</span></td>
          <td class="p-4 text-right">
            ${m.role !== 'SHOP_OWNER' && currentRole === 'SHOP_OWNER' ? `
              <button class="text-rose-500 hover:underline font-bold mr-3 text-[11px]" onclick="window.removeShopMember(${m.id})">Xoá</button>
            ` : ''}
          </td>
        </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Lỗi tải nhân viên:', err);
      shopMembersTbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-red-500">Lỗi tải dữ liệu.</td></tr>`;
    }
  }

  window.removeShopMember = async function(memberId) {
    if (!confirm('Bạn có chắc chắn muốn xoá nhân viên này khỏi Shop?')) return;
    try {
      const { error } = await sb.from('shop_members').update({
        removed_at: new Date().toISOString(),
        status: 'removed'
      }).eq('id', memberId);
      if (error) throw error;
      loadShopMembers();
    } catch (err) {
      alert('Lỗi xoá nhân viên: ' + err.message);
    }
  }

  // ==========================================
  // ADD MEMBER MODAL
  // ==========================================
  const closeModal = () => {
    shopMemberModal.classList.add('hidden');
    shopMemberForm.reset();
  };

  if (btnAddShopMember) btnAddShopMember.addEventListener('click', () => { shopMemberModal.classList.remove('hidden'); });
  if (closeShopMemberModal) closeShopMemberModal.addEventListener('click', closeModal);
  if (cancelShopMemberModal) cancelShopMemberModal.addEventListener('click', closeModal);

  if (shopMemberForm) {
    shopMemberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = inputMemberEmail.value.trim().toLowerCase();
      const roleCode = selectMemberRole.value;
      const submitBtn = document.getElementById('submit-shop-member-btn');
      
      if (!email || !currentShopId) return;

      if (!isValidUUID(currentShopId)) {
        alert('❌ Tính năng này chỉ khả dụng ở chế độ Trực tuyến (Online)!');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Đang xử lý...';

      try {
        // 1. Tìm user theo email trong profiles
        const { data: profiles, error: profileErr } = await sb.from('profiles').select('id').eq('email', email);
        if (profileErr) throw profileErr;
        
        if (!profiles || profiles.length === 0) {
          throw new Error('Không tìm thấy tài khoản với Email này. Vui lòng yêu cầu nhân viên cài đặt Extension và Đăng ký tài khoản trước khi bạn thêm vào Shop!');
        }
        const userId = profiles[0].id;

        // 2. Kiểm tra xem đã có trong shop chưa
        const { data: existing, error: checkErr } = await sb.from('shop_members')
          .select('id, removed_at')
          .eq('shop_id', currentShopId)
          .eq('user_id', userId);
          
        if (checkErr) throw checkErr;

        if (existing && existing.length > 0) {
          // Cập nhật lại quyền nếu đã tồn tại
          const { error: updErr } = await sb.from('shop_members').update({
            role: roleCode,
            status: 'active',
            removed_at: null
          }).eq('id', existing[0].id);
          if (updErr) throw updErr;
        } else {
          // Thêm mới
          const { error: insErr } = await sb.from('shop_members').insert({
            shop_id: currentShopId,
            user_id: userId,
            role: roleCode,
            status: 'active'
          });
          if (insErr) throw insErr;
        }

        alert('✅ Đã lưu nhân viên thành công!');
        closeModal();
        loadShopMembers();

      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ph ph-floppy-disk text-base"></i> Lưu';
      }
    });
  }
});
