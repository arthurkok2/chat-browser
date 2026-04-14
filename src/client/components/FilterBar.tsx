interface FilterBarProps {
  tool: string;
  onToolChange: (value: string) => void;
  project: string;
  onProjectChange: (value: string) => void;
  branch: string;
  onBranchChange: (value: string) => void;
  after: string;
  onAfterChange: (value: string) => void;
  before: string;
  onBeforeChange: (value: string) => void;
  includeSubagents: boolean;
  onIncludeSubagentsChange: (value: boolean) => void;
  onClearAll: () => void;
  projects?: string[];
  branches?: string[];
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
    </div>
  );
}

export default function FilterBar({
  tool,
  onToolChange,
  project,
  onProjectChange,
  branch,
  onBranchChange,
  after,
  onAfterChange,
  before,
  onBeforeChange,
  includeSubagents,
  onIncludeSubagentsChange,
  onClearAll,
  projects = [],
  branches = [],
}: FilterBarProps) {
  const hasFilters = !!(tool || project || branch || after || before || includeSubagents);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectField
        label="Tool"
        value={tool}
        onChange={onToolChange}
        options={[
          { value: "", label: "All Tools" },
          { value: "claude", label: "Claude" },
          { value: "copilot", label: "Copilot" },
          { value: "codex", label: "Codex" },
        ]}
      />

      <SelectField
        label="Project"
        value={project}
        onChange={onProjectChange}
        options={[
          { value: "", label: "All Projects" },
          ...projects.map((p) => ({ value: p, label: p })),
        ]}
      />

      <SelectField
        label="Branch"
        value={branch}
        onChange={onBranchChange}
        options={[
          { value: "", label: "All Branches" },
          ...branches.map((b) => ({ value: b, label: b })),
        ]}
      />

      <DateField label="After" value={after} onChange={onAfterChange} />
      <DateField label="Before" value={before} onChange={onBeforeChange} />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-400">Subagents</label>
        <button
          onClick={() => onIncludeSubagentsChange(!includeSubagents)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
            includeSubagents
              ? "bg-violet-700 border-violet-500 text-white"
              : "bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200"
          }`}
        >
          {includeSubagents ? "Included" : "Excluded"}
        </button>
      </div>

      {hasFilters && (
        <button
          onClick={onClearAll}
          className="text-xs text-slate-400 hover:text-slate-200 underline pb-1.5"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
