import { useState } from "react";
import {
  FIELDS,
  FIELD_LABELS,
  compact,
  nf,
  pct,
  splitTotal,
  type FieldSplit,
  type StageFieldMap,
  type Totals,
} from "@/lib/analytics-model";

type Layers = { ota: boolean; l1: boolean; l2: boolean };

export type L2Detail = { journey: number; staff: number; idscan: number; duringStay: number };

const W = 1080;
const H = 540;
const TOP = 62;
const BOTTOM = 400;
const LEFT = 96;
const RIGHT = W - 40;

type Tip = {
  x: number;
  y: number;
  title: string;
  color: string;
  rows: { k: string; v: string }[];
  note?: string;
};

function splitRows(s: FieldSplit) {
  return FIELDS.map((f) => ({ k: FIELD_LABELS[f], v: nf.format(Math.round(s[f])) }));
}

/** For values with no field-level truth (ceiling, gap): scale by the usable mix. */
function scaledRows(value: number, ref: FieldSplit) {
  const t = splitTotal(ref) || 1;
  return FIELDS.map((f) => ({
    k: FIELD_LABELS[f],
    v: nf.format(Math.round((ref[f] / t) * value)),
  }));
}

function niceTicks(max: number, count = 5) {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  return out;
}

export function HeroBridge({
  t,
  layers,
  fields,
  l2,
  bookings,
  unrecoverable,
  rangeLabel,
}: {
  t: Totals;
  layers: Layers;
  fields: StageFieldMap;
  l2: L2Detail;
  bookings: number;
  unrecoverable: number;
  rangeLabel: string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const max = Math.max(bookings, t.ceiling, 1);
  const y = (v: number) => BOTTOM - (v / max) * (BOTTOM - TOP);
  const h = (v: number) => (v / max) * (BOTTOM - TOP);
  const ticks = niceTicks(max);


  const cols: { key: string; label: string; sub: string }[] = [];
  if (layers.ota) cols.push({ key: "ota", label: "OTA baseline", sub: "Ready to use" });
  if (layers.l1) cols.push({ key: "l1", label: "Level 1", sub: "Whois AI" });
  if (layers.l2) cols.push({ key: "l2", label: "Level 2", sub: "Guest Journey + During Stay" });
  cols.push({ key: "final", label: "Total usable", sub: "Guest profiles" });

  const bw = 108;
  const slot = (RIGHT - LEFT) / cols.length;
  const x = (i: number) => LEFT + slot * i + (slot - bw) / 2;

  let run = 0;
  const seg = cols.map((c) => {
    const from = run;
    const val = c.key === "final" ? 0 : (t as unknown as Record<string, number>)[c.key]!;
    run += val;
    return { ...c, from, to: from + val, val };
  });

  const finalIdx = cols.length - 1;

  const show = (e: React.MouseEvent<SVGElement>, tp: Omit<Tip, "x" | "y">) => {
    const svg = e.currentTarget.ownerSVGElement ?? (e.currentTarget as unknown as SVGSVGElement);
    const r = svg.getBoundingClientRect();
    setTip({ ...tp, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  const infoIcon = (cx: number, cy: number, tp: Omit<Tip, "x" | "y">) => (
    <g
      className="cursor-help"
      onMouseMove={(e) => show(e, tp)}
      onMouseLeave={() => setTip(null)}
    >
      <circle cx={cx} cy={cy} r="9" fill="var(--surface-2, transparent)" stroke={tp.color} strokeWidth="1.4" />
      <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill={tp.color}>
        i
      </text>
    </g>
  );

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Usable guest information growth against the OTA opportunity ceiling"
      >
        <defs>
        </defs>

        {/* plot background */}
        <rect x={LEFT} y={TOP} width={RIGHT - LEFT} height={BOTTOM - TOP} fill="var(--surface)" rx="10" />

        {/* y gridlines + ticks */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={LEFT}
              y1={y(v)}
              x2={RIGHT}
              y2={y(v)}
              stroke="var(--border)"
              strokeOpacity={v === 0 ? 1 : 0.6}
              strokeWidth="1"
            />
            <line x1={LEFT - 6} y1={y(v)} x2={LEFT} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
            <text
              x={LEFT - 12}
              y={y(v) + 4}
              textAnchor="end"
              className="num"
              fill="var(--muted-foreground)"
              fontSize="12"
            >
              {compact(v)}
            </text>
          </g>
        ))}

        {/* axes */}
        <line x1={LEFT} y1={TOP - 10} x2={LEFT} y2={BOTTOM} stroke="var(--border)" strokeWidth="1.5" />
        <line x1={LEFT} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} stroke="var(--border)" strokeWidth="1.5" />
        <text
          x={26}
          y={(TOP + BOTTOM) / 2}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="12"
          fontWeight="600"
          transform={`rotate(-90 26 ${(TOP + BOTTOM) / 2})`}
        >
          Guest profiles
        </text>
        <text
          x={(LEFT + RIGHT) / 2}
          y={H - 10}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="12"
          fontWeight="600"
        >
          Enrichment stage · {rangeLabel}
        </text>

        {/* unrecoverable band: everything above the recoverable ceiling, up to
            total bookings — information that can never be recovered. */}
        <rect
          x={LEFT}
          y={TOP}
          width={RIGHT - LEFT}
          height={Math.max(0, y(t.ceiling) - TOP)}
          fill="var(--unrecoverable)"
          opacity="0.9"
          className="cursor-help"
          onMouseMove={(e) =>
            show(e, {
              title: "Unrecoverable information",
              color: "var(--unrecoverable)",
              note: "Bookings whose guest information can never be recovered — the hard limit above the ceiling.",
              rows: [
                { k: "Unrecoverable", v: nf.format(Math.round(unrecoverable)) },
                { k: "Total bookings", v: nf.format(Math.round(bookings)) },
                { k: "Share of bookings", v: `${Math.round((unrecoverable / (bookings || 1)) * 100)}%` },
              ],
            })
          }
          onMouseLeave={() => setTip(null)}
        />
        <text
          x={LEFT + 14}
          y={TOP + Math.max(16, (y(t.ceiling) - TOP) / 2 + 5)}
          className="num pointer-events-none"
          fill="var(--background)"
          fontSize="13"
          fontWeight="700"
        >
          Unrecoverable · {compact(unrecoverable)}
        </text>

        {/* total bookings line */}
        <line x1={LEFT} y1={TOP} x2={RIGHT} y2={TOP} stroke="var(--border)" strokeWidth="1.5" />
        <text x={RIGHT - 4} y={TOP - 12} textAnchor="end" className="num" fill="var(--muted-foreground)" fontSize="13" fontWeight="600">
          Total bookings · {compact(bookings)}
        </text>

        {/* recoverable opportunity ceiling */}
        <line
          x1={LEFT}
          y1={y(t.ceiling)}
          x2={RIGHT}
          y2={y(t.ceiling)}
          stroke="var(--ceiling)"
          strokeWidth="2"
          strokeDasharray="7 6"
        />
        <text
          x={RIGHT - 24}
          y={y(t.ceiling) + 20}
          textAnchor="end"
          className="num"
          fill="var(--ceiling)"
          fontSize="15"
          fontWeight="600"
        >
          Recoverable opportunity ceiling · {compact(t.ceiling)}
        </text>
        {infoIcon(RIGHT - 10, y(t.ceiling) + 15, {
          title: "Recoverable opportunity ceiling",
          color: "var(--ceiling)",
          note: "Total bookings minus unrecoverable information — the most usable guest information you could ever hold.",
          rows: [
            { k: "Ceiling", v: nf.format(Math.round(t.ceiling)) },
            ...scaledRows(t.ceiling, fields.usable),
          ],
        })}


        {/* connectors */}
        {seg.map((s, i) => {
          if (i === finalIdx) return null;
          const next = seg[i + 1]!;
          return (
            <line
              key={`c${i}`}
              x1={x(i) + bw}
              y1={y(s.to)}
              x2={x(i + 1)}
              y2={i + 1 === finalIdx ? y(t.usable) : y(next.from)}
              stroke="var(--muted-foreground)"
              strokeOpacity="0.5"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          );
        })}

        {seg.map((s, i) => {
          const isFinal = i === finalIdx;
          if (isFinal) {
            return (
              <g key={s.key} className="rise" style={{ animationDelay: `${i * 90}ms` }}>
                {/* remaining opportunity ghost */}
                <rect
                  x={x(i)}
                  y={y(t.ceiling)}
                  width={bw}
                  height={Math.max(0, y(t.usable) - y(t.ceiling))}
                  fill="var(--recoverable)"
                  rx="6"
                  className="cursor-help"
                  onMouseMove={(e) =>
                    show(e, {
                      title: "Opportunity remaining",
                      color: "var(--muted-foreground)",
                      note: "Bookings where guest information is still not usable, but could still be recovered.",
                      rows: [
                        { k: "Opportunity remaining", v: nf.format(Math.round(t.gap)) },
                        { k: "Share of ceiling", v: `${Math.round((t.gap / (t.ceiling || 1)) * 100)}%` },
                        ...scaledRows(t.gap, fields.usable),
                      ],
                    })
                  }
                  onMouseLeave={() => setTip(null)}
                />
                <text
                  x={x(i) + bw / 2}
                  y={(y(t.ceiling) + y(t.usable)) / 2}

                  textAnchor="middle"
                  fill="var(--muted-foreground)"
                  fontSize="13"
                  className="num pointer-events-none"
                >
                  {compact(t.gap)} left
                </text>
                {/* total usable, stacked as three green shades:
                    OTA (lightest) → Level 1 → Level 2 (full green) */}
                <rect
                  x={x(i)}
                  y={y(t.ota)}
                  width={bw}
                  height={Math.max(3, h(t.ota))}
                  rx="8"
                  fill="color-mix(in oklab, var(--l2) 30%, var(--surface-2))"
                  className="cursor-help"
                  onMouseMove={(e) =>
                    show(e, {
                      title: "OTA baseline inside the total",
                      color: "var(--l2)",
                      note: "Part of today's usable total that arrived usable from the OTA.",
                      rows: [
                        { k: "OTA baseline", v: nf.format(Math.round(t.ota)) },
                        { k: "Share of usable", v: `${Math.round((t.ota / (t.usable || 1)) * 100)}%` },
                      ],
                    })
                  }
                  onMouseLeave={() => setTip(null)}
                />
                <rect
                  x={x(i)}
                  y={y(t.ota + t.l1)}
                  width={bw}
                  height={Math.max(3, h(t.l1))}
                  fill="color-mix(in oklab, var(--l2) 60%, var(--surface-2))"
                  className="cursor-help"
                  onMouseMove={(e) =>
                    show(e, {
                      title: "Level 1 inside the total",
                      color: "var(--l2)",
                      note: "Profiles made usable by Level 1 (Whois AI) enrichment.",
                      rows: [
                        { k: "Level 1 · Whois AI", v: `+${nf.format(Math.round(t.l1))}` },
                        { k: "Uplift", v: pct(t.l1Uplift) },
                      ],
                    })
                  }
                  onMouseLeave={() => setTip(null)}
                />
                <rect
                  x={x(i)}
                  y={y(t.usable)}
                  width={bw}
                  height={Math.max(3, h(t.l2))}
                  rx="8"
                  fill="var(--l2)"
                  className="cursor-help"
                  onMouseMove={(e) =>
                    show(e, {
                      title: "Level 2 inside the total",
                      color: "var(--l2)",
                      note: "Profiles made usable by Level 2 (Journey + During Stay) enrichment.",
                      rows: [
                        { k: "Level 2 · Journey + Stay", v: `+${nf.format(Math.round(t.l2))}` },
                        { k: "— Guest Journey", v: nf.format(Math.round(l2.journey)) },
                        { k: "— During Stay", v: nf.format(Math.round(l2.duringStay)) },
                        { k: "   · Staff Collection", v: nf.format(Math.round(l2.staff)) },
                        { k: "   · ID Scan Collection", v: nf.format(Math.round(l2.idscan)) },
                        { k: "Uplift", v: pct(t.l2Uplift) },
                        { k: "Total usable", v: nf.format(Math.round(t.usable)) },
                        { k: "Uplift vs baseline", v: pct(t.totalUplift) },
                      ],
                    })
                  }
                  onMouseLeave={() => setTip(null)}
                />

                <text
                  x={x(i) + bw / 2 - 16}
                  y={y(t.usable) - 34}
                  textAnchor="middle"
                  className="num pointer-events-none"
                  fill="var(--l2)"
                  fontSize="44"
                  fontWeight="700"
                >
                  {compact(t.usable)}
                </text>
                {infoIcon(x(i) + bw / 2 + 44, y(t.usable) - 48, {
                  title: "Total usable — field breakdown",
                  color: "var(--l2)",
                  rows: [{ k: "Total usable", v: nf.format(Math.round(t.usable)) }, ...splitRows(fields.usable)],
                })}
                <text
                  x={x(i) + bw / 2}
                  y={y(t.usable) - 14}
                  textAnchor="middle"
                  className="num pointer-events-none"
                  fill="var(--l2)"
                  fontSize="14"
                  fontWeight="600"
                >
                  {pct(t.totalUplift)} vs baseline
                </text>
              </g>
            );
          }
          // Three green shades per segment: OTA (lightest) → Level 1 → Level 2 (full).
          const color =
            s.key === "ota"
              ? "color-mix(in oklab, var(--l2) 30%, var(--surface-2))"
              : s.key === "l1"
                ? "color-mix(in oklab, var(--l2) 60%, var(--surface-2))"
                : "var(--l2)";
          const tipFor: Omit<Tip, "x" | "y"> =
            s.key === "ota"
              ? {
                  title: "OTA baseline — already usable",
                  color,
                  note: "Guest information that arrived from the OTA in a usable state.",
                  rows: [
                    { k: "Usable", v: nf.format(Math.round(t.ota)) },
                    { k: "Share of ceiling", v: `${Math.round((t.ota / (t.ceiling || 1)) * 100)}%` },
                    ...splitRows(fields.ota),
                  ],
                }
              : {
                  title: s.key === "l1" ? "Level 1 — Whois AI" : "Level 2 — Guest Journey + During Stay",
                  color,
                  note: "Profiles made usable by this enrichment level.",
                  rows: [
                    { k: "Added", v: `+${nf.format(Math.round(s.val))}` },
                    { k: "Running total", v: nf.format(Math.round(s.to)) },
                    { k: "Uplift", v: pct(s.key === "l1" ? t.l1Uplift : t.l2Uplift) },
                    ...(s.key === "l1" ? splitRows(fields.l1) : splitRows(fields.l2)),
                    ...(s.key === "l2"
                      ? [
                          { k: "— Guest Journey", v: nf.format(Math.round(l2.journey)) },
                          { k: "— During Stay", v: nf.format(Math.round(l2.duringStay)) },
                          { k: "   · Staff Collection", v: nf.format(Math.round(l2.staff)) },
                          { k: "   · ID Scan Collection", v: nf.format(Math.round(l2.idscan)) },
                        ]
                      : []),
                  ],
                };
          return (
            <g key={s.key} className="rise" style={{ animationDelay: `${i * 90}ms` }}>
              {s.from > 0 && (
                <rect x={x(i)} y={y(s.from)} width={bw} height={h(s.from)} fill="var(--gap)" rx="6" />
              )}
              <rect
                x={x(i)}
                y={y(s.to)}
                width={bw}
                height={Math.max(3, h(s.val))}
                rx="6"
                fill={color}
                className="cursor-help"
                onMouseMove={(e) => show(e, tipFor)}
                onMouseLeave={() => setTip(null)}
              />
              <text
                x={x(i) + bw / 2 - 12}
                y={y(s.to) - 12}
                textAnchor="middle"
                className="num pointer-events-none"
                fill={color}
                fontSize="22"
                fontWeight="700"
              >
                {s.key === "ota" ? compact(s.val) : `+${compact(s.val)}`}
              </text>
              {infoIcon(x(i) + bw / 2 + 34, y(s.to) - 18, tipFor)}
            </g>
          );
        })}

        {/* uplift brackets */}
        {seg.map((s, i) => {
          if (i === 0 || i === finalIdx) return null;
          const upl = s.key === "l1" ? t.l1Uplift : t.l2Uplift;
          const cx = x(i) - (slot - bw) / 2;
          const yy = y(s.from) + 26;
          return (
            <g key={`u${i}`} className="pointer-events-none">
              <path d={`M ${cx - 26} ${yy} h 52`} stroke="var(--muted-foreground)" strokeOpacity="0.6" strokeWidth="1.5" />
              <text x={cx} y={yy - 8} textAnchor="middle" className="num" fill="var(--foreground)" fontSize="14" fontWeight="600">
                {pct(upl)} uplift
              </text>
            </g>
          );
        })}

        {/* x-axis labels */}
        {seg.map((s, i) => (
          <g key={`l${i}`} className="pointer-events-none">
            <line x1={x(i) + bw / 2} y1={BOTTOM} x2={x(i) + bw / 2} y2={BOTTOM + 6} stroke="var(--border)" strokeWidth="1" />
            <text x={x(i) + bw / 2} y={BOTTOM + 26} textAnchor="middle" fill="var(--foreground)" fontSize="14" fontWeight="600">
              {s.label}
            </text>
            <text x={x(i) + bw / 2} y={BOTTOM + 46} textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">
              {s.sub}
            </text>
            {i === finalIdx && (
              <text x={x(i) + bw / 2} y={BOTTOM + 66} textAnchor="middle" fill="var(--muted-foreground)" fontSize="12" className="num">
                {nf.format(Math.round(t.usable))}
              </text>
            )}
          </g>
        ))}
      </svg>

      {tip && (
        <div
          className="panel pointer-events-none absolute z-20 w-60 -translate-x-1/2 -translate-y-full rounded-xl border border-border p-3 text-xs shadow-lg"
          style={{ left: `${tip.x}%`, top: `calc(${tip.y}% - 12px)`, background: "var(--background)" }}
        >
          <div className="mb-1.5 font-semibold" style={{ color: tip.color }}>
            {tip.title}
          </div>
          {tip.note && <p className="mb-2 text-muted-foreground">{tip.note}</p>}
          <dl className="space-y-1">
            {tip.rows.map((r) => (
              <div key={r.k} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{r.k}</dt>
                <dd className="num font-semibold">{r.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
