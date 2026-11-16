-- v3.0.4 legacy History CAS. REVIEW / TEST ONLY: never applied to production
-- by the repair workflow. See docs/v3.0.4-cloud-rollout.md before deployment.
-- CUTOVER: v3.0.3 cloud writes fail closed after this transaction. Reads,
-- local training and exports continue. Unguarded legacy writes cannot safely
-- coexist with revisioned clients. BB2's bvom_cloud_state is untouched.
BEGIN;

ALTER TABLE public.bvom_data
  ADD COLUMN legacy_revision bigint NOT NULL DEFAULT 1
    CHECK (legacy_revision BETWEEN 1 AND 9007199254740991),
  ADD COLUMN legacy_request_id uuid;

CREATE FUNCTION public.bvom_legacy_revision_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Trusted maintenance writes must invalidate clients' old revisions too.
  NEW.legacy_revision := OLD.legacy_revision + 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bvom_legacy_revision_v1() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bvom_legacy_revision_v1 BEFORE UPDATE ON public.bvom_data
FOR EACH ROW EXECUTE FUNCTION public.bvom_legacy_revision_v1();

CREATE FUNCTION public.bvom_legacy_cloud_commit_v1(
  p_owner_id uuid, p_expected_id bigint, p_expected_revision bigint,
  p_data jsonb, p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_row public.bvom_data%ROWTYPE;
BEGIN
  IF v_owner IS NULL OR p_owner_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'Cloud account changed; local data was kept' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
     OR p_expected_revision IS NULL OR p_expected_revision < 0
     OR p_expected_revision > 9007199254740991 THEN
    RAISE EXCEPTION 'Invalid cloud commit' USING ERRCODE = '22023';
  END IF;
  -- Also serializes two first uploads when no row exists to SELECT FOR UPDATE.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bvom_legacy:' || v_owner::text, 0));
  SELECT * INTO v_row FROM public.bvom_data
    WHERE user_id = v_owner ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    -- Retry of an acknowledged-or-lost acknowledgement is idempotent only
    -- while it remains the latest write, and only for the identical payload.
    IF v_row.legacy_request_id = p_request_id AND v_row.data = p_data THEN
      RETURN jsonb_build_object('status','committed','id',v_row.id,
        'revision',v_row.legacy_revision,'replayed',true);
    END IF;
    IF p_expected_id IS DISTINCT FROM v_row.id
       OR p_expected_revision IS DISTINCT FROM v_row.legacy_revision
       OR p_request_id IS NOT DISTINCT FROM v_row.legacy_request_id THEN
      RETURN jsonb_build_object('status','conflict');
    END IF;
    UPDATE public.bvom_data SET data = p_data, legacy_request_id = p_request_id
      WHERE id = v_row.id AND user_id = v_owner RETURNING * INTO v_row;
  ELSE
    IF p_expected_id IS NOT NULL OR p_expected_revision <> 0 THEN
      RETURN jsonb_build_object('status','conflict');
    END IF;
    INSERT INTO public.bvom_data (user_id, data, legacy_request_id)
      VALUES (v_owner, p_data, p_request_id) RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('status','committed','id',v_row.id,
    'revision',v_row.legacy_revision,'replayed',false);
END;
$$;
COMMENT ON FUNCTION public.bvom_legacy_cloud_commit_v1(uuid,bigint,bigint,jsonb,uuid)
  IS 'Owner-checked atomic legacy document CAS; sole authenticated write path. No BB2 sidecar writes.';
REVOKE ALL ON FUNCTION public.bvom_legacy_cloud_commit_v1(uuid,bigint,bigint,jsonb,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bvom_legacy_cloud_commit_v1(uuid,bigint,bigint,jsonb,uuid)
  TO authenticated;

-- Keep existing RLS and SELECT grants. Fence old clients in the SAME atomic
-- transaction as RPC publication. Revoke column grants as well as table grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.bvom_data FROM PUBLIC, anon, authenticated;
DO $$
DECLARE v_columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ',') INTO v_columns
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.bvom_data'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE 'REVOKE INSERT (' || v_columns || '), UPDATE (' || v_columns ||
    ') ON public.bvom_data FROM PUBLIC, anon, authenticated';
  IF has_table_privilege('authenticated','public.bvom_data','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_any_column_privilege('authenticated','public.bvom_data','INSERT,UPDATE')
     OR has_table_privilege('anon','public.bvom_data','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_any_column_privilege('anon','public.bvom_data','INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Inherited legacy write privileges remain; migration rolled back';
  END IF;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
