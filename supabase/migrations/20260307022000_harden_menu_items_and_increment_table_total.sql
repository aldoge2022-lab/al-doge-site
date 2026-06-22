BEGIN;

-- 1) menu_items: keep menu publicly readable, block client-side writes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
  ) THEN
    ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

    REVOKE INSERT, UPDATE, DELETE ON TABLE public.menu_items FROM anon;
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.menu_items FROM authenticated;
    GRANT SELECT ON TABLE public.menu_items TO anon;
    GRANT SELECT ON TABLE public.menu_items TO authenticated;

    DROP POLICY IF EXISTS menu_items_public_read ON public.menu_items;
    CREATE POLICY menu_items_public_read
      ON public.menu_items
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END;
$$;

-- 2) increment_table_total: prevent direct execution from public client roles
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
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn_signature);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn_signature);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn_signature);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_signature);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
