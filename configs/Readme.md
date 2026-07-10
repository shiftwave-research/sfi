# SFI Deployment Guide
**`configs/` — one JSON file per deployment**

This folder contains all deployment configuration files for the Shiftwave Field Instrument. Each file controls which questions appear, how the survey is labelled, and whether the deployment uses anonymous or identified mode. The HTML is never edited directly.

---

---

## What You Can and Cannot Do

The SFI is a single HTML file that serves all deployments. You **never edit the HTML**. Everything you control lives in a JSON config file that you create and commit to the GitHub repository.

**You control:**
- Which addon question blocks appear in your deployment
- The display name shown in the survey header
- Whether the deployment uses anonymous (QR) or identified (name lookup) mode
- Whether the core female health block is suppressed
- A study tag for data filtering in Supabase
- The content, order, and timing of every addon question

**You cannot control:**
- The core SSS items (body tension, energy, body connection, clarity, mental quiet, alertness)
- The STAI-6 anxiety scale
- The EmojiGrid affect grid
- The pain scale
- The open comment field
- The consent flow
- The submission pipeline or Supabase backend

If you need a new question type, a new `insertAfter` anchor, or changes to the core survey flow, that requires Wyatt to modify the HTML directly.

---

## File Location and Naming

Config files live in the `configs/` directory of the GitHub repository:

```
CofactorSystems/shiftwave-field-instrument
├── shiftwave-field-instrument.html   ← production HTML (never edit)
└── configs/
    ├── caa.json
    ├── spirit.json
    ├── mclaren.json
    ├── lafd.json
    ├── randi.json
    └── your_deployment.json          ← you create this
```

**Naming convention:** lowercase, hyphens or underscores for spaces, no special characters. The filename (without `.json`) becomes your deployment URL parameter.

---

## Deployment URL

**Production (live deployments):**
```
https://cofactorsystems.github.io/shiftwave-field-instrument/shiftwave-field-instrument.html?deployment=your_deployment
```

**Development/testing:**
```
Use a local server or branch preview before merging to `main`.
```

Where `your_deployment` matches your config filename without `.json`. For example: `configs/spirit.json` → `?deployment=spirit`.

---

## JSON File Structure

Every config file has exactly two top-level keys:

```json
{
  "preset": {
    "displayName": "Your Deployment Name",
    "studyTag": "optional_tag_for_data_filtering",
    "anonymousMode": false,
    "suppressFemaleHealthBlock": false,
    "defaultProtocol": null,
    "addons": ["addonKey1", "addonKey2"]
  },
  "addons": {
    "addonKey1": { ... },
    "addonKey2": { ... }
  }
}
```

The `preset.addons` array lists which addon blocks to inject and in what order. The `addons` object defines what those blocks actually contain.

---

## Preset Fields

| Field | Type | Description |
|---|---|---|
| `displayName` | string | Shown in the survey header. |
| `studyTag` | string or null | Included in every submission for easy data filtering. Use snake_case. |
| `anonymousMode` | boolean | `true` = QR/kiosk mode — no name entry, ANON-ID assigned automatically. `false` (default) = identified mode with name lookup. |
| `suppressFemaleHealthBlock` | boolean | `true` = removes the core female hormonal health block entirely. Default `false`. |
| `defaultProtocol` | string or null | Pre-fills the protocol field. Useful for single-protocol deployments. |
| `addons` | array | Ordered list of addon keys to inject. Must match entries in your `addons` object. |

**Minimal deployment — core SSS only, no addons:**
```json
{
  "preset": {
    "displayName": "Acme Corp",
    "studyTag": "acme_2026",
    "addons": []
  },
  "addons": {}
}
```

---

## Anonymous vs. Identified Mode

**Identified mode** (`anonymousMode: false`, default): Participants enter their first and last name. The system looks them up in the Supabase `participant_keys` table. Returning participants are recognised and skip consent. Their age and sex are on file from their first visit. Used for ongoing, multi-session deployments (CAA, McLaren, Spirit).

**Anonymous mode** (`anonymousMode: true`): No name entry. Each QR scan generates a fresh `ANON-XXXXXX` ID. Consent is shown every time. Used for one-off events or deployments where participant privacy must be complete (LAFD, Women's Health Month). The offline queue is especially important here — if a submission is lost there is no recovery path.

In anonymous mode, `sex` is not captured in the setup section. If you need demographic data, add the relevant questions as addon items.

---

## What's Baked Into Every Deployment

The following appear in every deployment regardless of your config. You cannot remove or reorder them.

**Both timings:**
- Body Tension VAS
- Energy VAS
- Body Connection VAS
- Mental Clarity VAS
- Mental Quiet VAS
- Alertness VAS
- STAI-6 (6-item anxiety scale)
- EmojiGrid (affect grid)
- Pain scale
- Open comment field

**Pre-session only (identified mode, new participants):**
- First name / last name entry
- Age and sex fields
- Consent gate

**Core female health block:**
- Triggered automatically when a participant selects `Female` for sex (identified mode), or for returning female participants on every visit
- Entirely optional — participants can skip the whole block
- Pre-session: hormonal life stage → cycle phase (conditional) → symptom severity (conditional)
- Post-session: symptom change question (only shown if pre hormonal stage was answered and not "prefer not to say")
- Suppress with `"suppressFemaleHealthBlock": true` if not appropriate for your deployment

---

## Addon Question Types

### `sectionHeader`
A bold section label. No data collected.
```json
{ "type": "sectionHeader", "label": "Role & Background" }
```

### `sectionDescription`
Small explanatory text below a header. Supports inline HTML. No data collected.
```json
{ "type": "sectionDescription", "html": "Rate each item from 1–5.<br><span style=\"color:#888\">1 = Strongly disagree — 5 = Strongly agree</span>" }
```

### `vas`
A 0–100 visual analogue scale slider. Requires participant interaction to register a value (the default center position is not captured).
```json
{
  "type": "vas",
  "field": "mySoreness",
  "question": "How sore does your body feel right now?",
  "labelLow": "No soreness",
  "labelHigh": "Extreme soreness"
}
```

### `singleSelect`
Full-width stacked option buttons. One selection allowed.
```json
{
  "type": "singleSelect",
  "field": "myRole",
  "question": "What is your role?",
  "options": [
    { "value": "engineer", "label": "Engineer" },
    { "value": "other",    "label": "Other" }
  ]
}
```

### `multiSelect`
Same as singleSelect but allows multiple selections. Values stored pipe-separated (e.g. `"morning|lunch|after_work"`).
```json
{
  "type": "multiSelect",
  "field": "myTimes",
  "question": "When do you typically use Shiftwave?",
  "hint": "Select all that apply",
  "options": [ ... ]
}
```

Use `exclusiveValue` (single) or `exclusiveValues` (array) to make certain options mutually exclusive with all others:
```json
"exclusiveValue": "no_pattern"
"exclusiveValues": ["not_applicable", "not_sure"]
```

### `likert5`
Five-button 1–5 scale. Used for agreement statements.
```json
{ "type": "likert5", "field": "myAccept1", "question": "I enjoyed this session" }
```

### `nps`
0–10 numerical rating scale for likelihood, readiness, or NPS questions.
```json
{
  "type": "nps",
  "field": "myLikelihood",
  "question": "How likely are you to use Shiftwave again?",
  "labelLow": "Not at all likely",
  "labelHigh": "Extremely likely"
}
```

### `conditional`
A hidden wrapper block revealed when a `singleSelect` with a matching `conditionalTarget` receives any response. Used for returning-participant follow-up questions. Contains its own `questions` array.
```json
{
  "type": "conditional",
  "id": "myConditionalBlock",
  "questions": [
    { "type": "multiSelect", "field": "myFollowUp", ... }
  ]
}
```
The triggering singleSelect must reference this block with `conditionalTarget`:
```json
{
  "type": "singleSelect",
  "field": "myUsageCount",
  "conditionalTarget": "myConditionalBlock",
  ...
}
```

---

## Conditional Visibility

### `showIf`
Shows a question only when another field holds a specific value (or one of several values). Hidden again — and cleared — if the condition goes false.
```json
{
  "type": "singleSelect",
  "field": "myCyclePhase",
  "question": "Where are you in your cycle?",
  "showIf": { "field": "myHormonalStage", "value": ["regular_cycles", "perimenopause"] },
  "options": [ ... ]
}
```

### `showIfAnswered`
Shows a question when another field has been answered AND the answer is not in an exclusion list. Used for post-session follow-ups that depend on a pre-session answer.
```json
{
  "type": "singleSelect",
  "field": "myAttribution",
  "question": "Did your symptoms change during the session?",
  "showIfAnswered": { "field": "myHormonalStage", "exclude": ["prefer_not"] },
  "options": [ ... ]
}
```

Cross-timing `showIfAnswered` (pre answer driving a post question) is handled automatically for the core female health block. For custom addon fields, contact Wyatt — it requires additional sessionStorage logic.

---

## `insertAfter` — Where Your Block Appears

Each addon block specifies where it injects using `insertAfter`. This must be one of the fixed SSS anchor IDs. **You cannot reference another addon's ID.**

| `insertAfter` value | Position |
|---|---|
| `surveyBodyStart` | Very top of the survey body — before all VAS items |
| `vasItem_bodyTension` | After Body Tension |
| `vasItem_energy` | After Energy |
| `vasItem_bodyConnection` | After Body Connection |
| `vasItem_clarity` | After Mental Clarity |
| `vasItem_mentalQuiet` | After Mental Quiet |
| `vasItem_alertness` | After Alertness, before STAI-6 |
| `emojiGridSection` | After EmojiGrid, before the open comment — recommended for post-session acceptance and experience questions |

If two addons share the same `insertAfter`, they appear in the order listed in `preset.addons`.

---

## Timing

| Value | When shown |
|---|---|
| `"pre"` | Pre-session only |
| `"post"` | Post-session only |
| `"both"` | Both timings |

```json
{
  "insertAfter": "vasItem_bodyConnection",
  "timing": "both",
  "questions": [ ... ]
}
```

---

## Required Fields

All questions are required by default. The survey will not submit until all required fields are answered.

**Mark a question optional:**
```json
{ "type": "singleSelect", "field": "myOptionalQ", "required": false, ... }
```

**Provide an explicit required list** (overrides auto-detection):
```json
{
  "required": { "pre": ["field1", "field2"], "post": ["field3"] }
}
```

Questions inside hidden `showIf` or `showIfAnswered` wrappers are automatically excluded from required field checking.

---

## Returning Participant Logic (Identified Mode Only)

Flag a question to be skipped for participants who have prior sessions:

```json
{
  "type": "singleSelect",
  "field": "usageCount",
  "blockId": "usageCountBlock",
  "skipIfReturning": true,
  "conditionalTarget": "returningConditional",
  ...
}
```

When `skipIfReturning: true`:
- The question block is hidden for returning participants
- Its `conditionalTarget` block is automatically revealed (so follow-up questions still appear)
- The field is removed from the required list

`blockId` must be set — it becomes the DOM element ID for the rendered block, which the system uses to show/hide it.

---

## Complete Example

```json
{
  "preset": {
    "displayName": "Peak Performance Gym",
    "studyTag": "peak_gym_2026",
    "addons": ["gymPre", "gymPost"]
  },
  "addons": {
    "gymPre": {
      "insertAfter": "surveyBodyStart",
      "timing": "pre",
      "questions": [
        { "type": "sectionHeader", "label": "Today's Session" },
        {
          "type": "singleSelect",
          "field": "gymSessionType",
          "question": "What type of training did you just complete?",
          "options": [
            { "value": "strength",  "label": "Strength training" },
            { "value": "cardio",    "label": "Cardio" },
            { "value": "hiit",      "label": "HIIT" },
            { "value": "mobility",  "label": "Mobility / stretching" },
            { "value": "other",     "label": "Other" }
          ]
        },
        {
          "type": "vas",
          "field": "gymSoreness",
          "question": "How sore does your body feel right now?",
          "labelLow": "No soreness",
          "labelHigh": "Extreme soreness"
        }
      ]
    },
    "gymPost": {
      "insertAfter": "emojiGridSection",
      "timing": "post",
      "questions": [
        { "type": "sectionHeader", "label": "Recovery" },
        {
          "type": "nps",
          "field": "gymUseAgain",
          "question": "How likely are you to use Shiftwave again after training?",
          "labelLow": "Not at all likely",
          "labelHigh": "Extremely likely"
        }
      ]
    }
  }
}
```

---

## How to Add Your Deployment

1. Create your JSON file following the structure above
2. In the GitHub repository, navigate to `configs/`
3. Click **Add file → Create new file**, name it `your_deployment.json`
4. Paste your JSON and commit
5. Test locally or on a branch preview before merging to `main`
6. When confirmed working, notify Wyatt to update the production QR code URL

---

## Data

All responses land in the Supabase `sessions` table. Addon fields are stored as a JSON object in the `addons` column. Your `studyTag` appears in the `study_tag` column for filtering.

Use snake_case field names that are specific enough to avoid collisions across deployments (e.g. `gymSoreness` not just `soreness`). Field names become keys in the `addons` JSON object exactly as you define them.

The `participant_keys` table is PII-restricted. Participant names, ages, and sex live there and are not accessible to most analysts. Everything in `sessions` is keyed to anonymous participant IDs.

---

## What Requires Wyatt

Do not attempt the following without involving Wyatt:

- New question types
- New `insertAfter` anchor points
- Cross-timing `showIfAnswered` for custom addon fields
- PII capture (email, phone)
- Three-timing deployments (pre / during / post)
- Modifications to `shiftwave-field-instrument.html`
- Changes to the Supabase Edge Function or schema
