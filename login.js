// login.js — Handles authentication for admin-dashboard/login.html (No inline script for MV3 CSP)
(() => {
  // Đã đăng nhập trước đó? Chuyển thẳng về index.html
  try {
    if (localStorage.getItem('af_logged_user')) {
      window.location.href = 'index.html';
    }
  } catch (_) {}

  document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const forgotPassLink = document.getElementById('link-forgot-password');

    if (forgotPassLink) {
      forgotPassLink.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Vui lòng liên hệ Admin hệ thống để khôi phục mật khẩu');
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const emailInput = document.getElementById('login-email');
        const passInput = document.getElementById('login-password');
        const errEmail = document.getElementById('error-email');
        const errPass = document.getElementById('error-password');
        const submitBtn = document.getElementById('login-submit-btn');

        // Reset errors
        if (errEmail) errEmail.classList.add('hidden');
        if (errPass) errPass.classList.add('hidden');
        if (emailInput) emailInput.classList.remove('border-red-500');
        if (passInput) passInput.classList.remove('border-red-500');

        const email = (emailInput?.value || '').trim();
        const pass = (passInput?.value || '').trim();
        let hasError = false;

        if (!email) {
          if (errEmail) {
            errEmail.textContent = "Vui lòng nhập Username hoặc Email!";
            errEmail.classList.remove('hidden');
          }
          if (emailInput) emailInput.classList.add('border-red-500');
          hasError = true;
        }

        if (!pass) {
          if (errPass) {
            errPass.textContent = "Mật khẩu không được để trống!";
            errPass.classList.remove('hidden');
          }
          if (passInput) passInput.classList.add('border-red-500');
          hasError = true;
        } else if (pass.length < 6) {
          if (errPass) {
            errPass.textContent = "Mật khẩu phải tối thiểu 6 ký tự!";
            errPass.classList.remove('hidden');
          }
          if (passInput) passInput.classList.add('border-red-500');
          hasError = true;
        }

        if (hasError) return;

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Đang đăng nhập...';
          }

          if (typeof AuthService !== 'undefined') {
            const res = await AuthService.loginWithUsernameOrEmail(email, pass);
            const userObj = { email: res.profile?.email || email, id: res.session?.user?.id || 'user', full_name: res.profile?.full_name || email.split('@')[0] };
            localStorage.setItem('af_logged_user', JSON.stringify(userObj));
            localStorage.setItem('profile', JSON.stringify(userObj));

            if (res.session?.access_token) {
              localStorage.setItem('access_token', res.session.access_token);
            }
            if (res.session?.refresh_token) {
              localStorage.setItem('refresh_token', res.session.refresh_token);
            }

            const role = typeof AuthService.getUserRole === 'function' ? await AuthService.getUserRole() : 'SHOP_OWNER';
            localStorage.setItem('current_role', role || 'SHOP_OWNER');
            
            if (res.session && res.session.active_shop_id) {
              localStorage.setItem('current_shop_id', res.session.active_shop_id);
              localStorage.setItem('af_active_shop_id', res.session.active_shop_id);
            }

            if (role === 'SYSTEM_ADMIN') {
              window.location.href = 'admin.html';
            } else {
              window.location.href = 'index.html';
            }
          } else {
            throw new Error('Hệ thống xác thực chưa được nạp');
          }
        } catch(err) {
          alert("❌ Đăng nhập thất bại: " + (err.message || 'Lỗi không xác định'));
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '🔑 Bắt đầu đăng nhập';
          }
        }
      });
    }
  });
})();
