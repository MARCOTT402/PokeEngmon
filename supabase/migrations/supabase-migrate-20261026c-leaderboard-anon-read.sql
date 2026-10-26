-- ============================================================
-- v133 Leaderboard: 開放 anon 讀取全球榜（只讀，冇寫操作）
-- 跑法：Supabase Dashboard → SQL Editor → Run
--
-- 之前：revoke all from public/anon, grant to authenticated only
-- 家：grant anon 讀取 → 未登入用戶都可以睇全球榜 Top 50
-- RPC 係 SECURITY DEFINER，本身已繞 RLS，只做 SELECT，安全。
-- 真正「參與」即係寫入自己嘅數據，仍然需要登入。
-- ============================================================

grant execute on function get_leaderboard() to anon;
