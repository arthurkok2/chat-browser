import type { AnalyticsData } from "../../../server/types.js";
import type { AnalyticsPeriod } from "../../hooks/useAnalytics.js";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

interface Props {
  pulse: AnalyticsData["pulse"];
  period: AnalyticsPeriod;
  onPeriodChange: (p: AnalyticsPeriod) => void;
}

function delta(current: number, prev: number): { label: string; positive: boolean } | null {
  if (prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  return { label: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, positive: pct >= 0 };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: { label: string; positive: boolean } | null }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs font-medium text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      {sub && (
        <div className={`text-xs mt-1 ${sub.positive ? "text-emerald-400" : "text-rose-400"}`}>
          {sub.label} vs prev period
        </div>
      )}
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

export default function ActivityPulse({ pulse, period, onPeriodChange }: Props) {
  const PERIODS: AnalyticsPeriod[] = ["7d", "30d", "90d", "all"];

  const prevMap = new Map(pulse.daily_counts_prev.map(d => [d.date, d.count]));
  const chartData = pulse.daily_counts.map(d => ({
    date: d.date,
    this: d.count,
    prev: prevMap.get(d.date) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              period === p
                ? "bg-violet-700 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
            }`}
          >
            {p === "all" ? "All time" : p}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Sessions"
          value={String(pulse.sessions_this)}
          sub={delta(pulse.sessions_this, pulse.sessions_prev)}
        />
        <StatCard
          label="Avg / day"
          value={pulse.avg_per_day_this.toFixed(1)}
          sub={delta(pulse.avg_per_day_this, pulse.avg_per_day_prev)}
        />
        <StatCard
          label="Estimated hours"
          value={formatHours(pulse.hours_this)}
          sub={delta(pulse.hours_this, pulse.hours_prev)}
        />
        <StatCard
          label="Most active day"
          value={pulse.most_active_dow}
        />
      </div>

      {chartData.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Daily sessions</h3>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="this" fill="#7c3aed" radius={[3, 3, 0, 0]} name="This period" />
              <Line dataKey="prev" stroke="#475569" strokeWidth={1.5} dot={false} name="Prev period" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
