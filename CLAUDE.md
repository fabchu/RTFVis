# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RTFVis visualizes cyclists on a map during a bike touring event (RTF/CTF/Jedermann categories),
based on checkpoint scan timestamps from a Google Sheet — there is no GPS tracking. Position
between two checkpoints is interpolated from recent pace along the real route geometry. Supports
both live operation during the event and replay afterwards, using the exact same code path.

## Commands

```bash
pnpm install                          # install all workspaces
pnpm generate:example-data            # placeholder GPX/checkpoint data for local testing
pnpm build:routes                     # (re)generate data/routes.json + checkpoints.json — see gotcha below
pnpm simulate:field                   # generates data/simulation/{roster,scans}.csv (300 riders) for local dev/testing
pnpm race                             # starts backend + frontend, opens the map in a browser
pnpm test                             # runs tests in all workspaces (pnpm -r test)
```

Per-workspace (from repo root, or `cd` into the package):

```bash
pnpm --filter @rtfvis/core test -- test/speed.test.ts   # run a single test file
pnpm --filter @rtfvis/server dev                        # backend with watch mode
pnpm --filter @rtfvis/web dev                            # frontend only (Vite dev server, port 5173)
pnpm --filter @rtfvis/web build                          # production build (apps/web/dist)
pnpm --filter <pkg> exec tsc --noEmit                     # typecheck (no shortcut script exists)
```

Backend requires `apps/server/.env` (copy from `.env.example`) with `APPS_SCRIPT_URL`/`APPS_SCRIPT_TOKEN`,
or `DATA_SOURCE=csv` + `ROSTER_CSV_PATH`/`SCANS_CSV_PATH`/`SHEET_TIMEZONE` for the offline CSV fallback.
Requires Node.js ≥ 22.5 (uses the built-in `node:sqlite` module).

## Architecture

**Monorepo (pnpm workspaces):** `packages/core` (pure domain logic, no I/O) → `apps/server`
(Fastify, polls the sheet, persists to SQLite, serves JSON) → `apps/web` (React + MapLibre GL,
computes positions client-side). `apps-script/Code.gs` is the Google Apps Script Web App deployed
into the actual race spreadsheet.

**Central design principle:** `computePositions(scans, routes, roster, t)` in
`packages/core/src/position.ts` is a pure function of all scans and a timestamp `t`. Live mode
calls it with `t = Date.now()`, Replay with the timeline slider's value — there is no separate
code path for replay. `packages/core` deliberately has zero I/O so it can be unit-tested without a
server, browser, or network, and is imported directly by both `apps/server` and `apps/web`.

**Route resolution (`route-matching.ts`):** if the roster has a pre-assigned route and the
observed checkpoint sequence is a *subsequence* (not prefix — a single missed scan shouldn't
disqualify a rider) of it, that route wins. Otherwise routes are derived from the scan sequence
alone, tried against real routes first; auto-generated "Sternfahrt" variants (riders who join
partway through the course, see `preprocess/sternfahrt.ts`) are only tried as a fallback once no
real route matches, specifically so a normal rider is never shown as "ambiguous between route and
its own Sternfahrt variant" for their entire ride.

**Positional checkpoint matching is required, not optional.** Several routes revisit the same
physical checkpoint twice (loops), so checkpoint IDs are not unique within a route's checkpoint
list. Naive `array.find(id)`/ID→distance-map lookups always resolve to the *first* occurrence,
silently producing wrong (sometimes backwards) distances for a rider actually at the second
occurrence. `scan-matching.ts`'s `matchScansToRouteCheckpoints` resolves each scan to a checkpoint
**position** (index into the route), not an ID, and `position.ts`/`speed.ts` consume that
positional index everywhere instead of re-deriving distance from the checkpoint ID. When touching
anything that maps a scan to "where on the route", use the positional resolution — this exact bug
class has recurred multiple times in this codebase.

**`data/routes.json` is generated but committed to git — it goes stale silently.** It's built by
`pnpm build:routes` from `data/route-checkpoints.yaml` (manually maintained checkpoint sequence
per route) + `data/gpx/*.gpx`. Editing the YAML/checkpoints without re-running `build:routes`
leaves the committed `routes.json` out of sync, which manifests as riders showing a
"Streckenkonflikt" even though their scans are perfectly correct for the (new) checkpoint IDs.
Some checkpoint IDs contain a `/` (e.g. `K3/5`, `K6/9`) — these are checkpoints physically shared
between routes at different positions in each route's own sequence.

**Sheet data is messy free text; two normalization layers translate it to internal IDs**, both in
`apps/server/src/`, both applied once in `poller.ts` before persisting to SQLite (not in the
Apps Script, not per-consumer):
- `routeNameMapping.ts` — sheet route labels (e.g. `"RTF - 49km"`) → internal route IDs, matched
  case-/whitespace-insensitively; unmapped values fall back to checkpoint-sequence derivation
  rather than being passed through.
- `checkpointIdMapping.ts` — sheet checkpoint labels (e.g. `"K4 RTF Dornholzhausen"`) → internal
  checkpoint IDs, resolved by longest-known-ID-as-prefix match (after stripping all whitespace,
  since spacing inside the label is inconsistent, e.g. `"K 7/8 ..."`). Unknown values are logged
  once and passed through unresolved rather than dropped, so they degrade to "unmatched checkpoint"
  instead of crashing or silently disappearing.

**`Kontrolle2` (the live checkpoint-scan sheet, via an AppSheet integration) has two timestamps**:
`Zeitstempel` (when the checkpoint event happened) and `Zeitstempel_tech` (when the row synced
into the sheet — AppSheet buffers scans locally during radio dead zones, so these can differ by
hours). `Code.gs`'s incremental `since` fetch filters on `Zeitstempel_tech`, never on
`Zeitstempel` — filtering on event time would let a late-syncing row's old event timestamp fall
before the cutoff and be silently dropped forever, since later polls only ever request newer
cutoffs. The returned `timestampUtc` field is still the event time (`Zeitstempel`) — that's what
position/speed calculations need. Start (`TN Übersicht` roster column) and Finish
(`Zurück im Ziel` sheet) scans are synthesized separately in `Code.gs` and don't have this
buffering concern.

**`estimateSpeed()` (`speed.ts`) caps segment speed at `MAX_PLAUSIBLE_SPEED_MPS` (~72 km/h).**
A single bad scan pair (e.g. two checkpoints logged seconds apart) can otherwise produce an
absurd segment speed that — via the weighted recent-segments average — throws off the ETA for
the rest of the ride. Segments above the cap are discarded exactly like the existing
time/order-anomaly checks, not clamped.

**SQLite schema changes need a manual migration check, not just an updated `CREATE TABLE`.**
`CREATE TABLE IF NOT EXISTS` only applies to a brand-new database file; existing local/deployed
`rtfvis.db` files won't get new columns automatically. See `ensureTechnicalTimestampColumn()` in
`apps/server/src/db.ts` for the pattern (check `PRAGMA table_info`, `ALTER TABLE ADD COLUMN` if
missing) — follow it for any future column addition.

**Data sources are pluggable behind `ScanSource`** (`apps/server/src/sources/`): `AppsScriptSource`
(live), `CsvFileSource` (offline fallback, manual Google Sheet CSV export, does its own timezone
parsing since exported CSV values have no timezone info attached), `FixtureSource` (tests).
Selected via `DATA_SOURCE` env var in `config.ts`.

**Deployment (Render) serves frontend + backend as one process.** `apps/server` optionally serves
`apps/web/dist` as static files (`server.ts`, only if that directory exists — a no-op for local
dev, which runs Vite's own dev server separately). `HOST`, `PORT`/`HTTP_PORT`, and
`BASIC_AUTH_USER`/`BASIC_AUTH_PASS` are all env-driven so the exact same code runs unmodified
locally (defaults: bind to `127.0.0.1`, no auth) and on Render (`HOST=0.0.0.0`, Basic Auth in
front of everything except `/health` so platform health checks keep working). SQLite is ephemeral
on Render's free tier by design — acceptable because the Google Sheet is the actual source of
truth and a fresh poll rebuilds full history.

**MapLibre GL's `'load'` event fires exactly once per map instance.** Code that needs to react to
style/layer readiness after the initial load (e.g. toggling layer visibility, updating a source)
must check for layer/source **existence** rather than relying on `map.isStyleLoaded()` or a second
`.once('load', ...)` — see `setSourceDataWhenReady`/`setLayerVisibilityWhenReady` in
`apps/web/src/map/MapView.tsx` for the established pattern.

**The sidebar becomes a fixed-position overlay with a backdrop below 768px** (`index.css`, single
media query at the end of the file) instead of participating in the flex layout — a fixed 300px
sidebar next to the map leaves almost no room on a phone, and anything absolutely positioned over
the map (relative to `.map-area`) would otherwise overflow into the sidebar's screen space.
Several other floating map controls (timeline, rider-detail panel, ranking button) have
mobile-specific repositioning in the same media query for the same reason — check there before
adding a new floating UI element over the map.
