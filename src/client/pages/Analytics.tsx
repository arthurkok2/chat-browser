import { useState } from "react";
import { useAnalytics, type AnalyticsPeriod } from "../hooks/useAnalytics";
import ActivityPulse from "../components/charts/ActivityPulse";
import WorkBreakdown from "../components/charts/WorkBreakdown";
import BehaviorStats from "../components/charts/BehaviorStats";
import TemporalPatterns from "../components/charts/TemporalPatterns";

export default function Analytics() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);

  const { data, loading } = useAnalytics({ period, project: projectFilter });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Loading analytics...</div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-20 text-slate-500">Failed to load analytics.</div>;
  }

  return (
    <div className="space-y-8">
      {projectFilter && (
        <div className="flex items-center gap-3 px-4 py-2 bg-violet-900/30 border border-violet-700/50 rounded-lg text-sm">
          <span className="text-violet-300">Filtered to project: <strong>{projectFilter}</strong></span>
          <button
            onClick={() => setProjectFilter(undefined)}
            className="text-violet-400 hover:text-violet-200 underline text-xs"
          >
            Clear
          </button>
        </div>
      )}

      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-4">Activity pulse</h2>
        <ActivityPulse
          pulse={data.pulse}
          period={period}
          onPeriodChange={(p) => { setPeriod(p); setProjectFilter(undefined); }}
        />
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-4">Work breakdown</h2>
        <WorkBreakdown
          breakdown={data.breakdown}
          onProjectClick={(p) => setProjectFilter(prev => prev === p ? undefined : p)}
        />
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-4">Conversation behavior</h2>
        <BehaviorStats behavior={data.behavior} />
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-4">Temporal patterns</h2>
        <TemporalPatterns temporal={data.temporal} />
      </section>
    </div>
  );
}
