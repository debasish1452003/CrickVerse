// Lightweight, dependency-free SVG charts over the per-innings over rollup.
// Worm = cumulative runs per over (innings overlaid); Manhattan = runs per over
// with wickets flagged. Pure presentational; safe in a server component.

import type { InningsOversData, OverPoint } from "@/dto/match-dto";

const SERIES_COLORS = ["#22c55e", "#38bdf8", "#f59e0b", "#f472b6"];

function maxOver(innings: InningsOversData[]): number {
  return Math.max(1, ...innings.map((i) => i.overs.length));
}
function maxCum(innings: InningsOversData[]): number {
  return Math.max(1, ...innings.flatMap((i) => i.overs.map((o) => o.c)));
}
function maxRuns(overs: OverPoint[]): number {
  return Math.max(1, ...overs.map((o) => o.r));
}

/** Cumulative-runs line chart, all innings overlaid. */
function Worm({ innings, labels }: { innings: InningsOversData[]; labels: (n: number) => string }) {
  const W = 640;
  const H = 220;
  const padL = 36;
  const padB = 24;
  const padT = 10;
  const padR = 10;
  const ox = maxOver(innings);
  const oy = maxCum(innings);
  const x = (over: number) => padL + (over / ox) * (W - padL - padR);
  const y = (runs: number) => H - padB - (runs / oy) * (H - padB - padT);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[480px]" role="img" aria-label="Cumulative runs by over">
        {/* y gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(oy * t)} y2={y(oy * t)} stroke="rgba(16,24,40,0.08)" />
            <text x={4} y={y(oy * t) + 3} fontSize="9" fill="rgba(16,24,40,0.45)">
              {Math.round(oy * t)}
            </text>
          </g>
        ))}
        {innings.map((inn, idx) => {
          const color = SERIES_COLORS[idx % SERIES_COLORS.length]!;
          const pts = inn.overs.map((o) => `${x(o.o + 1)},${y(o.c)}`).join(" ");
          return (
            <g key={inn.inningsNo}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
              {/* wicket dots */}
              {inn.overs
                .filter((o) => o.w > 0)
                .map((o) => (
                  <circle key={o.o} cx={x(o.o + 1)} cy={y(o.c)} r="2.5" fill="#ef4444" />
                ))}
            </g>
          );
        })}
        {/* x label */}
        <text x={W - padR} y={H - 6} fontSize="9" fill="rgba(16,24,40,0.45)" textAnchor="end">
          Over {ox}
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        {innings.map((inn, idx) => (
          <span key={inn.inningsNo} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-3 rounded-sm"
              style={{ background: SERIES_COLORS[idx % SERIES_COLORS.length] }}
            />
            {labels(inn.inningsNo)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-red-500" /> wicket
        </span>
      </div>
    </div>
  );
}

/** Runs-per-over bars for one innings, wickets flagged red. */
function Manhattan({ data, label }: { data: InningsOversData; label: string }) {
  const W = 640;
  const H = 160;
  const padL = 28;
  const padB = 20;
  const padT = 8;
  const my = maxRuns(data.overs);
  const n = Math.max(1, data.overs.length);
  const bw = (W - padL - 6) / n;
  const y = (runs: number) => H - padB - (runs / my) * (H - padB - padT);

  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-xs text-muted">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[480px]" role="img" aria-label={`Runs per over — ${label}`}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 6} y1={y(my * t)} y2={y(my * t)} stroke="rgba(16,24,40,0.08)" />
            <text x={2} y={y(my * t) + 3} fontSize="9" fill="rgba(16,24,40,0.45)">
              {Math.round(my * t)}
            </text>
          </g>
        ))}
        {data.overs.map((o) => {
          const h = H - padB - y(o.r);
          return (
            <rect
              key={o.o}
              x={padL + o.o * bw + 1}
              y={y(o.r)}
              width={Math.max(1, bw - 2)}
              height={Math.max(0, h)}
              rx="1"
              fill={o.w > 0 ? "#ef4444" : "#38bdf8"}
              opacity={o.w > 0 ? 0.95 : 0.7}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function OverCharts({
  innings,
  teamLabel,
}: {
  innings: InningsOversData[];
  teamLabel: (inningsNo: number) => string;
}) {
  const withData = innings.filter((i) => i.overs.length > 0);
  if (withData.length === 0) return null;
  return (
    <section className="card mt-6 p-5 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted">Worm — cumulative runs</h3>
      <Worm innings={withData} labels={teamLabel} />
      <h3 className="mb-4 mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-muted">
        Manhattan — runs per over
      </h3>
      <div className="flex flex-col gap-5">
        {withData.map((inn) => (
          <Manhattan key={inn.inningsNo} data={inn} label={teamLabel(inn.inningsNo)} />
        ))}
      </div>
    </section>
  );
}
