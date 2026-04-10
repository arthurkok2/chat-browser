import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ProjectBreakdownProps {
  data: { project: string; count: number }[];
}

export default function ProjectBreakdown({ data }: ProjectBreakdownProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Most Active Projects</h3>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
        <BarChart data={data.slice(0, 15)} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} allowDecimals={false} />
          <YAxis
            dataKey="project"
            type="category"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            width={140}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
            labelStyle={{ color: "#e2e8f0" }}
            itemStyle={{ color: "#34d399" }}
          />
          <Bar dataKey="count" fill="#34d399" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
