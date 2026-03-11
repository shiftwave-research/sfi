import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Category functions (ported from Apps Script)
function getValenceCategory(v: number) {
  if (v < 35) return 'Unpleasant'
  if (v > 65) return 'Pleasant'
  return 'Neutral'
}
function getArousalCategory(a: number) {
  if (a < 35) return 'Low'
  if (a > 65) return 'High'
  return 'Medium'
}
function getAffectQuadrant(v: number, a: number) {
  if (v >= 50 && a >= 50) return 'Excited/Happy'
  if (v >= 50 && a < 50)  return 'Calm/Relaxed'
  if (v < 50  && a >= 50) return 'Stressed/Anxious'
  return 'Sad/Depressed'
}
function getPainCategory(p: number) {
  if (p === 0) return 'No Pain'
  if (p <= 3)  return 'Mild'
  if (p <= 6)  return 'Moderate'
  return 'Severe'
}
function getStaiCategory(s: number) {
  if (s < 30) return 'Low Anxiety'
  if (s < 40) return 'Mild Anxiety'
  if (s < 50) return 'Moderate Anxiety'
  return 'High Anxiety'
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Service role client — bypasses RLS, can access participant_keys
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const { action } = body

    // ── LOOKUP ────────────────────────────────────────────────────────────
    if (action === 'lookup') {
      const { participantName, deploymentId } = body
      const normalized = normalizeName(participantName)

      const { data, error } = await supabase
        .from('participant_keys')
        .select('participant_id, age, sex')
        .eq('deployment_id', deploymentId)
        .eq('name_normalized', normalized)
        .maybeSingle()

      if (error) throw error

      if (data) {
        return new Response(JSON.stringify({
          status: 'returning',
          participantId: data.participant_id,
          age: data.age,
          sex: data.sex
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else {
        return new Response(JSON.stringify({ status: 'new' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // ── SUBMIT ────────────────────────────────────────────────────────────
    if (action === 'submit') {
      const {
        participantName, deploymentId, timing, protocol, sessionId,
        valence, arousal, body_tension, energy, body_connection,
        clarity, mental_quiet, alertness, pain,
        stai_calm, stai_tense, stai_upset, stai_relaxed, stai_content, stai_worried,
        stai6_sum, stai20_equivalent,
        comment, consent, age, sex, addons, client_timestamp
      } = body

      const normalized = normalizeName(participantName)

      // Get or create participant ID (scoped per deployment, sequential P-001, P-002…)
      let participantId: string
      let isNew = false

      const { data: existing, error: lookupError } = await supabase
        .from('participant_keys')
        .select('participant_id')
        .eq('deployment_id', deploymentId)
        .eq('name_normalized', normalized)
        .maybeSingle()

      if (lookupError) throw lookupError

      if (existing) {
        participantId = existing.participant_id
      } else {
        // Atomically get next participant ID via Postgres function
        const { data: seqData, error: seqError } = await supabase
          .rpc('get_next_participant_id', { dep_id: deploymentId })

        if (seqError) throw seqError
        participantId = seqData
        isNew = true

        const { error: insertKeyError } = await supabase
          .from('participant_keys')
          .insert({
            deployment_id: deploymentId,
            participant_id: participantId,
            name_normalized: normalized,
            age: age ?? null,
            sex: sex ?? null,
            consented_at: consent ? new Date().toISOString() : null
          })

        if (insertKeyError) throw insertKeyError
      }

      // Compute category fields server-side
      const valenceCategory   = valence != null ? getValenceCategory(valence) : null
      const arousalCategory   = arousal != null ? getArousalCategory(arousal) : null
      const affectQuadrant    = (valence != null && arousal != null) ? getAffectQuadrant(valence, arousal) : null
      const painCategory      = pain != null ? getPainCategory(pain) : null
      const staiCategory      = stai6_sum != null ? getStaiCategory(stai6_sum) : null

      // Insert session row (no PII)
      const { error: sessionError } = await supabase
        .from('sessions')
        .insert({
          deployment_id: deploymentId,
          participant_id: participantId,
          timing, protocol, session_id: sessionId,
          valence, arousal, valence_category: valenceCategory,
          arousal_category: arousalCategory, affect_quadrant: affectQuadrant,
          body_tension, energy, body_connection,
          clarity, mental_quiet, alertness,
          pain, pain_category: painCategory,
          stai_calm, stai_tense, stai_upset, stai_relaxed, stai_content, stai_worried,
          stai6_sum, stai20_equivalent, stai_category: staiCategory,
          comment, consent, age, sex,
          addons: addons ? (typeof addons === 'string' ? JSON.parse(addons) : addons) : null,
          client_timestamp: client_timestamp ?? null
        })

      if (sessionError) throw sessionError

      return new Response(JSON.stringify({
        status: 'success',
        participantId,
        isNew,
        quadrant: affectQuadrant,
        staiCategory
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    // ── CHECK SESSION ─────────────────────────────────────────────────────
    if (action === 'checkSession') {
      const { participantName, deploymentId } = body

      if (!participantName || !deploymentId) {
        return new Response(JSON.stringify({ error: 'missing participantName or deploymentId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const normalized = normalizeName(participantName)

      // Step 1: resolve name → sequential participant_id via participant_keys
      const { data: keyData, error: keyError } = await supabase
        .from('participant_keys')
        .select('participant_id')
        .eq('name_normalized', normalized)
        .eq('deployment_id', deploymentId)
        .maybeSingle()

      if (keyError) {
        return new Response(JSON.stringify({ error: keyError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (!keyData) {
        return new Response(JSON.stringify({ timings: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Step 2: query sessions with sequential participant_id
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('timing')
        .eq('participant_id', keyData.participant_id)
        .eq('deployment_id', deploymentId)

      if (sessionError) {
        return new Response(JSON.stringify({ error: sessionError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const timings = (sessionData || []).map((row: { timing: string }) => row.timing)

      return new Response(JSON.stringify({ timings }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

   
  return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})