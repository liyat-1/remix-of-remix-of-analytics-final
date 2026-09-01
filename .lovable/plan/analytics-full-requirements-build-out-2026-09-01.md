# Analytics — full requirements build-out

Expands the current dashboard into the complete analytics experience described in the requirements doc, keeping the visual language (solid colors, green intensity progression, panel style) we already have.

## 1. Data model rebuild

Replace the flat `ota / l1 / l2` day record with the full hierarchy so every number reconciles:

```text
Total bookings (20,000)
├── Total usable
│   ├── OTA baseline            4,000
│   ├── Level 1 · Whois AI        200
│   └── Level 2                 3,800
│       ├── Guest Journey
│       └── During Stay
│           ├── Staff Collection
│           └── ID Scan Collection
├── Remaining recoverable      12,000
└── Unrecoverable               4,000
```

Every leaf carries Email / Phone / Address values. Hard rule enforced in the data layer:
`bookings = usable + recoverable + unrecoverable`, recomputed from the actual selected sources.

Per-property daily series (mock, deterministic) so property switching, periods and comparison all derive from one source.

## 2. Controls bar

- **Property selector**: individual property or All properties (portfolio total).
- **Period selector**: Last 15 days (default), Last 30 days, Last month, Last 3 months, This year, Last year, Custom range.
- **Custom range**: date-range picker (calendar popover) for start/end.
- **Comparison**: dropdown instead of the current toggle — Off, Previous period, Previous equivalent range, This year vs last year, Custom comparison range (own date picker).
- **Source checkboxes**: OTA Baseline / Level 1 / Level 2 — drive every number on the page.
- **Show breakdown** toggle.

## 3. Main visualization

Two modes, **Pie is default**, Bridge second:

- **Pie** — Total usable / Remaining recoverable / Unrecoverable, reconciling to total bookings.
- **Bridge** — OTA baseline → +Level 1 → +Level 2 → Total usable, with the added amount and uplift % printed between stages (not hover-only), correctly labelled by denominator: Level 1 `+200 / +5% vs OTA baseline`, Level 2 `+3,800 / +90.5% vs after Level 1`, total `+100% vs OTA baseline`.

Existing Funnel / Fill bar / Self-scaled / Staircase views stay available as secondary modes.

Rich hover on every segment: source description, amount, Email/Phone/Address split, resulting total usable, plus recoverable/unrecoverable where relevant. Level 2 hover always shows Guest Journey vs During Stay, and During Stay hover shows Staff vs ID Scan.

## 4. Breakdown panel

Appears when **Show breakdown** is on, following the selected hierarchy only (no irrelevant levels):

- OTA Baseline → Email / Phone / Address
- Level 1 (Whois AI) → Email / Phone / Address
- Level 2 → Guest Journey and During Stay checkboxes; During Stay expands to Staff Collection and ID Scan Collection checkboxes, each with Email / Phone / Address

With comparison on, each breakdown row shows Current / Previous / Change.

## 5. Time-based chart

- Default series: Total usable, Remaining recoverable, Unrecoverable — each with its own visibility checkbox.
- When breakdown is active, the time chart follows the selected breakdown subset (e.g. During Stay → Email over time).
- Hover always keeps total-usable context even when viewing a field-level subset.
- Comparison overlays the comparison period as dashed lines.

## 6. Wow factor

Keep the hero line, restated on the doc's numbers: `4,000 → 8,000 = +100% more usable guest information`, with total usable, added by enrichment, remaining opportunity and unrecoverable as the supporting stats.

## Technical notes

- New `src/lib/analytics-model.ts`: hierarchy types, deterministic per-property mock generator, period/comparison range resolution, selection-aware aggregation and uplift helpers. `enrichment-data.ts` is retired once views are migrated.
- New components: `PropertyPeriodBar`, `ComparisonPicker` (shadcn Popover + Calendar range), `OpportunityPie`, `BreakdownTree`, `HoverCard` content builders. Existing bridge/funnel/bar components adapted to the new totals shape.
- All state stays client-side in the route; no backend needed for mock data.
- Colors: reuse existing solid tokens and the OTA→L1→L2 green intensity ladder; recoverable and unrecoverable get their own neutral/muted tokens in `src/styles.css`.

## Not in this pass

Real data via Lovable Cloud, auth, and persistence — the whole thing stays on deterministic mock data shaped exactly like the future API response.
