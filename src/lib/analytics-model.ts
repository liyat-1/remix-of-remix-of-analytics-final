/**
 * Analytics data model.
 *
 * Mirrors the shape a real API would return so the UI can be swapped onto a
 * backend later without touching any component:
 *
 *   Total bookings
 *   ├── Total usable
 *   │   ├── OTA baseline
 *   │   ├── Level 1 · Whois AI
 *   │   └── Level 2
 *   │       ├── Guest Journey
 *   │       └── During Stay ── Staff Collection / ID Scan Collection
 *   ├── Remaining recoverable opportunity
 *   └── Unrecoverable information
 *
 * Hard invariant enforced everywhere:
 *   bookings = usable + recoverable + unrecoverable
 */

/* ------------------------------------------------------------------ types */

export type FieldKey = "email" | "phone" | "address";

export type FieldSplit = { email: number; phone: number; address: number };

/** Leaves that actually carry numbers. Everything else is a roll-up. */
export type LeafKey = "ota" | "l1" | "journey" | "staff" | "idscan";

export const LEAF_KEYS: LeafKey[] = ["ota", "l1", "journey", "staff", "idscan"];

export type DayRow = {
  date: string; // YYYY-MM-DD
  bookings: number;
  unrecoverable: number;
  leaves: Record<LeafKey, FieldSplit>;
};

export type Selection = {
  ota: boolean;
  l1: boolean;
  l2: boolean;
  journey: boolean;
  duringStay: boolean;
  staff: boolean;
  idscan: boolean;
};

export const DEFAULT_SELECTION: Selection = {
  ota: true,
  l1: true,
  l2: true,
  journey: true,
  duringStay: true,
  staff: true,
  idscan: true,
};

export type Range = { start: string; end: string };

/* ------------------------------------------------------------ label config */

export const LEAF_LABELS: Record<LeafKey, { label: string; sub: string }> = {
  ota: { label: "OTA baseline", sub: "Already usable on arrival" },
  l1: { label: "Level 1 — Whois AI", sub: "Recovered by Whois AI" },
  journey: { label: "Guest Journey", sub: "Collected through the journey" },
  staff: { label: "Staff Collection", sub: "Captured by staff during stay" },
  idscan: { label: "ID Scan Collection", sub: "Captured by ID scan during stay" },
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  email: "Email",
  phone: "Phone",
  address: "Address",
};

export const FIELDS: FieldKey[] = ["email", "phone", "address"];

export const PROPERTIES = [
  { id: "all", label: "All properties", weight: 0 },
  { id: "harborview", label: "Harborview Grand", weight: 1 },
  { id: "seaside", label: "Seaside Resort", weight: 0.62 },
  { id: "metro", label: "Metro Central", weight: 0.45 },
  { id: "alpine", label: "Alpine Lodge", weight: 0.28 },
] as const;

export type PropertyId = (typeof PROPERTIES)[number]["id"];

export const DEFAULT_PROPERTY: PropertyId = "harborview";

/* ------------------------------------------------------------- generation */

/**
 * Reference story for a 15-day window on the reference property:
 *   20,000 bookings · 4,000 unrecoverable · 4,000 OTA baseline
 *   Level 1 (Whois AI) recovers 5% of the opportunity still open
 *   Level 2 recovers 27% of what is still open after Level 1
 */
const DAILY_BOOKINGS = 20000 / 15;
const DAILY_UNRECOVERABLE = 4000 / 15;
const DAILY_OTA = 4000 / 15;

/** Share of the still-open recoverable opportunity each level cleans up. */
export const L1_RECOVERY_RATE = 0.05;
export const L2_RECOVERY_RATE = 0.27;

/** How Level 2 splits across its collection paths. */
const L2_MIX = { journey: 0.55, staff: 0.27, idscan: 0.18 };

const LEAF_FIELD_RATIO: Record<LeafKey, FieldSplit> = {
  ota: { email: 0.52, phone: 0.3, address: 0.18 },
  l1: { email: 0.46, phone: 0.34, address: 0.2 },
  journey: { email: 0.44, phone: 0.34, address: 0.22 },
  staff: { email: 0.38, phone: 0.36, address: 0.26 },
  idscan: { email: 0.24, phone: 0.28, address: 0.48 },
};


function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Deterministic 0.86–1.14 wobble plus a gentle improvement trend. */
function wobble(seed: string, trend = 0) {
  return 0.86 + hash(seed) * 0.28 + trend;
}

function splitFields(total: number, ratio: FieldSplit, seed: string): FieldSplit {
  const e = Math.round(total * ratio.email * wobble(seed + "e") * 1.02);
  const p = Math.round(total * ratio.phone * wobble(seed + "p") * 1.02);
  const a = Math.max(0, Math.round(total) - e - p);
  return { email: Math.max(0, e), phone: Math.max(0, p), address: a };
}

const MS_DAY = 86400000;

export function todayISO() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export function isoToDate(iso: string) {
  return new Date(iso + "T00:00:00Z");
}

export function dateToISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function shiftISO(iso: string, days: number) {
  return dateToISO(new Date(isoToDate(iso).getTime() + days * MS_DAY));
}

export function daysBetween(range: Range) {
  return Math.max(1, Math.round((isoToDate(range.end).getTime() - isoToDate(range.start).getTime()) / MS_DAY) + 1);
}

/** Day index used as the trend clock, so the same date always looks the same. */
function dayIndex(iso: string) {
  return Math.round(isoToDate(iso).getTime() / MS_DAY);
}

function rowForProperty(propertyId: string, weight: number, iso: string): DayRow {
  const idx = dayIndex(iso);
  // enrichment slowly improves over time; ~+12% per year
  const trend = ((idx % 365) / 365) * 0.12;
  const seed = `${propertyId}:${iso}`;

  const bookings = Math.round(DAILY_BOOKINGS * weight * wobble(seed + "b"));
  const unrecoverable = Math.round(DAILY_UNRECOVERABLE * weight * wobble(seed + "u"));
  const ota = DAILY_OTA * weight * wobble(seed + "ota");

  // Level 1 cleans a share of the opportunity still open after the OTA data,
  // Level 2 cleans a share of what is still open after Level 1.
  const open0 = Math.max(0, bookings - unrecoverable - ota);
  const l1 = open0 * L1_RECOVERY_RATE * wobble(seed + "l1", trend);
  const open1 = Math.max(0, open0 - l1);
  const l2 = open1 * L2_RECOVERY_RATE * wobble(seed + "l2", trend);

  const amounts: Record<LeafKey, number> = {
    ota,
    l1,
    journey: l2 * L2_MIX.journey,
    staff: l2 * L2_MIX.staff,
    idscan: l2 * L2_MIX.idscan,
  };

  const leaves = {} as Record<LeafKey, FieldSplit>;
  for (const key of LEAF_KEYS) {
    leaves[key] = splitFields(amounts[key], LEAF_FIELD_RATIO[key], seed + key);
  }
  return { date: iso, bookings, unrecoverable, leaves };
}

function emptySplit(): FieldSplit {
  return { email: 0, phone: 0, address: 0 };
}

function addSplit(a: FieldSplit, b: FieldSplit): FieldSplit {
  return { email: a.email + b.email, phone: a.phone + b.phone, address: a.address + b.address };
}

export function splitTotal(s: FieldSplit) {
  return s.email + s.phone + s.address;
}

const rowCache = new Map<string, DayRow>();

export function getRow(propertyId: PropertyId, iso: string): DayRow {
  const cacheKey = `${propertyId}|${iso}`;
  const hit = rowCache.get(cacheKey);
  if (hit) return hit;

  let row: DayRow;
  if (propertyId === "all") {
    row = { date: iso, bookings: 0, unrecoverable: 0, leaves: {} as Record<LeafKey, FieldSplit> };
    for (const k of LEAF_KEYS) row.leaves[k] = emptySplit();
    for (const p of PROPERTIES) {
      if (p.id === "all") continue;
      const r = rowForProperty(p.id, p.weight, iso);
      row.bookings += r.bookings;
      row.unrecoverable += r.unrecoverable;
      for (const k of LEAF_KEYS) row.leaves[k] = addSplit(row.leaves[k]!, r.leaves[k]);
    }
  } else {
    const p = PROPERTIES.find((x) => x.id === propertyId)!;
    row = rowForProperty(p.id, p.weight, iso);
  }
  rowCache.set(cacheKey, row);
  return row;
}

export function getRows(propertyId: PropertyId, range: Range): DayRow[] {
  const out: DayRow[] = [];
  const n = daysBetween(range);
  for (let i = 0; i < n; i++) out.push(getRow(propertyId, shiftISO(range.start, i)));
  return out;
}

/* ---------------------------------------------------------------- periods */

export const PERIODS = [
  { id: "15d", label: "Last 15 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "lastMonth", label: "Last month" },
  { id: "3m", label: "Last 3 months" },
  { id: "thisYear", label: "This year" },
  { id: "lastYear", label: "Last year" },
  { id: "custom", label: "Custom range" },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

export function resolvePeriod(id: PeriodId, custom?: Range | null): Range {
  const today = todayISO();
  const d = isoToDate(today);
  const y = d.getUTCFullYear();

  switch (id) {
    case "15d":
      return { start: shiftISO(today, -14), end: today };
    case "30d":
      return { start: shiftISO(today, -29), end: today };
    case "lastMonth": {
      const first = new Date(Date.UTC(y, d.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(y, d.getUTCMonth(), 0));
      return { start: dateToISO(first), end: dateToISO(last) };
    }
    case "3m":
      return { start: shiftISO(today, -89), end: today };
    case "thisYear":
      return { start: `${y}-01-01`, end: today };
    case "lastYear":
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    case "custom":
      return custom ?? { start: shiftISO(today, -14), end: today };
  }
}

export const COMPARISONS = [
  { id: "off", label: "No comparison" },
  { id: "previous", label: "Previous period" },
  { id: "lastYear", label: "Same period last year" },
  { id: "custom", label: "Custom comparison range" },
] as const;

export type ComparisonId = (typeof COMPARISONS)[number]["id"];

export function resolveComparison(
  id: ComparisonId,
  current: Range,
  custom?: Range | null,
): Range | null {
  if (id === "off") return null;
  if (id === "custom") return custom ?? null;
  if (id === "previous") {
    const n = daysBetween(current);
    return { start: shiftISO(current.start, -n), end: shiftISO(current.start, -1) };
  }
  // same period, one year earlier
  const shift = (iso: string) => {
    const d = isoToDate(iso);
    return dateToISO(new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate())));
  };
  return { start: shift(current.start), end: shift(current.end) };
}

/* ------------------------------------------------------------ aggregation */

/** Which leaves the current checkbox selection includes. */
export function activeLeaves(sel: Selection): LeafKey[] {
  const out: LeafKey[] = [];
  if (sel.ota) out.push("ota");
  if (sel.l1) out.push("l1");
  if (sel.l2) {
    if (sel.journey) out.push("journey");
    if (sel.duringStay && sel.staff) out.push("staff");
    if (sel.duringStay && sel.idscan) out.push("idscan");
  }
  return out;
}

export type Agg = {
  range: Range;
  days: number;
  bookings: number;
  unrecoverable: number;
  /** Per-leaf field splits (always present, regardless of selection). */
  leaves: Record<LeafKey, FieldSplit>;
  /** Selection-aware totals. */
  ota: number;
  l1: number;
  journey: number;
  staff: number;
  idscan: number;
  duringStay: number;
  l2: number;
  enrichment: number;
  usable: number;
  recoverable: number;
  afterL1: number;
  l1Uplift: number;
  l2Uplift: number;
  totalUplift: number;
};

export function aggregate(rows: DayRow[], sel: Selection, range: Range): Agg {
  const leaves = {} as Record<LeafKey, FieldSplit>;
  for (const k of LEAF_KEYS) leaves[k] = emptySplit();
  let bookings = 0;
  let unrecoverable = 0;
  for (const r of rows) {
    bookings += r.bookings;
    unrecoverable += r.unrecoverable;
    for (const k of LEAF_KEYS) leaves[k] = addSplit(leaves[k]!, r.leaves[k]);
  }

  const active = new Set(activeLeaves(sel));
  const v = (k: LeafKey) => (active.has(k) ? splitTotal(leaves[k]!) : 0);

  const ota = v("ota");
  const l1 = v("l1");
  const journey = v("journey");
  const staff = v("staff");
  const idscan = v("idscan");
  const duringStay = staff + idscan;
  const l2 = journey + duringStay;
  const enrichment = l1 + l2;
  const usable = ota + enrichment;
  const recoverable = Math.max(0, bookings - usable - unrecoverable);
  const afterL1 = ota + l1;
  const base = ota || 1;

  return {
    range,
    days: rows.length,
    bookings,
    unrecoverable,
    leaves,
    ota,
    l1,
    journey,
    staff,
    idscan,
    duringStay,
    l2,
    enrichment,
    usable,
    recoverable,
    afterL1,
    l1Uplift: l1 / base,
    l2Uplift: l2 / (afterL1 || 1),
    totalUplift: (usable - ota) / base,
  };
}

export function getAgg(propertyId: PropertyId, range: Range, sel: Selection): Agg {
  return aggregate(getRows(propertyId, range), sel, range);
}

/** Per-day, selection-aware series used by the time-based chart. */
export type SeriesPoint = {
  date: string;
  label: string;
  bookings: number;
  unrecoverable: number;
  usable: number;
  recoverable: number;
  ota: number;
  l1: number;
  journey: number;
  staff: number;
  idscan: number;
  duringStay: number;
  l2: number;
  fields: FieldSplit;
};

export function buildSeries(rows: DayRow[], sel: Selection): SeriesPoint[] {
  const active = new Set(activeLeaves(sel));
  return rows.map((r) => {
    const v = (k: LeafKey) => (active.has(k) ? splitTotal(r.leaves[k]) : 0);
    const ota = v("ota");
    const l1 = v("l1");
    const journey = v("journey");
    const staff = v("staff");
    const idscan = v("idscan");
    const l2 = journey + staff + idscan;
    const usable = ota + l1 + l2;
    let fields = emptySplit();
    for (const k of active) fields = addSplit(fields, r.leaves[k]);
    return {
      date: r.date,
      label: formatDay(r.date),
      bookings: r.bookings,
      unrecoverable: r.unrecoverable,
      usable,
      recoverable: Math.max(0, r.bookings - usable - r.unrecoverable),
      ota,
      l1,
      journey,
      staff,
      idscan,
      duringStay: staff + idscan,
      l2,
      fields,
    };
  });
}

/* ------------------------------------------------------------- formatting */

export const nf = new Intl.NumberFormat("en-US");

export function compact(n: number) {
  const v = Math.round(n);
  if (Math.abs(v) >= 1000) {
    const k = v / 1000;
    return `${Math.abs(k) % 1 === 0 ? k : k.toFixed(1)}K`;
  }
  return nf.format(v);
}

export function pct(n: number, digits = 0) {
  const v = n * 100;
  const shown = Math.abs(v) < 10 && digits === 0 && Math.abs(v) % 1 >= 0.05 ? v.toFixed(1) : v.toFixed(digits);
  return `${v >= 0 ? "+" : ""}${shown}%`;
}

export function share(part: number, whole: number) {
  return whole ? `${((part / whole) * 100).toFixed(1)}%` : "0%";
}

export function formatDay(iso: string) {
  return isoToDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatRange(r: Range) {
  const sameYear = r.start.slice(0, 4) === r.end.slice(0, 4);
  const f = (iso: string, withYear: boolean) =>
    isoToDate(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  return `${f(r.start, !sameYear)} – ${f(r.end, true)}`;
}

export function delta(current: number, previous: number) {
  const diff = current - previous;
  return { diff, rel: previous ? diff / previous : 0 };
}

/* ------------------------------------- adapter for the legacy chart views */

/**
 * The bridge / funnel / fill-bar / staircase views were written against a flat
 * totals shape where `ceiling` is the recoverable opportunity ceiling
 * (bookings minus unrecoverable). This keeps them working unchanged.
 */
export type Totals = {
  ceiling: number;
  ota: number;
  l1: number;
  l2: number;
  usable: number;
  gap: number;
  fill: number;
  l1Uplift: number;
  l2Uplift: number;
  totalUplift: number;
  days: number;
};

export function toTotals(a: Agg): Totals {
  const ceiling = Math.max(1, a.bookings - a.unrecoverable);
  return {
    ceiling,
    ota: a.ota,
    l1: a.l1,
    l2: a.l2,
    usable: a.usable,
    gap: a.recoverable,
    fill: a.usable / ceiling,
    l1Uplift: a.l1Uplift,
    l2Uplift: a.l2Uplift,
    totalUplift: a.totalUplift,
    days: a.days,
  };
}

/* ------------------------------------------------- stage field breakdowns */

export type StageFieldMap = {
  bookings: FieldSplit;
  ota: FieldSplit;
  l1: FieldSplit;
  l2: FieldSplit;
  usable: FieldSplit;
};

/** Real per-field splits for each bridge/pie stage, honouring the selection. */
export function stageFields(a: Agg, sel: Selection): StageFieldMap {
  const act = new Set(activeLeaves(sel));
  const pick = (keys: LeafKey[]) =>
    keys.filter((k) => act.has(k)).reduce((s, k) => addSplit(s, a.leaves[k]!), emptySplit());
  const usable = pick(LEAF_KEYS);
  // bookings has no field-level truth in the source data; approximate from the
  // observed usable mix so hover stays internally consistent.
  const t = splitTotal(usable) || 1;
  const bookings: FieldSplit = {
    email: Math.round((usable.email / t) * a.bookings),
    phone: Math.round((usable.phone / t) * a.bookings),
    address: Math.round((usable.address / t) * a.bookings),
  };
  return {
    bookings,
    ota: pick(["ota"]),
    l1: pick(["l1"]),
    l2: pick(["journey", "staff", "idscan"]),
    usable,
  };
}

/* ----------------------------------------------------- breakdown focusing */

export type FocusKey = "usable" | "ota" | "l1" | "l2" | "journey" | "duringStay" | "staff" | "idscan";

export const FOCUS_LABELS: Record<FocusKey, string> = {
  usable: "Total usable information",
  ota: "OTA baseline",
  l1: "Level 1 — Whois AI",
  l2: "Level 2",
  journey: "Guest Journey",
  duringStay: "During Stay",
  staff: "Staff Collection",
  idscan: "ID Scan Collection",
};

export function leavesForFocus(focus: FocusKey, sel: Selection): LeafKey[] {
  const act = new Set(activeLeaves(sel));
  const want: Record<FocusKey, LeafKey[]> = {
    usable: LEAF_KEYS,
    ota: ["ota"],
    l1: ["l1"],
    l2: ["journey", "staff", "idscan"],
    journey: ["journey"],
    duringStay: ["staff", "idscan"],
    staff: ["staff"],
    idscan: ["idscan"],
  };
  return want[focus].filter((k) => act.has(k));
}

export type FocusPoint = {
  date: string;
  label: string;
  email: number;
  phone: number;
  address: number;
  total: number;
  /** Context that must never be lost while inspecting a subset. */
  usableTotal: number;
  staff: number;
  idscan: number;
};

export function buildFocusSeries(rows: DayRow[], sel: Selection, focus: FocusKey): FocusPoint[] {
  const keys = leavesForFocus(focus, sel);
  const all = leavesForFocus("usable", sel);
  return rows.map((r) => {
    const s = keys.reduce((acc, k) => addSplit(acc, r.leaves[k]), emptySplit());
    const usableTotal = all.reduce((acc, k) => acc + splitTotal(r.leaves[k]), 0);
    return {
      date: r.date,
      label: formatDay(r.date),
      email: s.email,
      phone: s.phone,
      address: s.address,
      total: splitTotal(s),
      usableTotal,
      staff: keys.includes("staff") ? splitTotal(r.leaves.staff) : 0,
      idscan: keys.includes("idscan") ? splitTotal(r.leaves.idscan) : 0,
    };
  });
}

/** Aggregate field split for a focus scope over a range. */
export function focusTotals(a: Agg, sel: Selection, focus: FocusKey): FieldSplit {
  return leavesForFocus(focus, sel).reduce((s, k) => addSplit(s, a.leaves[k]!), emptySplit());
}

/* ------------------------------------------------- scope-based field series */

export type ScopePoint = {
  date: string;
  label: string;
  email: number;
  phone: number;
  address: number;
  total: number;
  /** Context kept visible at every zoom level. */
  usableTotal: number;
  recoverable: number;
  unrecoverable: number;
  bookings: number;
};

/** Per-day Email/Phone/Address series for an arbitrary set of leaves. */
export function buildScopeSeries(
  rows: DayRow[],
  sel: Selection,
  keys: LeafKey[],
): ScopePoint[] {
  const all = leavesForFocus("usable", sel);
  const scoped = keys.filter((k) => all.includes(k));
  return rows.map((r) => {
    const s = scoped.reduce((acc, k) => addSplit(acc, r.leaves[k]), emptySplit());
    const usableTotal = all.reduce((acc, k) => acc + splitTotal(r.leaves[k]), 0);
    return {
      date: r.date,
      label: formatDay(r.date),
      email: s.email,
      phone: s.phone,
      address: s.address,
      total: splitTotal(s),
      usableTotal,
      recoverable: Math.max(0, r.bookings - usableTotal - r.unrecoverable),
      unrecoverable: r.unrecoverable,
      bookings: r.bookings,
    };
  });
}

/** Aggregate field split for an arbitrary set of leaves. */
export function scopeTotals(a: Agg, sel: Selection, keys: LeafKey[]): FieldSplit {
  const all = new Set(leavesForFocus("usable", sel));
  return keys.filter((k) => all.has(k)).reduce((s, k) => addSplit(s, a.leaves[k]!), emptySplit());
}
