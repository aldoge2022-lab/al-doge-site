-- Supabase production security audit
-- Run this script in SQL Editor before and after hardening migrations.

-- 1) Table exposure (RLS + grants) for menu/tables/sessions/orders/payments
WITH target_tables AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public'
    AND (
      c.relname = 'menu_items'
      OR c.relname ~* '(table|session|order|payment)'
    )
)
SELECT
  t.schema_name,
  t.table_name,
  t.rls_enabled,
  t.rls_forced,
  has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'SELECT') AS anon_select,
  has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'INSERT') AS anon_insert,
  has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'UPDATE') AS anon_update,
  has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'DELETE') AS anon_delete,
  has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'SELECT') AS auth_select,
  has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'INSERT') AS auth_insert,
  has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'DELETE') AS auth_delete,
  has_table_privilege('service_role', format('%I.%I', t.schema_name, t.table_name), 'SELECT') AS service_select,
  has_table_privilege('service_role', format('%I.%I', t.schema_name, t.table_name), 'INSERT') AS service_insert,
  has_table_privilege('service_role', format('%I.%I', t.schema_name, t.table_name), 'UPDATE') AS service_update,
  has_table_privilege('service_role', format('%I.%I', t.schema_name, t.table_name), 'DELETE') AS service_delete
FROM target_tables t
ORDER BY t.table_name;

-- 2) Existing RLS policies on the same target tables
SELECT
  p.schemaname,
  p.tablename,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND (
    p.tablename = 'menu_items'
    OR p.tablename ~* '(table|session|order|payment)'
  )
ORDER BY p.tablename, p.policyname, p.cmd;

-- 3) RPC/function exposure and mutability checks (focus on increment_table_total)
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.oid::regprocedure AS function_signature,
  p.prosecdef AS security_definer,
  l.lanname AS language,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
    ELSE p.provolatile::text
  END AS volatility,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND (
    p.proname = 'increment_table_total'
    OR p.proname ~* '(table|session|order|payment)'
  )
ORDER BY p.proname, p.oid::regprocedure::text;
