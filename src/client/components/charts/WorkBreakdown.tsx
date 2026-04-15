import type { AnalyticsData } from "../../../server/types.js";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  breakdown: AnalyticsData["breakdown"];
  onProjectClick?: (project: string) => void;
}

const TOOL_COLORS: Record<string, string> = {
  claude:  "#7c3aed",
  copilot: "#059669",
  codex:   "#0284c7",
};

export default function WorkBreakdown({ breakdown, onProjectClick }: Props) {
  const projectData = breakdown.projects.map(p => ({
    name: p.decoded,
    encoded: p.project,
    sessions: p.sessions,
    hours: Number(p.hours.toFixed(1)),
  }));

  const branchData = breakdown.branches.map(b => ({
    name: b.branch,
    sessions: b.sessions,
  }));

  const totalSessions = breakdown.tool_split.reduce((s, t) => s + t.sessions, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Top projects</h3>
          {projectData.length === 0 ? (
            <div className="text-slate-500 text-sm py-8 text-center">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, projectData.length * 32)}>
              <BarChart data={projectData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category" dataKey="name" width={140}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={v => v.length > 20 ? v.slice(0, 19) + "…" : v}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                  labelStyle={{ color: "#e2e8f0" }}
                  formatter={(value, name) => [value, name === "sessions" ? "Sessions" : "Hours"]}
                />
                <Bar
                  dataKey="sessions" fill="#7c3aed" radius={[0, 4, 4, 0]}
                  cursor={onProjectClick ? "pointer" : "default"}
                  onClick={(d) => onProjectClick?.(d.encoded)}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Top branches</h3>
          {branchData.length === 0 ? (
            <div className="text-slate-500 text-sm py-8 text-center">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, branchData.length * 32)}>
              <BarChart data={branchData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category" dataKey="name" width={120}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={v => v.length > 18 ? v.slice(0, 17) + "…" : v}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                  labelStyle={{ color: "#e2e8f0" }}
                />
                <Bar dataKey="sessions" fill="#0284c7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {breakdown.tool_split.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Tool split</h3>
          <div className="flex rounded-lg overflow-hidden h-8">
            {breakdown.tool_split.map(t => (
              <div
                key={t.tool}
                style={{
                  width: `${(t.sessions / totalSessions) * 100}%`,
                  backgroundColor: TOOL_COLORS[t.tool] ?? "#475569",
                }}
                className="flex items-center justify-center text-xs font-medium text-white whitespace-nowrap px-2 overflow-hidden"
                title={`${t.tool}: ${t.sessions} sessions`}
              >
                {(t.sessions / totalSessions) * 100 > 12 ? `${t.tool} · ${t.sessions}` : ""}
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2">
            {breakdown.tool_split.map(t => (
              <div key={t.tool} className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TOOL_COLORS[t.tool] ?? "#475569" }} />
                {t.tool} · {t.sessions}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
