import { useEffect, useState } from "react";

import { withBase } from "../lib/basePath";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; version: string }
  | { status: "error"; message: string };

export function HealthIndicator() {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(withBase("/api/health"), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { version: string };
        setState({ status: "ok", version: body.version });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({ status: "error", message });
      });
    return () => controller.abort();
  }, []);

  const dot =
    state.status === "ok"
      ? "bg-ok"
      : state.status === "error"
        ? "bg-err"
        : "bg-warn animate-pulse";

  const label =
    state.status === "ok"
      ? `v${state.version}`
      : state.status === "error"
        ? "offline"
        : "checking…";

  const title =
    state.status === "ok"
      ? `Backend up · v${state.version}`
      : state.status === "error"
        ? `Backend unreachable · ${state.message}`
        : "Checking backend…";

  return (
    <div
      title={title}
      className="hidden items-center gap-2 rounded-full border border-border bg-panel px-2.5 py-1 text-[11px] sm:inline-flex"
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="font-mono text-muted">{label}</span>
    </div>
  );
}
