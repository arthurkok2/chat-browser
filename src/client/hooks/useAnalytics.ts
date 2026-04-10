import { useState, useEffect } from "react";

interface AnalyticsParams {
  after?: string;
  before?: string;
}

interface AnalyticsData {
  summary: {
    total_sessions: number;
    total_messages: number;
    total_tokens: number;
    unique_projects: number;
    tool_split: Record<string, number>;
  };
  sessions_over_time: { date: string; count: number }[];
  tool_breakdown: { tool: string; count: number }[];
  project_breakdown: { project: string; count: number }[];
  tool_usage: { tool_name: string; count: number }[];
  conversation_lengths: { bucket: string; count: number }[];
  branch_breakdown: { branch: string; count: number }[];
}

interface AnalyticsState {
  data: AnalyticsData | null;
  loading: boolean;
}

export function useAnalytics(params: AnalyticsParams): AnalyticsState {
  const [state, setState] = useState<AnalyticsState>({
    data: null,
    loading: true,
  });

  useEffect(() => {
    setState((prev) => ({ ...prev, loading: true }));

    const searchParams = new URLSearchParams();
    if (params.after) searchParams.set("after", params.after);
    if (params.before) searchParams.set("before", params.before);

    fetch(`/api/analytics?${searchParams}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch analytics");
        return res.json();
      })
      .then((data) => {
        setState({ data, loading: false });
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loading: false }));
      });
  }, [params.after, params.before]);

  return state;
}
