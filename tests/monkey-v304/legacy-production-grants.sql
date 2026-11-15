-- Disposable fixture only. Mirrors READ-ONLY production metadata inspected
-- 2026-11-15. Never apply this fixture to production: the migration removes
-- these legacy write grants. No production rows or accounts were read.
ALTER TABLE public.bvom_data ALTER COLUMN data DROP NOT NULL;
ALTER TABLE public.bvom_data ALTER COLUMN user_id SET DEFAULT auth.uid();
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.bvom_data TO anon, authenticated;
