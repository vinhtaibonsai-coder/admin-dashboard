// admin-dashboard/supabase-config.js
// Cấu hình dự án Supabase cho Web Admin Dashboard
const SUPABASE_CONFIG = {
  url: 'https://xlgovgynbsahuykyjzcx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsZ292Z3luYnNhaHV5a3lqemN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODg2MTksImV4cCI6MjEwMDE2NDYxOX0.AytQ0MPBklNajTadr2KyNwk-UP7JQZJ-UWdTGtIEyeM'
};

if (typeof globalThis !== 'undefined') {
  globalThis.SUPABASE_CONFIG = SUPABASE_CONFIG;
}
