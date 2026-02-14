export type FeedbackLabel =
  | "wrong_commute"
  | "wrong_price_fit"
  | "wrong_explanation"
  | "not_similar_to_likes";

export interface MonitoringEvent {
  id: string;
  type: string;
  ts: number;
  sessionId: string;
  payload: Record<string, unknown>;
}

export interface MonitoringProvider {
  emit(event: MonitoringEvent): Promise<void>;
}

const MONITOR_QUEUE_KEY = "monitoringEventQueue_v1";
const MONITOR_ENDPOINT_ENV = (import.meta.env.VITE_MONITOR_ENDPOINT as string | undefined)?.trim();
const MONITOR_ENDPOINT = MONITOR_ENDPOINT_ENV || "/api/monitor";
const SHOULD_USE_HTTP_PROVIDER = Boolean(MONITOR_ENDPOINT_ENV) || import.meta.env.PROD;

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function createEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getFilterSessionPart() {
  const parsed = safeJsonParse<{
    priceType?: "rent" | "buy" | "both";
    bedrooms?: number | null;
    bathrooms?: number | null;
  }>(localStorage.getItem("listingFilters"));

  const priceType = parsed?.priceType || "rent";
  const beds = parsed?.bedrooms ?? "any";
  const baths = parsed?.bathrooms ?? "any";
  return `${priceType}_${beds}_${baths}`;
}

export function getMonitoringSessionId(): string {
  return `swipeSession_v1_${getFilterSessionPart()}`;
}

function appendToQueue(event: MonitoringEvent) {
  const queue = safeJsonParse<MonitoringEvent[]>(localStorage.getItem(MONITOR_QUEUE_KEY)) || [];
  queue.push(event);
  // Keep queue bounded so localStorage does not grow forever.
  const capped = queue.slice(-2000);
  localStorage.setItem(MONITOR_QUEUE_KEY, JSON.stringify(capped));
}

class LocalQueueProvider implements MonitoringProvider {
  async emit(event: MonitoringEvent) {
    appendToQueue(event);
  }
}

class ApiProvider implements MonitoringProvider {
  async emit(event: MonitoringEvent) {
    const response = await fetch(MONITOR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      throw new Error(`Monitor endpoint failed: ${response.status}`);
    }
  }
}

export class WhiteCircleProvider implements MonitoringProvider {
  async emit(_event: MonitoringEvent) {
    // Placeholder until White Circle provides private ingestion docs/credentials.
    throw new Error("WhiteCircleProvider not configured");
  }
}

class FallbackProvider implements MonitoringProvider {
  constructor(
    private readonly primary: MonitoringProvider,
    private readonly fallback: MonitoringProvider
  ) {}

  async emit(event: MonitoringEvent) {
    try {
      await this.primary.emit(event);
    } catch (error) {
      await this.fallback.emit({
        ...event,
        payload: {
          ...event.payload,
          deliveryError: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

let provider: MonitoringProvider = SHOULD_USE_HTTP_PROVIDER
  ? new FallbackProvider(
      new ApiProvider(),
      new LocalQueueProvider()
    )
  : new LocalQueueProvider();

export function setMonitoringProvider(next: MonitoringProvider) {
  provider = next;
}

export async function monitorEvent(type: string, payload: Record<string, unknown>) {
  const event: MonitoringEvent = {
    id: createEventId(),
    type,
    ts: Date.now(),
    sessionId: getMonitoringSessionId(),
    payload,
  };

  try {
    await provider.emit(event);
  } catch {
    // Never throw from monitoring; app flow must continue.
  }
}

export function getQueuedMonitoringEvents(): MonitoringEvent[] {
  return safeJsonParse<MonitoringEvent[]>(localStorage.getItem(MONITOR_QUEUE_KEY)) || [];
}

export function clearQueuedMonitoringEvents() {
  localStorage.removeItem(MONITOR_QUEUE_KEY);
}

function toRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

export function summarizeQueuedMonitoringMetrics() {
  const events = getQueuedMonitoringEvents();
  const tagEvents = events.filter((e) => e.payload.stage === "tag_extraction_complete");
  const explanationEvents = events.filter((e) => e.payload.stage === "explanation_quality");

  const parseSuccessCount = tagEvents.filter((e) => e.payload.jsonParseSuccess === true).length;
  const schemaValidCount = tagEvents.filter((e) => e.payload.schemaValid === true).length;
  const unknownRates = tagEvents
    .map((e) => Number(e.payload.nullOrUnknownTagRate))
    .filter((v) => Number.isFinite(v));
  const subwayMatchRates = tagEvents
    .map((e) => Number(e.payload.subwayLineMatchRate))
    .filter((v) => Number.isFinite(v));

  const groundedness = explanationEvents
    .map((e) => Number(e.payload.groundednessScore))
    .filter((v) => Number.isFinite(v));
  const hallucinations = explanationEvents.filter((e) => e.payload.hallucinationFlag === true).length;
  const constraintCompliant = explanationEvents.filter((e) => e.payload.constraintCompliance === true).length;

  const avg = (values: number[]) =>
    values.length === 0 ? null : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));

  return {
    tagExtraction: {
      count: tagEvents.length,
      json_parse_success_rate: toRate(parseSuccessCount, tagEvents.length),
      schema_valid_rate: toRate(schemaValidCount, tagEvents.length),
      null_or_unknown_tag_rate_avg: avg(unknownRates),
      subway_line_match_rate_avg: avg(subwayMatchRates),
    },
    explanationQuality: {
      count: explanationEvents.length,
      groundedness_score_avg: avg(groundedness),
      hallucination_rate: toRate(hallucinations, explanationEvents.length),
      constraint_compliance_rate: toRate(constraintCompliant, explanationEvents.length),
    },
  };
}
