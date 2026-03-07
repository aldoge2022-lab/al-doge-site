BEGIN;

-- Rollback script for 20260307022000_harden_menu_items_and_increment_table_total.sql
-- NOTE: this rollback removes the hardening introduced by that migration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
  ) THEN
    DROP POLICY IF EXISTS menu_items_public_read ON public.menu_items;

    REVOKE SELECT ON TABLE public.menu_items FROM anon;
    REVOKE SELECT ON TABLE public.menu_items FROM authenticated;

    GRANT INSERT, UPDATE, DELETE ON TABLE public.menu_items TO anon;
    GRANT INSERT, UPDATE, DELETE ON TABLE public.menu_items TO authenticated;

    ALTER TABLE public.menu_items DISABLE ROW LEVEL SECURITY;
  END IF;
END;
$$;

DO $$
DECLARE
  fn_signature regprocedure;
BEGIN
  FOR fn_signature IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'increment_table_total'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', fn_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', fn_signature);
  END LOOP;
END;
$$;

COMMIT;
