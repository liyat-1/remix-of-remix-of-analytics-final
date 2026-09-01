import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, ChartColumn, ChartPie, Sparkles } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { CompletenessBar } from "@/components/dashboard/CompletenessBar";
import { ControlsBar } from "@/components/dashboard/ControlsBar";
import { HeroBridge } from "@/components/dashboard/HeroBridge";
import { MixDonut, MixLegend, type Breakdown, type SourceKey } from "@/components/dashboard/UsableMixPie";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import {
  DEFAULT_PROPERTY,
  DEFAULT_SELECTION,
  aggregate,
  buildScopeSeries,
  buildSeries,
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
  type LeafKey,
  type PeriodId,
  type PropertyId,
  type Range,
  type Selection,
} from "@/lib/analytics-model";

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

type ScopeNode = { key: LeafKey; label: string; depth: number };

function Dashboard() {
  const [property, setProperty] = useState<PropertyId>(DEFAULT_PROPERTY);
  const [period, setPeriod] = useState<PeriodId>("15d");
  const [customRange, setCustomRange] = useState<Range | null>(null);
  const [comparison, setComparison] = useState<ComparisonId>("off");
  const [customCompare, setCustomCompare] = useState<Range | null>(null);
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION);
  const [breakdown, setBreakdown] = useState<Breakdown>({ ota: false, l1: false, l2: false });
  const [scopeOff, setScopeOff] = useState<Partial<Record<LeafKey, boolean>>>({});
  const [chartView, setChartView] = useState<"pie" | "bridge">("pie");

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
  const series = useMemo(() => buildSeries(rows, selection), [rows, selection]);
  const compareSeries = useMemo(
    () => (compareRows ? buildSeries(compareRows, selection) : null),
    [compareRows, selection],
  );

  // Which breakdown nodes the time chart can follow, driven by the pie's
  // "Show breakdown" checkboxes.
  const scopeNodes: ScopeNode[] = useMemo(() => {
    const out: ScopeNode[] = [];
    if (selection.ota && breakdown.ota) out.push({ key: "ota", label: "OTA baseline", depth: 0 });
    if (selection.l1 && breakdown.l1) out.push({ key: "l1", label: "Level 1 — Whois AI", depth: 0 });
    if (selection.l2 && breakdown.l2) {
      out.push({ key: "journey", label: "Guest Journey", depth: 0 });
      out.push({ key: "staff", label: "During Stay · Staff Collection", depth: 1 });
      out.push({ key: "idscan", label: "During Stay · ID Scan Collection", depth: 1 });
    }
    return out;
  }, [selection, breakdown]);

  const activeScope = scopeNodes.filter((n) => !scopeOff[n.key]);
  const scopeKeys = activeScope.map((n) => n.key);

  const scopePoints = useMemo(
    () => (scopeKeys.length ? buildScopeSeries(rows, selection, scopeKeys) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, selection, scopeKeys.join(",")],
  );
  const scopeCompare = useMemo(
    () => (compareRows && scopeKeys.length ? buildScopeSeries(compareRows, selection, scopeKeys) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compareRows, selection, scopeKeys.join(",")],
  );

  const scopeLabel =
    activeScope.length === 0
      ? "Total usable"
      : activeScope.length > 2
        ? "Selected breakdown"
        : activeScope.map((n) => n.label).join(" + ");

  const t = useMemo(() => toTotals(a), [a]);
  const layers = { ota: selection.ota, l1: selection.l1, l2: selection.l2 };
  const l2detail = { journey: a.journey, staff: a.staff, idscan: a.idscan, duringStay: a.duringStay };

  const toggleSource = (k: SourceKey) =>
    setSelection((s) => {
      const next = { ...s, [k]: !s[k] };
      if (!next.ota && !next.l1 && !next.l2) return s;
      return next;
    });

  const toggleBreakdown = (k: SourceKey) => setBreakdown((b) => ({ ...b, [k]: !b[k] }));

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

      <div className="grid items-start gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="panel p-6 lg:p-8">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Usable mix</h2>
              <p className="text-sm text-muted-foreground">
                Every booking is usable, still recoverable, or unrecoverable.
              </p>
            </div>
            <div className="flex rounded-xl border border-border bg-surface-2/60 p-1">
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

          {chartView === "pie" ? (
            <div className="space-y-6">
              <div className={prevA ? "grid gap-6 md:grid-cols-2" : "flex justify-center"}>
                <MixDonut
                  a={a}
                  sel={selection}
                  bd={breakdown}
                  title={prevA ? "Current period" : "Selected period"}
                  rangeLabel={formatRange(range)}
                  size={prevA ? 320 : 380}
                />
                {prevA && compareRange && (
                  <MixDonut
                    a={prevA}
                    sel={selection}
                    bd={breakdown}
                    title="Previous period"
                    rangeLabel={formatRange(compareRange)}
                    size={320}
                  />
                )}
              </div>
              <MixLegend
                a={a}
                prev={prevA}
                sel={selection}
                bd={breakdown}
                onToggleSource={toggleSource}
                onToggleBreakdown={toggleBreakdown}
              />
            </div>
          ) : (
            <HeroBridge t={t} layers={layers} fields={fields} l2={l2detail} />
          )}
        </section>

        <section className="panel p-6 lg:p-8">
          <h2 className="mb-1 text-xl font-semibold">Information completeness by level</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            How complete guest information is, and which level completed it.
          </p>
          <CompletenessBar a={a} sel={selection} />
        </section>
      </div>

      <section className="panel mt-6 p-6 lg:p-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Over time</h2>
          <p className="text-sm text-muted-foreground">
            {scopeKeys.length
              ? "Field-level progress for the selected breakdown. Hover keeps the remaining and unrecoverable context."
              : "Daily usable, opportunity remaining and unrecoverable. Turn on Show breakdown in the pie to follow fields over time."}
          </p>
        </div>

        {scopeNodes.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-surface-2/40 p-3">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Breakdown scope
            </span>
            {scopeNodes.map((nde) => (
              <label
                key={nde.key}
                className="flex cursor-pointer items-center gap-2 text-sm"
                style={{ paddingLeft: nde.depth * 12 }}
              >
                <Checkbox
                  checked={!scopeOff[nde.key]}
                  onCheckedChange={() =>
                    setScopeOff((s) => ({ ...s, [nde.key]: !s[nde.key] }))
                  }
                  aria-label={nde.label}
                />
                {nde.label}
              </label>
            ))}
          </div>
        )}

        <TimeSeriesChart
          points={series}
          compare={compareSeries}
          scopePoints={scopePoints}
          scopeCompare={scopeCompare}
          scopeLabel={scopeLabel}
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
