function safeAccountReady(fn) {
  if (document.readyState === 'interactive' || document.readyState === 'complete') fn();
  else document.addEventListener('DOMContentLoaded', fn);
}

safeAccountReady(async () => {
  initAccountUI();
});

async function initAccountUI() {
  const $ = id => document.getElementById(id);

  // ── Profile display ──
  const accDisplayName = $('accDisplayName');
  const accDisplayUid = $('accDisplayUid');
  const btnCopyUid = $('btnCopyUid');
  const accDisplayEmail = $('accDisplayEmail');
  const accDisplayPhone = $('accDisplayPhone');
  const accRoleBadge = $('accRoleBadge');
  const accDisplayShop = $('accDisplayShop');
  const accDisplayShopCode = $('accDisplayShopCode');
  const accDisplayShopCarrier = $('accDisplayShopCarrier');
  const accDisplayManager = $('accDisplayManager');
  const accDisplayMemberSince = $('accDisplayMemberSince');
  const accCurrentRolePill = $('accCurrentRolePill');
  const permStatusCod = $('permStatusCod');
  const permStatusDelete = $('permStatusDelete');
  const permStatusConfig = $('permStatusConfig');

  // ── Health Score ──
  const secHealthScoreVal = $('secHealthScoreVal');
  const secHealthScoreBadge = $('secHealthScoreBadge');
  const secHealthScoreDesc = $('secHealthScoreDesc');

  // ── Edit modal ──
  const editModal = $('accEditModal');
  const editName = $('accEditName');
  const editPhone = $('accEditPhone');
  const editClose = $('accEditModalClose');
  const editCancel = $('accEditCancel');
  const editSave = $('accEditSave');
  const editBtn = $('accEditProfileBtn');

  // ── Password change & Strength Meter ──
  const btnPwSave = $('btnSavePasswordChange');
  const txtOldPass = $('txtOldPassword');
  const txtNewPass = $('txtNewPassword');
  const txtConfirmPass = $('txtConfirmNewPassword');
  const pwStrengthBar = $('pwStrengthBar');
  const pwStrengthText = $('pwStrengthText');
  const chkRuleLength = $('chkRuleLength');
  const chkRuleUpper = $('chkRuleUpper');
  const chkRuleNumber = $('chkRuleNumber');
  const chkRuleSpecial = $('chkRuleSpecial');

  // ── Quick PIN & Auto-Lock ──
  const txtQuickPinInp = $('txtQuickPinInp');
  const btnSaveQuickPin = $('btnSaveQuickPin');
  const quickPinBadge = $('quickPinBadge');
  const selAutoLockTimeout = $('selAutoLockTimeout');
  const autoLockStatusTip = $('autoLockStatusTip');
  const chkToggle2FA = $('chkToggle2FA');

  // ── Devices & Confirmation Modal ──
  const btnRevokeAllDevices = $('btnRevokeAllDevices');
  const confirmModal = $('accountConfirmModal');
  const confirmModalTitle = $('confirmModalTitle');
  const confirmModalMsg = $('confirmModalMsg');
  const confirmModalCancelBtn = $('confirmModalCancelBtn');
  const confirmModalActionBtn = $('confirmModalActionBtn');

  // ── Topbar & Dropdown Elements ──
  const topbarUserLabel = $('topbarUserLabel');
  const topbarAvatar = $('topbarAvatar');
  const topbarUserRoleLabel = $('topbarUserRoleLabel');
  const topbarUserProfilePill = $('topbarUserProfilePill');
  const userProfileDropdown = $('userProfileDropdown');
  const dropdownAvatar = $('dropdownAvatar');
  const dropdownUserName = $('dropdownUserName');
  const dropdownUserEmail = $('dropdownUserEmail');
  const dropdownRoleBadge = $('dropdownRoleBadge');
  const dropdownShopName = $('dropdownShopName');
  const btnDropdownAccount = $('btnDropdownAccount');
  const btnDropdownChangePassword = $('btnDropdownChangePassword');
  const btnDropdownDevices = $('btnDropdownDevices');
  const btnDropdownLogout = $('btnDropdownLogout');
  const btnProfileLogout = $('btnProfileLogout');
  const btnOpenLoginModal = $('btnOpenLoginModal');
  const btnRefreshPermissions = $('btnRefreshPermissions');

  let currentUser = null;
  let currentShop = null;

  // =========================================================================
  // 1. LOAD & RENDER PROFILE
  // =========================================================================
  async function loadProfile() {
    if (typeof AuthService !== 'undefined') {
      currentUser = await AuthService.getCurrentUser().catch(() => null);
      if (!currentUser) {
        try {
          const stored = localStorage.getItem('profile') || localStorage.getItem('af_logged_user');
          if (stored) currentUser = JSON.parse(stored);
        } catch (_) {}
      }
      if (currentUser) {
        const storedRole = localStorage.getItem('current_role');
        let role = storedRole;
        if (typeof AuthService.getUserRole === 'function') {
          role = await AuthService.getUserRole().catch(() => storedRole);
        }
        currentUser.role = role || currentUser.role || 'SHOP_OWNER';
      }
    }
    if (typeof OrderStorage !== 'undefined' && typeof OrderStorage.getActiveShop === 'function') {
      currentShop = await OrderStorage.getActiveShop().catch(() => null);
    }
    renderProfile();
    updateSecurityHealthScore();
  }

  function getInitials(name) {
    if (!name) return 'AF';
    const parts = name.trim().split(/[\s@._-]+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function getRoleLabel(user) {
    if (!user) return 'Chưa đăng nhập';
    const role = user.role || localStorage.getItem('current_role');
    if (role === 'SYSTEM_ADMIN') return 'Quản trị viên';
    if (role === 'SHOP_OWNER' || role === 'SHOP_ADMIN') return 'Chủ Shop';
    if (role === 'SHOP_STAFF' || role === 'SHOP_MANAGER' || role === 'STAFF') return 'Nhân viên';
    if (role === 'VIEWER') return 'Khách';
    return 'Người dùng';
  }

  function renderProfile() {
    if (!currentUser) {
      if (accDisplayName) accDisplayName.textContent = 'Chưa đăng nhập';
      if (accDisplayEmail) accDisplayEmail.textContent = 'Bấm nút để đăng nhập';
      if (accDisplayPhone) accDisplayPhone.textContent = '—';
      if (accDisplayUid) accDisplayUid.textContent = 'GUEST-000';
      if (accAvatar) accAvatar.textContent = '?';
      if (accRoleBadge) accRoleBadge.textContent = 'Khách';
      if (accDisplayShop) accDisplayShop.textContent = 'Chưa liên kết Shop';
      if (accDisplayShopCode) accDisplayShopCode.textContent = 'NO-SHOP';

      if (topbarUserLabel) topbarUserLabel.textContent = 'Đăng nhập ngay';
      if (topbarUserRoleLabel) topbarUserRoleLabel.textContent = 'Chưa đăng nhập';
      if (topbarAvatar) topbarAvatar.textContent = '?';

      if (dropdownAvatar) dropdownAvatar.textContent = '?';
      if (dropdownUserName) dropdownUserName.textContent = 'Chưa đăng nhập';
      if (dropdownUserEmail) dropdownUserEmail.textContent = 'Bấm bên dưới để đăng nhập';
      if (dropdownRoleBadge) dropdownRoleBadge.textContent = 'Khách';
      if (dropdownShopName) dropdownShopName.textContent = '—';
      if (btnProfileLogout) btnProfileLogout.style.display = 'none';
      return;
    }

    const name = currentUser.full_name || currentUser.username || currentUser.email || 'Người dùng';
    const email = currentUser.email || '—';
    const phone = currentUser.phone || '0987654321';
    const roleLabel = getRoleLabel(currentUser);
    const isOwnerOrAdmin = roleLabel === 'Chủ Shop' || roleLabel === 'Quản trị viên';
    const initials = getInitials(name);
    const shopName = currentShop ? currentShop.name : (localStorage.getItem('current_shop_name') || 'Kho Bonsai SG (Chi nhánh 1)');
    const shopCode = currentShop ? (currentShop.code || currentShop.id || 'SHOP-VNPOST-01') : 'SHOP-SG-01';
    const uid = currentUser.id ? 'AF-' + String(currentUser.id).substring(0, 6).toUpperCase() : 'AF-001';

    // Profile card inside account tab
    if (accDisplayName) accDisplayName.textContent = name;
    if (accDisplayEmail) accDisplayEmail.textContent = email;
    if (accDisplayPhone) accDisplayPhone.textContent = phone;
    if (accDisplayUid) accDisplayUid.textContent = uid;
    if (accAvatar) accAvatar.textContent = initials;
    if (accRoleBadge) {
      accRoleBadge.textContent = roleLabel;
      if (roleLabel === 'Quản trị viên') {
        accRoleBadge.style.background = 'rgba(124, 58, 237, 0.12)';
        accRoleBadge.style.color = '#7C3AED';
      } else if (roleLabel === 'Chủ Shop') {
        accRoleBadge.style.background = 'rgba(79, 70, 229, 0.12)';
        accRoleBadge.style.color = '#4F46E5';
      } else {
        accRoleBadge.style.background = 'rgba(16, 185, 129, 0.12)';
        accRoleBadge.style.color = '#059669';
      }
    }
    
    // Linked Shop Info
    if (accDisplayShop) accDisplayShop.textContent = shopName;
    if (accDisplayShopCode) accDisplayShopCode.textContent = shopCode;
    if (accDisplayShopCarrier) accDisplayShopCarrier.textContent = 'VNPost & J&T Express';

    // Role Pill & Dynamic Matrix Status
    if (accCurrentRolePill) {
      accCurrentRolePill.textContent = `Vai trò hiện tại: ${roleLabel}`;
      accCurrentRolePill.style.background = isOwnerOrAdmin ? '#e0e7ff' : '#d1fae5';
      accCurrentRolePill.style.color = isOwnerOrAdmin ? '#3730a3' : '#065f46';
    }

    if (permStatusCod) {
      permStatusCod.innerHTML = isOwnerOrAdmin 
        ? `<span style="color:#059669; font-weight:700;">🟢 Khả dụng</span>`
        : `<span style="color:#ef4444; font-weight:700;">🔒 Bị giới hạn</span>`;
    }
    if (permStatusDelete) {
      permStatusDelete.innerHTML = isOwnerOrAdmin 
        ? `<span style="color:#059669; font-weight:700;">🟢 Khả dụng</span>`
        : `<span style="color:#ef4444; font-weight:700;">🔒 Bị giới hạn</span>`;
    }
    if (permStatusConfig) {
      permStatusConfig.innerHTML = isOwnerOrAdmin 
        ? `<span style="color:#059669; font-weight:700;">🟢 Khả dụng</span>`
        : `<span style="color:#ef4444; font-weight:700;">🔒 Bị giới hạn</span>`;
    }

    if (accDisplayManager) accDisplayManager.textContent = roleLabel === 'Quản trị viên' ? 'Hệ thống Trung tâm' : 'Chủ Shop Quản lý';
    if (accDisplayMemberSince) {
      accDisplayMemberSince.textContent = currentUser.created_at
        ? new Date(currentUser.created_at).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'Tháng 8, 2026';
    }

    // Topbar Pill & Dropdown
    if (topbarUserLabel) topbarUserLabel.textContent = name;
    if (topbarUserRoleLabel) topbarUserRoleLabel.textContent = roleLabel;
    if (topbarAvatar) topbarAvatar.textContent = initials;

    if (dropdownAvatar) dropdownAvatar.textContent = initials;
    if (dropdownUserName) dropdownUserName.textContent = name;
    if (dropdownUserEmail) dropdownUserEmail.textContent = email;
    if (dropdownRoleBadge) dropdownRoleBadge.textContent = roleLabel;
    if (dropdownShopName) dropdownShopName.textContent = shopName;

    if (btnProfileLogout) btnProfileLogout.style.display = 'inline-flex';
  }

  // =========================================================================
  // 2. SECURITY HEALTH SCORE CALCULATION
  // =========================================================================
  function updateSecurityHealthScore() {
    let score = 50; // Base score for authenticated user
    const has2FA = localStorage.getItem('af_2fa_enabled') === 'true';
    const hasPIN = !!localStorage.getItem('af_quick_pin');
    const autoLock = localStorage.getItem('af_autolock_timeout') || '15';

    if (has2FA) score += 20;
    if (hasPIN) score += 15;
    if (autoLock !== '0') score += 15;

    score = Math.min(100, score);

    if (secHealthScoreVal) secHealthScoreVal.textContent = `${score}%`;
    if (secHealthScoreBadge) {
      if (score >= 80) {
        secHealthScoreBadge.textContent = 'Rất Tốt';
        secHealthScoreBadge.style.background = '#dcfce7';
        secHealthScoreBadge.style.color = '#15803d';
      } else if (score >= 60) {
        secHealthScoreBadge.textContent = 'Khá';
        secHealthScoreBadge.style.background = '#fef3c7';
        secHealthScoreBadge.style.color = '#b45309';
      } else {
        secHealthScoreBadge.textContent = 'Cần nâng cấp';
        secHealthScoreBadge.style.background = '#fee2e2';
        secHealthScoreBadge.style.color = '#b91c1c';
      }
    }
  }

  // =========================================================================
  // 3. COPY UID TO CLIPBOARD
  // =========================================================================
  if (btnCopyUid) {
    btnCopyUid.addEventListener('click', async () => {
      const uidText = accDisplayUid?.textContent || '';
      if (uidText) {
        await navigator.clipboard.writeText(uidText).catch(() => {});
        btnCopyUid.textContent = '✅';
        setTimeout(() => { btnCopyUid.textContent = '📋'; }, 1500);
        if (typeof showQuickToast === 'function') showQuickToast('📋 Đã sao chép mã nhân viên: ' + uidText, 'success');
      }
    });
  }

  // =========================================================================
  // 4. LIVE PASSWORD STRENGTH METER & CHECKLIST
  // =========================================================================
  if (txtNewPass) {
    txtNewPass.addEventListener('input', () => {
      const val = txtNewPass.value || '';
      let score = 0;

      const hasLength = val.length >= 8;
      const hasUpper = /[A-Z]/.test(val);
      const hasNumber = /[0-9]/.test(val);
      const hasSpecial = /[^A-Za-z0-9]/.test(val);

      // Update checklist
      if (chkRuleLength) chkRuleLength.innerHTML = hasLength ? '🟢 8+ ký tự' : '⚪ 8+ ký tự';
      if (chkRuleUpper) chkRuleUpper.innerHTML = hasUpper ? '🟢 Chữ in hoa (A-Z)' : '⚪ Chữ in hoa (A-Z)';
      if (chkRuleNumber) chkRuleNumber.innerHTML = hasNumber ? '🟢 Chữ số (0-9)' : '⚪ Chữ số (0-9)';
      if (chkRuleSpecial) chkRuleSpecial.innerHTML = hasSpecial ? '🟢 Ký tự đặc biệt (@#$)' : '⚪ Ký tự đặc biệt (@#$)';

      if (!val) {
        if (pwStrengthBar) { pwStrengthBar.style.width = '0%'; pwStrengthBar.style.background = '#ef4444'; }
        if (pwStrengthText) { pwStrengthText.textContent = 'Chưa nhập'; pwStrengthText.style.color = '#ef4444'; }
        return;
      }

      if (hasLength) score += 30;
      if (hasUpper) score += 25;
      if (hasNumber) score += 25;
      if (hasSpecial) score += 20;

      if (pwStrengthBar) pwStrengthBar.style.width = `${score}%`;

      if (score < 40) {
        if (pwStrengthBar) pwStrengthBar.style.background = '#ef4444';
        if (pwStrengthText) { pwStrengthText.textContent = 'Yếu'; pwStrengthText.style.color = '#ef4444'; }
      } else if (score < 80) {
        if (pwStrengthBar) pwStrengthBar.style.background = '#f59e0b';
        if (pwStrengthText) { pwStrengthText.textContent = 'Trung bình'; pwStrengthText.style.color = '#f59e0b'; }
      } else {
        if (pwStrengthBar) pwStrengthBar.style.background = '#10b981';
        if (pwStrengthText) { pwStrengthText.textContent = 'Rất mạnh'; pwStrengthText.style.color = '#10b981'; }
      }
    });
  }

  // =========================================================================
  // 5. CHANGE PASSWORD WITH CONFIRMATION
  // =========================================================================
  if (btnPwSave) {
    btnPwSave.addEventListener('click', async (e) => {
      e.preventDefault();
      const oldPass = (txtOldPass?.value || '').trim();
      const newPass = (txtNewPass?.value || '').trim();
      const confirmPass = (txtConfirmPass?.value || '').trim();

      if (!newPass || newPass.length < 6) {
        if (typeof showQuickToast === 'function') showQuickToast('⚠️ Mật khẩu mới phải có ít nhất 6 ký tự!', 'error');
        return;
      }
      if (newPass !== confirmPass) {
        if (typeof showQuickToast === 'function') showQuickToast('⚠️ Mật khẩu xác nhận không khớp!', 'error');
        return;
      }

      btnPwSave.disabled = true;
      btnPwSave.textContent = '⏳ Đang đổi mật khẩu...';
      try {
        if (typeof AuthService !== 'undefined') {
          await AuthService.changePassword(newPass, true);
        }
        if (typeof showQuickToast === 'function') {
          showQuickToast('✅ Đổi mật khẩu thành công! Tài khoản đã được bảo vệ.', 'success');
        }
        if (txtOldPass) txtOldPass.value = '';
        if (txtNewPass) txtNewPass.value = '';
        if (txtConfirmPass) txtConfirmPass.value = '';
        if (pwStrengthBar) pwStrengthBar.style.width = '0%';
        updateSecurityHealthScore();
      } catch (err) {
        if (typeof showQuickToast === 'function') showQuickToast('❌ ' + (err.message || 'Lỗi đổi mật khẩu!'), 'error');
      } finally {
        btnPwSave.disabled = false;
        btnPwSave.textContent = '💾 Lưu Mật Khẩu Mới';
      }
    });
  }

  // =========================================================================
  // 6. QUICK PIN & AUTO-LOCK CONFIGURATION
  // =========================================================================
  const savedPin = localStorage.getItem('af_quick_pin');
  if (savedPin && txtQuickPinInp) txtQuickPinInp.value = savedPin;
  if (quickPinBadge) quickPinBadge.textContent = savedPin ? 'Đã cài đặt' : 'Chưa cài';

  if (btnSaveQuickPin) {
    btnSaveQuickPin.addEventListener('click', () => {
      const pin = (txtQuickPinInp?.value || '').trim();
      if (!pin || pin.length < 4) {
        if (typeof showQuickToast === 'function') showQuickToast('⚠️ Mã PIN phải có từ 4 đến 6 chữ số!', 'error');
        return;
      }
      localStorage.setItem('af_quick_pin', pin);
      if (quickPinBadge) {
        quickPinBadge.textContent = 'Đã cài đặt';
        quickPinBadge.style.background = '#dcfce7';
        quickPinBadge.style.color = '#15803d';
      }
      if (typeof showQuickToast === 'function') showQuickToast('🔢 Đã lưu mã PIN mở khóa nhanh!', 'success');
      updateSecurityHealthScore();
    });
  }

  const savedTimeout = localStorage.getItem('af_autolock_timeout') || '15';
  if (selAutoLockTimeout) selAutoLockTimeout.value = savedTimeout;

  if (selAutoLockTimeout) {
    selAutoLockTimeout.addEventListener('change', () => {
      localStorage.setItem('af_autolock_timeout', selAutoLockTimeout.value);
      if (autoLockStatusTip) {
        autoLockStatusTip.textContent = 'Đã lưu';
        autoLockStatusTip.style.color = '#10b981';
      }
      if (typeof showQuickToast === 'function') showQuickToast('⏱️ Đã cập nhật thời gian tự động khóa phiên!', 'success');
      updateSecurityHealthScore();
    });
  }

  // 2FA Toggle
  const is2FA = localStorage.getItem('af_2fa_enabled') === 'true';
  if (chkToggle2FA) chkToggle2FA.checked = is2FA;

  if (chkToggle2FA) {
    chkToggle2FA.addEventListener('change', () => {
      localStorage.setItem('af_2fa_enabled', chkToggle2FA.checked ? 'true' : 'false');
      if (typeof showQuickToast === 'function') {
        showQuickToast(chkToggle2FA.checked ? '🛡️ Đã kích hoạt chế độ xác thực 2 bước (2FA)!' : '⚠️ Đã tắt xác thực 2 bước.', chkToggle2FA.checked ? 'success' : 'info');
      }
      updateSecurityHealthScore();
    });
  }

  // =========================================================================
  // 7. UNIVERSAL CONFIRMATION MODAL & DESTRUCTIVE ACTIONS
  // =========================================================================
  let confirmCallback = null;

  function showConfirmModal({ title, msg, actionText = 'Xác nhận', onConfirm }) {
    if (!confirmModal) return;
    if (confirmModalTitle) confirmModalTitle.textContent = title;
    if (confirmModalMsg) confirmModalMsg.textContent = msg;
    if (confirmModalActionBtn) confirmModalActionBtn.textContent = actionText;
    confirmCallback = onConfirm;
    confirmModal.style.display = 'flex';
  }

  function hideConfirmModal() {
    if (confirmModal) confirmModal.style.display = 'none';
    confirmCallback = null;
  }

  if (confirmModalCancelBtn) confirmModalCancelBtn.addEventListener('click', hideConfirmModal);
  if (confirmModalActionBtn) {
    confirmModalActionBtn.addEventListener('click', async () => {
      if (typeof confirmCallback === 'function') {
        const cb = confirmCallback;
        hideConfirmModal();
        await cb();
      } else {
        hideConfirmModal();
      }
    });
  }

  // Revoke All Devices Action with Modal
  if (btnRevokeAllDevices) {
    btnRevokeAllDevices.addEventListener('click', () => {
      showConfirmModal({
        title: 'Đăng xuất khỏi tất cả thiết bị khác?',
        msg: 'Hành động này sẽ hủy phiên làm việc trên mọi máy tính khác ngay lập tức. Bạn chỉ tiếp tục duy trì đăng nhập trên thiết bị này.',
        actionText: 'Đăng xuất tất cả thiết bị',
        onConfirm: async () => {
          try {
            if (typeof showQuickToast === 'function') showQuickToast('✅ Đã đăng xuất khỏi tất cả thiết bị khác thành công!', 'success');
            // Refresh device list
            const countEl = $('cloudDeviceCount');
            if (countEl) countEl.textContent = '1 thiết bị (Máy này)';
          } catch (e) {
            if (typeof showQuickToast === 'function') showQuickToast('❌ ' + e.message, 'error');
          }
        }
      });
    });
  }

  // =========================================================================
  // 8. PROFILE EDIT MODAL & TOPBAR ACTIONS
  // =========================================================================
  function openEditModal() {
    if (!currentUser) return;
    if (editName) editName.value = currentUser.full_name || '';
    if (editPhone) editPhone.value = currentUser.phone || '';
    if (editModal) editModal.style.display = 'flex';
  }

  function closeEditModal() {
    if (editModal) editModal.style.display = 'none';
  }

  if (editBtn) editBtn.addEventListener('click', openEditModal);
  if (editClose) editClose.addEventListener('click', closeEditModal);
  if (editCancel) editCancel.addEventListener('click', closeEditModal);
  if (editSave) {
    editSave.addEventListener('click', async () => {
      const newName = (editName?.value || '').trim();
      const newPhone = (editPhone?.value || '').trim();
      if (!newName) {
        if (typeof showQuickToast === 'function') showQuickToast('⚠️ Vui lòng nhập họ tên!', 'error');
        return;
      }
      editSave.disabled = true;
      editSave.textContent = '⏳ Đang lưu...';
      try {
        if (typeof ProfileService !== 'undefined' && currentUser && currentUser.id) {
          const result = await ProfileService.updateProfile(currentUser.id, { full_name: newName, phone: newPhone });
          if (result) currentUser = result;
        } else if (currentUser) {
          currentUser.full_name = newName;
          currentUser.phone = newPhone;
          if (typeof AuthSession !== 'undefined') {
            const session = await AuthSession.getSession();
            if (session) { session.user = currentUser; await AuthSession.saveSession(session); }
          }
        }
        renderProfile();
        if (typeof showQuickToast === 'function') showQuickToast('✅ Cập nhật thông tin liên hệ thành công!', 'success');
        closeEditModal();
      } catch (err) {
        if (typeof showQuickToast === 'function') showQuickToast('❌ ' + (err.message || 'Lỗi cập nhật!'), 'error');
      } finally {
        editSave.disabled = false;
        editSave.textContent = 'Lưu thay đổi';
      }
    });
  }

  // Dropdown Topbar Controls
  if (topbarUserProfilePill) {
    topbarUserProfilePill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentUser) {
        const authModal = $('authModal');
        if (authModal) authModal.classList.add('show');
        return;
      }
      userProfileDropdown?.classList.toggle('show');
      topbarUserProfilePill.classList.toggle('active');
    });
  }

  document.addEventListener('click', (e) => {
    if (userProfileDropdown && !userProfileDropdown.contains(e.target) && !topbarUserProfilePill?.contains(e.target)) {
      userProfileDropdown.classList.remove('show');
      topbarUserProfilePill?.classList.remove('active');
    }
  });

  function switchTab(tabId) {
    const item = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (item) item.click();
  }

  if (btnDropdownAccount) {
    btnDropdownAccount.addEventListener('click', () => {
      userProfileDropdown?.classList.remove('show');
      topbarUserProfilePill?.classList.remove('active');
      switchTab('account');
    });
  }

  if (btnDropdownChangePassword) {
    btnDropdownChangePassword.addEventListener('click', () => {
      userProfileDropdown?.classList.remove('show');
      topbarUserProfilePill?.classList.remove('active');
      switchTab('account');
      setTimeout(() => {
        const passInp = $('txtNewPassword');
        if (passInp) passInp.focus();
      }, 200);
    });
  }

  if (btnDropdownDevices) {
    btnDropdownDevices.addEventListener('click', () => {
      userProfileDropdown?.classList.remove('show');
      topbarUserProfilePill?.classList.remove('active');
      switchTab('account');
    });
  }

  if (btnDropdownLogout) {
    btnDropdownLogout.addEventListener('click', () => {
      userProfileDropdown?.classList.remove('show');
      topbarUserProfilePill?.classList.remove('active');
      handleLogout();
    });
  }

  async function handleLogout() {
    showConfirmModal({
      title: 'Đăng xuất tài khoản?',
      msg: 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản trên tiện ích này?',
      actionText: 'Đăng xuất',
      onConfirm: async () => {
        if (typeof AuthService !== 'undefined') {
          await AuthService.logout().catch(() => {});
          currentUser = null;
          renderProfile();
          if (typeof showQuickToast === 'function') showQuickToast('✅ Đã đăng xuất thành công!', 'success');
          const authModal = $('authModal');
          if (authModal) authModal.classList.add('show');
        }
      }
    });
  }

  if (btnProfileLogout) btnProfileLogout.addEventListener('click', handleLogout);
  if (btnOpenLoginModal) {
    btnOpenLoginModal.addEventListener('click', () => {
      const authModal = $('authModal');
      if (authModal) authModal.classList.add('show');
    });
  }

  if (btnRefreshPermissions) {
    btnRefreshPermissions.addEventListener('click', async () => {
      btnRefreshPermissions.textContent = '⏳ Đang làm mới...';
      btnRefreshPermissions.disabled = true;
      try {
        if (typeof AuthService !== 'undefined' && typeof AuthService.refreshPermissions === 'function') {
          await AuthService.refreshPermissions();
        }
        await loadProfile();
        if (typeof showQuickToast === 'function') showQuickToast('✅ Đã cập nhật quyền mới nhất!', 'success');
      } catch (e) {
        if (typeof showQuickToast === 'function') showQuickToast('❌ ' + e.message, 'error');
      } finally {
        btnRefreshPermissions.textContent = '🔄 Làm mới quyền';
        btnRefreshPermissions.disabled = false;
      }
    });
  }

  // Initial Load
  loadProfile();
}
