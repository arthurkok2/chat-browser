import { useState, useEffect } from "react";
import type { AnalyticsData } from "../../server/types.js";

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

interface AnalyticsParams {
  period: AnalyticsPeriod;
  project?: string;
}

interface AnalyticsState {
  data: AnalyticsData | null;
  loading: boolean;
}

export function useAnalytics(params: AnalyticsParams): AnalyticsState {
  const [state, setState] = useState<AnalyticsState>({ data: null, loading: true });

  useEffect(() => {
    setState((prev) => ({ ...prev, loading: true }));
    const sp = new URLSearchParams({ period: params.period });
    if (params.project) sp.set("project", params.project);

    fetch(`/api/analytics?${sp}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch analytics");
        return res.json();
      })
      .then((data: AnalyticsData) => setState({ data, loading: false }))
      .catch(() => setState((prev) => ({ ...prev, loading: false })));
  }, [params.period, params.project]);

  return state;
}
