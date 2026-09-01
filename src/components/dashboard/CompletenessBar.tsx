import { nf, type Agg, type Selection } from "@/lib/analytics-model";

type Row = {
  key: string;
  label: string;
  value: number;
  depth: number;
  color: string;
};

function shade(v: string, amount: number) {
  return `color-mix(in oklab, ${v} ${amount}%, var(--surface-2))`;
}

/**
 * Information completeness — a completion ring plus per-level fill bars showing
 * which level completed how much of the guest information.
 */
export function CompletenessBar({ a, sel }: { a: Agg; sel: Selection }) {
  const total = Math.max(1, a.bookings);
  const complete = a.usable / total;

  // Completeness is about what enrichment completed — the OTA baseline arrives
  // complete by definition, so it is not a level here.
  const rows: Row[] = [];
  if (sel.l1) rows.push({ key: "l1", label: "Level 1 — Whois AI", value: a.l1, depth: 0, color: "var(--l1)" });
  if (sel.l2) {
    rows.push({ key: "l2", label: "Level 2", value: a.l2, depth: 0, color: "var(--l2)" });
    rows.push({ key: "journey", label: "Guest Journey", value: a.journey, depth: 1, color: shade("var(--l2)", 78) });
    rows.push({ key: "during", label: "During Stay", value: a.duringStay, depth: 1, color: shade("var(--l2)", 62) });
    rows.push({ key: "staff", label: "Staff Collection", value: a.staff, depth: 2, color: shade("var(--l2)", 46) });
    rows.push({ key: "idscan", label: "ID Scan", value: a.idscan, depth: 2, color: shade("var(--l2)", 32) });
  }

  const peak = Math.max(1, ...rows.map((r) => r.value));


  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <div className="w-full">
      <div className="flex items-center gap-6">
        <svg viewBox="0 0 140 140" className="size-32 shrink-0" role="img" aria-label="Completeness">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
          <circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${C * complete} ${C}`}
            transform="rotate(-90 70 70)"
            className="transition-[stroke-dasharray] duration-700"
          />
          <text x="70" y="70" textAnchor="middle" className="num" fill="var(--foreground)" fontSize="24" fontWeight="700">
            {(complete * 100).toFixed(1)}%
          </text>
          <text x="70" y="88" textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">
            Complete
          </text>
        </svg>

        <div className="min-w-0 flex-1 space-y-3">
          {rows.map((r) => (
            <div key={r.key} style={{ paddingLeft: r.depth * 14 }}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={r.depth ? "text-muted-foreground" : "font-medium"}>{r.label}</span>
                <span className="num font-semibold">{nf.format(Math.round(r.value))}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${(r.value / peak) * 100}%`, background: r.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="num">
          {nf.format(Math.round(a.usable))} of {nf.format(a.bookings)} guest info complete
        </span>
        <span className="num font-semibold text-primary">
          Enrichment +{nf.format(Math.round(a.enrichment))}
        </span>
      </div>
    </div>
  );
}
