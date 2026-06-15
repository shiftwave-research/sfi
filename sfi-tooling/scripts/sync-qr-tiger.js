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
const DEFAULT_LIST_PATH = '/campaign?limit=200&page=1';
const DEFAULT_UPDATE_DYNAMIC_PATH = '/campaign/edit/{id}';

function usage() {
  console.log(`SFI QR TIGER sync

Usage:
  npm run qr:list
  npm run qr:audit
  npm run qr:plan
  npm run qr:sync -- --dry-run
  npm run qr:sync -- --live
  npm run qr:plan -- --deployment ukrainian

Commands:
  list   Show every deployment and its current public SFI URL.
  audit  Compare the manifest with live QR TIGER campaign records.
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

function configuredPath(name, defaultValue = null) {
  const value = process.env[name] || defaultValue;
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

async function listQrTigerCampaigns() {
  const listPath = process.env.QR_TIGER_LIST_PATH || DEFAULT_LIST_PATH;
  const payload = await requestQrTiger('GET', listPath);
  const campaigns = Array.isArray(payload)
    ? payload
    : payload.data || payload.qrCodes || payload.campaigns || payload.records || [];

  if (!Array.isArray(campaigns)) {
    throw new Error('QR TIGER list response did not include an array of campaigns');
  }

  return campaigns;
}

function updatePayload(record) {
  return {
    qrUrl: record.targetUrl
  };
}

function createPayload(record) {
  return {
    qrUrl: record.targetUrl,
    qrName: record.label,
    qrCategory: 'url',
    qrType: 'qr2',
    dynamic: true
  };
}

function extractCreatedRecord(created) {
  const data = created.data || created.qr || created.campaign || created;
  return {
    qrTigerId: data.qrId || data.id || data._id || data.qrTigerId,
    qrTigerShortUrl: data.shortUrl || data.qrTigerShortUrl
  };
}

function printAudit(records, campaigns) {
  const byQrId = new Map(campaigns.map(campaign => [campaign.qrId, campaign]));
  const oldBase = 'https://shiftwave-research.github.io/sfi/shiftwave-field-instrument.html';
  let manifestLegacyMatches = 0;

  for (const record of records) {
    const campaign = record.qrTigerId ? byQrId.get(record.qrTigerId) : null;
    console.log(`${record.deployment}`);
    console.log(`  manifest id: ${record.qrTigerId || '(missing)'}`);
    if (!campaign) {
      console.log('  live QR TIGER: (not found)');
      continue;
    }
    console.log(`  live name: ${campaign.qrName || '(unnamed)'}`);
    console.log(`  short: ${campaign.shortUrl || '(missing)'}`);
    console.log(`  redirect: ${campaign.redirectUrl || '(missing)'}`);
    if (campaign.redirectUrl && campaign.redirectUrl.startsWith(oldBase)) {
      manifestLegacyMatches += 1;
    }
  }

  const allLegacySfi = campaigns.filter(campaign =>
    typeof campaign.redirectUrl === 'string' &&
    campaign.redirectUrl.startsWith(oldBase)
  );

  console.log(`\nLegacy SFI URLs in manifest records: ${manifestLegacyMatches}`);
  console.log(`Legacy SFI URLs in full QR TIGER account page: ${allLegacySfi.length}`);
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
      const updatePath = configuredPath('QR_TIGER_UPDATE_DYNAMIC_PATH', DEFAULT_UPDATE_DYNAMIC_PATH);
      await requestQrTiger('POST', updatePath, updatePayload(record), record.qrTigerId);
      console.log(`updated ${record.deployment}`);
      continue;
    }

    const createPath = configuredPath('QR_TIGER_CREATE_DYNAMIC_PATH');
    const created = await requestQrTiger('POST', createPath, createPayload(record));
    const { qrTigerId, qrTigerShortUrl } = extractCreatedRecord(created);

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

  if (command === 'audit') {
    const campaigns = await listQrTigerCampaigns();
    printAudit(records, campaigns);
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
