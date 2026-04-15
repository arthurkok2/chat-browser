import type { AnalyticsData } from "../../../server/types.js";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Props {
  behavior: AnalyticsData["behavior"];
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function AvgCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs font-medium text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function MiniHistogram({ data, color }: { data: { bucket: string; count: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="bucket" tick={{ fill: "#94a3b8", fontSize: 10 }} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
          labelStyle={{ color: "#e2e8f0" }}
          itemStyle={{ color: "#e2e8f0" }}
        />
        <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function BehaviorStats({ behavior }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <AvgCard
          label="Avg session duration"
          value={formatDuration(behavior.avg_duration_ms)}
          sub="Median across sessions"
        />
        <AvgCard
          label="Avg autonomy ratio"
          value={`${behavior.avg_autonomy_pct.toFixed(0)}%`}
          sub="Tool msgs / total msgs"
        />
        <AvgCard
          label="Avg depth"
          value={String(Math.round(behavior.avg_depth))}
          sub="Median user messages / session"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Session duration</h3>
          <MiniHistogram data={behavior.duration_hist} color="#7c3aed" />
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Autonomy ratio</h3>
          <MiniHistogram data={behavior.autonomy_hist} color="#0284c7" />
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Session depth</h3>
          <MiniHistogram data={behavior.depth_hist} color="#059669" />
        </div>
      </div>
    </div>
  );
}
