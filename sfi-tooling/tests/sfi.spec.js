/**
 * SFI End-to-End Tests
 * Tests full pre/post submission flow and verifies data integrity in Supabase.
 *
 * Usage:
 *   npx playwright test                          # run all tests
 *   npx playwright test --headed                 # watch the browser
 *   npx playwright test -g "caa"                 # run tests matching "caa"
 *
 * Environment variables (set in .env or shell):
 *   SFI_BASE_URL          Base URL of the SFI (default: https://shiftwave-research.github.io/sfi)
 *   SFI_HTML              HTML filename (default: shiftwave-field-instrument.html)
 *   SUPABASE_URL          Your Supabase project URL
 *   SUPABASE_ANON_KEY     Your Supabase anon key (legacy eyJ... format)
 *
 * Test participants use names prefixed "SFI Test" — never affects real data.
 */

const { test, expect } = require('@playwright/test');
require('dotenv').config();

const BASE_URL     = process.env.SFI_BASE_URL  || 'https://shiftwave-research.github.io/sfi';
const HTML         = process.env.SFI_HTML       || 'shiftwave-field-instrument.html';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// ─── helpers ─────────────────────────────────────────────────────────────────

function deploymentUrl(deployment) {
  return `${BASE_URL}/${HTML}?deployment=${deployment}`;
}

async function fetchSupabaseRows(deployment, participantId, limit = 2) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/sessions`
    + `?deployment_id=eq.${deployment}`
    + `&participant_id=eq.${participantId}`
    + `&order=received_at.desc`
    + `&limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) return null;
  return res.json();
}

async function fillVasSliders(page) {
  const sliders = page.locator('input[type="range"].vas-slider');
  const count = await sliders.count();
  for (let i = 0; i < count; i++) {
    const slider = sliders.nth(i);
    if (await slider.isVisible()) {
      await slider.evaluate(el => {
        el.value = '30';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
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
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  }
}

async function fillSelectButtons(page) {
  const groups = page.locator('.addon-ss-group:visible, .addon-ms-group:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const group = groups.nth(i);
    const firstBtn = group.locator('.addon-ss-btn, .addon-ms-btn').first();
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

async function fillEmojiGrid(page) {
  const grid = page.locator('#emojiGridCanvas, canvas').first();
  if (await grid.isVisible()) {
    const box = await grid.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
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
  const protocolInput = page.locator('#protocol');
  await protocolInput.fill('Deep');
  await page.waitForTimeout(400);
  const firstSuggestion = page.locator('.protocol-list .protocol-option').first();
  if (await firstSuggestion.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstSuggestion.click();
  } else {
    await protocolInput.fill('Deep Rest');
  }
}

/**
 * Wait for the result of the participant lookup — either consent gate appears
 * (new participant) or protocolTimingSection appears (returning participant).
 * Returns 'consent' or 'protocol'.
 */
async function waitForLookupResult(page) {
  await page.waitForFunction(() => {
    const pts = document.getElementById('protocolTimingSection');
    const cb  = document.getElementById('consentBtn');
    const ptsVisible = pts && !pts.classList.contains('hidden');
    const consentVisible = cb && cb.offsetParent !== null;
    return ptsVisible || consentVisible;
  }, null, { timeout: 15000 });

  const protocolVisible = await page.evaluate(() =>
    !document.getElementById('protocolTimingSection').classList.contains('hidden')
  );
  return protocolVisible ? 'protocol' : 'consent';
}

async function waitForProtocolSection(page) {
  await page.waitForFunction(
    () => !document.getElementById('protocolTimingSection').classList.contains('hidden'),
    null, { timeout: 10000 }
  );
}

async function submitAndCapture(page) {
  const submitBtn = page.locator('#submitBtn').first();
  await expect(submitBtn).toBeEnabled({ timeout: 5000 });
  await submitBtn.click();
  await page.waitForFunction(
    () => !document.getElementById('successContainer').classList.contains('hidden'),
    null, { timeout: 15000 }
  );
  return page.evaluate(() =>
    sessionStorage.getItem('sfi_session_id') ||
    sessionStorage.getItem('sfi_session_url')
  );
}

// ─── identified deployment flow ──────────────────────────────────────────────

async function doIdentifiedPreSession(page, firstName, lastName, deployment) {
  await page.goto(deploymentUrl(deployment));
  await page.waitForLoadState('networkidle');

  // Step 1: enter name and continue
  await page.fill('#firstName', firstName);
  await page.fill('#lastName', lastName);
  await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
  await page.locator('#nameContinueBtn').click();

  // Step 2: wait for lookup to complete — either consent gate or protocol section
  const result = await waitForLookupResult(page);

  if (result === 'consent') {
    // New participant: fill demographics BEFORE accepting consent
    // (acceptConsent() hides demographicsRow immediately on click)
    const ageField = page.locator('#participantAge');
    if (await ageField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ageField.fill('32');
      await page.locator('#participantSex').selectOption('male');
    }
    await page.locator('#ageCheck').check();
    await page.locator('#consentCheck').check();
    await page.waitForFunction(() => !document.getElementById('consentBtn').disabled, null, { timeout: 3000 });
    await page.locator('#consentBtn').click();
    await waitForProtocolSection(page);
  }
  // returning participant lands directly on protocol section — no consent needed

  // Step 3: select pre timing and protocol
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

  // Anon mode calls showConsentGate() automatically on load — wait for it
  const result = await waitForLookupResult(page);

  if (result === 'consent') {
    await page.locator('#ageCheck').check();
    await page.locator('#consentCheck').check();
    await page.waitForFunction(() => !document.getElementById('consentBtn').disabled, null, { timeout: 3000 });
    await page.locator('#consentBtn').click();
    await waitForProtocolSection(page);
  }

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
      expect(typeof val, `${field} should be a number, got ${typeof val}`).toBe('number');
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
            'sz_t_jaw', 'sz_t_head', 'sz_t_neck_throat', 'sz_t_shoulders',
            'sz_t_chest', 'sz_t_back', 'sz_t_hips_pelvis', 'sz_t_stomach',
            'sz_t_hands', 'sz_t_feet', 'sz_worn_out', 'sz_managing_emotions',
            'sz_burnout_capacity'
          ];
          for (const field of vasFields) {
            if (addons[field] !== undefined) {
              expect(typeof addons[field], `${field} should be number`).toBe('number');
            }
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

    const result = await waitForLookupResult(page);

    if (result === 'consent') {
      const ageField = page.locator('#participantAge');
      if (await ageField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ageField.fill('35');
        await page.locator('#participantSex').selectOption('female');
      }
      await page.locator('#ageCheck').check();
      await page.locator('#consentCheck').check();
      await page.waitForFunction(() => !document.getElementById('consentBtn').disabled, null, { timeout: 3000 });
      await page.locator('#consentBtn').click();
      await waitForProtocolSection(page);
    }

    // Skip the female health opt-in if it appears
    const skipBtn = page.locator('button:has-text("Skip"), [data-value="skip"]');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) await skipBtn.click();

    const preBtn = page.locator('.timing-btn[data-timing="pre"]');
    if (await preBtn.isVisible()) await preBtn.click();
    await selectProtocol(page);

    await fillSurveyForm(page);
    await submitAndCapture(page);
    await page.waitForTimeout(500);

    const hormoneChangeBlock = page.locator('[data-field="core_hormonal_change"], #addonItem_coreHormonalChange');
    await expect(hormoneChangeBlock).not.toBeVisible();
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

    const result = await waitForLookupResult(page);

    if (result === 'consent') {
      const ageField = page.locator('#participantAge');
      if (await ageField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ageField.fill('28');
        await page.locator('#participantSex').selectOption('male');
      }
      await page.locator('#ageCheck').check();
      await page.locator('#consentCheck').check();
      await page.waitForFunction(() => !document.getElementById('consentBtn').disabled, null, { timeout: 3000 });
      await page.locator('#consentBtn').click();
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

    const queueLength = await page.evaluate(() => {
      const q = JSON.parse(localStorage.getItem('sfi_submission_queue') || '[]');
      return q.length;
    });
    expect(queueLength).toBeGreaterThan(0);

    // Come back online — queue should flush
    await context.setOffline(false);
    await page.waitForTimeout(5000);

    const queueAfter = await page.evaluate(() => {
      const q = JSON.parse(localStorage.getItem('sfi_submission_queue') || '[]');
      return q.length;
    });
    expect(queueAfter).toBe(0);
  });
});
