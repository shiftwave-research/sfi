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
npm run qr:plan
npm run qr:plan -- --deployment ukrainian
npm run qr:sync -- --dry-run
```

`qr:list` shows every deployment discovered from `configs/*.json`.

`qr:plan` shows whether each deployment needs a QR code created or an existing QR TIGER redirect updated.

Add `--deployment <name>` to plan or sync a single deployment.

`qr:sync -- --live` is the command that will make QR TIGER API changes. It requires the exact create/update endpoint paths to be configured in `sfi-tooling/.env`:

```sh
QR_TIGER_CREATE_DYNAMIC_PATH=...
QR_TIGER_UPDATE_DYNAMIC_PATH=...
```

The update path may include `{id}`, which is replaced with the deployment's `qrTigerId`.

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

## Build Process

When a new deployment config is added under `configs/`, the QR tooling will pick it up automatically. The normal release checklist should be:

1. Add or update the deployment config.
2. Run `npm run validate`.
3. Run `npm run qr:plan`.
4. Create or update the QR TIGER dynamic QR code.
5. Confirm the GitHub Pages URL returns the deployment.
