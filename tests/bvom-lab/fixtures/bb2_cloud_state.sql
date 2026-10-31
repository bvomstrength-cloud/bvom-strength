-- Ephemeral Supabase CLI database only. Mirrors the existing BVOM table and
-- authenticated-owner RLS; this file is NOT a production migration.
CREATE TABLE public.bvom_cloud_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  data_version text NOT NULL DEFAULT '1',
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bvom_cloud_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.bvom_cloud_state TO authenticated;

CREATE POLICY bvom_cloud_state_select_own ON public.bvom_cloud_state
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY bvom_cloud_state_insert_own ON public.bvom_cloud_state
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY bvom_cloud_state_update_own ON public.bvom_cloud_state
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
