/**
 * SFI End-to-End Tests
 *
 * Usage:
 *   npx playwright test
 *   npx playwright test --headed
 *   npx playwright test -g "caa"
 *
 * Env vars (.env):
 *   SFI_BASE_URL, SFI_HTML, SUPABASE_URL, SUPABASE_ANON_KEY
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

// ─── form fill helpers ────────────────────────────────────────────────────────

async function fillVasSliders(page) {
  const sliders = page.locator('input[type="range"].vas-slider');
  const count = await sliders.count();
  for (let i = 0; i < count; i++) {
    const slider = sliders.nth(i);
    if (await slider.isVisible()) {
      await slider.evaluate(el => {
        el.value = '30';
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  }
}

async function fillAddonVasSliders(page) {
  const sliders = page.locator('input[type="range"].addon-engage-slider');
  const count = await sliders.count();
  for (let i = 0; i < count; i++) {
    const slider = sliders.nth(i);
    if (await slider.isVisible()) {
      await slider.evaluate(el => {
        el.value = '45';
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  }
}

async function fillEmojiGrid(page) {
  // Trigger mousedown on the emojiGrid div at its center
  const grid = page.locator('#emojiGrid');
  if (await grid.isVisible()) {
    const box = await grid.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
    }
  }
}

async function fillStai(page) {
  const groups = page.locator('.stai-item:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const firstBtn = groups.nth(i).locator('.stai-btn').first();
    if (await firstBtn.isVisible()) await firstBtn.click();
  }
}

async function fillPainSlider(page) {
  const pain = page.locator('#painSlider');
  if (await pain.isVisible()) {
    await pain.evaluate(el => {
      el.value = '20';
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
}

async function fillSelectButtons(page) {
  const groups = page.locator('.addon-ss-group:visible, .addon-ms-group:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const firstBtn = groups.nth(i).locator('.addon-ss-btn, .addon-ms-btn').first();
    if (await firstBtn.isVisible() && !(await firstBtn.evaluate(el => el.classList.contains('selected')))) {
      await firstBtn.click();
    }
  }
}

async function fillLikert(page) {
  const groups = page.locator('.addon-l5-group:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const btns = groups.nth(i).locator('.addon-l5-btn');
    if (await btns.count() >= 3) await btns.nth(2).click();
  }
}

async function fillNps(page) {
  const groups = page.locator('.addon-nps-group:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const btns = groups.nth(i).locator('.addon-nps-btn');
    if (await btns.count() >= 8) await btns.nth(7).click();
  }
}

async function fillSurveyForm(page) {
  await fillVasSliders(page);
  await fillAddonVasSliders(page);
  await fillEmojiGrid(page);
  await fillStai(page);
  await fillPainSlider(page);
  await fillSelectButtons(page);
  await fillLikert(page);
  await fillNps(page);
}

async function selectProtocol(page) {
  const input = page.locator('#protocol');
  await input.fill('Deep');
  await page.waitForTimeout(400);
  const first = page.locator('.protocol-list .protocol-option').first();
  if (await first.isVisible({ timeout: 2000 }).catch(() => false)) {
    await first.click();
  } else {
    await input.fill('Deep Rest');
  }
}

async function waitForProtocolSection(page, timeout = 10000) {
  await page.waitForFunction(
    () => !document.getElementById('protocolTimingSection').classList.contains('hidden'),
    null, { timeout }
  );
}

async function submitAndCapture(page) {
  const btn = page.locator('#submitBtn').first();
  await expect(btn).toBeEnabled({ timeout: 5000 });
  await btn.click();
  await page.waitForFunction(
    () => !document.getElementById('successContainer').classList.contains('hidden'),
    null, { timeout: 15000 }
  );
}

// ─── consent helper ───────────────────────────────────────────────────────────
// Directly calls acceptConsent() via JS — bypasses checkbox simulation entirely.
// Demographics (age/sex) must be set first since acceptConsent() hides that row.

async function acceptConsentWithDemographics(page, age = '32', sex = 'male') {
  // Fill demographics while demographicsRow is visible
  const ageField = page.locator('#participantAge');
  if (await ageField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await ageField.fill(age);
    await page.locator('#participantSex').selectOption(sex);
  }
  // Call acceptConsent() directly — no checkbox dance needed
  await page.evaluate(() => {
    document.getElementById('ageCheck').checked = true;
    document.getElementById('consentCheck').checked = true;
    acceptConsent();
  });
}

// ─── identified deployment flow ──────────────────────────────────────────────

async function doIdentifiedPreSession(page, firstName, lastName, deployment, age = '32', sex = 'male') {
  await page.goto(deploymentUrl(deployment));
  await page.waitForLoadState('networkidle');

  // Enter name and click Continue
  await page.fill('#firstName', firstName);
  await page.fill('#lastName', lastName);
  await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
  await page.locator('#nameContinueBtn').click();

  // Wait for lookup to resolve: either consent gate or protocol section appears
  await page.waitForFunction(() => {
    const pts = document.getElementById('protocolTimingSection');
    const gate = document.getElementById('consentGate');
    return (pts && !pts.classList.contains('hidden')) ||
           (gate && !gate.classList.contains('hidden'));
  }, null, { timeout: 15000 });

  // If consent gate is showing, accept it; otherwise we're already past it
  const consentGateVisible = await page.evaluate(() => {
    const gate = document.getElementById('consentGate');
    return gate && !gate.classList.contains('hidden');
  });

  if (consentGateVisible) {
    await acceptConsentWithDemographics(page, age, sex);
    await waitForProtocolSection(page);
  }

  // Select pre timing and protocol
  const preBtn = page.locator('.timing-btn[data-timing="pre"]');
  if (await preBtn.isVisible()) await preBtn.click();
  await selectProtocol(page);

  await fillSurveyForm(page);
  return submitAndCapture(page);
}

async function doIdentifiedPostSession(page, firstName, lastName, deployment) {
  await page.goto(deploymentUrl(deployment));
  await page.waitForLoadState('networkidle');

  await page.fill('#firstName', firstName);
  await page.fill('#lastName', lastName);
  await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
  await page.locator('#nameContinueBtn').click();
  await waitForProtocolSection(page);

  await fillSurveyForm(page);
  return submitAndCapture(page);
}

// ─── anonymous deployment flow ───────────────────────────────────────────────

async function doAnonymousPreSession(page, deployment) {
  await page.goto(deploymentUrl(deployment));
  await page.waitForLoadState('networkidle');

  // Anon mode shows consent gate on load (no name entry)
  await page.waitForFunction(() => {
    const gate = document.getElementById('consentGate');
    return gate && !gate.classList.contains('hidden');
  }, null, { timeout: 10000 });

  // Accept consent directly — no demographics in anon mode
  await page.evaluate(() => {
    document.getElementById('ageCheck').checked = true;
    document.getElementById('consentCheck').checked = true;
    acceptConsent();
  });

  await waitForProtocolSection(page);

  const preBtn = page.locator('.timing-btn[data-timing="pre"]');
  if (await preBtn.isVisible({ timeout: 2000 }).catch(() => false)) await preBtn.click();

  await fillSurveyForm(page);
  return submitAndCapture(page);
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
  test('pre/post pair submits with correct field types and shared session_id', async ({ page }) => {
    const deployment = 'randi';

    await doIdentifiedPreSession(page, 'SFI', 'TestUser', deployment);
    await page.waitForTimeout(1000);

    // Post-session — timing auto-locked after pre submit
    await fillSurveyForm(page);
    await page.locator('#submitBtn').first().click();
    await page.waitForFunction(
      () => !document.getElementById('successContainer').classList.contains('hidden'),
      null, { timeout: 15000 }
    );

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
  test('hormonal stage does not appear on post when skipped on pre', async ({ page }) => {
    await page.goto(deploymentUrl('randi'));
    await page.waitForLoadState('networkidle');

    await page.fill('#firstName', 'SFI');
    await page.fill('#lastName', 'TestFemale');
    await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
    await page.locator('#nameContinueBtn').click();

    await page.waitForFunction(() => {
      const gate = document.getElementById('consentGate');
      const pts  = document.getElementById('protocolTimingSection');
      return (gate && !gate.classList.contains('hidden')) ||
             (pts  && !pts.classList.contains('hidden'));
    }, null, { timeout: 15000 });

    const consentGateVisible = await page.evaluate(() => {
      const gate = document.getElementById('consentGate');
      return gate && !gate.classList.contains('hidden');
    });

    if (consentGateVisible) {
      await acceptConsentWithDemographics(page, '35', 'female');
      await waitForProtocolSection(page);
    }

    // Skip female health opt-in if shown
    const skipBtn = page.locator('button:has-text("Skip"), [data-value="skip"]');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) await skipBtn.click();

    const preBtn = page.locator('.timing-btn[data-timing="pre"]');
    if (await preBtn.isVisible()) await preBtn.click();
    await selectProtocol(page);

    await fillSurveyForm(page);
    await submitAndCapture(page);
    await page.waitForTimeout(500);

    const hormoneBlock = page.locator('[data-field="core_hormonal_change"], #addonItem_coreHormonalChange');
    await expect(hormoneBlock).not.toBeVisible();
  });
});

test.describe('Offline queue', () => {
  test('submission is queued when offline and flushed on reconnect', async ({ page, context }) => {
    await page.goto(deploymentUrl('randi'));
    await page.waitForLoadState('networkidle');

    await page.fill('#firstName', 'SFI');
    await page.fill('#lastName', 'TestOffline');
    await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
    await page.locator('#nameContinueBtn').click();

    await page.waitForFunction(() => {
      const gate = document.getElementById('consentGate');
      const pts  = document.getElementById('protocolTimingSection');
      return (gate && !gate.classList.contains('hidden')) ||
             (pts  && !pts.classList.contains('hidden'));
    }, null, { timeout: 15000 });

    const consentGateVisible = await page.evaluate(() => {
      const gate = document.getElementById('consentGate');
      return gate && !gate.classList.contains('hidden');
    });

    if (consentGateVisible) {
      await acceptConsentWithDemographics(page, '28', 'male');
      await waitForProtocolSection(page);
    }

    const preBtn = page.locator('.timing-btn[data-timing="pre"]');
    if (await preBtn.isVisible()) await preBtn.click();
    await selectProtocol(page);

    await fillSurveyForm(page);

    // Go offline before submitting
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

    // Come back online — queue should flush
    await context.setOffline(false);
    await page.waitForTimeout(5000);

    const queueAfter = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('sfi_submission_queue') || '[]').length
    );
    expect(queueAfter).toBe(0);
  });
});
