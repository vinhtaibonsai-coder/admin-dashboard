// =========================================================================
// AUTH.SESSION.JS — QUẢN LÝ PHIÊN ĐĂNG NHẬP & SESSION TOKEN
// =========================================================================

const AuthSession = {
  _sessionKey: 'vnpost_session',

  async getSession() {
    return new Promise(resolve => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get([this._sessionKey], res => {
            resolve(res[this._sessionKey] || null);
          });
        } else {
          const raw = localStorage.getItem(this._sessionKey);
          resolve(raw ? JSON.parse(raw) : null);
        }
      } catch (e) { resolve(null); }
    });
  },

  async saveSession(sessionData) {
    return new Promise(resolve => {
      try {
        // Đồng bộ token ra localStorage để supabase-js client (initSupabase / getSupabaseClient)
        // có thể setSession — nếu thiếu, auth.uid() bị NULL và mọi RPC sẽ từ chối truy cập
        if (sessionData && sessionData.access_token) {
          localStorage.setItem('access_token', sessionData.access_token);
          localStorage.setItem('refresh_token', sessionData.refresh_token || '');
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [this._sessionKey]: sessionData }, resolve);
        } else {
          localStorage.setItem(this._sessionKey, JSON.stringify(sessionData));
          resolve();
        }
      } catch (e) { resolve(); }
    });
  },

  async clearSession() {
    return new Promise(resolve => {
      try {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove([this._sessionKey], resolve);
        } else {
          localStorage.removeItem(this._sessionKey);
          resolve();
        }
      } catch (e) { resolve(); }
    });
  },

  // Helpers để lấy nhanh dữ liệu từ session
  async getUser() {
    const session = await this.getSession();
    return session ? session.user : null;
  },
  
  async getActiveShop() {
    const session = await this.getSession();
    return session ? session.active_shop_id : null;
  },

  async getPermissions() {
    const session = await this.getSession();
    return session ? session.permissions : [];
  },
  
  async updateActiveShop(shopId) {
    const session = await this.getSession();
    if (session) {
      session.active_shop_id = shopId;
      await this.saveSession(session);
    }
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.AuthSession = AuthSession;
}
