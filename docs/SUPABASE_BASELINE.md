# Supabase Baseline

The SFI backend currently depends on Supabase objects that should be captured as versioned migrations before the project grows further.

## Runtime Pieces

- Edge Function: `supabase/functions/sfi/index.ts`
- Public session table: `sessions`
- PII-restricted participant table: `participant_keys`
- RPC used by the Edge Function: `get_next_participant_id(dep_id)`
- Local Supabase config: `supabase/config.toml`

## Required Migration Coverage

Add migrations under `supabase/migrations/` for:

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

## Current Gap

The repository contains the Edge Function source but does not yet contain a reproducible database schema. Until migrations are added, a fresh Supabase project cannot be recreated from the repo alone.
