#!/usr/bin/env node
/**
 * SFI Config Validator
 * Validates all deployment config files against the JSON Schema,
 * then runs a set of cross-reference checks the schema can't express.
 *
 * Usage:
 *   node scripts/validate-config.js                  # validate all configs/
 *   node scripts/validate-config.js configs/caa.json # validate one file
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const SCHEMA_PATH = path.join(__dirname, '../schemas/config.schema.json');
const CONFIGS_DIR = path.join(__dirname, '../configs');

// Valid insertAfter anchors — must match the IDs in the HTML
const VALID_ANCHORS = new Set([
  'surveyBodyStart',
  'vasItem_bodyTension',
  'vasItem_energy',
  'vasItem_bodyConnection',
  'vasItem_clarity',
  'vasItem_mentalQuiet',
  'vasItem_alertness',
  'emojiGridSection'
]);

// ─── helpers ────────────────────────────────────────────────────────────────

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { error: `Failed to parse JSON: ${e.message}` };
  }
}

function collectFields(questions, fields = []) {
  if (!Array.isArray(questions)) return fields;
  for (const q of questions) {
    if (q.field) fields.push(q.field);
    if (q.type === 'conditional' && q.questions) {
      collectFields(q.questions, fields);
    }
  }
  return fields;
}

// ─── cross-reference checks ─────────────────────────────────────────────────

function crossReferenceChecks(config, errors) {
  const { preset, addons } = config;
  if (!preset || !addons) return; // schema will catch these

  // 1. Every key in preset.addons must exist in addons object
  for (const key of (preset.addons || [])) {
    if (!addons[key]) {
      errors.push(`preset.addons references "${key}" but no matching key exists in addons`);
    }
  }

  // 2. Every key in addons object should be referenced in preset.addons
  //    (warn only — unreferenced addons are silently ignored at runtime)
  const presetKeys = new Set(preset.addons || []);
  for (const key of Object.keys(addons)) {
    if (!presetKeys.has(key)) {
      errors.push(`WARN: addons["${key}"] is defined but not listed in preset.addons — it will be ignored`);
    }
  }

  // 3. Field name uniqueness across all addons
  const allFields = [];
  for (const [key, addon] of Object.entries(addons)) {
    if (!addon.questions) continue;
    const fields = collectFields(addon.questions);
    for (const field of fields) {
      const existing = allFields.find(f => f.field === field);
      if (existing) {
        errors.push(`Duplicate field name "${field}" in addons["${key}"] — already used in addons["${existing.addon}"]`);
      } else {
        allFields.push({ field, addon: key });
      }
    }
  }

  // 4. conditionalTarget references must exist as conditional block IDs
  const conditionalIds = new Set();
  for (const addon of Object.values(addons)) {
    if (!addon.questions) continue;
    for (const q of addon.questions) {
      if (q.type === 'conditional' && q.id) conditionalIds.add(q.id);
    }
  }
  for (const [key, addon] of Object.entries(addons)) {
    if (!addon.questions) continue;
    for (const q of addon.questions) {
      if (q.conditionalTarget && !conditionalIds.has(q.conditionalTarget)) {
        errors.push(`addons["${key}"]: conditionalTarget "${q.conditionalTarget}" does not match any conditional block id`);
      }
    }
  }

  // 5. showIf.field and showIfAnswered.field must reference a field defined elsewhere
  const allFieldNames = new Set(allFields.map(f => f.field));
  for (const [key, addon] of Object.entries(addons)) {
    if (!addon.questions) continue;
    for (const q of addon.questions) {
      if (q.showIf && !allFieldNames.has(q.showIf.field)) {
        errors.push(`addons["${key}"]: showIf references field "${q.showIf.field}" which is not defined in any addon`);
      }
      if (q.showIfAnswered && !allFieldNames.has(q.showIfAnswered.field)) {
        // Allow core_hormonal_stage — defined in the HTML, not in any config
        if (!['core_hormonal_stage', 'lafdHormonalStage'].includes(q.showIfAnswered.field)) {
          errors.push(`addons["${key}"]: showIfAnswered references field "${q.showIfAnswered.field}" which is not defined in any addon`);
        }
      }
    }
  }

  // 6. skipIfReturning requires blockId and conditionalTarget
  for (const [key, addon] of Object.entries(addons)) {
    if (!addon.questions) continue;
    for (const q of addon.questions) {
      if (q.skipIfReturning) {
        if (!q.blockId) {
          errors.push(`addons["${key}"]: skipIfReturning:true requires blockId to be set`);
        }
        if (!q.conditionalTarget) {
          errors.push(`addons["${key}"]: skipIfReturning:true requires conditionalTarget to be set`);
        }
      }
    }
  }

  // 7. studyTag format (schema handles pattern, but confirm not accidentally camelCase)
  if (preset.studyTag && /[A-Z]/.test(preset.studyTag)) {
    errors.push(`WARN: studyTag "${preset.studyTag}" contains uppercase — use snake_case for consistency with other deployments`);
  }
}

// ─── main ───────────────────────────────────────────────────────────────────

function validateFile(filePath, ajv, validate) {
  const fileName = path.basename(filePath);
  const results = { file: fileName, errors: [], warnings: [] };

  const config = loadJSON(filePath);
  if (config.error) {
    results.errors.push(config.error);
    return results;
  }

  // Skip _notes and other comment keys for schema validation
  const cleanConfig = Object.fromEntries(
    Object.entries(config).filter(([k]) => !k.startsWith('_'))
  );

  // JSON Schema validation
  const valid = validate(cleanConfig);
  if (!valid) {
    for (const err of validate.errors) {
      results.errors.push(`${err.instancePath || '(root)'}: ${err.message}`);
    }
  }

  // Cross-reference checks
  const crossErrors = [];
  crossReferenceChecks(cleanConfig, crossErrors);
  for (const e of crossErrors) {
    if (e.startsWith('WARN:')) {
      results.warnings.push(e.replace('WARN: ', ''));
    } else {
      results.errors.push(e);
    }
  }

  return results;
}

function main() {
  const schema = loadJSON(SCHEMA_PATH);
  if (schema.error) {
    console.error(`Cannot load schema: ${schema.error}`);
    process.exit(1);
  }

  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  // Determine which files to validate
  let files = process.argv.slice(2);
  if (files.length === 0) {
    files = fs.readdirSync(CONFIGS_DIR)
      .filter(f => f.endsWith('.json') && f !== 'README.md')
      .map(f => path.join(CONFIGS_DIR, f));
  }

  let hasErrors = false;
  for (const file of files) {
    const result = validateFile(file, ajv, validate);
    const hasIssues = result.errors.length > 0 || result.warnings.length > 0;

    if (!hasIssues) {
      console.log(`✓  ${result.file}`);
    } else {
      if (result.errors.length > 0) {
        hasErrors = true;
        console.log(`✗  ${result.file}`);
        for (const e of result.errors) console.log(`   ERROR: ${e}`);
      }
      if (result.warnings.length > 0) {
        if (result.errors.length === 0) console.log(`⚠  ${result.file}`);
        for (const w of result.warnings) console.log(`   WARN:  ${w}`);
      }
    }
  }

  if (hasErrors) {
    console.log('\nValidation failed.');
    process.exit(1);
  } else {
    console.log('\nAll configs valid.');
  }
}

main();
