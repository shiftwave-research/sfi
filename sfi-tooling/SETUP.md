# SFI Tooling — Setup & Implementation Guide

How to set up config validation, end-to-end testing, and a sane Git workflow for the Shiftwave Field Instrument.

---

## Repo & Branch Strategy

**The problem with multiple HTML files in one branch:**
`sfi-v4.html`, `sfi-v5.html`, and `shiftwave-field-instrument.html` in the same branch creates ambiguity about what's current, and caused the v4/v5 baseline merge bug that dropped `staiScore`. The right model is one canonical filename on two branches.

### Target structure

```
main branch   →  shiftwave-field-instrument.html   ← live, participant-facing
dev branch    →  shiftwave-field-instrument.html   ← staging
configs/      →  same on both branches             ← configs deploy from whichever branch serves
```

**GitHub Pages serves from one branch at a time.** You can set this in Settings → Pages. The recommended approach is:

- `main` → serves `https://shiftwave-research.github.io/sfi/` (live URL you give participants)
- `dev` → use raw GitHub URL for testing: `https://raw.githack.com/shiftwave-research/sfi/dev/shiftwave-field-instrument.html?deployment=NAME`
  - Or set up a second GitHub Pages site from the dev branch under a different path

**Clean-up steps:**
1. Delete `sfi-v4.html` and `sfi-v5.html` from the `main` branch
2. Create a `dev` branch from main: `git checkout -b dev`
3. All new work happens on `dev`; merge to `main` only when verified

### Day-to-day workflow

```bash
# Start new work
git checkout dev
git pull origin dev

# Make changes, test locally
# ...

# Validate configs before committing
npm run validate

# Commit to dev
git add -A
git commit -m "describe what changed"
git push origin dev

# Test against the dev URL with real Supabase
# When verified:
git checkout main
git merge dev
git push origin main
```

---

## Tooling Directory Structure

Place the `sfi-tooling/` folder at the root of your repo (alongside `configs/` and `shiftwave-field-instrument.html`):

```
sfi/
├── shiftwave-field-instrument.html    ← one canonical file
├── configs/
│   ├── caa.json
│   ├── spirit.json
│   ├── lafd.json
│   ├── mclaren.json
│   ├── randi.json
│   ├── suzanne.json
│   ├── womens_health_month.json
│   └── README.md
└── sfi-tooling/
    ├── package.json
    ├── playwright.config.js
    ├── .env.example
    ├── .gitignore
    ├── schemas/
    │   └── config.schema.json
    ├── scripts/
    │   └── validate-config.js
    └── tests/
        └── sfi.spec.js
```

---

## Setup

### 1. Install Node.js (if not already installed)

```bash
# Check if you have it
node --version   # needs v18+

# If not, install via nvm (recommended):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
```

### 2. Install dependencies

```bash
cd sfi-tooling
npm install
npx playwright install chromium   # installs the test browser
```

### 3. Set up credentials

```bash
cp .env.example .env
# Then edit .env with your real Supabase anon key
```

The `.env` file is gitignored — never committed.

---

## Config Validation

### What it checks

**JSON Schema (structural):**
- All required fields present (`insertAfter`, `timing`, `questions`, etc.)
- Valid `insertAfter` values — catches typos before they become silent runtime failures
- Question types match their required fields (e.g. `vas` requires `labelLow`/`labelHigh`)
- `field` names are valid identifiers (no spaces, no starting with a number)
- Option lists have at least 2 items

**Cross-reference checks (semantic):**
- Every key in `preset.addons` has a matching entry in `addons` object
- No duplicate `field` names across addons in the same config
- `conditionalTarget` references resolve to a real `conditional` block `id`
- `showIf.field` and `showIfAnswered.field` reference a field that exists
- `skipIfReturning: true` always has `blockId` and `conditionalTarget`
- `studyTag` is snake_case

### Usage

```bash
# Validate all configs
cd sfi-tooling
npm run validate

# Validate a single config
node scripts/validate-config.js ../configs/suzanne.json

# Example output:
✓  caa.json
✓  spirit.json
✗  suzanne.json
   ERROR: addons["szTension"].insertAfter: must be equal to one of the allowed values
⚠  mclaren.json
   WARN:  studyTag "McLarenRacing" contains uppercase — use snake_case

Validation failed.
```

### When to run it

- **Always before committing a new or edited config** — add it to your commit habit, or use the precommit hook below

### Optional: Git precommit hook

This runs validation automatically every time you `git commit`, blocking bad configs from entering the repo.

```bash
# From the repo root:
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
cd sfi-tooling && node scripts/validate-config.js
if [ $? -ne 0 ]; then
  echo "Config validation failed. Fix errors before committing."
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
```

---

## End-to-End Tests

### What they test

| Test | What it verifies |
|------|-----------------|
| Config loads | Every deployment's config loads without error; no JS console errors; display name visible |
| Submission integrity | Pre/post pair shares `session_id`; core VAS fields arrive as integers not strings |
| Addon field types | Addon VAS fields (e.g. Suzanne tension battery) are integers, not strings |
| Female health block | Hormonal stage doesn't bleed into post-session when skipped on pre |
| Offline queue | Submission queues when offline; flushes on reconnect; localStorage cleared |
| Anonymous mode | LAFD submissions get ANON- participant IDs |

### Usage

```bash
cd sfi-tooling

# Run all tests (headless)
npm test

# Watch the browser (useful for debugging)
npm run test:headed

# Run just the fast smoke tests (config load checks)
npm run test:configs

# Run submission integrity tests only
npm run test:submit

# Run offline test only
npm run test:offline

# View the HTML report after a run
npx playwright show-report
```

### Running against dev vs production

By default tests run against your production URL. To test against a dev build:

```bash
# Edit .env:
SFI_BASE_URL=https://raw.githack.com/shiftwave-research/sfi/dev
# or your local server:
SFI_BASE_URL=http://localhost:8080
```

Or override inline:

```bash
SFI_BASE_URL=http://localhost:8080 npm test
```

### Serving locally for fast testing

```bash
# From the repo root, serve the whole repo:
npx serve .
# Then set SFI_BASE_URL=http://localhost:3000 in .env
```

### Test data cleanup

Tests use the name "SFI TestUser" / "SFI TestSuzanne" / "SFI TestFemale" as participant names. After running tests, clean these from Supabase if needed:

```sql
-- Run in Supabase SQL editor
DELETE FROM sessions
WHERE participant_id IN (
  SELECT participant_id FROM participant_keys
  WHERE first_name = 'SFI' AND last_name LIKE 'Test%'
);
DELETE FROM participant_keys WHERE first_name = 'SFI' AND last_name LIKE 'Test%';
```

---

## How the Schema Informs Future Config Writing

The `config.schema.json` file is the authoritative spec for what configs can contain. Keep it open when writing new configs — it's also what Claude uses when helping you build a new deployment config, so keeping it current means fewer rounds of correction.

**When you add a new question type to the HTML**, update the schema:
1. Add the new type to the `enum` in `question.properties.type`
2. Add a new `allOf` branch defining its required and optional fields
3. Run `npm run validate` against all existing configs to confirm nothing broke

---

## Recommended Pre-Deployment Checklist

Before merging `dev` → `main` for any change:

- [ ] `npm run validate` passes with no errors
- [ ] `npm run test:configs` passes (all deployments load)
- [ ] Manual test submission for the affected deployment — check Supabase row
- [ ] VAS fields are integers (not strings) in the Supabase row
- [ ] session_id pairs correctly between pre and post
- [ ] Female health block behavior correct if any female logic was touched
- [ ] Offline submission queues and flushes correctly if offline logic was touched
