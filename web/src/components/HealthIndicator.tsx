import { useEffect, useState } from "react";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; version: string }
  | { status: "error"; message: string };

export function HealthIndicator() {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
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
      ? "bg-emerald-500"
      : state.status === "error"
        ? "bg-rose-500"
        : "bg-amber-400 animate-pulse";

  const label =
    state.status === "ok"
      ? `backend up · v${state.version}`
      : state.status === "error"
        ? `backend unreachable · ${state.message}`
        : "checking backend…";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/60 px-3 py-1.5 text-xs">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span className="font-mono text-ink/80">{label}</span>
    </div>
  );
}
