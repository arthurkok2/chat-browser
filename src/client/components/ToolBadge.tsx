const toolColors: Record<string, string> = {
  claude: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  copilot: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  codex: "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

const toolLabels: Record<string, string> = {
  claude: "Claude",
  copilot: "Copilot",
  codex: "Codex",
};

interface ToolBadgeProps {
  tool: string;
  size?: "sm" | "md";
}

export default function ToolBadge({ tool, size = "sm" }: ToolBadgeProps) {
  const colors = toolColors[tool] || "bg-slate-500/20 text-slate-300 border-slate-500/30";
  const label = toolLabels[tool] || tool;

  return (
    <span
      className={`inline-flex items-center border rounded-full font-medium ${colors} ${
        size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1"
      }`}
    >
      {label}
    </span>
  );
}
