import { services } from "@/lib/services";
import type {
  HistoryCell,
  OverallStatus,
  StatusIncident,
  StatusMeta,
  StatusResponse,
  StatusService,
  ServiceStatus,
} from "@/lib/types";
import {
  getMonitorResponseTimeStats,
  getMonitorUptimeStats,
  listIncidents,
  listMonitors,
  type UrHistogramPoint,
  type UrIncident,
  type UrMonitor,
  type UrResponseTimeStats,
  type UrTimestamp,
  type UrUptimeStats,
} from "@/lib/uptimerobot";

const MONITORS_TTL_MS = 60_000;
const STATS_TTL_MS = 600_000;
const INCIDENTS_TTL_MS = 300_000;
const FAILURE_BACKOFF_MS = 15_000;
const HISTORY_POINTS = 24;
const MAX_INCIDENTS = 20;

export const STATUS_META: StatusMeta = {
  uptimePeriodDays: 30,
  responseTimePeriodHours: 24,
  historyPeriodHours: 24,
  incidentPeriodDays: 30,
};

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

let monitorsCache: CacheEntry<UrMonitor[]> | null = null;
let monitorsInFlight: Promise<UrMonitor[]> | null = null;

let uptimeCache: CacheEntry<Map<number, UrUptimeStats>> | null = null;
let uptimeInFlight: Promise<void> | null = null;

let responseCache: CacheEntry<Map<number, UrResponseTimeStats>> | null = null;
let responseInFlight: Promise<void> | null = null;

let incidentsCache: CacheEntry<UrIncident[]> | null = null;
let incidentsInFlight: Promise<UrIncident[]> | null = null;

let upstreamBackoffUntil = 0;

function isFresh(entry: CacheEntry<unknown> | null, ttl: number): boolean {
  return entry !== null && Date.now() - entry.fetchedAt <= ttl;
}

function isBackingOff(): boolean {
  return Date.now() < upstreamBackoffUntil;
}

function noteUpstreamFailure(): void {
  upstreamBackoffUntil = Date.now() + FAILURE_BACKOFF_MS;
}

function ensureMonitors(): Promise<UrMonitor[]> {
  if (isFresh(monitorsCache, MONITORS_TTL_MS)) {
    return Promise.resolve(monitorsCache!.value);
  }

  if (monitorsCache !== null && isBackingOff()) {
    return Promise.resolve(monitorsCache.value);
  }

  if (monitorsInFlight === null) {
    const request = fetchMonitors().finally(() => {
      if (monitorsInFlight === request) {
        monitorsInFlight = null;
      }
    });
    monitorsInFlight = request;
  }

  return monitorsInFlight;
}

async function fetchMonitors(): Promise<UrMonitor[]> {
  try {
    const value = await listMonitors();
    monitorsCache = { value, fetchedAt: Date.now() };
    return value;
  } catch (error) {
    noteUpstreamFailure();
    if (monitorsCache !== null) {
      return monitorsCache.value;
    }
    throw error;
  }
}

function ensureUptimeStats(monitors: UrMonitor[]): Promise<void> {
  if (isFresh(uptimeCache, STATS_TTL_MS) || isBackingOff()) {
    return Promise.resolve();
  }

  if (uptimeInFlight === null) {
    const request = fetchUptimeStats(monitors).finally(() => {
      if (uptimeInFlight === request) {
        uptimeInFlight = null;
      }
    });
    uptimeInFlight = request;
  }

  return uptimeInFlight;
}

async function fetchUptimeStats(monitors: UrMonitor[]): Promise<void> {
  const to = new Date();
  const from = new Date(
    to.getTime() - STATUS_META.uptimePeriodDays * 24 * 60 * 60 * 1000
  );
  const previous = uptimeCache?.value ?? new Map<number, UrUptimeStats>();
  const next = new Map(previous);
  let successes = 0;

  await Promise.all(
    monitors.map(async (monitor) => {
      try {
        const stats = await getMonitorUptimeStats(monitor.id, from, to);
        next.set(monitor.id, stats);
        successes += 1;
      } catch {
        // Keep the previous value for this monitor, if one exists.
      }
    })
  );

  if (successes === 0) {
    noteUpstreamFailure();
    return;
  }

  uptimeCache = { value: next, fetchedAt: Date.now() };
}

function ensureResponseStats(monitors: UrMonitor[]): Promise<void> {
  if (isFresh(responseCache, STATS_TTL_MS) || isBackingOff()) {
    return Promise.resolve();
  }

  if (responseInFlight === null) {
    const request = fetchResponseStats(monitors).finally(() => {
      if (responseInFlight === request) {
        responseInFlight = null;
      }
    });
    responseInFlight = request;
  }

  return responseInFlight;
}

async function fetchResponseStats(monitors: UrMonitor[]): Promise<void> {
  const to = new Date();
  const from = new Date(
    to.getTime() - STATUS_META.responseTimePeriodHours * 60 * 60 * 1000
  );
  const previous = responseCache?.value ?? new Map<number, UrResponseTimeStats>();
  const next = new Map(previous);
  let successes = 0;

  await Promise.all(
    monitors.map(async (monitor) => {
      try {
        const stats = await getMonitorResponseTimeStats(monitor.id, from, to);
        next.set(monitor.id, stats);
        successes += 1;
      } catch {
        // Keep the previous value for this monitor, if one exists.
      }
    })
  );

  if (successes === 0) {
    noteUpstreamFailure();
    return;
  }

  responseCache = { value: next, fetchedAt: Date.now() };
}

function ensureIncidents(): Promise<UrIncident[]> {
  if (isFresh(incidentsCache, INCIDENTS_TTL_MS)) {
    return Promise.resolve(incidentsCache!.value);
  }

  if (incidentsCache !== null && isBackingOff()) {
    return Promise.resolve(incidentsCache.value);
  }

  if (incidentsInFlight === null) {
    const request = fetchIncidents().finally(() => {
      if (incidentsInFlight === request) {
        incidentsInFlight = null;
      }
    });
    incidentsInFlight = request;
  }

  return incidentsInFlight;
}

async function fetchIncidents(): Promise<UrIncident[]> {
  const startedAfter = new Date(
    Date.now() - STATUS_META.incidentPeriodDays * 24 * 60 * 60 * 1000
  );

  try {
    const value = await listIncidents(startedAfter);
    incidentsCache = { value, fetchedAt: Date.now() };
    return value;
  } catch (error) {
    noteUpstreamFailure();
    if (incidentsCache !== null) {
      return incidentsCache.value;
    }
    throw error;
  }
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ""}${path}`;
  } catch {
    return null;
  }
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function resolveMonitor(service: (typeof services)[number], monitors: UrMonitor[]): UrMonitor | null {
  if (service.uptimeRobotMonitorId) {
    const monitorId = Number(service.uptimeRobotMonitorId);
    if (Number.isFinite(monitorId)) {
      const byId = monitors.find((monitor) => monitor.id === monitorId);
      if (byId) return byId;
    }
  }

  const targetUrl = normalizeUrl(service.url);
  if (targetUrl) {
    const byUrl = monitors.find((monitor) => normalizeUrl(monitor.url) === targetUrl);
    if (byUrl) return byUrl;
  }

  const targetHost = hostnameOf(service.url);
  if (targetHost) {
    const byHost = monitors.find((monitor) => hostnameOf(monitor.url) === targetHost);
    if (byHost) return byHost;
  }

  return null;
}

function mapMonitorStatus(status: string): ServiceStatus {
  switch (status) {
    case "UP":
      return "up";
    case "DOWN":
    case "LOOKS_DOWN":
      return "down";
    case "PAUSED":
      return "paused";
    default:
      return "unknown";
  }
}

function bucketToCell(point: UrHistogramPoint, bucketSize: number): HistoryCell {
  const raw = point.uptime;
  if (!Number.isFinite(raw) || raw < 0) return "unknown";

  let percent = raw;
  if (raw > 100) {
    if (bucketSize > 0) {
      percent = (raw / bucketSize) * 100;
    } else {
      return "unknown";
    }
  }

  return percent >= 100 ? "up" : "down";
}

function historyCells(monitor: UrMonitor): HistoryCell[] {
  const bucketSize = monitor.lastDayUptimes?.bucketSize ?? 0;
  const histogram = [...(monitor.lastDayUptimes?.histogram ?? [])]
    .filter((point) => Number.isFinite(point.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-HISTORY_POINTS);

  return histogram.map((point) => bucketToCell(point, bucketSize));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toIso(value: UrTimestamp | null | undefined): string | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const milliseconds = value < 1e12 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }

  return null;
}

function buildIncidents(matchedMonitorIds: Set<number>): StatusIncident[] | null {
  const cache = incidentsCache;
  if (cache === null) return null;

  const serviceByMonitorId = new Map<number, (typeof services)[number]>();
  for (const service of services) {
    const monitor = resolveMonitor(service, monitorsCache?.value ?? []);
    if (monitor) serviceByMonitorId.set(monitor.id, service);
  }

  const incidents: StatusIncident[] = [];

  for (const incident of cache.value) {
    const monitorId = incident.monitor?.id;
    if (typeof monitorId !== "number" || !matchedMonitorIds.has(monitorId)) {
      continue;
    }

    const startedAt = toIso(incident.startedAt);
    if (startedAt === null) continue;

    const resolvedAt = toIso(incident.resolvedAt);
    const service = serviceByMonitorId.get(monitorId);

    incidents.push({
      id: incident.id,
      serviceId: service?.id ?? null,
      serviceName: service?.name ?? monitorNameOf(incident),
      startedAt,
      resolvedAt,
      durationSeconds:
        typeof incident.duration === "number" && incident.duration >= 0
          ? incident.duration
          : null,
      reason: incident.reason?.trim() || "Downtime detected",
      ongoing: resolvedAt === null,
    });
  }

  incidents.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return incidents.slice(0, MAX_INCIDENTS);
}

function monitorNameOf(incident: UrIncident): string {
  const friendlyName = incident.monitor?.friendlyName?.trim();
  return friendlyName && friendlyName.length > 0 ? friendlyName : "Unknown service";
}

function computeOverall(statuses: ServiceStatus[]): {
  status: OverallStatus;
  label: string;
} {
  if (statuses.length === 0) {
    return { status: "unknown", label: "Monitoring data unavailable" };
  }

  const downCount = statuses.filter((status) => status === "down").length;
  const upCount = statuses.filter((status) => status === "up").length;

  if (downCount === statuses.length) {
    return { status: "down", label: "Major outage" };
  }

  if (downCount > 0) {
    return {
      status: "degraded",
      label: "Some systems are experiencing issues",
    };
  }

  if (upCount === 0) {
    return { status: "unknown", label: "Monitoring data unavailable" };
  }

  return { status: "operational", label: "All systems operational" };
}

function buildPayload(monitors: UrMonitor[]): StatusResponse {
  const checkedMonitors = new Map<number, UrMonitor>();
  const statusList: ServiceStatus[] = [];

  const servicesPayload: StatusService[] = services.map((service) => {
    const monitor = resolveMonitor(service, monitors);
    if (!monitor) {
      statusList.push("unknown");
      return {
        id: service.id,
        name: service.name,
        url: service.url,
        status: "unknown",
        uptime: null,
        responseTime: null,
        recentChecks: [],
      };
    }

    checkedMonitors.set(monitor.id, monitor);
    const status = mapMonitorStatus(monitor.status as string);
    statusList.push(status);

    const uptimeStats = uptimeCache?.value.get(monitor.id) ?? null;
    const responseStats = responseCache?.value.get(monitor.id) ?? null;
    const averageResponse = responseStats?.summary.avg;

    return {
      id: service.id,
      name: service.name,
      url: service.url,
      status,
      uptime:
        uptimeStats && Number.isFinite(uptimeStats.uptime)
          ? round(uptimeStats.uptime, 2)
          : null,
      responseTime:
        typeof averageResponse === "number" && Number.isFinite(averageResponse)
          ? Math.round(averageResponse)
          : null,
      recentChecks: historyCells(monitor),
    };
  });

  const fetchedAt = monitorsCache?.fetchedAt ?? Date.now();

  return {
    overall: computeOverall(statusList),
    lastChecked: new Date(fetchedAt).toISOString(),
    fresh: isFresh(monitorsCache, MONITORS_TTL_MS),
    services: servicesPayload,
    incidents: buildIncidents(new Set(checkedMonitors.keys())),
    meta: STATUS_META,
  };
}

export async function getStatusSnapshot(): Promise<StatusResponse> {
  const monitors = await ensureMonitors();

  const uptimeRefresh = ensureUptimeStats(monitors);
  if (uptimeCache === null) {
    await uptimeRefresh.catch(() => undefined);
  } else {
    void uptimeRefresh.catch(() => undefined);
  }

  void ensureResponseStats(monitors).catch(() => undefined);
  void ensureIncidents().catch(() => undefined);

  return buildPayload(monitors);
}
