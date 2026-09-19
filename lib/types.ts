export interface MonitoredService {
  name: string;
  url: string;
}

export type ServiceStatus = "up" | "down";

export interface CheckedService extends MonitoredService {
  status: ServiceStatus;
  responseTime: number | null;
}

export type OverallStatus = "operational" | "degraded" | "down";

export interface StatusResponse {
  overall: OverallStatus;
  services: CheckedService[];
  checkedAt: string;
}