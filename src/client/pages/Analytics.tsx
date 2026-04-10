import { useState } from "react";
import { useAnalytics } from "../hooks/useAnalytics";
import SessionsOverTime from "../components/charts/SessionsOverTime";
import ToolUsage from "../components/charts/ToolUsage";
import ProjectBreakdown from "../components/charts/ProjectBreakdown";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs font-medium text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function Analytics() {
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");

  const { data, loading } = useAnalytics({ after, before });

  const handleExportCsv = () => {
    const params = new URLSearchParams({ format: "csv", type: "analytics" });
    if (after) params.set("after", after);
    if (before) params.set("before", before);
    window.open(`/api/export?${params}`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Loading analytics...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-slate-500">
        Failed to load analytics data.
      </div>
    );
  }

  const toolSplitStr = data.summary.tool_split
    ? Object.entries(data.summary.tool_split)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "N/A";

  return (
    <div className="space-y-6">
      {/* Header with date range and export */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400">After</label>
            <input
              type="date"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400">Before</label>
            <input
              type="date"
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          {(after || before) && (
            <button
              onClick={() => { setAfter(""); setBefore(""); }}
              className="text-xs text-slate-400 hover:text-slate-200 underline pb-1.5"
            >
              Clear
            </button>
          )}
        </div>
        <button
          onClick={handleExportCsv}
          className="px-4 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Sessions" value={formatNumber(data.summary.total_sessions)} />
        <SummaryCard label="Estimated Tokens" value={formatNumber(data.summary.total_tokens)} />
        <SummaryCard label="Projects" value={data.summary.unique_projects} />
        <SummaryCard label="Tool Split" value={toolSplitStr} />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SessionsOverTime data={data.sessions_over_time} />
        <ToolUsage data={data.tool_usage} />
        <ProjectBreakdown data={data.project_breakdown} />

        {/* Conversation lengths */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Conversation Lengths</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.conversation_lengths}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="bucket" tick={{ fill: "#94a3b8", fontSize: 12 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                labelStyle={{ color: "#e2e8f0" }}
                itemStyle={{ color: "#2dd4bf" }}
              />
              <Bar dataKey="count" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
