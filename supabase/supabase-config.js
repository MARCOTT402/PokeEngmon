/* ============================================================
   Supabase Config — Production
   anonKey 係 public key（客戶端本來就要用），可以安全 commit。
   部署時此檔案必須存在。
   ============================================================ */

window.SUPABASE_CONFIG = {
  url: "https://gcfoeaxxeerqixaistaf.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjZm9lYXh4ZWVycWl4YWlzdGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MzU2NDQsImV4cCI6MjEwODMxMTY0NH0.w1tqs-Q-qEKASs63eVOt0OhLO2mKaHnAzM15w6OtGZc",
  /* rest API base — Supabase PostgREST standard */
  restUrl: "https://gcfoeaxxeerqixaistaf.supabase.co/rest/v1"
};
