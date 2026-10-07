import type { MonitoringErrorCode } from "@/lib/types";

const BASE_URL = "https://api.uptimerobot.com/v3";
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_PER_MINUTE = 9;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_PAGES = 5;
const MAX_RETRIES = 2;

export class UptimeRobotError extends Error {
  readonly code: MonitoringErrorCode;
  readonly status: number | null;

  constructor(
    code: MonitoringErrorCode,
    message: string,
    status: number | null = null
  ) {
    super(message);
    this.name = "UptimeRobotError";
    this.code = code;
    this.status = status;
  }
}

export type UrMonitorStatus =
  | "UP"
  | "DOWN"
  | "LOOKS_DOWN"
  | "PAUSED"
  | "STARTED";

export type UrTimestamp = string | number;

export interface UrHistogramPoint {
  timestamp: number;
  uptime: number;
  changes?: number;
}

export interface UrLastDayUptimes {
  bucketSize: number;
  totalChanges?: number;
  histogram: UrHistogramPoint[];
}

export interface UrMonitor {
  id: number;
  friendlyName: string;
  status: UrMonitorStatus;
  url: string;
  interval?: number;
  lastDayUptimes?: UrLastDayUptimes | null;
}

export interface UrMonitorPage {
  nextLink?: string | null;
  data: UrMonitor[] | null;
}

export interface UrUptimeStats {
  uptime: number;
  total_downtime_seconds: number;
  incident_count: number;
  mtbf: number | null;
  from: string;
  to: string;
}

export interface UrResponseTimeSummary {
  min: number | null;
  max: number | null;
  avg: number | null;
}

export interface UrResponseTimeStats {
  summary: UrResponseTimeSummary;
  data_points: number;
  from: string;
  to: string;
}

export interface UrIncidentMonitor {
  id: number;
  friendlyName: string | null;
}

export interface UrIncident {
  id: string;
  reason: string;
  monitor: UrIncidentMonitor;
  startedAt: UrTimestamp;
  resolvedAt: UrTimestamp | null;
  duration: number | null;
}

export interface UrIncidentPage {
  nextLink?: string | null;
  data: UrIncident[] | null;
}

interface RateWaiter {
  blocking: boolean;
  resolve: () => void;
}

const rateTimestamps: number[] = [];
const rateWaiters: RateWaiter[] = [];
let rateTimer: ReturnType<typeof setTimeout> | null = null;

function pruneRateWindow(now: number): void {
  while (
    rateTimestamps.length > 0 &&
    now - rateTimestamps[0] >= RATE_WINDOW_MS
  ) {
    rateTimestamps.shift();
  }
}

function hasRateSlot(now: number): boolean {
  pruneRateWindow(now);
  return rateTimestamps.length < RATE_LIMIT_PER_MINUTE;
}

function scheduleRateDrain(delayMs: number): void {
  if (rateTimer !== null) return;
  rateTimer = setTimeout(() => {
    rateTimer = null;
    drainRateWaiters();
  }, delayMs);
}

function drainRateWaiters(): void {
  const now = Date.now();

  while (rateWaiters.length > 0) {
    const preferred = rateWaiters.findIndex((waiter) => waiter.blocking);
    const index = preferred === -1 ? 0 : preferred;
    if (!hasRateSlot(now)) break;
    rateTimestamps.push(now);
    rateWaiters.splice(index, 1)[0].resolve();
  }

  if (rateWaiters.length > 0) {
    pruneRateWindow(Date.now());
    const delay =
      rateTimestamps.length > 0
        ? Math.max(rateTimestamps[0] + RATE_WINDOW_MS - Date.now(), 25)
        : 25;
    scheduleRateDrain(delay);
  }
}

async function acquireRateSlot(blocking: boolean): Promise<void> {
  const now = Date.now();
  if (rateWaiters.length === 0 && hasRateSlot(now)) {
    rateTimestamps.push(now);
    return;
  }

  await new Promise<void>((resolve) => {
    rateWaiters.push({ blocking, resolve });
    scheduleRateDrain(25);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(): string {
  const apiKey = process.env.UPTIMEROBOT_API_KEY?.trim();
  if (!apiKey) {
    throw new UptimeRobotError(
      "not_configured",
      "UPTIMEROBOT_API_KEY is not configured on the server."
    );
  }
  return apiKey;
}

function isRateLimitRetryAfter(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header === null ? Number.NaN : Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, RATE_WINDOW_MS);
  }
  return 5_000;
}

async function requestJson<T>(
  path: string,
  options: { blocking?: boolean } = {}
): Promise<T> {
  if (typeof window !== "undefined") {
    throw new UptimeRobotError(
      "unexpected",
      "The UptimeRobot client cannot run in the browser."
    );
  }

  const apiKey = getApiKey();
  const blocking = options.blocking ?? false;
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

  let attempt = 0;

  for (;;) {
    await acquireRateSlot(blocking);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new UptimeRobotError(
        "unavailable",
        "Could not reach the UptimeRobot API."
      );
    }

    if (response.status === 429) {
      await response.body?.cancel().catch(() => undefined);
      if (attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(isRateLimitRetryAfter(response) + 250);
        continue;
      }
      throw new UptimeRobotError(
        "rate_limited",
        "UptimeRobot API rate limit reached.",
        429
      );
    }

    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      throw new UptimeRobotError(
        "unauthorized",
        "UptimeRobot rejected the configured API key.",
        response.status
      );
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new UptimeRobotError(
        "unavailable",
        "UptimeRobot API returned an error response.",
        response.status
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new UptimeRobotError(
        "unexpected",
        "UptimeRobot API returned an unreadable response."
      );
    }
  }
}

export async function listMonitors(): Promise<UrMonitor[]> {
  const monitors: UrMonitor[] = [];
  let path: string | null = "/monitors?limit=200";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (typeof path !== "string") break;
    const body: UrMonitorPage = await requestJson<UrMonitorPage>(path, {
      blocking: true,
    });
    monitors.push(...(body.data ?? []));
    path = body.nextLink ?? null;
  }

  return monitors;
}

export async function getMonitorUptimeStats(
  monitorId: number,
  from: Date,
  to: Date
): Promise<UrUptimeStats> {
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return requestJson<UrUptimeStats>(
    `/monitors/${monitorId}/stats/uptime?${query.toString()}`
  );
}

export async function getMonitorResponseTimeStats(
  monitorId: number,
  from: Date,
  to: Date
): Promise<UrResponseTimeStats> {
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return requestJson<UrResponseTimeStats>(
    `/monitors/${monitorId}/stats/response-time?${query.toString()}`
  );
}

export async function listIncidents(startedAfter: Date): Promise<UrIncident[]> {
  const incidents: UrIncident[] = [];
  const query = new URLSearchParams({
    started_after: startedAfter.toISOString(),
  });
  let path: string | null = `/incidents?${query.toString()}`;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (typeof path !== "string") break;
    const body: UrIncidentPage = await requestJson<UrIncidentPage>(path);
    incidents.push(...(body.data ?? []));
    path = body.nextLink ?? null;
  }


  return incidents;
}
