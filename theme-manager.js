// theme-manager.js
// Trình quản lý giao diện Sáng/Tối đồng bộ cho toàn bộ Hệ thống

(function() {
  const THEME_KEY = 'antigravity_ui_theme';
  const STORAGE = typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null;

  // Khởi tạo Theme ngay khi tải script để tránh chớp trắng (FOUC)
  function applyTheme(isDark) {
    if (isDark) {
      document.documentElement.classList.add('dark'); // Tailwind
      if (document.body) document.body.classList.add('dark-mode'); // Legacy CSS
    } else {
      document.documentElement.classList.remove('dark');
      if (document.body) document.body.classList.remove('dark-mode');
    }
    // Gửi sự kiện để Chart.js hoặc Panel cập nhật
    document.dispatchEvent(new CustomEvent('theme-changed', { detail: { isDark } }));
  }

  function getSavedTheme(callback) {
    if (STORAGE) {
      STORAGE.get([THEME_KEY], (res) => {
        if (res[THEME_KEY]) {
          callback(res[THEME_KEY] === 'dark');
        } else {
          // Fallback HĐH
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          callback(prefersDark);
        }
      });
    } else {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved) {
        callback(saved === 'dark');
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        callback(prefersDark);
      }
    }
  }

  function saveTheme(isDark) {
    const val = isDark ? 'dark' : 'light';
    if (STORAGE) {
      STORAGE.set({ [THEME_KEY]: val });
    } else {
      localStorage.setItem(THEME_KEY, val);
    }
  }

  // Tải Theme ngay lập tức
  getSavedTheme(applyTheme);

  // Inject Nút Toggle UI
  document.addEventListener('DOMContentLoaded', () => {
    // Đảm bảo body nhận class khi DOM đã sẵn sàng
    getSavedTheme(applyTheme);
    // Thêm CSS cho nút Toggle
    const style = document.createElement('style');
    style.textContent = `
      .theme-toggle-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--card, #ffffff);
        border: 1px solid var(--border, #e2e8f0);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 999999;
        transition: all 0.3s ease;
        color: var(--text-p, #334155);
      }
      .dark .theme-toggle-btn, .dark-mode .theme-toggle-btn {
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(12px);
        color: #f8fafc;
      }
      .theme-toggle-btn:hover {
        transform: scale(1.1);
      }
      .theme-toggle-btn svg {
        width: 24px;
        height: 24px;
        transition: all 0.3s ease;
      }
      .theme-toggle-btn .moon-icon { display: none; }
      .theme-toggle-btn .sun-icon { display: block; }
      
      .dark .theme-toggle-btn .moon-icon, 
      .dark-mode .theme-toggle-btn .moon-icon { display: block; }
      
      .dark .theme-toggle-btn .sun-icon, 
      .dark-mode .theme-toggle-btn .sun-icon { display: none; }
    `;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.className = 'theme-toggle-btn';
    btn.title = "Chuyển đổi Sáng/Tối";
    btn.innerHTML = `
      <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></svg>
      <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    `;

    if (document.getElementById('vnpost-autofill-panel')) {
      // Avoid overlaying extension UI panel
    } else {
      document.body.appendChild(btn);
    }

    btn.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark');
      applyTheme(!isDark);
      saveTheme(!isDark);
    });
  });

  if (STORAGE && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[THEME_KEY]) {
        applyTheme(changes[THEME_KEY].newValue === 'dark');
      }
    });
  }

})();
