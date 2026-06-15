# QR TIGER Deployment QR Codes

SFI deployments are public URLs served from the company GitHub Pages site:

`https://cofactorsystems.github.io/shiftwave-field-instrument/shiftwave-field-instrument.html?deployment=<deployment-name>`

QR TIGER should hold one dynamic QR code per deployment. The dynamic QR code can keep the same printed/scanned QR image while the redirect target changes.

## Local Setup

Store the QR TIGER API key in `sfi-tooling/.env`:

```sh
QR_TIGER_API_KEY=...
```

Do not commit `sfi-tooling/.env`. The repository includes `sfi-tooling/.env.example` for the expected variable names.

## Commands

Run these from `sfi-tooling/`:

```sh
npm run qr:list
npm run qr:audit
npm run qr:plan
npm run qr:plan -- --deployment ukrainian
npm run qr:sync -- --dry-run
```

`qr:list` shows every deployment discovered from `configs/*.json`.

`qr:audit` checks the manifest against live QR TIGER campaign records and reports any remaining legacy SFI redirects from the personal GitHub Pages URL.

`qr:plan` shows whether each deployment needs a QR code created or an existing QR TIGER redirect updated.

Add `--deployment <name>` to plan or sync a single deployment.

`qr:sync -- --live` is the command that will make QR TIGER API changes. Existing dynamic QR code updates use the verified QR TIGER campaign edit endpoint:

```sh
QR_TIGER_UPDATE_DYNAMIC_PATH=...
```

The default update path is `/campaign/edit/{id}`. The sync script sends `qrUrl` to that endpoint, replacing `{id}` with the deployment's `qrTigerId`.

Creating brand-new dynamic QR codes is intentionally guarded behind `QR_TIGER_CREATE_DYNAMIC_PATH`. QR TIGER's dashboard exposes `/qrcodes/qr2`, but that route appears to generate QR images/previews; confirm the dynamic campaign save endpoint with a deliberate test code before enabling automatic live creation.

## Existing QR Migration

Older printed QR codes from the personal repository should not be recreated. They should be redirected in QR TIGER from the legacy URL:

`https://shiftwave-research.github.io/sfi/shiftwave-field-instrument.html?deployment=<deployment-name>`

to the company URL:

`https://cofactorsystems.github.io/shiftwave-field-instrument/shiftwave-field-instrument.html?deployment=<deployment-name>`

To migrate an existing code, add its QR TIGER record ID to `sfi-tooling/qr-tiger.manifest.json`:

```json
{
  "deployments": {
    "ukrainian": {
      "qrTigerId": "..."
    }
  }
}
```

Then run `npm run qr:plan` to confirm the target before running a live sync.

As of the company migration, these existing QR TIGER short links are registered in the manifest:

| Deployment | QR TIGER short link |
| --- | --- |
| `banner_health_leadership_matters_event_2026` | `https://qr1.be/EUKQWA` |
| `caa` | `https://qr1.be/XKMW1Y` |
| `lafd` | `https://qr1.be/11ZAPM` |
| `nflpa-longitudinal` | `https://qr1.be/7B1ETR` |
| `orthohealing-anonymous` | `https://qr1.be/5CNF94` |
| `orthohealing-longitudinal` | `https://qr1.be/062MOI` |

## Build Process

When a new deployment config is added under `configs/`, the QR tooling will pick it up automatically. The normal release checklist should be:

1. Add or update the deployment config.
2. Run `npm run validate`.
3. Run `npm run qr:plan`.
4. Create or update the QR TIGER dynamic QR code.
5. Confirm the GitHub Pages URL returns the deployment.
