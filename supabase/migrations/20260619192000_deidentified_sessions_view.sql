-- De-identified team-facing read surface for SFI data.
--
-- The Edge Function continues to use the service-role key for submit/lookup/checkSession.
-- Team analytics should read this view, not public.sessions, so identity-adjacent
-- free text such as comment stays out of routine agent queries.

CREATE OR REPLACE VIEW public.sfi_sessions_deidentified AS
SELECT
  id,
  deployment_id,
  participant_id,
  timing,
  protocol,
  session_id,
  valence,
  arousal,
  valence_category,
  arousal_category,
  affect_quadrant,
  body_tension,
  energy,
  body_connection,
  clarity,
  mental_quiet,
  alertness,
  pain,
  pain_category,
  stai_calm,
  stai_tense,
  stai_upset,
  stai_relaxed,
  stai_content,
  stai_worried,
  stai6_sum,
  stai20_equivalent,
  stai_category,
  (comment = '__SFI_TEST__') AS is_test,
  age,
  sex,
  addons,
  client_timestamp,
  received_at
FROM public.sessions;

ALTER VIEW public.sfi_sessions_deidentified OWNER TO postgres;

GRANT SELECT ON public.sfi_sessions_deidentified TO anon;
GRANT SELECT ON public.sfi_sessions_deidentified TO authenticated;
GRANT SELECT ON public.sfi_sessions_deidentified TO service_role;

DROP POLICY IF EXISTS "anon can select sessions" ON public.sessions;
REVOKE SELECT ON public.sessions FROM anon;
REVOKE SELECT ON public.sessions FROM authenticated;
