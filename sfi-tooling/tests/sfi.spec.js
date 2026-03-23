/**
 * SFI End-to-End Tests
 *
 * Usage:
 *   npx playwright test
 *   npx playwright test --headed
 *   npx playwright test -g "standard identified"
 *
 * Env vars (.env):
 *   SFI_BASE_URL, SFI_HTML, SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * Test data cleanup:
 *   - sessions rows tagged comment='__SFI_TEST__' are auto-deleted in afterAll
 *     (requires RLS policy: anon can DELETE WHERE comment = '__SFI_TEST__')
 *   - participant_keys rows must be cleaned manually in Supabase dashboard:
 *     DELETE FROM participant_keys
 *     WHERE name_normalized IN
 *       ('sfi testuser','sfi testsuzanne','sfi testfemale','sfi testoffline');
 */

const { test, expect } = require('@playwright/test');
require('dotenv').config();

const BASE_URL     = process.env.SFI_BASE_URL  || 'https://shiftwave-research.github.io/sfi';
const HTML         = process.env.SFI_HTML       || 'shiftwave-field-instrument.html';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// ─── helpers ─────────────────────────────────────────────────────────────────

function deploymentUrl(d) {
  return `${BASE_URL}/${HTML}?deployment=${d}`;
}

async function fetchSupabaseRows(deployment, participantId, limit = 2) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/sessions`
    + `?deployment_id=eq.${deployment}`
    + `&participant_id=eq.${participantId}`
    + `&order=received_at.desc&limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Delete all sessions rows tagged as test data.
 * Requires RLS policy: anon can DELETE ON sessions WHERE comment = '__SFI_TEST__'
 * Run once in afterAll — cleans up all test rows from the full suite run.
 */
async function deleteTestSessions() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const url = `${SUPABASE_URL}/rest/v1/sessions?comment=eq.__SFI_TEST__`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    }
  });
  if (!res.ok) {
    console.warn('Test session cleanup failed — HTTP', res.status);
  } else {
    console.log('Test session rows deleted successfully.');
  }
}

/**
 * Fill the entire survey form by directly setting formData and addonValues
 * in the page context, then calling updateProgress(). This is more reliable
 * than synthetic DOM events which don't always reach the SFI's event listeners.
 *
 * Sets comment = '__SFI_TEST__' so rows are identifiable and auto-deleted in afterAll.
 */
async function fillSurveyForm(page) {
  await page.evaluate(() => {
    // Tag this submission as test data for auto-cleanup
    formData.comment = '__SFI_TEST__';
    // Also set the DOM textarea — submit handler reads getElementById('comment').value directly
    const commentEl = document.getElementById('comment');
    if (commentEl) commentEl.value = '__SFI_TEST__';

    // Core VAS sliders (bodyTension, energy, bodyConnection, clarity, mentalQuiet, alertness)
    ['bodyTension', 'energy', 'bodyConnection', 'clarity', 'mentalQuiet', 'alertness'].forEach(id => {
      formData[id] = 30;
      formData[id + 'Engaged'] = true;
      // Update the slider display so it looks filled
      const slider = document.getElementById(id);
      if (slider) {
        slider.value = '30';
        const valEl = document.getElementById(id + 'Value');
        if (valEl) valEl.textContent = '30';
        const vasItem = document.getElementById('vasItem_' + id);
        if (vasItem) vasItem.classList.add('engaged');
      }
    });

    // Pain slider
    formData.pain = 2.0;
    formData.painEngaged = true;
    const painSlider = document.getElementById('painSlider');
    if (painSlider) {
      painSlider.value = '20';
      const painContainer = document.getElementById('painVasContainer');
      if (painContainer) painContainer.classList.add('engaged');
      const painPrompt = document.getElementById('painPrompt');
      if (painPrompt) painPrompt.style.display = 'none';
      const painDisplay = document.getElementById('painValueDisplay');
      if (painDisplay) painDisplay.textContent = '2.0';
    }

    // EmojiGrid — set valence and arousal directly
    formData.valence = 50;
    formData.arousal = 50;
    const gridValues = document.getElementById('gridValues');
    if (gridValues) gridValues.innerHTML = 'Valence: <span>50</span> &nbsp;|&nbsp; Arousal: <span>50</span>';

    // STAI-6 items
    ['stai_calm', 'stai_tense', 'stai_upset', 'stai_relaxed', 'stai_content', 'stai_worried'].forEach(item => {
      formData[item] = 2;
      // Mark the first button as selected visually
      const el = document.querySelector(`[data-item="${item}"]`);
      if (el) {
        const btn = el.querySelector('.stai-btn');
        if (btn) btn.classList.add('selected');
      }
    });

    // Addon fields — fill all visible addon VAS sliders and selects
    document.querySelectorAll('.addon-engage-slider').forEach(slider => {
      const field = slider.dataset.field;
      if (field && slider.offsetParent !== null) {
        addonValues[field] = 45;
        slider.value = '45';
        const vasItem = slider.closest('.vas-item, .addon-vas-item');
        if (vasItem) vasItem.classList.add('engaged');
      }
    });

    // Addon singleSelect — select first option of each visible group
    document.querySelectorAll('.addon-ss-group').forEach(group => {
      if (group.offsetParent === null) return;
      const field = group.dataset.field;
      const firstBtn = group.querySelector('.addon-ss-btn');
      if (field && firstBtn) {
        addonValues[field] = firstBtn.dataset.value;
        firstBtn.classList.add('selected');
      }
    });

    // Addon multiSelect — select first option of each visible group
    document.querySelectorAll('.addon-ms-group').forEach(group => {
      if (group.offsetParent === null) return;
      const field = group.dataset.field;
      const firstBtn = group.querySelector('.addon-ms-btn');
      if (field && firstBtn) {
        if (!addonValues[field]) addonValues[field] = [];
        if (!addonValues[field].includes(firstBtn.dataset.value)) {
          addonValues[field].push(firstBtn.dataset.value);
        }
        firstBtn.classList.add('selected');
      }
    });

    // Addon likert5 — select middle button of each visible group
    document.querySelectorAll('.addon-l5-group').forEach(group => {
      if (group.offsetParent === null) return;
      const field = group.dataset.field;
      const btns = group.querySelectorAll('.addon-l5-btn');
      if (field && btns.length >= 3) {
        const mid = btns[2];
        addonValues[field] = parseInt(mid.dataset.value) || 3;
        mid.classList.add('selected');
      }
    });

    // Addon NPS — select 7
    document.querySelectorAll('.addon-nps-group').forEach(group => {
      if (group.offsetParent === null) return;
      const field = group.dataset.field;
      const btns = group.querySelectorAll('.addon-nps-btn');
      if (field && btns.length >= 8) {
        const btn = btns[7];
        addonValues[field] = parseInt(btn.dataset.value) || 7;
        btn.classList.add('selected');
      }
    });

    // Trigger progress recalculation
    updateProgress();
  });
}

async function selectProtocol(page) {
  const input = page.locator('#protocol');
  await input.fill('Deep');
  await page.waitForTimeout(400);
  const first = page.locator('.protocol-list .protocol-option').first();
  if (await first.isVisible({ timeout: 2000 }).catch(() => false)) {
    await first.click();
  } else {
    // Fallback: set protocol directly in formData via page.evaluate
    await page.evaluate(() => {
      const proto = document.getElementById('protocol');
      if (proto) proto.value = 'Deep Rest';
      updateProgress();
    });
  }
}

async function waitForProtocolSection(page, timeout = 15000) {
  await page.waitForFunction(
    () => !document.getElementById('protocolTimingSection').classList.contains('hidden'),
    null, { timeout }
  );
}

async function waitForReadyThenSubmit(page) {
  // Wait for submit button to reach 'ready' class
  await page.waitForFunction(
    () => document.getElementById('submitBtn').classList.contains('ready'),
    null, { timeout: 15000 }
  );
  await page.locator('#submitBtn').first().click();
  // Wait for success screen
  await page.waitForFunction(
    () => !document.getElementById('successContainer').classList.contains('hidden'),
    null, { timeout: 15000 }
  );
}

// ─── consent helper ───────────────────────────────────────────────────────────

async function acceptConsentWithDemographics(page, age = '32', sex = 'male') {
  const ageField = page.locator('#participantAge');
  if (await ageField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await ageField.fill(age);
    await page.locator('#participantSex').selectOption(sex);
  }
  // Call acceptConsent() directly — bypasses checkbox simulation
  await page.evaluate(() => {
    if (document.getElementById('ageCheck')) document.getElementById('ageCheck').checked = true;
    if (document.getElementById('consentCheck')) document.getElementById('consentCheck').checked = true;
    acceptConsent();
  });
}

async function waitForConsentOrProtocol(page) {
  await page.waitForFunction(() => {
    const gate = document.getElementById('consentGate');
    const pts  = document.getElementById('protocolTimingSection');
    return (gate && !gate.classList.contains('hidden')) ||
           (pts  && !pts.classList.contains('hidden'));
  }, null, { timeout: 15000 });

  return page.evaluate(() => {
    const gate = document.getElementById('consentGate');
    return !!(gate && !gate.classList.contains('hidden'));
  });
}

// ─── identified deployment flow ──────────────────────────────────────────────

async function doIdentifiedPreSession(page, firstName, lastName, deployment, age = '32', sex = 'male') {
  await page.goto(deploymentUrl(deployment));
  await page.waitForLoadState('networkidle');

  await page.fill('#firstName', firstName);
  await page.fill('#lastName', lastName);
  await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
  await page.locator('#nameContinueBtn').click();

  const needsConsent = await waitForConsentOrProtocol(page);
  if (needsConsent) {
    await acceptConsentWithDemographics(page, age, sex);
    await waitForProtocolSection(page);
  }

  const preBtn = page.locator('.timing-btn[data-timing="pre"]');
  if (await preBtn.isVisible()) await preBtn.click();
  await selectProtocol(page);

  await fillSurveyForm(page);
  await waitForReadyThenSubmit(page);
}

// ─── anonymous deployment flow ───────────────────────────────────────────────

async function doAnonymousPreSession(page, deployment) {
  await page.goto(deploymentUrl(deployment));
  await page.waitForLoadState('networkidle');

  // Anon mode shows consent gate immediately
  await page.waitForFunction(() => {
    const gate = document.getElementById('consentGate');
    return gate && !gate.classList.contains('hidden');
  }, null, { timeout: 10000 });

  await page.evaluate(() => {
    if (document.getElementById('ageCheck')) document.getElementById('ageCheck').checked = true;
    if (document.getElementById('consentCheck')) document.getElementById('consentCheck').checked = true;
    acceptConsent();
  });

  await waitForProtocolSection(page);

  const preBtn = page.locator('.timing-btn[data-timing="pre"]');
  if (await preBtn.isVisible({ timeout: 2000 }).catch(() => false)) await preBtn.click();

  await fillSurveyForm(page);
  await waitForReadyThenSubmit(page);
}

// ─── assertion helpers ────────────────────────────────────────────────────────

function assertVasTypes(row, fields) {
  for (const field of fields) {
    const val = row[field] ?? (row.addons && JSON.parse(row.addons || '{}')[field]);
    if (val !== undefined && val !== null) {
      expect(typeof val, `${field} should be number`).toBe('number');
    }
  }
}

function assertPairedSession(preRow, postRow) {
  expect(preRow.session_id).toBe(postRow.session_id);
}

// ─── tests ───────────────────────────────────────────────────────────────────

test.describe('Config loads', () => {
  for (const deployment of ['caa', 'spirit', 'mclaren', 'lafd', 'randi', 'suzanne', 'womens-health-month']) {
    test(`${deployment} — config loads without error`, async ({ page }) => {
      await page.goto(deploymentUrl(deployment));
      await page.waitForLoadState('networkidle');

      const errorScreen = page.locator('[class*="config-error"], #configError, :text("Failed to load")');
      await expect(errorScreen).not.toBeVisible();

      const displayNames = {
        caa: 'CAA', spirit: 'Washington Spirit', mclaren: 'McLaren',
        lafd: 'LAFD', randi: 'Randi', suzanne: 'Burnout',
        'womens-health-month': 'Women'
      };
      if (displayNames[deployment]) {
        await expect(page.locator(`text=${displayNames[deployment]}`).first()).toBeVisible({ timeout: 5000 });
      }
    });
  }
});

test.describe('Submission integrity — standard identified flow', () => {
  test.afterAll(async () => {
    await deleteTestSessions();
  });

  test('pre/post pair submits with correct field types and shared session_id', async ({ page }) => {
    const deployment = 'randi';

    await doIdentifiedPreSession(page, 'SFI', 'TestUser', deployment);

    // After pre-session, click through to post-session
    await page.locator('#successBtn').click();
    await page.waitForFunction(
      () => !document.getElementById('surveyBody').classList.contains('hidden'),
      null, { timeout: 10000 }
    );
    // Re-sync window refs — resetForm() reassigns formData and addonValues closures
    await page.evaluate(() => {
      window.formData = formData;
      window.addonValues = addonValues;
    });

    // Post-session — timing auto-locked after pre submit
    await fillSurveyForm(page);
    await waitForReadyThenSubmit(page);

    if (SUPABASE_URL && SUPABASE_KEY) {
      await page.waitForTimeout(2000);
      const rows = await fetchSupabaseRows(deployment, 'P-001');
      if (rows && rows.length >= 2) {
        const preRow  = rows.find(r => r.timing === 'pre');
        const postRow = rows.find(r => r.timing === 'post');
        if (preRow && postRow) {
          assertPairedSession(preRow, postRow);
          for (const row of [preRow, postRow]) {
            assertVasTypes(row, ['body_tension', 'energy', 'body_connection', 'clarity', 'mental_quiet', 'alertness']);
          }
        }
      }
    }
  });
});

test.describe('Submission integrity — anonymous flow', () => {
  test.afterAll(async () => {
    await deleteTestSessions();
  });

  test('anon pre-session submits with ANON participant_id', async ({ page }) => {
    await doAnonymousPreSession(page, 'lafd');

    if (SUPABASE_URL && SUPABASE_KEY) {
      await page.waitForTimeout(2000);
      const url = `${SUPABASE_URL}/rest/v1/sessions?deployment_id=eq.lafd&order=received_at.desc&limit=1`;
      const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      if (res.ok) {
        const [row] = await res.json();
        if (row) expect(row.participant_id).toMatch(/^ANON-/);
      }
    }
  });
});

test.describe('Addon field type integrity', () => {
  test.afterAll(async () => {
    await deleteTestSessions();
  });

  test('suzanne — VAS addon fields land as integers not strings', async ({ page }) => {
    await doIdentifiedPreSession(page, 'SFI', 'TestSuzanne', 'suzanne');

    if (SUPABASE_URL && SUPABASE_KEY) {
      await page.waitForTimeout(2000);
      const url = `${SUPABASE_URL}/rest/v1/sessions?deployment_id=eq.suzanne&order=received_at.desc&limit=1`;
      const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      if (res.ok) {
        const [row] = await res.json();
        if (row && row.addons) {
          const addons = JSON.parse(row.addons);
          const vasFields = [
            'sz_t_jaw','sz_t_head','sz_t_neck_throat','sz_t_shoulders',
            'sz_t_chest','sz_t_back','sz_t_hips_pelvis','sz_t_stomach',
            'sz_t_hands','sz_t_feet','sz_worn_out','sz_managing_emotions','sz_burnout_capacity'
          ];
          for (const f of vasFields) {
            if (addons[f] !== undefined) expect(typeof addons[f], `${f} should be number`).toBe('number');
          }
        }
      }
    }
  });
});

test.describe('Female health block', () => {
  test.afterAll(async () => {
    await deleteTestSessions();
  });

  test('hormonal stage does not appear on post when skipped on pre', async ({ page }) => {
    await page.goto(deploymentUrl('randi'));
    await page.waitForLoadState('networkidle');

    await page.fill('#firstName', 'SFI');
    await page.fill('#lastName', 'TestFemale');
    await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
    await page.locator('#nameContinueBtn').click();

    const needsConsent = await waitForConsentOrProtocol(page);
    if (needsConsent) {
      await acceptConsentWithDemographics(page, '35', 'female');
      await waitForProtocolSection(page);
    }

    const skipBtn = page.locator('button:has-text("Skip"), [data-value="skip"]');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) await skipBtn.click();

    const preBtn = page.locator('.timing-btn[data-timing="pre"]');
    if (await preBtn.isVisible()) await preBtn.click();
    await selectProtocol(page);

    await fillSurveyForm(page);
    await waitForReadyThenSubmit(page);
    await page.waitForTimeout(500);

    const hormoneBlock = page.locator('[data-field="core_hormonal_change"], #addonItem_coreHormonalChange');
    await expect(hormoneBlock).not.toBeVisible();
  });
});

test.describe('Offline queue', () => {
  test.afterAll(async () => {
    await deleteTestSessions();
  });

  test('submission is queued when offline and flushed on reconnect', async ({ page, context }) => {
    // Capture browser console so we can see flush errors if the test fails
    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

    await page.goto(deploymentUrl('randi'));
    await page.waitForLoadState('networkidle');

    await page.fill('#firstName', 'SFI');
    await page.fill('#lastName', 'TestOffline');
    await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
    await page.locator('#nameContinueBtn').click();

    const needsConsent = await waitForConsentOrProtocol(page);
    if (needsConsent) {
      await acceptConsentWithDemographics(page, '28', 'male');
      await waitForProtocolSection(page);
    }

    const preBtn = page.locator('.timing-btn[data-timing="pre"]');
    if (await preBtn.isVisible()) await preBtn.click();
    await selectProtocol(page);

    await fillSurveyForm(page);

    // Wait for ready then go offline before clicking submit
    await page.waitForFunction(
      () => document.getElementById('submitBtn').classList.contains('ready'),
      null, { timeout: 15000 }
    );

    await context.setOffline(true);
    await page.locator('#submitBtn').first().click();

    // Wait for queuedNote to shed its hidden class
    await page.waitForFunction(
      () => !document.getElementById('queuedNote').classList.contains('hidden'),
      null, { timeout: 10000 }
    );

    const queueLength = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('sfi_submission_queue') || '[]').length
    );
    expect(queueLength).toBeGreaterThan(0);

    await context.setOffline(false);

    // Reset throttle and await the flush fully before checking localStorage.
    // flush() is async — not awaiting it caused a race where waitForFunction
    // would start polling before the fetch completed.
    const flushResult = await page.evaluate(async () => {
      SubmissionQueue._lastFlush = 0;
      const remaining = await SubmissionQueue.flush();
      return {
        remaining,
        queue: JSON.parse(localStorage.getItem('sfi_submission_queue') || '[]')
      };
    });

    // Log the queued payload if flush didn't clear it — helps diagnose Edge Function errors
    if (flushResult.remaining > 0) {
      console.log('=== OFFLINE FLUSH DIAGNOSTIC ===');
      console.log('Remaining after flush:', flushResult.remaining);
      console.log('Queue contents:', JSON.stringify(flushResult.queue, null, 2));
      console.log('Browser console during test:');
      consoleLogs.forEach(l => console.log(' ', l));
      console.log('================================');
    }

    expect(flushResult.remaining, 'Queue should be empty after flush — check diagnostic output above').toBe(0);
  });
});
