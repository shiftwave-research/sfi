# Supabase Baseline

The SFI backend currently depends on Supabase objects that should be captured as versioned migrations before the project grows further.

## Runtime Pieces

- Edge Function: `supabase/functions/sfi/index.ts`
- Public session table: `sessions`
- PII-restricted participant table: `participant_keys`
- RPC used by the Edge Function: `get_next_participant_id(dep_id)`
- Local Supabase config: `supabase/config.toml`

## Required Migration Coverage

The first remote schema baseline is committed at:

- `supabase/migrations/20260612211500_remote_schema_baseline.sql`

Future migrations should be added under `supabase/migrations/` for:

- `sessions` table definition
- `participant_keys` table definition
- primary keys, unique constraints, and indexes
- `get_next_participant_id(dep_id)` function
- row-level security enablement and policies
- any analyst-safe views used for QA/export
- test-data cleanup policies, if automated submission tests continue touching the live project

## Operational QA Views To Consider

- recent submission counts by deployment and timing
- incomplete pre/post pairs by `session_id`
- duplicate participant names within a deployment
- addon key coverage by deployment
- test rows tagged with `comment = '__SFI_TEST__'`

## Remaining Gap

The repository now contains a baseline schema dump, but it has not yet been replay-tested against a fresh local Supabase stack. Before relying on it for disaster recovery or onboarding, run a local reset and verify that the Edge Function can submit, look up participants, and run the config test suite against the local stack.
