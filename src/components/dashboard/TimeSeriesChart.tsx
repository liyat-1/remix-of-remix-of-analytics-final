import { useState } from "react";

import { compact, nf } from "@/lib/analytics-model";
import type { ChartSeries } from "@/lib/graph-series";

const W = 1120;
const H = 420;
const TOP = 24;
const BOTTOM = 330;
const LEFT = 76;
const RIGHT = W - 24;

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
  labels,
  series,
  rangeLabel,
  compareLabel,
}: {
  labels: string[];
  series: ChartSeries[];
  rangeLabel: string;
  compareLabel: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [barHover, setBarHover] = useState<number | null>(null);

  const hasCompare = !!compareLabel && series.some((s) => s.prev);

  const caption = (
    <div className="num mb-3 text-sm font-semibold">
      {rangeLabel}
      {compareLabel ? <span className="font-normal text-muted-foreground"> vs {compareLabel}</span> : null}
    </div>
  );

  if (series.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Select at least one series to plot.
      </div>
    );
  }

  /* ------------------------------------------ comparison: grouped bar chart */

  if (hasCompare) {
    const groups = series.map((s) => ({
      ...s,
      current: sum(s.values),
      previous: sum(s.prev ?? []),
    }));
    const max = Math.max(1, ...groups.flatMap((g) => [g.current, g.previous]));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1] ?? max;
    const y = (v: number) => BOTTOM - (v / top) * (BOTTOM - TOP);
    const slot = (RIGHT - LEFT) / Math.max(1, groups.length);
    const barW = Math.min(84, slot / 3);
    const hg = barHover !== null ? groups[barHover] : null;

    return (
      <div className="relative w-full">
        {caption}
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
              { v: g.current, x: cx - barW - 5, prev: false },
              { v: g.previous, x: cx + 5, prev: true },
            ];
            const diff = g.previous ? (g.current - g.previous) / g.previous : 0;
            const active = barHover === i;
            return (
              <g
                key={g.key}
                className="cursor-help"
                onMouseEnter={() => setBarHover(i)}
                onMouseLeave={() => setBarHover(null)}
              >
                <rect x={cx - slot / 2} y={TOP} width={slot} height={BOTTOM - TOP} fill="transparent" />
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
                      opacity={barHover !== null && !active ? 0.4 : 1}
                    />
                    <text
                      x={b.x + barW / 2}
                      y={y(b.v) - 8}
                      textAnchor="middle"
                      className="num pointer-events-none"
                      fill="var(--foreground)"
                      fontSize="13"
                      fontWeight="700"
                    >
                      {compact(b.v)}
                    </text>
                  </g>
                ))}
                <text
                  x={cx}
                  y={BOTTOM + 24}
                  textAnchor="middle"
                  className="pointer-events-none"
                  fill="var(--foreground)"
                  fontSize="13"
                  fontWeight="600"
                >
                  {g.label}
                </text>
                <text
                  x={cx}
                  y={BOTTOM + 44}
                  textAnchor="middle"
                  className="num pointer-events-none"
                  fill={diff >= 0 ? "var(--l2)" : "var(--muted-foreground)"}
                  fontSize="13"
                  fontWeight="600"
                >
                  {diff >= 0 ? "+" : ""}
                  {(diff * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}
        </svg>

        {hg && (
          <div
            className="panel pointer-events-none absolute top-16 z-20 w-64 rounded-xl border border-border p-3 text-xs shadow-lg"
            style={{
              left: `${((LEFT + slot * barHover! + slot / 2) / W) * 100}%`,
              transform: `translateX(${barHover! >= groups.length / 2 ? "-110%" : "10%"})`,
              background: "var(--background)",
            }}
          >
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <i className="size-3 rounded-[4px]" style={{ background: hg.color }} />
              {hg.label}
            </div>
            <dl className="space-y-1">
              <Row k={rangeLabel} v={hg.current} bold />
              <Row k={compareLabel ?? "Previous"} v={hg.previous} />
              <div className="flex justify-between gap-3 border-t border-border pt-1">
                <dt className="text-muted-foreground">Change</dt>
                <dd
                  className="num font-bold"
                  style={{ color: hg.current >= hg.previous ? "var(--l2)" : "var(--muted-foreground)" }}
                >
                  {hg.current - hg.previous >= 0 ? "+" : ""}
                  {nf.format(Math.round(hg.current - hg.previous))} (
                  {hg.previous
                    ? `${(((hg.current - hg.previous) / hg.previous) * 100).toFixed(1)}%`
                    : "—"}
                  )
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    );
  }

  /* ---------------------------------------------- no comparison: line chart */

  const n = Math.max(labels.length, 1);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? max;
  const y = (v: number) => BOTTOM - (v / top) * (BOTTOM - TOP);
  const step = n > 1 ? (RIGHT - LEFT) / (n - 1) : 0;
  const px = (i: number) => (n > 1 ? LEFT + step * i : (LEFT + RIGHT) / 2);
  const labelStep = Math.max(1, Math.ceil(n / 12));

  return (
    <div className="relative w-full">
      {caption}

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

        {series.map((s) => (
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

        {labels.map((l, i) =>
          i % labelStep === 0 ? (
            <text key={`${l}-${i}`} x={px(i)} y={BOTTOM + 22} textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">
              {l}
            </text>
          ) : null,
        )}
        <text
          x={(LEFT + RIGHT) / 2}
          y={H - 8}
          textAnchor="middle"
          className="num"
          fill="var(--muted-foreground)"
          fontSize="12"
          fontWeight="600"
        >
          {rangeLabel}
        </text>

        {labels.map((_, i) => (
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

      {hover !== null && (
        <div
          className="panel pointer-events-none absolute top-20 z-20 w-72 rounded-xl border border-border p-3 text-xs shadow-lg"
          style={{
            left: `${(px(hover) / W) * 100}%`,
            transform: `translateX(${px(hover) > W / 2 ? "-110%" : "10%"})`,
            background: "var(--background)",
          }}
        >
          <div className="mb-2 font-semibold">{labels[hover]}</div>
          <dl className="space-y-1">
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <i className="size-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </dt>
                <dd className="num font-semibold">{nf.format(Math.round(s.values[hover] ?? 0))}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`num ${bold ? "font-bold" : "font-semibold"}`}>{nf.format(Math.round(v))}</dd>
    </div>
  );
}
