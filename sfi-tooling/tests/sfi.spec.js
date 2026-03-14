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
 * The tests use a reserved test participant name "Test Participant" so real
 * submissions are never affected. Clean up test rows after each run if needed.
 */

const { test, expect } = require('@playwright/test');
require('dotenv').config();

const BASE_URL     = process.env.SFI_BASE_URL  || 'https://shiftwave-research.github.io/sfi';
const HTML         = process.env.SFI_HTML       || 'shiftwave-field-instrument.html';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// ─── helpers ────────────────────────────────────────────────────────────────

function deploymentUrl(deployment) {
  return `${BASE_URL}/${HTML}?deployment=${deployment}`;
}

/**
 * Fetch the most recent row(s) from Supabase for a given deployment + participant.
 */
async function fetchSupabaseRows(deployment, participantId, limit = 2) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/sessions`
    + `?deployment_id=eq.${deployment}`
    + `&participant_id=eq.${participantId}`
    + `&order=received_at.desc`
    + `&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Fill in all VAS sliders in the current view by moving each to a test value.
 * Clicks at ~30% position to avoid dead-center default.
 */
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

/**
 * Fill all addon VAS sliders.
 */
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

/**
 * Select the first available option in every visible singleSelect and multiSelect group.
 */
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

/**
 * Fill all likert5 items by selecting rating 3.
 */
async function fillLikert(page) {
  const groups = page.locator('.addon-l5-group:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const btns = groups.nth(i).locator('.addon-l5-btn');
    if (await btns.count() >= 3) await btns.nth(2).click(); // middle = 3
  }
}

/**
 * Fill all NPS items by selecting 7.
 */
async function fillNps(page) {
  const groups = page.locator('.addon-nps-group:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const btns = groups.nth(i).locator('.addon-nps-btn');
    if (await btns.count() >= 8) await btns.nth(7).click(); // index 7 = value 7
  }
}

/**
 * Complete the full EmojiGrid interaction (click center of grid).
 */
async function fillEmojiGrid(page) {
  const grid = page.locator('#emojiGridCanvas, canvas').first();
  if (await grid.isVisible()) {
    const box = await grid.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
  }
}

/**
 * Fill all STAI-6 items by selecting the first option.
 */
async function fillStai(page) {
  const groups = page.locator('.stai-item:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const firstBtn = groups.nth(i).locator('.stai-btn').first();
    if (await firstBtn.isVisible()) await firstBtn.click();
  }
}

/**
 * Fill the pain slider.
 */
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

/**
 * Complete a full survey form — fills all visible instruments.
 */
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

// ─── identified deployment flow ─────────────────────────────────────────────

async function doIdentifiedPreSession(page, firstName, lastName, deployment) {
  await page.goto(deploymentUrl(deployment));
  await page.waitForLoadState('networkidle');

  // Enter name and click Continue
  await page.fill('#firstName', firstName);
  await page.fill('#lastName', lastName);
  await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
  await page.locator('#nameContinueBtn').click();
  await page.waitForTimeout(1500);

  // New participant: check both consent checkboxes then click Continue to Survey
  const consentBtn = page.locator('#consentBtn');
  if (await consentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator('#ageCheck').check();
    await page.locator('#consentCheck').check();
    await page.waitForFunction(() => !document.getElementById('consentBtn').disabled, null, { timeout: 3000 });
    await consentBtn.click();
  }

  // Set demographics if visible
  const ageField = page.locator('#participantAge');
  if (await ageField.isVisible({ timeout: 2000 }).catch(() => false)) {
    await ageField.fill('32');
    await page.locator('#participantSex').selectOption('male');
  }

  // Select pre timing if not already selected
  const preBtn = page.locator('.timing-btn[data-timing="pre"]');
  if (await preBtn.isVisible()) await preBtn.click();

  // Select a protocol
  const protocolInput = page.locator('#protocol');
  await protocolInput.fill('Deep');
  await page.waitForTimeout(500);
  const firstSuggestion = page.locator('.protocol-list .protocol-option').first();
  if (await firstSuggestion.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstSuggestion.click();
  } else {
    await protocolInput.fill('Deep Rest');
  }

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
  await page.waitForTimeout(2000);

  // Should land on post-session after lookup
  await fillSurveyForm(page);
  return submitAndCapture(page);
}

/**
 * Click submit and wait for success screen. Returns the session ID from the URL/storage.
 */
async function submitAndCapture(page) {
  const submitBtn = page.locator('#submitBtn, button:has-text("Submit")').first();
  await expect(submitBtn).toBeEnabled({ timeout: 5000 });
  await submitBtn.click();

  // Wait for success screen or amber offline screen
  await page.waitForSelector('.success-screen, .offline-success, #successScreen, [class*="success"]', {
    timeout: 15000
  });

  // Capture session ID from sessionStorage
  const sessionId = await page.evaluate(() =>
    sessionStorage.getItem('sfi_session_id') ||
    sessionStorage.getItem('sfi_session_url')
  );
  return sessionId;
}

// ─── anonymous deployment flow ───────────────────────────────────────────────

async function doAnonymousPreSession(page, deployment) {
  await page.goto(deploymentUrl(deployment));
  await page.waitForLoadState('networkidle');

  // In anon mode the name/consent section is skipped entirely.
  // Wait for the survey body to appear (timing buttons or first VAS item visible).
  await page.waitForSelector('.timing-btn, .vas-item', { timeout: 10000 });

  // Select pre timing if shown
  const preBtn = page.locator('.timing-btn[data-timing="pre"]');
  if (await preBtn.isVisible({ timeout: 2000 }).catch(() => false)) await preBtn.click();

  await fillSurveyForm(page);
  return submitAndCapture(page);
}

// ─── assertion helpers ───────────────────────────────────────────────────────

/**
 * Assert that all VAS fields in the row are integers (not strings).
 */
function assertVasTypes(row, fields) {
  for (const field of fields) {
    const val = row[field] ?? (row.addons && JSON.parse(row.addons || '{}')[field]);
    if (val !== undefined && val !== null) {
      expect(typeof val, `${field} should be a number, got ${typeof val}`).toBe('number');
    }
  }
}

/**
 * Assert that a pre/post pair share the same session_id.
 */
function assertPairedSession(preRow, postRow) {
  expect(preRow.session_id).toBe(postRow.session_id);
}

// ─── tests ───────────────────────────────────────────────────────────────────

test.describe('Config loads', () => {
  // Note: deployment key must match the config filename (hyphens not underscores for womens-health-month)
  for (const deployment of ['caa', 'spirit', 'mclaren', 'lafd', 'randi', 'suzanne', 'womens-health-month']) {
    test(`${deployment} — config loads without error`, async ({ page }) => {
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(deploymentUrl(deployment));
      await page.waitForLoadState('networkidle');

      // Config load error shows a hard stop screen
      const errorScreen = page.locator('[class*="config-error"], #configError, :text("Failed to load")');
      await expect(errorScreen).not.toBeVisible();

      // Display name should appear somewhere on the page
      const displayNames = {
        caa: 'CAA', spirit: 'Washington Spirit', mclaren: 'McLaren',
        lafd: 'LAFD', randi: 'Randi', suzanne: 'Burnout',
        'womens-health-month': "Women"  // partial match avoids apostrophe encoding issues
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
    const firstName = 'SFI';
    const lastName = 'TestUser';

    // Pre-session
    const sessionId = await doIdentifiedPreSession(page, firstName, lastName, deployment);
    await page.waitForTimeout(1000);

    // Post-session (same page, timing auto-locked to post)
    await fillSurveyForm(page);
    await page.locator('#submitBtn, button:has-text("Submit")').first().click();
    await page.waitForSelector('.success-screen, #successScreen, [class*="success"]', { timeout: 15000 });

    // Supabase check
    if (SUPABASE_URL && SUPABASE_KEY) {
      await page.waitForTimeout(2000); // allow server round-trip
      const rows = await fetchSupabaseRows(deployment, 'P-001'); // adjust if your test participant gets a different ID
      if (rows && rows.length >= 2) {
        const preRow  = rows.find(r => r.timing === 'pre');
        const postRow = rows.find(r => r.timing === 'post');

        if (preRow && postRow) {
          assertPairedSession(preRow, postRow);
          // Core VAS fields should be integers
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
    const deployment = 'suzanne';
    await doIdentifiedPreSession(page, 'SFI', 'TestSuzanne', deployment);

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
    // Load fresh session as female participant
    await page.goto(deploymentUrl('randi'));
    await page.waitForLoadState('networkidle');

    await page.fill('#firstName', 'SFI');
    await page.fill('#lastName', 'TestFemale');
    await page.waitForFunction(() => !document.getElementById('nameContinueBtn').disabled, null, { timeout: 5000 });
    await page.locator('#nameContinueBtn').click();
    await page.waitForTimeout(1500);

    const consentBtn = page.locator('#consentBtn');
    if (await consentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.locator('#ageCheck').check();
      await page.locator('#consentCheck').check();
      await page.waitForFunction(() => !document.getElementById('consentBtn').disabled, null, { timeout: 3000 });
      await consentBtn.click();
    }

    // Select female sex
    const sexSelect = page.locator('#participantSex');
    if (await sexSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sexSelect.selectOption('female');
      await page.fill('#participantAge', '35');
    }

    // Female health opt-in should appear — click Skip
    const skipBtn = page.locator('button:has-text("Skip"), [data-value="skip"]');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

    await fillSurveyForm(page);
    await submitAndCapture(page);
    await page.waitForTimeout(500);

    // Now on post-session — hormonal change question should NOT be visible
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
    await page.waitForTimeout(1500);

    const consentBtn = page.locator('#consentBtn');
    if (await consentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.locator('#ageCheck').check();
      await page.locator('#consentCheck').check();
      await page.waitForFunction(() => !document.getElementById('consentBtn').disabled, null, { timeout: 3000 });
      await consentBtn.click();
    }

    if (await page.locator('#participantAge').isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.fill('#participantAge', '28');
      await page.locator('#participantSex').selectOption('male');
    }

    await fillSurveyForm(page);

    // Go offline before submitting
    await context.setOffline(true);
    await page.locator('#submitBtn, button:has-text("Submit")').first().click();

    // Should show amber offline success screen
    await page.waitForSelector('[class*="offline"], [class*="amber"], :text("saved")', { timeout: 10000 });

    // Verify item is in localStorage queue
    const queueLength = await page.evaluate(() => {
      const q = JSON.parse(localStorage.getItem('sfi_submission_queue') || '[]');
      return q.length;
    });
    expect(queueLength).toBeGreaterThan(0);

    // Come back online — queue should flush
    await context.setOffline(false);
    await page.waitForTimeout(5000); // allow flush + retry throttle

    // Queue should now be empty (if network succeeds)
    const queueAfter = await page.evaluate(() => {
      const q = JSON.parse(localStorage.getItem('sfi_submission_queue') || '[]');
      return q.length;
    });
    expect(queueAfter).toBe(0);
  });
});
