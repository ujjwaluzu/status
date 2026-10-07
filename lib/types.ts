export type ServiceStatus = "up" | "down" | "paused" | "unknown";

export type OverallStatus = "operational" | "degraded" | "down" | "unknown";

export type HistoryCell = "up" | "down" | "unknown";

export type MonitoringErrorCode =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "unavailable"
  | "unexpected";

export interface MonitoredService {
  id: string;
  name: string;
  url: string;
  uptimeRobotMonitorId?: string;
}

export interface StatusService {
  id: string;
  name: string;
  url: string;
  status: ServiceStatus;
  uptime: number | null;
  responseTime: number | null;
  recentChecks: HistoryCell[];
}

export interface StatusIncident {
  id: string;
  serviceId: string | null;
  serviceName: string;
  startedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  reason: string;
  ongoing: boolean;
}

export interface StatusMeta {
  uptimePeriodDays: number;
  responseTimePeriodHours: number;
  historyPeriodHours: number;
  incidentPeriodDays: number;
}

export interface StatusResponse {
  overall: {
    status: OverallStatus;
    label: string;
  };
  lastChecked: string;
  fresh: boolean;
  services: StatusService[];
  incidents: StatusIncident[] | null;
  meta: StatusMeta;
}

export interface StatusErrorResponse {
  error: {
    code: MonitoringErrorCode;
    message: string;
  };
}
