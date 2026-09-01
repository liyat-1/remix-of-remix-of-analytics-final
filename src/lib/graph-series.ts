/**
 * Time-series graph model.
 *
 * The graph is a progressive-disclosure tree over the analytics hierarchy:
 *
 *   Totals  : Total usable / Opportunity remaining / Unrecoverable
 *   Sources : OTA baseline / Level 1 / Level 2 (+ Total usable)
 *             Level 2 → Guest Journey + During Stay
 *                       During Stay → Staff Collection + ID Scan
 *                                     each → Email / Phone / Address
 *
 * Hard rule: when a node is expanded, its children REPLACE it on the graph so
 * parent and child totals are never plotted at the same time.
 */
import {
  FIELDS,
  FIELD_LABELS,
  activeLeaves,
  formatDay,
  splitTotal,
  type DayRow,
  type FieldKey,
  type LeafKey,
  type Selection,
} from "@/lib/analytics-model";

export type GraphMode = "totals" | "sources";

/** Nodes that can be expanded into children. */
export type ExpandKey = "l2" | "journey" | "duringStay" | "staff" | "idscan";

export type Expansion = Record<ExpandKey, boolean>;

export const DEFAULT_EXPANSION: Expansion = {
  l2: false,
  journey: false,
  duringStay: false,
  staff: false,
  idscan: false,
};

export type GraphNode = {
  /** Stable id, also used for visibility state. */
  key: string;
  label: string;
  color: string;
  depth: number;
  /** Present when this node can be broken down further. */
  expand?: ExpandKey;
  value: (row: DayRow, sel: Selection) => number;
};

function shade(color: string, amount: number) {
  return `color-mix(in oklab, ${color} ${amount}%, var(--surface-2))`;
}

const FIELD_SHADE: Record<FieldKey, number> = { email: 100, phone: 68, address: 42 };

const leafValue = (k: LeafKey) => (row: DayRow) => splitTotal(row.leaves[k]);

const fieldValue = (k: LeafKey, f: FieldKey) => (row: DayRow) => row.leaves[k][f];

function usableValue(row: DayRow, sel: Selection) {
  return activeLeaves(sel).reduce((s, k) => s + splitTotal(row.leaves[k]), 0);
}

function fieldNodes(leaf: LeafKey, label: string, color: string, depth: number): GraphNode[] {
  return FIELDS.map((f) => ({
    key: `${leaf}.${f}`,
    label: `${label} · ${FIELD_LABELS[f]}`,
    color: shade(color, FIELD_SHADE[f]),
    depth,
    value: fieldValue(leaf, f),
  }));
}

const L2 = "var(--l2)";

/** Branch for a leaf that can only expand into its fields. */
function leafBranch(
  leaf: LeafKey,
  key: ExpandKey,
  label: string,
  color: string,
  depth: number,
  ex: Expansion,
): GraphNode[] {
  const self: GraphNode = { key: leaf, label, color, depth, expand: key, value: leafValue(leaf) };
  return ex[key] ? fieldNodes(leaf, label, color, depth + 1) : [self];
}

function duringStayBranch(ex: Expansion, depth: number): GraphNode[] {
  if (!ex.duringStay) {
    return [
      {
        key: "duringStay",
        label: "During Stay",
        color: shade(L2, 62),
        depth,
        expand: "duringStay",
        value: (r) => splitTotal(r.leaves.staff) + splitTotal(r.leaves.idscan),
      },
    ];
  }
  return [
    ...leafBranch("staff", "staff", "Staff Collection", shade(L2, 80), depth + 1, ex),
    ...leafBranch("idscan", "idscan", "ID Scan", shade(L2, 48), depth + 1, ex),
  ];
}

function l2Branch(ex: Expansion, depth: number): GraphNode[] {
  if (!ex.l2) {
    return [
      {
        key: "l2",
        label: "Level 2",
        color: L2,
        depth,
        expand: "l2",
        value: (r) =>
          splitTotal(r.leaves.journey) + splitTotal(r.leaves.staff) + splitTotal(r.leaves.idscan),
      },
    ];
  }
  return [
    ...leafBranch("journey", "journey", "Guest Journey", L2, depth + 1, ex),
    ...duringStayBranch(ex, depth + 1),
  ];
}

/** The node list the graph should plot, honouring source selection + expansion. */
export function resolveNodes(mode: GraphMode, sel: Selection, ex: Expansion): GraphNode[] {
  if (mode === "totals") {
    return [
      { key: "usable", label: "Total usable", color: "var(--l2)", depth: 0, value: usableValue },
      {
        key: "recoverable",
        label: "Opportunity remaining",
        color: "var(--recoverable)",
        depth: 0,
        value: (r, s) => Math.max(0, r.bookings - usableValue(r, s) - r.unrecoverable),
      },
      {
        key: "unrecoverable",
        label: "Unrecoverable",
        color: "var(--unrecoverable)",
        depth: 0,
        value: (r) => r.unrecoverable,
      },
    ];
  }

  const out: GraphNode[] = [];
  if (sel.ota)
    out.push({
      key: "ota",
      label: "OTA baseline",
      color: "var(--ota)",
      depth: 0,
      value: leafValue("ota"),
    });
  if (sel.l1)
    out.push({ key: "l1", label: "Level 1 — Whois AI", color: "var(--l1)", depth: 0, value: leafValue("l1") });
  if (sel.l2) out.push(...l2Branch(ex, 0));
  out.push({
    key: "usable",
    label: "Total usable",
    color: "var(--primary)",
    depth: 0,
    value: usableValue,
  });
  return out;
}

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
  prev?: number[];
};

export function buildChartSeries(
  nodes: GraphNode[],
  rows: DayRow[],
  compareRows: DayRow[] | null,
  sel: Selection,
): ChartSeries[] {
  return nodes.map((n) => {
    const values = rows.map((r) => n.value(r, sel));
    const prev = compareRows ? compareRows.map((r) => n.value(r, sel)) : undefined;
    return { key: n.key, label: n.label, color: n.color, values, ...(prev ? { prev } : {}) };
  });
}

export function dayLabels(rows: DayRow[]) {
  return rows.map((r) => formatDay(r.date));
}
