import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { compact, nf, type ScopePoint, type SeriesPoint } from "@/lib/analytics-model";

const W = 1120;
const H = 400;
const TOP = 24;
const BOTTOM = 320;
const LEFT = 76;
const RIGHT = W - 24;

type Serie = { key: string; label: string; color: string; values: number[]; prev?: number[] };

function niceTicks(max: number, count = 4) {
  const raw = Math.max(1, max) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  return out;
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export function TimeSeriesChart({
  points,
  compare,
  scopePoints,
  scopeCompare,
  scopeLabel,
  rangeLabel,
  compareLabel,
}: {
  points: SeriesPoint[];
  compare: SeriesPoint[] | null;
  scopePoints: ScopePoint[] | null;
  scopeCompare: ScopePoint[] | null;
  scopeLabel: string;
  rangeLabel: string;
  compareLabel: string | null;
}) {
  const fieldMode = !!scopePoints;
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<number | null>(null);

  const isOn = (k: string) => visible[k] !== false;

  const series: Serie[] = useMemo(() => {
    const pick = (arr: Array<Record<string, number>> | null, key: string) =>
      arr ? arr.map((p) => p[key] ?? 0) : undefined;

    const defs =
      fieldMode && scopePoints
        ? ([
            ["email", "Email", "var(--l2)"],
            ["phone", "Phone", "var(--l1)"],
            ["address", "Address", "var(--ceiling)"],
          ] as const)
        : ([
            ["usable", "Total usable", "var(--l2)"],
            ["recoverable", "Opportunity remaining", "var(--recoverable)"],
            ["unrecoverable", "Unrecoverable", "var(--unrecoverable)"],
          ] as const);

    const src = (fieldMode ? scopePoints : points) as unknown as Array<Record<string, number>>;
    const cmp = (fieldMode ? scopeCompare : compare) as unknown as Array<
      Record<string, number>
    > | null;

    return defs.map(([key, label, color]) => {
      const prev = pick(cmp, key);
      return { key, label, color, values: pick(src, key) ?? [], ...(prev ? { prev } : {}) };
    });
  }, [fieldMode, scopePoints, scopeCompare, points, compare]);

  const shown = series.filter((s) => isOn(s.key));
  const hasCompare = !!(fieldMode ? scopeCompare : compare);

  const header = (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        {series.map((t) => (
          <label key={t.key} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={isOn(t.key)}
              onCheckedChange={() => setVisible((s) => ({ ...s, [t.key]: !isOn(t.key) }))}
              aria-label={t.label}
              style={{ "--primary": t.color, "--border": t.color } as React.CSSProperties}
            />
            <i className="size-3 rounded-[4px]" style={{ background: t.color }} />
            {t.label}
          </label>
        ))}
        {fieldMode && (
          <span className="text-xs text-muted-foreground">
            Fields of <span className="font-semibold text-foreground">{scopeLabel}</span>
          </span>
        )}
      </div>
      <div className="num mb-3 text-sm font-semibold">
        {rangeLabel}
        {compareLabel ? (
          <span className="font-normal text-muted-foreground"> vs {compareLabel}</span>
        ) : null}
      </div>
    </>
  );

  /* ------------------------------------------- comparison: two bars only */

  if (hasCompare) {
    const groups = shown.map((s) => ({
      ...s,
      current: sum(s.values),
      previous: sum(s.prev ?? []),
    }));
    const max = Math.max(1, ...groups.flatMap((g) => [g.current, g.previous]));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1] ?? max;
    const y = (v: number) => BOTTOM - (v / top) * (BOTTOM - TOP);
    const slot = (RIGHT - LEFT) / Math.max(1, groups.length);
    const barW = Math.min(96, slot / 3);

    return (
      <div className="w-full">
        {header}
        <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <i className="h-3 w-2.5 rounded-[3px] bg-foreground/70" /> {rangeLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-3 w-2.5 rounded-[3px] border border-foreground/50 bg-foreground/20" />{" "}
            {compareLabel}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Period comparison">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={LEFT} y1={y(v)} x2={RIGHT} y2={y(v)} stroke="var(--border)" strokeOpacity={v === 0 ? 1 : 0.55} />
              <text x={LEFT - 10} y={y(v) + 4} textAnchor="end" className="num" fill="var(--muted-foreground)" fontSize="12">
                {compact(v)}
              </text>
            </g>
          ))}
          <line x1={LEFT} y1={TOP} x2={LEFT} y2={BOTTOM} stroke="var(--border)" strokeWidth="1.5" />

          {groups.map((g, i) => {
            const cx = LEFT + slot * i + slot / 2;
            const bars = [
              { v: g.current, x: cx - barW - 6, prev: false },
              { v: g.previous, x: cx + 6, prev: true },
            ];
            const diff = g.previous ? (g.current - g.previous) / g.previous : 0;
            return (
              <g key={g.key}>
                {bars.map((b) => (
                  <g key={String(b.prev)}>
                    <rect
                      x={b.x}
                      y={y(b.v)}
                      width={barW}
                      height={Math.max(2, BOTTOM - y(b.v))}
                      rx="8"
                      fill={b.prev ? `color-mix(in oklab, ${g.color} 28%, var(--surface-2))` : g.color}
                      stroke={b.prev ? g.color : "none"}
                      strokeOpacity="0.5"
                    />
                    <text
                      x={b.x + barW / 2}
                      y={y(b.v) - 8}
                      textAnchor="middle"
                      className="num"
                      fill="var(--foreground)"
                      fontSize="14"
                      fontWeight="700"
                    >
                      {compact(b.v)}
                    </text>
                  </g>
                ))}
                <text x={cx} y={BOTTOM + 24} textAnchor="middle" fill="var(--foreground)" fontSize="14" fontWeight="600">
                  {g.label}
                </text>
                <text
                  x={cx}
                  y={BOTTOM + 44}
                  textAnchor="middle"
                  className="num"
                  fill={diff >= 0 ? "var(--l2)" : "var(--muted-foreground)"}
                  fontSize="13"
                  fontWeight="600"
                >
                  {diff >= 0 ? "+" : ""}
                  {(diff * 100).toFixed(1)}% vs comparison
                </text>
              </g>
            );
          })}

          <text
            x={(LEFT + RIGHT) / 2}
            y={H - 6}
            textAnchor="middle"
            className="num"
            fill="var(--muted-foreground)"
            fontSize="12"
            fontWeight="600"
          >
            {rangeLabel} vs {compareLabel}
          </text>
        </svg>
      </div>
    );
  }

  /* ---------------------------------------------- no comparison: line chart */

  const n = Math.max(points.length, 1);
  const max = Math.max(1, ...shown.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? max;
  const y = (v: number) => BOTTOM - (v / top) * (BOTTOM - TOP);
  const step = n > 1 ? (RIGHT - LEFT) / (n - 1) : 0;
  const px = (i: number) => (n > 1 ? LEFT + step * i : (LEFT + RIGHT) / 2);
  const labelStep = Math.max(1, Math.ceil(n / 12));

  const hp = hover !== null ? points[hover] : null;
  const hs = hover !== null && scopePoints ? scopePoints[hover] : null;

  return (
    <div className="relative w-full">
      {header}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Guest information over time">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={LEFT} y1={y(v)} x2={RIGHT} y2={y(v)} stroke="var(--border)" strokeOpacity={v === 0 ? 1 : 0.55} />
            <text x={LEFT - 10} y={y(v) + 4} textAnchor="end" className="num" fill="var(--muted-foreground)" fontSize="12">
              {compact(v)}
            </text>
          </g>
        ))}
        <line x1={LEFT} y1={TOP} x2={LEFT} y2={BOTTOM} stroke="var(--border)" strokeWidth="1.5" />
        <text
          x={22}
          y={(TOP + BOTTOM) / 2}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="12"
          fontWeight="600"
          transform={`rotate(-90 22 ${(TOP + BOTTOM) / 2})`}
        >
          Guest profiles
        </text>

        {hover !== null && (
          <line x1={px(hover)} y1={TOP} x2={px(hover)} y2={BOTTOM} stroke="var(--border)" strokeWidth="1.5" />
        )}

        {shown.map((s) => (
          <g key={s.key}>
            <polyline
              points={s.values.map((v, i) => `${px(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.values.map((v, i) =>
              hover === i || n <= 20 ? (
                <circle
                  key={i}
                  cx={px(i)}
                  cy={y(v)}
                  r={hover === i ? 5 : 3}
                  fill="var(--background)"
                  stroke={s.color}
                  strokeWidth="2.5"
                />
              ) : null,
            )}
          </g>
        ))}

        {points.map((p, i) =>
          i % labelStep === 0 ? (
            <text key={p.date} x={px(i)} y={BOTTOM + 22} textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">
              {p.label}
            </text>
          ) : null,
        )}
        <text
          x={(LEFT + RIGHT) / 2}
          y={H - 6}
          textAnchor="middle"
          className="num"
          fill="var(--muted-foreground)"
          fontSize="12"
          fontWeight="600"
        >
          {rangeLabel}
        </text>

        {points.map((_, i) => (
          <rect
            key={`h${i}`}
            x={px(i) - step / 2}
            y={TOP}
            width={Math.max(step, 8)}
            height={BOTTOM - TOP}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {hp && (
        <div
          className="panel pointer-events-none absolute top-24 z-20 w-72 rounded-xl border border-border p-3 text-xs shadow-lg"
          style={{
            left: `${(px(hover!) / W) * 100}%`,
            transform: `translateX(${px(hover!) > W / 2 ? "-110%" : "10%"})`,
            background: "var(--background)",
          }}
        >
          <div className="mb-2 font-semibold">{hp.label}</div>
          <dl className="space-y-1">
            {hs ? (
              <>
                <Row k="Email" v={hs.email} />
                <Row k="Phone" v={hs.phone} />
                <Row k="Address" v={hs.address} />
                <Row k={scopeLabel} v={hs.total} bold />
                <div className="my-1 border-t border-border" />
              </>
            ) : null}
            <Row k="Total usable" v={hp.usable} bold={!hs} />
            <Row k="Opportunity remaining" v={hp.recoverable} />
            <Row k="Unrecoverable" v={hp.unrecoverable} />
            <Row k="Bookings" v={hp.bookings} muted />
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({
  k,
  v,
  bold,
  muted,
}: {
  k: string;
  v: number;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${muted ? "text-muted-foreground" : ""}`}>
      <dt className={muted ? "" : "text-muted-foreground"}>{k}</dt>
      <dd className={`num ${bold ? "font-bold" : "font-semibold"}`}>{nf.format(Math.round(v))}</dd>
    </div>
  );
}
