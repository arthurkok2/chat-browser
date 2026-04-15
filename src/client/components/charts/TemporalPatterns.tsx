import { useState } from "react";
import type { AnalyticsData } from "../../../server/types.js";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface Props {
  temporal: AnalyticsData["temporal"];
}

const TOOL_COLORS: Record<string, string> = {
  claude:  "#7c3aed",
  copilot: "#059669",
  codex:   "#0284c7",
};

function ActivityHeatmap({ heatmap }: { heatmap: { date: string; count: number }[] }) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  const maxCount = Math.max(...heatmap.map(d => d.count), 1);

  function cellColor(count: number): string {
    if (count === 0) return "#1e293b";
    const intensity = count / maxCount;
    if (intensity < 0.25) return "#4c1d95";
    if (intensity < 0.5)  return "#6d28d9";
    if (intensity < 0.75) return "#7c3aed";
    return "#a78bfa";
  }

  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < heatmap.length; i += 7) {
    weeks.push(heatmap.slice(i, i + 7));
  }

  const DOW_ABBR = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div className="relative overflow-x-auto">
      <div className="flex gap-0.5 min-w-max">
        <div className="flex flex-col gap-0.5 mr-1">
          {DOW_ABBR.map((d, i) => (
            <div key={i} className="h-3 w-5 text-[9px] text-slate-500 flex items-center">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((day, di) => (
              <div
                key={di}
                className="w-3 h-3 rounded-sm cursor-default"
                style={{ backgroundColor: cellColor(day.count) }}
                onMouseEnter={(e) => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  setTooltip({ date: day.date, count: day.count, x: rect.left, y: rect.top });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        ))}
      </div>
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 pointer-events-none"
          style={{ left: tooltip.x + 16, top: tooltip.y - 8 }}
        >
          {tooltip.date} · {tooltip.count} session{tooltip.count !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

export default function TemporalPatterns({ temporal }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Hour of day</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={temporal.by_hour}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickFormatter={h => `${h}h`} interval={3} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                labelStyle={{ color: "#e2e8f0" }}
                labelFormatter={h => `${h}:00`}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {temporal.by_hour.map((entry, i) => (
                  <Cell key={i} fill={TOOL_COLORS[entry.dominant_tool] ?? "#7c3aed"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Day of week</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={temporal.by_dow}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={l => l.slice(0, 3)} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Activity — last 52 weeks</h3>
        <ActivityHeatmap heatmap={temporal.heatmap} />
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-slate-500">Less</span>
          {["#1e293b", "#4c1d95", "#6d28d9", "#7c3aed", "#a78bfa"].map(c => (
            <div key={c} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
          <span className="text-xs text-slate-500">More</span>
        </div>
      </div>
    </div>
  );
}
