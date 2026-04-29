import { useState, useEffect } from "react";

export interface StatusData {
  sessions: number;
  messages: number;
  watcher: "active" | "recovering" | "dead";
  last_indexed_at: number | null;
}

interface StatusState {
  data: StatusData | null;
  loading: boolean;
}

const POLL_INTERVAL_MS = 10_000;

export function useStatus(): StatusState {
  const [state, setState] = useState<StatusState>({ data: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    function fetchStatus() {
      fetch("/api/status")
        .then((res) => {
          if (!res.ok) throw new Error("status fetch failed");
          return res.json() as Promise<StatusData>;
        })
        .then((data) => {
          if (!cancelled) setState({ data, loading: false });
        })
        .catch(() => {
          if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
        });
    }

    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
