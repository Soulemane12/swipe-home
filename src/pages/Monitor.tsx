import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import {
  clearQueuedMonitoringEvents,
  getQueuedMonitoringEvents,
  summarizeQueuedMonitoringMetrics,
  type MonitoringEvent,
} from "@/services/monitoring";

function formatRate(value: number | null): string {
  if (value === null) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function asString(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

const Monitor = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<MonitoringEvent[]>(() => getQueuedMonitoringEvents());

  const refresh = useCallback(() => {
    setEvents(getQueuedMonitoringEvents());
  }, []);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/swipe");
  }, [navigate]);

  useEffect(() => {
    const interval = setInterval(refresh, 2500);
    return () => clearInterval(interval);
  }, [refresh]);

  const metrics = useMemo(() => summarizeQueuedMonitoringMetrics(), [events]);
  const recentEvents = useMemo(() => [...events].reverse().slice(0, 120), [events]);

  const handleClear = useCallback(() => {
    clearQueuedMonitoringEvents();
    refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-background px-4 py-4 md:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Monitoring</h1>
              <p className="text-xs text-muted-foreground">
                Queue events: {events.length}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Queue
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Tag Parse Success</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatRate(metrics.tagExtraction.json_parse_success_rate)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Samples: {metrics.tagExtraction.count}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Tag Schema Valid</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatRate(metrics.tagExtraction.schema_valid_rate)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Null/Unknown avg: {formatRate(metrics.tagExtraction.null_or_unknown_tag_rate_avg)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Subway Match Rate</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatRate(metrics.tagExtraction.subway_line_match_rate_avg)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tag extraction quality
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Groundedness</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatRate(metrics.explanationQuality.groundedness_score_avg)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Samples: {metrics.explanationQuality.count}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Hallucination Rate</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatRate(metrics.explanationQuality.hallucination_rate)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Lower is better
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Constraint Compliance</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatRate(metrics.explanationQuality.constraint_compliance_rate)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Output format + length checks
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Recent Events</h2>
            <p className="text-xs text-muted-foreground">
              Showing latest {recentEvents.length} events from local queue
            </p>
          </div>
          <div className="max-h-[58vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 sticky top-0 z-10">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Listing</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                      No monitoring events yet. Swipe listings to generate telemetry.
                    </td>
                  </tr>
                )}
                {recentEvents.map((event) => {
                  const stage = asString(event.payload.stage, "—");
                  const listingId = asString(event.payload.listingId, "—");
                  const feedbackLabel = asString(event.payload.feedbackLabel, "");
                  const swipeDirection = asString(event.payload.swipeDirection, "");
                  const reason = asString(event.payload.reason, "");
                  const detailParts = [feedbackLabel, swipeDirection, reason].filter(Boolean);
                  const details = detailParts.length > 0 ? detailParts.join(" · ") : "—";
                  return (
                    <tr key={event.id} className="border-t border-border/70">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatTime(event.ts)}</td>
                      <td className="px-3 py-2 text-foreground">{event.type}</td>
                      <td className="px-3 py-2 text-foreground">{stage}</td>
                      <td className="px-3 py-2 text-foreground font-mono">{listingId}</td>
                      <td className="px-3 py-2 text-muted-foreground">{details}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Monitor;
