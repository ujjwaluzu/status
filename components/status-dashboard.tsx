"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hostOf } from "@/lib/services";
import type {
  HistoryCell,
  OverallStatus,
  ServiceStatus,
  StatusIncident,
  StatusMeta,
  StatusResponse,
} from "@/lib/types";

const POLL_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 1_000;

const SERVICE_COPY: Record<ServiceStatus, string> = {
  up: "Operational",
  down: "Down",
  paused: "Paused",
  unknown: "Unknown",
};

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatElapsed(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

function formatUptime(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function formatResponseTime(value: number | null): string {
  return value === null ? "—" : `${value}ms`;
}

function formatIncidentDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? "—" : DATE_FORMAT.format(new Date(parsed));
}

function formatDuration(seconds: number | null, ongoing: boolean): string {
  if (ongoing) return "Ongoing";
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(seconds / 3600);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={spinning ? "refresh__icon refresh__icon--spin" : "refresh__icon"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function HistoryBars({ cells }: { cells: HistoryCell[] }) {
  if (cells.length === 0) {
    return <span className="metric__value metric__value--muted">—</span>;
  }

  return (
    <div className="checks__bars" aria-hidden="true">
      {cells.map((cell, index) => (
        <span key={index} className={`bar bar--${cell}`} />
      ))}
    </div>
  );
}

function IncidentRow({ incident }: { incident: StatusIncident }) {
  return (
    <li className="incident">
      <div className="incident__main">
        <span className="incident__service">{incident.serviceName}</span>
        <span className="incident__reason">{incident.reason}</span>
      </div>
      <div className="incident__meta">
        <span
          className={`incident__state${
            incident.ongoing ? " incident__state--ongoing" : ""
          }`}
        >
          {incident.ongoing ? "Ongoing" : "Resolved"}
        </span>
        <span className="incident__date">
          {formatIncidentDate(incident.startedAt)}
        </span>
        <span className="incident__duration">
          {formatDuration(incident.durationSeconds, incident.ongoing)}
        </span>
      </div>
    </li>
  );
}

export function StatusDashboard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inFlightRef = useRef(false);
  const startedRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setChecking(true);

    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Status endpoint returned ${response.status}`);
      }
      const payload = (await response.json()) as StatusResponse;
      setData(payload);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      inFlightRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runCheck();
    const pollId = window.setInterval(
      () => void runCheck(),
      POLL_INTERVAL_MS
    );
    return () => window.clearInterval(pollId);
  }, [runCheck]);

  useEffect(() => {
    const tickId = window.setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => window.clearInterval(tickId);
  }, []);

  const checkedAtMs = data ? Date.parse(data.lastChecked) : Number.NaN;
  const elapsed = Number.isNaN(checkedAtMs)
    ? null
    : Math.max(0, Math.round((now - checkedAtMs) / 1000));

  const showError = failed && data === null;

  const badgeState: OverallStatus | "checking" = data
    ? data.overall.status
    : "checking";
  const badgeCopy = showError
    ? "Unable to retrieve monitoring data"
    : data
      ? data.overall.label
      : "Checking monitoring status…";

  const noticeText =
    data === null
      ? null
      : !data.fresh
        ? `Unable to retrieve monitoring data — showing the last known status${
            elapsed === null ? "" : ` from ${formatElapsed(elapsed)}`
          }.`
        : failed
          ? "Refresh failed — showing the last known status."
          : null;

  const totalServices = data?.services.length ?? 0;
  const upCount = data
    ? data.services.filter((service) => service.status === "up").length
    : 0;
  const downCount = data
    ? data.services.filter((service) => service.status === "down").length
    : 0;

  const servicesSummary =
    data === null
      ? "—"
      : downCount === 0
        ? `${upCount} operational`
        : `${upCount} of ${totalServices} operational`;

  const incidents = data?.incidents ?? null;
  const ongoingIncidents =
    incidents === null
      ? null
      : incidents.filter((incident) => incident.ongoing).length;

  const panelSubtitle =
    data === null
      ? "Waiting for the first monitoring update."
      : downCount === 0
        ? "All monitored services are currently operational."
        : `${downCount} service${downCount === 1 ? " is" : "s are"} currently down.`;

  const meta: StatusMeta | null = data?.meta ?? null;

  return (
    <>
      <section className="hero" aria-labelledby="status-heading">
        <p
          className={`overall overall--${badgeState}`}
          role="status"
          aria-live="polite"
        >
          <span className={`dot dot--${badgeState}`} aria-hidden="true" />
          {badgeCopy}
        </p>

        <h1 className="hero__title" id="status-heading">
          Ujjwaluzu Status
        </h1>

        <p className="hero__sub">
          Real-time status and uptime for Ujjwaluzu services.
        </p>
      </section>

      <section className="summary" aria-label="Status summary">
        <div className="summary__item">
          <span className="summary__label">System status</span>
          <span className={`summary__value summary__value--${badgeState}`}>
            <span className={`dot dot--${badgeState}`} aria-hidden="true" />
            {badgeCopy}
          </span>
        </div>

        <div className="summary__item">
          <span className="summary__label">Services</span>
          <span className="summary__value">{servicesSummary}</span>
        </div>

        <div className="summary__item">
          <span className="summary__label">Last checked</span>
          <span className="summary__value">
            {elapsed === null ? "—" : formatElapsed(elapsed)}
          </span>
        </div>

        <div className="summary__item">
          <span className="summary__label">Incidents</span>
          <span
            className={`summary__value${
              (ongoingIncidents ?? 0) > 0 ? " summary__value--alert" : ""
            }`}
          >
            {ongoingIncidents === null ? "—" : ongoingIncidents}
          </span>
        </div>
      </section>

      {noticeText !== null && (
        <div className="notice" role="status">
          <span className="notice__text">{noticeText}</span>
          <button
            type="button"
            className="refresh"
            onClick={() => void runCheck()}
            disabled={checking}
          >
            <RefreshIcon spinning={checking} />
            Retry
          </button>
        </div>
      )}

      {showError ? (
        <div className="status-error" role="alert">
          <div>
            <p className="status-error__title">
              Unable to retrieve monitoring data
            </p>
            <p className="status-error__hint">
              The monitoring API did not respond. Retry in a moment.
            </p>
          </div>
          <button
            type="button"
            className="refresh"
            onClick={() => void runCheck()}
            disabled={checking}
          >
            <RefreshIcon spinning={checking} />
            Retry
          </button>
        </div>
      ) : (
        <section className="panel" id="services" aria-labelledby="services-title">
          <header className="panel__header">
            <div className="panel__heading">
              <h2 className="panel__title" id="services-title">
                Services
              </h2>
              <p className="panel__subtitle">{panelSubtitle}</p>
            </div>

            <div className="panel__actions">
              <span className="panel__updated">
                {elapsed === null
                  ? "Last updated —"
                  : `Last updated ${formatElapsed(elapsed)}`}
              </span>
              <button
                type="button"
                className="refresh"
                onClick={() => void runCheck()}
                disabled={checking}
                aria-label="Refresh system status"
              >
                <RefreshIcon spinning={checking} />
                Refresh
              </button>
            </div>
          </header>

          {data === null ? (
            <p className="panel__empty">Checking monitored services…</p>
          ) : (
            <ul className="service-list">
              {data.services.map((service) => {
                const state: ServiceStatus = service.status;

                return (
                  <li key={service.id} className="service">
                    <div className="service__identity">
                      <span
                        className={`dot dot--${state}`}
                        aria-hidden="true"
                      />
                      <div className="service__text">
                        <div className="service__name-row">
                          <span className="service__name">{service.name}</span>
                          <span
                            className={`service__state service__state--${state}`}
                          >
                            {SERVICE_COPY[state]}
                          </span>
                        </div>
                        <code className="service__url">
                          {hostOf(service.url)}
                        </code>
                      </div>
                    </div>

                    <div className="service__metrics">
                      <div className="metric">
                        <span className="metric__value">
                          {formatUptime(service.uptime)}
                        </span>
                        <span className="metric__label">
                          {meta ? `uptime · ${meta.uptimePeriodDays}d` : "uptime"}
                        </span>
                      </div>

                      <div className="metric">
                        <HistoryBars cells={service.recentChecks} />
                        <span className="metric__label">
                          {meta
                            ? `history · ${meta.historyPeriodHours}h`
                            : "history"}
                        </span>
                      </div>
                    </div>

                    <div className="service__response">
                      <span className="metric__value">
                        {formatResponseTime(service.responseTime)}
                      </span>
                      <span className="metric__label">
                        {meta
                          ? `response · ${meta.responseTimePeriodHours}h`
                          : "response"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {incidents !== null && (
        <section
          className="panel incidents"
          id="incidents"
          aria-labelledby="incidents-title"
        >
          <header className="panel__header">
            <div className="panel__heading">
              <h2 className="panel__title" id="incidents-title">
                Past incidents
              </h2>
              <p className="panel__subtitle">
                {incidents.length === 0
                  ? "No incidents reported."
                  : meta
                    ? `Reported in the last ${meta.incidentPeriodDays} days.`
                    : "Reported recently."}
              </p>
            </div>
          </header>

          {incidents.length > 0 && (
            <ul className="incident-list">
              {incidents.map((incident) => (
                <IncidentRow key={incident.id} incident={incident} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
