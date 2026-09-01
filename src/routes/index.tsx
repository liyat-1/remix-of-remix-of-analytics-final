import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, ChartColumn, ChartPie, Sparkles } from "lucide-react";

import { CompletenessBar } from "@/components/dashboard/CompletenessBar";
import { ControlsBar } from "@/components/dashboard/ControlsBar";
import { GraphControls } from "@/components/dashboard/GraphControls";
import { HeroBridge } from "@/components/dashboard/HeroBridge";
import {
  MixDonut,
  MixLegend,
  SourceToggles,
  type Breakdown,
  type SourceKey,
} from "@/components/dashboard/UsableMixPie";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import {
  DEFAULT_PROPERTY,
  DEFAULT_SELECTION,
  aggregate,
  compact,
  formatRange,
  getRows,
  nf,
  pct,
  resolveComparison,
  resolvePeriod,
  stageFields,
  toTotals,
  type ComparisonId,
  type PeriodId,
  type PropertyId,
  type Range,
  type Selection,
} from "@/lib/analytics-model";
import {
  DEFAULT_EXPANSION,
  buildChartSeries,
  dayLabels,
  resolveNodes,
  type Expansion,
  type GraphMode,
} from "@/lib/graph-series";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Guest Information Opportunity — Enrichment Analytics" },
      {
        name: "description",
        content:
          "See how OTA Buster turns raw OTA guest data into usable guest information: baseline, Whois AI, Level 2 enrichment, the opportunity still open and what is unrecoverable.",
      },
      { property: "og:title", content: "Guest Information Opportunity — Enrichment Analytics" },
      {
        property: "og:description",
        content:
          "Usable guest information from OTA baseline through Level 1 and Level 2 enrichment, against total bookings received.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [property, setProperty] = useState<PropertyId>(DEFAULT_PROPERTY);
  const [period, setPeriod] = useState<PeriodId>("15d");
  const [customRange, setCustomRange] = useState<Range | null>(null);
  const [comparison, setComparison] = useState<ComparisonId>("off");
  const [customCompare, setCustomCompare] = useState<Range | null>(null);
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION);
  const [breakdown, setBreakdown] = useState<Breakdown>({ ota: false, l1: false, l2: false });
  const [chartView, setChartView] = useState<"pie" | "bridge">("pie");

  // Time graph state
  const [graphMode, setGraphMode] = useState<GraphMode>("totals");
  const [expansion, setExpansion] = useState<Expansion>(DEFAULT_EXPANSION);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const range = useMemo(() => resolvePeriod(period, customRange), [period, customRange]);
  const compareRange = useMemo(
    () => resolveComparison(comparison, range, customCompare),
    [comparison, range, customCompare],
  );

  const rows = useMemo(() => getRows(property, range), [property, range]);
  const compareRows = useMemo(
    () => (compareRange ? getRows(property, compareRange) : null),
    [property, compareRange],
  );

  const a = useMemo(() => aggregate(rows, selection, range), [rows, selection, range]);
  const prevA = useMemo(
    () => (compareRows && compareRange ? aggregate(compareRows, selection, compareRange) : null),
    [compareRows, selection, compareRange],
  );

  const fields = useMemo(() => stageFields(a, selection), [a, selection]);
  const t = useMemo(() => toTotals(a), [a]);
  const layers = { ota: selection.ota, l1: selection.l1, l2: selection.l2 };
  const l2detail = { journey: a.journey, staff: a.staff, idscan: a.idscan, duringStay: a.duringStay };

  const nodes = useMemo(
    () => resolveNodes(graphMode, selection, expansion),
    [graphMode, selection, expansion],
  );
  const visibleNodes = nodes.filter((n) => !hidden[n.key]);
  const chartSeries = useMemo(
    () => buildChartSeries(visibleNodes, rows, compareRows, selection),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleNodes.map((n) => n.key).join(","), rows, compareRows, selection],
  );
  const labels = useMemo(() => dayLabels(rows), [rows]);

  const rangeLabel = formatRange(range);
  const compareLabel = compareRange ? formatRange(compareRange) : null;

  const toggleSource = (k: SourceKey) =>
    setSelection((s) => {
      const next = { ...s, [k]: !s[k] };
      if (!next.ota && !next.l1 && !next.l2) return s;
      return next;
    });

  const toggleBreakdown = (k: SourceKey) => setBreakdown((b) => ({ ...b, [k]: !b[k] }));
  const toggleSel = (k: keyof Selection) => setSelection((s) => ({ ...s, [k]: !s[k] }));

  return (
    <main className="mx-auto w-full max-w-[1400px] px-5 py-10 lg:px-10">
      <header className="mb-6">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/60 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Sparkles className="size-3.5 text-primary" /> OTA Buster · Guest information opportunity
        </p>
        <h1 className="text-3xl font-bold lg:text-4xl">
          Your OTA data is the starting point — not the value.
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          How many bookings arrived, how much guest information is usable, how much is still
          recoverable, and how much can never be recovered.
        </p>
      </header>

      <ControlsBar
        property={property}
        onProperty={setProperty}
        period={period}
        onPeriod={setPeriod}
        customRange={customRange}
        onCustomRange={setCustomRange}
        comparison={comparison}
        onComparison={setComparison}
        customCompare={customCompare}
        onCustomCompare={setCustomCompare}
        currentRange={range}
        compareRange={compareRange}
      />

      <section className="panel mb-6 flex flex-wrap items-center justify-between gap-6 p-6 lg:p-8">
        <div className="flex items-end gap-4">
          <span className="num text-5xl font-bold text-muted-foreground lg:text-6xl">
            {compact(a.ota)}
          </span>
          <ArrowUpRight className="mb-3 size-8 text-primary" />
          <span className="num text-6xl font-bold text-primary lg:text-7xl">{compact(a.usable)}</span>
          <div className="mb-2">
            <div className="num text-xl font-bold text-primary">{pct(a.totalUplift)}</div>
            <div className="text-sm text-muted-foreground">more usable guest information</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-4">
          <Stat label="Total bookings" value={nf.format(a.bookings)} />
          <Stat label="Total usable" value={nf.format(Math.round(a.usable))} tone="primary" />
          <Stat label="Opportunity remaining" value={nf.format(Math.round(a.recoverable))} muted />
          <Stat label="Unrecoverable" value={nf.format(Math.round(a.unrecoverable))} muted />
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[1.75fr_1fr]">
        <section
          role="button"
          tabIndex={0}
          onClick={() => setGraphMode("sources")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setGraphMode("sources");
          }}
          className={`panel cursor-pointer p-6 transition-shadow lg:p-8 ${
            graphMode === "sources" ? "ring-2 ring-primary/60" : "hover:ring-1 hover:ring-primary/30"
          }`}
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Usable mix</h2>
              <p className="text-sm text-muted-foreground">
                Every booking is usable, still recoverable, or unrecoverable.
              </p>
              <p className="num mt-1 text-xs text-muted-foreground">
                {rangeLabel}
                {compareLabel ? ` · vs ${compareLabel}` : ""}
              </p>
              <p className="mt-1 text-xs text-primary">
                {graphMode === "sources"
                  ? "Tracked over time in the graph below"
                  : "Click this card to track these sources over time"}
              </p>
            </div>
            <div
              className="flex rounded-xl border border-border bg-surface-2/60 p-1"
              onClick={(e) => e.stopPropagation()}
            >
              {(
                [
                  ["pie", "Pie", ChartPie],
                  ["bridge", "Bridge", ChartColumn],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setChartView(id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    chartView === id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            {chartView === "pie" ? (
              <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
                <div className="flex justify-center">
                  <MixDonut a={a} sel={selection} bd={breakdown} size={340} />
                </div>
                <MixLegend
                  a={a}
                  prev={prevA}
                  sel={selection}
                  bd={breakdown}
                  onToggleSource={toggleSource}
                  onToggleBreakdown={toggleBreakdown}
                  onToggleSel={toggleSel}
                />
              </div>
            ) : (
              <>
                <SourceToggles sel={selection} onToggle={toggleSource} />
                <HeroBridge
                  t={t}
                  layers={layers}
                  fields={fields}
                  l2={l2detail}
                  bookings={a.bookings}
                  unrecoverable={a.unrecoverable}
                  rangeLabel={rangeLabel}
                />
              </>
            )}
          </div>
        </section>

        <section className="panel p-6 lg:p-8">
          <h2 className="mb-1 text-xl font-semibold">Information completeness by level</h2>
          <p className="text-sm text-muted-foreground">
            How complete guest information is, and which enrichment level completed it.
          </p>
          <p className="num mt-1 mb-5 text-xs text-muted-foreground">{rangeLabel}</p>
          <CompletenessBar a={a} sel={selection} />
        </section>
      </div>

      <section className="panel mt-6 p-6 lg:p-8">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Over time</h2>
            <p className="text-sm text-muted-foreground">
              {graphMode === "totals"
                ? "Daily usable, opportunity remaining and unrecoverable."
                : "Traction per source. Expand a level to replace it with its components."}
            </p>
          </div>
          <div className="flex rounded-xl border border-border bg-surface-2/60 p-1">
            {(
              [
                ["totals", "Totals"],
                ["sources", "Sources"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setGraphMode(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  graphMode === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <GraphControls
          nodes={nodes}
          hidden={hidden}
          onToggleVisible={(k) => setHidden((h) => ({ ...h, [k]: !h[k] }))}
          expansion={expansion}
          onToggleExpand={(k) => setExpansion((e) => ({ ...e, [k]: !e[k] }))}
        />

        <TimeSeriesChart
          labels={labels}
          series={chartSeries}
          rangeLabel={rangeLabel}
          compareLabel={compareLabel}
        />
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: "primary";
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div
        className={`num text-xl font-bold ${
          tone === "primary" ? "text-primary" : muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
