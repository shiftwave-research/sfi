#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const ROOT_DIR = path.join(__dirname, '../..');
const CONFIGS_DIR = path.join(ROOT_DIR, 'configs');
const MANIFEST_PATH = path.join(__dirname, '../qr-tiger.manifest.json');
const DEFAULT_BASE_URL = 'https://cofactorsystems.github.io/shiftwave-field-instrument/shiftwave-field-instrument.html';
const DEFAULT_API_BASE_URL = 'https://api.qrtiger.com/api';

function usage() {
  console.log(`SFI QR TIGER sync

Usage:
  npm run qr:list
  npm run qr:plan
  npm run qr:sync -- --dry-run
  npm run qr:sync -- --live
  npm run qr:plan -- --deployment ukrainian

Commands:
  list   Show every deployment and its current public SFI URL.
  plan   Show which QR TIGER records are missing or need redirect updates.
  sync   Create/update QR TIGER records. Defaults to dry-run unless --live is passed.

Manifest:
  sfi-tooling/qr-tiger.manifest.json keeps stable QR TIGER IDs per deployment.
  Add qrTigerId values there for existing QR codes before redirecting old codes.
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function deploymentNamesFromConfigs() {
  return fs.readdirSync(CONFIGS_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => path.basename(file, '.json'))
    .sort((a, b) => a.localeCompare(b));
}

function loadManifest() {
  const manifest = fs.existsSync(MANIFEST_PATH)
    ? readJson(MANIFEST_PATH)
    : {};

  manifest.baseSfiUrl = manifest.baseSfiUrl || DEFAULT_BASE_URL;
  manifest.legacyBaseSfiUrl = manifest.legacyBaseSfiUrl || '';
  manifest.deployments = manifest.deployments || {};

  for (const deployment of deploymentNamesFromConfigs()) {
    manifest.deployments[deployment] = manifest.deployments[deployment] || {};
  }

  return manifest;
}

function deploymentUrl(baseUrl, deployment) {
  const url = new URL(baseUrl);
  url.searchParams.set('deployment', deployment);
  return url.toString();
}

function buildRecords(manifest) {
  return Object.entries(manifest.deployments)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([deployment, record]) => ({
      deployment,
      qrTigerId: record.qrTigerId || null,
      qrTigerShortUrl: record.qrTigerShortUrl || null,
      label: record.label || `SFI - ${deployment}`,
      targetUrl: deploymentUrl(manifest.baseSfiUrl, deployment),
      legacyUrl: manifest.legacyBaseSfiUrl
        ? deploymentUrl(manifest.legacyBaseSfiUrl, deployment)
        : null,
      archived: Boolean(record.archived)
    }));
}

function actionFor(record) {
  if (record.archived) return 'skip archived deployment';
  if (!record.qrTigerId) return 'create dynamic QR code';
  return 'update QR redirect target';
}

function printRecords(records, includeActions = false) {
  for (const record of records) {
    console.log(`${record.deployment}`);
    console.log(`  target: ${record.targetUrl}`);
    if (record.legacyUrl) console.log(`  legacy: ${record.legacyUrl}`);
    console.log(`  qrTigerId: ${record.qrTigerId || '(missing)'}`);
    if (record.qrTigerShortUrl) console.log(`  qrTigerShortUrl: ${record.qrTigerShortUrl}`);
    if (includeActions) console.log(`  action: ${actionFor(record)}`);
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for live QR TIGER sync`);
  }
  return value;
}

function configuredPath(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured. Confirm the QR TIGER endpoint path before running live sync.`);
  }
  return value;
}

function apiUrl(pathTemplate, id) {
  const baseUrl = (process.env.QR_TIGER_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const resolvedPath = pathTemplate.replace('{id}', encodeURIComponent(id || ''));
  return `${baseUrl}/${resolvedPath.replace(/^\//, '')}`;
}

async function requestQrTiger(method, pathTemplate, body, id) {
  const apiKey = requireEnv('QR_TIGER_API_KEY');
  const response = await fetch(apiUrl(pathTemplate, id), {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(`QR TIGER ${method} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload || {};
}

function qrPayload(record) {
  return {
    name: record.label,
    qrUrl: record.targetUrl,
    type: 'url',
    dynamic: true
  };
}

async function sync(records, manifest, live) {
  if (!live) {
    printRecords(records, true);
    console.log('\nDry run only. Add --live to create/update QR TIGER records.');
    return;
  }

  for (const record of records) {
    if (record.archived) continue;

    if (record.qrTigerId) {
      const updatePath = configuredPath('QR_TIGER_UPDATE_DYNAMIC_PATH');
      await requestQrTiger('PATCH', updatePath, qrPayload(record), record.qrTigerId);
      console.log(`updated ${record.deployment}`);
      continue;
    }

    const createPath = configuredPath('QR_TIGER_CREATE_DYNAMIC_PATH');
    const created = await requestQrTiger('POST', createPath, qrPayload(record));
    const qrTigerId = created.id || created.qrTigerId || created.data?.id || created.data?.qrTigerId;
    const qrTigerShortUrl = created.shortUrl || created.qrTigerShortUrl || created.data?.shortUrl || created.data?.qrTigerShortUrl;

    if (!qrTigerId) {
      throw new Error(`QR TIGER create response for ${record.deployment} did not include an id`);
    }

    manifest.deployments[record.deployment].qrTigerId = qrTigerId;
    if (qrTigerShortUrl) {
      manifest.deployments[record.deployment].qrTigerShortUrl = qrTigerShortUrl;
    }
    console.log(`created ${record.deployment}`);
  }

  writeJson(MANIFEST_PATH, manifest);
}

function optionValue(args, name) {
  const equalsArg = args.find(arg => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1];

  return null;
}

async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  const live = args.includes('--live');
  const deployment = optionValue(args, '--deployment');
  const manifest = loadManifest();
  let records = buildRecords(manifest);

  if (deployment) {
    records = records.filter(record => record.deployment === deployment);
    if (records.length === 0) {
      throw new Error(`Unknown deployment: ${deployment}`);
    }
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'list') {
    printRecords(records);
    return;
  }

  if (command === 'plan') {
    printRecords(records, true);
    return;
  }

  if (command === 'sync') {
    await sync(records, manifest, live);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
