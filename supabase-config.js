// =========================================================================
// SUPABASE-CONFIG.JS — CẤU HÌNH & SINGLETON SUPABASE CLIENT
// Kết nối trực tiếp Supabase Database (Project: xlgovgynbsahuykyjzcx)
// =========================================================================

const SUPABASE_CONFIG = {
  url: 'https://xlgovgynbsahuykyjzcx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsZ292Z3luYnNhaHV5a3lqemN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODg2MTksImV4cCI6MjEwMDE2NDYxOX0.AytQ0MPBklNajTadr2KyNwk-UP7JQZJ-UWdTGtIEyeM'
};

function getSupabaseClient() {
  if (globalThis._sbGlobalInstance) return globalThis._sbGlobalInstance;
  
  if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    const client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    
    // Đồng bộ session token từ localStorage
    let accessToken = localStorage.getItem('access_token');
    let refreshToken = localStorage.getItem('refresh_token');
    
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
      client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || ''
      }).catch(err => {
        console.warn('[Supabase] SetSession warning:', err);
      });
    }
    
    globalThis._sbGlobalInstance = client;
    return client;
  }
  return null;
}

function initSupabase() {
  return getSupabaseClient();
}

if (typeof globalThis !== 'undefined') {
  globalThis.SUPABASE_CONFIG = SUPABASE_CONFIG;
  globalThis.getSupabaseClient = getSupabaseClient;
  globalThis.initSupabase = initSupabase;
}
if (typeof window !== 'undefined') {
  window.SUPABASE_CONFIG = SUPABASE_CONFIG;
  window.getSupabaseClient = getSupabaseClient;
  window.initSupabase = initSupabase;
}
