# Shiftwave Field Instrument (SFI)

A single-page psychophysiological state survey deployed via QR code at Shiftwave client sites. Captures pre- and post-session affect, anxiety, body state, and pain using validated and custom instruments, with a Supabase backend.

---

## Live URLs

| Purpose | URL |
|---|---|
| **Production** | `https://cofactorsystems.github.io/shiftwave-field-instrument/shiftwave-field-instrument.html?deployment=NAME` |
| **Development / staging** | Use a branch preview or local server before merging to `main` |

Replace `NAME` with the deployment identifier (e.g. `caa`, `lafd`, `spirit`).

---

## Active Deployments

| Deployment | Mode | Config |
|---|---|---|
| `caa` | Identified | `configs/caa.json` |
| `spirit` | Identified | `configs/spirit.json` |
| `mclaren` | Identified | `configs/mclaren.json` |
| `lafd` | Anonymous | `configs/lafd.json` |
| `randi` | Identified | `configs/randi.json` |
| `womens-health-month` | Anonymous | `configs/womens-health-month.json` |
| `suzanne` | Identified | `configs/suzanne.json` |
| `ukrainian` | Anonymous | `configs/ukrainian.json` |

---

## Repo Structure

```
/
├── shiftwave-field-instrument.html   ← production HTML (do not edit directly)
├── README.md                         ← this file
├── .github/workflows/                ← validation and Pages publishing automation
└── configs/
    ├── README.md                     ← deployment guide (start here to add a deployment)
    ├── caa.json
    ├── spirit.json
    ├── mclaren.json
    ├── lafd.json
    ├── randi.json
    ├── womens_health_month.json
    └── suzanne.json
```

---

## Adding a New Deployment

All deployment configuration happens in `configs/`. You do not edit the HTML.

See **[configs/README.md](configs/README.md)** for the full deployment guide, including question types, conditional logic, anonymous vs. identified mode, and where to put your file.

---

## Core Instruments (all deployments)

Every deployment includes the following, regardless of config:

- **SSS** — 6-item body state scale (tension, energy, body connection, clarity, mental quiet, alertness)
- **STAI-6** — 6-item state anxiety scale
- **EmojiGrid** — 2D affect grid (valence × arousal)
- **NRS-11** — 11-point pain scale
- **Open comment** field

Addon questions (body region, burnout items, acceptability, demographic follow-ups, etc.) are defined per deployment in the config JSON.

---

## Architecture

- Single-file HTML — no build step, deployable anywhere
- Runtime config via `?deployment=` URL parameter → fetches `configs/{name}.json`
- Backend: Supabase Edge Function (`/functions/v1/sfi`) handling `lookup`, `submit`, and `checkSession`
- Offline queue: failed submissions stored in `localStorage` and retried on reconnect
- Two Supabase tables: `sessions` (analyst-accessible) and `participant_keys` (PII-restricted)
- GitHub Pages publishes from `gh-pages`, containing only public browser assets (`shiftwave-field-instrument.html` and `configs/`)

---

## Contacts

- **Wyatt** — architecture, HTML, backend, data
- **Damjan** — engineering / infrastructure
- **Dehan** — deployment configs, QA, partner feedback
