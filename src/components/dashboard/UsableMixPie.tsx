import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  FIELDS,
  FIELD_LABELS,
  compact,
  nf,
  pct,
  share,
  splitTotal,
  type Agg,
  type FieldSplit,
  type LeafKey,
  type Selection,
} from "@/lib/analytics-model";

export type Breakdown = { ota: boolean; l1: boolean; l2: boolean };

export type SourceKey = "ota" | "l1" | "l2";

export type MixSlice = {
  key: string;
  parent: SourceKey | "recoverable" | "unrecoverable";
  label: string;
  sub: string;
  value: number;
  color: string;
  onDark?: boolean;
};

export const SOURCE_COLOR: Record<SourceKey, string> = {
  ota: "var(--ota)",
  l1: "var(--l1)",
  l2: "var(--l2)",
};

export const RECOVERABLE_COLOR = "var(--recoverable)";
export const UNRECOVERABLE_COLOR = "var(--unrecoverable)";

function shade(color: string, amount: number) {
  return `color-mix(in oklab, ${color} ${amount}%, var(--surface-2))`;
}

const FIELD_SHADE: Record<string, number> = { email: 100, phone: 68, address: 42 };

function fieldSlices(
  parent: SourceKey,
  leaf: LeafKey,
  label: string,
  split: FieldSplit,
): MixSlice[] {
  return FIELDS.map((f) => ({
    key: `${leaf}-${f}`,
    parent,
    label: `${label} · ${FIELD_LABELS[f]}`,
    sub: FIELD_LABELS[f],
    value: split[f],
    color: shade(SOURCE_COLOR[parent], FIELD_SHADE[f]!),
    onDark: true,
  }));
}

/**
 * Slices of the mix donut, in ring order. Always sums to total bookings.
 *
 * Level 2 breaks down hierarchically, never by field while two branches are
 * still visible: Journey + During Stay → (uncheck one) → the remaining branch
 * splits further → finally into Email / Phone / Address.
 */
export function mixSlices(a: Agg, sel: Selection, bd: Breakdown): MixSlice[] {
  const out: MixSlice[] = [];

  if (sel.ota && a.ota > 0) {
    if (bd.ota) out.push(...fieldSlices("ota", "ota", "OTA baseline", a.leaves.ota));
    else
      out.push({
        key: "ota",
        parent: "ota",
        label: "OTA baseline",
        sub: "Ready to use",
        value: a.ota,
        color: SOURCE_COLOR.ota,
        onDark: true,
      });
  }

  if (sel.l1 && a.l1 > 0) {
    if (bd.l1) out.push(...fieldSlices("l1", "l1", "Level 1", a.leaves.l1));
    else
      out.push({
        key: "l1",
        parent: "l1",
        label: "Level 1 — Whois AI",
        sub: "Recovered by Whois AI",
        value: a.l1,
        color: SOURCE_COLOR.l1,
        onDark: true,
      });
  }

  if (sel.l2 && a.l2 > 0) {
    if (!bd.l2) {
      out.push({
        key: "l2",
        parent: "l2",
        label: "Level 2",
        sub: "Guest Journey + During Stay",
        value: a.l2,
        color: SOURCE_COLOR.l2,
        onDark: true,
      });
    } else {
      const journeyOn = sel.journey && a.journey > 0;
      const stayOn = sel.duringStay && a.duringStay > 0;

      if (journeyOn && stayOn) {
        out.push({
          key: "journey",
          parent: "l2",
          label: "Guest Journey",
          sub: "Collected before arrival",
          value: a.journey,
          color: SOURCE_COLOR.l2,
          onDark: true,
        });
        out.push({
          key: "during",
          parent: "l2",
          label: "During Stay",
          sub: "Staff + ID scan",
          value: a.duringStay,
          color: shade(SOURCE_COLOR.l2, 58),
          onDark: true,
        });
      } else if (journeyOn) {
        out.push(...fieldSlices("l2", "journey", "Guest Journey", a.leaves.journey));
      } else if (stayOn) {
        const staffOn = sel.staff && a.staff > 0;
        const idOn = sel.idscan && a.idscan > 0;
        if (staffOn && idOn) {
          out.push({
            key: "staff",
            parent: "l2",
            label: "Staff Collection",
            sub: "Captured by staff",
            value: a.staff,
            color: SOURCE_COLOR.l2,
            onDark: true,
          });
          out.push({
            key: "idscan",
            parent: "l2",
            label: "ID Scan Collection",
            sub: "Captured by ID scan",
            value: a.idscan,
            color: shade(SOURCE_COLOR.l2, 55),
            onDark: true,
          });
        } else if (staffOn) {
          out.push(...fieldSlices("l2", "staff", "Staff Collection", a.leaves.staff));
        } else if (idOn) {
          out.push(...fieldSlices("l2", "idscan", "ID Scan Collection", a.leaves.idscan));
        }
      }
    }
  }

  out.push({
    key: "recoverable",
    parent: "recoverable",
    label: "Opportunity remaining",
    sub: "Still open",
    value: a.recoverable,
    color: RECOVERABLE_COLOR,
  });
  out.push({
    key: "unrecoverable",
    parent: "unrecoverable",
    label: "Unrecoverable information",
    sub: "Can never be recovered",
    value: a.unrecoverable,
    color: UNRECOVERABLE_COLOR,
    onDark: true,
  });

  return out.filter((s) => s.value > 0);
}

/* ----------------------------------------------------------------- donut */

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlice(cx: number, cy: number, r: number, thick: number, a0: number, a1: number) {
  const ri = r - thick;
  const large = a1 - a0 > 180 ? 1 : 0;
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const p2 = polar(cx, cy, ri, a1);
  const p3 = polar(cx, cy, ri, a0);
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${ri} ${ri} 0 ${large} 0 ${p3.x} ${p3.y}`,
    "Z",
  ].join(" ");
}

export function MixDonut({
  a,
  sel,
  bd,
  size = 380,
}: {
  a: Agg;
  sel: Selection;
  bd: Breakdown;
  size?: number;
}) {
  const [hover, setHover] = useState<MixSlice | null>(null);
  const slices = mixSlices(a, sel, bd);
  const total = Math.max(1, a.bookings);
  const S = 400;
  const C = S / 2;
  const R = 176;
  const THICK = 54;

  let acc = 0;
  const rendered = slices.map((s) => {
    const a0 = (acc / total) * 360;
    acc += s.value;
    return { s, a0, a1: (acc / total) * 360 };
  });

  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      style={{ width: size, maxWidth: "100%" }}
      role="img"
      aria-label={`Usable mix of ${nf.format(a.bookings)} bookings`}
    >
      {rendered.map(({ s, a0, a1 }) => {
        const start = Math.min(a0 + 0.6, 359.4);
        const end = Math.min(Math.max(a1 - 0.6, start + 0.3), 360);
        const dim = hover && hover.key !== s.key;
        return (
          <path
            key={s.key}
            d={donutSlice(C, C, R, THICK, start, end)}
            fill={s.color}
            opacity={dim ? 0.35 : 1}
            className="cursor-help transition-opacity"
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(null)}
          />
        );
      })}

      {rendered.map(({ s, a0, a1 }) => {
        const sweep = a1 - a0;
        if (sweep < 10) return null;
        const mid = (a0 + a1) / 2;
        const outside = s.parent === "recoverable";
        const p = polar(C, C, outside ? R + 22 : R - THICK / 2, mid);
        return (
          <text
            key={`lbl-${s.key}`}
            x={p.x}
            y={p.y + 5}
            textAnchor="middle"
            className="num pointer-events-none"
            fill={outside ? "var(--muted-foreground)" : s.onDark ? "var(--background)" : "var(--foreground)"}
            fontSize={sweep < 20 ? 12 : 15}
            fontWeight="700"
            opacity={hover && hover.key !== s.key ? 0.45 : 1}
          >
            {compact(s.value)}
          </text>
        );
      })}

      {hover ? (
        <>
          <text x={C} y={C - 22} textAnchor="middle" fill="var(--muted-foreground)" fontSize="13">
            {hover.label}
          </text>
          <text
            x={C}
            y={C + 16}
            textAnchor="middle"
            className="num"
            fill="var(--foreground)"
            fontSize="38"
            fontWeight="700"
          >
            {nf.format(Math.round(hover.value))}
          </text>
          <text x={C} y={C + 38} textAnchor="middle" className="num" fill="var(--muted-foreground)" fontSize="12">
            {share(hover.value, a.bookings)} of bookings
          </text>
        </>
      ) : (
        <>
          <text
            x={C}
            y={C - 6}
            textAnchor="middle"
            className="num"
            fill="var(--foreground)"
            fontSize="46"
            fontWeight="700"
          >
            {compact(a.usable)}
          </text>
          <text x={C} y={C + 18} textAnchor="middle" fill="var(--muted-foreground)" fontSize="13">
            usable guest profiles
          </text>
          <text x={C} y={C + 40} textAnchor="middle" className="num" fill="var(--l2)" fontSize="13" fontWeight="700">
            {share(a.usable, a.bookings)} of bookings
          </text>
        </>
      )}
    </svg>
  );
}

/* --------------------------------------------------------- source toggles */

/** Compact source checkbox row — used as the legend above the bridge view. */
export function SourceToggles({
  sel,
  onToggle,
}: {
  sel: Selection;
  onToggle: (k: SourceKey) => void;
}) {
  const rows: { k: SourceKey; label: string }[] = [
    { k: "ota", label: "OTA baseline" },
    { k: "l1", label: "Level 1 — Whois AI" },
    { k: "l2", label: "Level 2" },
  ];
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-surface-2/40 px-4 py-3">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Sources
      </span>
      {rows.map((r) => (
        <label key={r.k} className="flex cursor-pointer items-center gap-2 text-sm">
          <ColorCheckbox
            color={SOURCE_COLOR[r.k]}
            checked={sel[r.k]}
            onChange={() => onToggle(r.k)}
            label={r.label}
          />
          <i className="size-3 rounded-[4px]" style={{ background: SOURCE_COLOR[r.k] }} />
          {r.label}
        </label>
      ))}
      <span className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-[4px]" style={{ background: RECOVERABLE_COLOR }} /> Opportunity
          remaining
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-[4px]" style={{ background: UNRECOVERABLE_COLOR }} />{" "}
          Unrecoverable
        </span>
      </span>
    </div>
  );
}

function ColorCheckbox({
  color,
  checked,
  onChange,
  label,
}: {
  color: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      style={{ "--primary": color, "--border": color } as React.CSSProperties}
    />
  );
}

/* ---------------------------------------------------------------- legend */

type SelKey = keyof Selection;

export function MixLegend({
  a,
  prev,
  sel,
  bd,
  onToggleSource,
  onToggleBreakdown,
  onToggleSel,
}: {
  a: Agg;
  prev: Agg | null;
  sel: Selection;
  bd: Breakdown;
  onToggleSource: (k: SourceKey) => void;
  onToggleBreakdown: (k: SourceKey) => void;
  onToggleSel: (k: SelKey) => void;
}) {
  const sources: { k: SourceKey; label: string; sub: string; value: number; prev: number }[] = [
    { k: "ota", label: "OTA baseline", sub: "Ready to use", value: a.ota, prev: prev?.ota ?? 0 },
    { k: "l1", label: "Level 1", sub: "Whois AI", value: a.l1, prev: prev?.l1 ?? 0 },
    { k: "l2", label: "Level 2", sub: "Guest Journey + During Stay", value: a.l2, prev: prev?.l2 ?? 0 },
  ];

  return (
    <div className="w-full">
      <div className="mb-4 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Where the {compact(a.bookings)} OTA opportunity sits
      </div>

      <div className="space-y-4">
        {sources.map((s) => {
          const on = sel[s.k];
          return (
            <div key={s.k}>
              <div className="flex items-start gap-3">
                <ColorCheckbox
                  color={SOURCE_COLOR[s.k]}
                  checked={on}
                  onChange={() => onToggleSource(s.k)}
                  label={s.label}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-base font-semibold ${on ? "" : "text-muted-foreground line-through"}`}
                    >
                      {s.label}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">· {s.sub}</span>
                  </div>
                  <div className="num text-xs text-muted-foreground">
                    {nf.format(Math.round(s.value))} profiles · {share(s.value, a.bookings)} of bookings
                    {prev ? ` · prev ${compact(s.prev)}` : ""}
                  </div>
                </div>
                <div className="num shrink-0 text-2xl font-bold" style={{ color: SOURCE_COLOR[s.k] }}>
                  {s.k === "ota" ? compact(s.value) : `+${compact(s.value)}`}
                </div>
              </div>

              {on && (
                <div className="mt-2 ml-8">
                  <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <ColorCheckbox
                      color={SOURCE_COLOR[s.k]}
                      checked={bd[s.k]}
                      onChange={() => onToggleBreakdown(s.k)}
                      label={`Show breakdown for ${s.label}`}
                    />
                    Show breakdown
                  </label>

                  {bd[s.k] && s.k !== "l2" && (
                    <FieldList
                      split={a.leaves[s.k === "ota" ? "ota" : "l1"]}
                      color={SOURCE_COLOR[s.k]}
                      whole={s.value}
                    />
                  )}

                  {bd.l2 && s.k === "l2" && (
                    <L2Tree a={a} sel={sel} onToggleSel={onToggleSel} />
                  )}
                </div>
              )}
            </div>
          );
        })}

        <FixedRow
          color={RECOVERABLE_COLOR}
          label="Opportunity remaining"
          sub="Still open"
          value={a.recoverable}
          prev={prev?.recoverable ?? null}
          whole={a.bookings}
        />
        <FixedRow
          color={UNRECOVERABLE_COLOR}
          label="Unrecoverable information"
          sub="Can never be recovered"
          value={a.unrecoverable}
          prev={prev?.unrecoverable ?? null}
          whole={a.bookings}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 px-4 py-3">
        <span className="text-sm text-muted-foreground">Total usable</span>
        <span className="num text-2xl font-bold">{nf.format(Math.round(a.usable))}</span>
        <span className="num text-xl font-bold text-primary">{pct(a.totalUplift)} uplift</span>
      </div>
    </div>
  );
}

function FieldList({ split, color, whole }: { split: FieldSplit; color: string; whole: number }) {
  return (
    <div className="mt-2 space-y-1">
      {FIELDS.map((f) => (
        <Leaf
          key={f}
          label={FIELD_LABELS[f]}
          value={split[f]}
          whole={whole}
          color={shade(color, FIELD_SHADE[f]!)}
        />
      ))}
    </div>
  );
}

function L2Tree({
  a,
  sel,
  onToggleSel,
}: {
  a: Agg;
  sel: Selection;
  onToggleSel: (k: SelKey) => void;
}) {
  const journeyOn = sel.journey;
  const stayOn = sel.duringStay;
  const green = SOURCE_COLOR.l2;

  return (
    <div className="mt-2 space-y-2">
      {/* Guest Journey */}
      <div>
        <div className="flex items-center gap-2 text-xs">
          <ColorCheckbox
            color={green}
            checked={journeyOn}
            onChange={() => onToggleSel("journey")}
            label="Guest Journey"
          />
          <i className="size-2.5 rounded-full" style={{ background: green }} />
          <span className={journeyOn ? "" : "text-muted-foreground line-through"}>Guest Journey</span>
          <span className="num ml-auto font-semibold">{nf.format(Math.round(a.journey))}</span>
        </div>
        {journeyOn && !stayOn && (
          <div className="ml-6">
            <FieldList split={a.leaves.journey} color={green} whole={a.journey} />
          </div>
        )}
      </div>

      {/* During Stay */}
      <div>
        <div className="flex items-center gap-2 text-xs">
          <ColorCheckbox
            color={green}
            checked={stayOn}
            onChange={() => onToggleSel("duringStay")}
            label="During Stay"
          />
          <i className="size-2.5 rounded-full" style={{ background: shade(green, 58) }} />
          <span className={stayOn ? "" : "text-muted-foreground line-through"}>During Stay</span>
          <span className="num ml-auto font-semibold">{nf.format(Math.round(a.duringStay))}</span>
        </div>

        {stayOn && !journeyOn && (
          <div className="mt-2 ml-6 space-y-2">
            <div>
              <div className="flex items-center gap-2 text-xs">
                <ColorCheckbox
                  color={green}
                  checked={sel.staff}
                  onChange={() => onToggleSel("staff")}
                  label="Staff Collection"
                />
                <i className="size-2.5 rounded-full" style={{ background: green }} />
                <span className={sel.staff ? "" : "text-muted-foreground line-through"}>
                  Staff Collection
                </span>
                <span className="num ml-auto font-semibold">{nf.format(Math.round(a.staff))}</span>
              </div>
              {sel.staff && !sel.idscan && (
                <div className="ml-6">
                  <FieldList split={a.leaves.staff} color={green} whole={a.staff} />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs">
                <ColorCheckbox
                  color={green}
                  checked={sel.idscan}
                  onChange={() => onToggleSel("idscan")}
                  label="ID Scan Collection"
                />
                <i className="size-2.5 rounded-full" style={{ background: shade(green, 55) }} />
                <span className={sel.idscan ? "" : "text-muted-foreground line-through"}>
                  ID Scan Collection
                </span>
                <span className="num ml-auto font-semibold">{nf.format(Math.round(a.idscan))}</span>
              </div>
              {sel.idscan && !sel.staff && (
                <div className="ml-6">
                  <FieldList split={a.leaves.idscan} color={green} whole={a.idscan} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {journeyOn && stayOn && (
        <p className="text-[11px] text-muted-foreground">
          Uncheck one branch to break the other down further.
        </p>
      )}
    </div>
  );
}

function Leaf({
  label,
  value,
  whole,
  color,
}: {
  label: string;
  value: number;
  whole: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <i className="size-2.5 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="num ml-auto font-semibold">{nf.format(Math.round(value))}</span>
      <span className="num w-14 text-right text-muted-foreground">{share(value, whole)}</span>
    </div>
  );
}

function FixedRow({
  color,
  label,
  sub,
  value,
  prev,
  whole,
}: {
  color: string;
  label: string;
  sub: string;
  value: number;
  prev: number | null;
  whole: number;
}) {
  return (
    <div className="flex items-start gap-3">
      <i className="mt-1.5 size-4 shrink-0 rounded-[5px]" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold">{label}</span>
          <span className="truncate text-sm text-muted-foreground">· {sub}</span>
        </div>
        <div className="num text-xs text-muted-foreground">
          {nf.format(Math.round(value))} profiles · {share(value, whole)} of bookings
          {prev !== null ? ` · prev ${compact(prev)}` : ""}
        </div>
      </div>
      <div className="num shrink-0 text-2xl font-bold text-muted-foreground">{compact(value)}</div>
    </div>
  );
}

export function splitSum(s: FieldSplit) {
  return splitTotal(s);
}
