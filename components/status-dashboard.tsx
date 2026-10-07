"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hostOf, services } from "@/lib/services";
import type {
  CheckResult,
  OverallStatus,
  ServiceStatus,
  StatusResponse,
} from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;
const TICK_INTERVAL_MS = 1_000;
const HISTORY_LIMIT = 30;

const OVERALL_COPY: Record<OverallStatus, string> = {
  operational: "All systems operational",
  degraded: "Some systems are experiencing issues",
  down: "Systems are currently experiencing issues",
};

const SERVICE_COPY: Record<ServiceStatus, string> = {
  up: "Operational",
  down: "Down",
};

function formatElapsed(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function percentOf(results: CheckResult[]): number | null {
  if (results.length === 0) return null;
  const up = results.filter((r) => r.status === "up").length;
  return (up / results.length) * 100;
}

function formatPercent(value: number | null, digits = 0): string {
  if (value === null) return "—";
  return `${value.toFixed(digits)}%`;
}

function CheckBars({ results }: { results: CheckResult[] }) {
  const filled = results.slice(-HISTORY_LIMIT);
  const cells: (ServiceStatus | null)[] = [
    ...Array<null>(Math.max(0, HISTORY_LIMIT - filled.length)).fill(null),
    ...filled.map((result) => result.status),
  ];

  return (
    <div className="checks__bars" aria-hidden="true">
      {cells.map((cell, index) => (
        <span
          key={index}
          className={`bar bar--${cell === null ? "empty" : cell}`}
        />
      ))}
    </div>
  );
}

export function StatusDashboard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [history, setHistory] = useState<Record<string, CheckResult[]>>({});
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inFlightRef = useRef(false);
  const startedRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setChecking(true);
    setFailed(false);
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Status endpoint returned ${response.status}`);
      }
      const payload = (await response.json()) as StatusResponse;
      setData(payload);

      const stamp = Date.parse(payload.checkedAt) || Date.now();
      setHistory((previous) => {
        const next: Record<string, CheckResult[]> = { ...previous };
        for (const checked of payload.services) {
          const entry: CheckResult = {
            status: checked.status,
            timestamp: stamp,
            responseTime: checked.responseTime,
          };
          next[checked.name] = [
            ...(next[checked.name] ?? []),
            entry,
          ].slice(-HISTORY_LIMIT);
        }
        return next;
      });
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

  const checkedAtMs = data ? new Date(data.checkedAt).getTime() : null;
  const elapsed =
    checkedAtMs === null ? null : Math.max(0, Math.round((now - checkedAtMs) / 1000));

  const verdict = data ? data.overall : null;
  const badgeState = verdict ?? "checking";
  const badgeCopy = failed && data === null
    ? "Unable to check services"
    : verdict
      ? OVERALL_COPY[verdict]
      : "Checking system status…";

  const showError = failed && data === null;

  const totalServices = services.length;
  const upCount = data
    ? data.services.filter((service) => service.status === "up").length
    : null;
  const downCount = data ? data.services.filter((service) => service.status === "down").length : null;

  const allChecks = useMemo(
    () => Object.values(history).flat(),
    [history]
  );
  const recentAggregate = useMemo(
    () =>
      [...allChecks].sort((a, b) => a.timestamp - b.timestamp).slice(-HISTORY_LIMIT),
    [allChecks]
  );
  const currentUptime = percentOf(allChecks);

  const panelSubtitle =
    data === null
      ? "Waiting for the first status check."
      : (downCount ?? 0) === 0
        ? "All services are currently operational."
        : `${downCount} service${downCount === 1 ? " is" : "s are"} currently down.`;

  const servicesSummary =
    data === null
      ? "—"
      : (downCount ?? 0) === 0
        ? `${upCount} operational`
        : `${upCount} of ${totalServices} operational`;

  return (
    <>
      <section className="hero" aria-labelledby="status-heading">
        <div className="hero__left">
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
            Real-time status and uptime for all Ujjwaluzu services.
          </p>
        </div>

        <div className="hero__aside">
          <span className="hero__aside-label">Current uptime</span>
          <span className="hero__aside-value">{formatPercent(currentUptime, 2)}</span>
          <CheckBars results={recentAggregate} />
          <span className="hero__aside-note">recent checks</span>
        </div>
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
          <span className="summary__label">Last checked</span>
          <span className="summary__value">
            {elapsed === null ? "—" : formatElapsed(elapsed)}
          </span>
        </div>

        <div className="summary__item">
          <span className="summary__label">Active incidents</span>
          <span
            className={`summary__value${
              (downCount ?? 0) > 0 ? " summary__value--alert" : ""
            }`}
          >
            {downCount === null ? "—" : downCount}
          </span>
        </div>

        <div className="summary__item">
          <span className="summary__label">Services</span>
          <span className="summary__value">{servicesSummary}</span>
        </div>
      </section>

      {failed && data !== null && (
        <p className="refresh-failed" role="status">
          Refresh failed — showing last known status
        </p>
      )}

      {showError ? (
        <div className="status-error" role="alert">
          <div>
            <p className="status-error__title">Unable to check services</p>
            <p className="status-error__hint">
              The status endpoint did not respond. Retry in a moment.
            </p>
          </div>
          <button
            type="button"
            className="refresh"
            onClick={() => void runCheck()}
            disabled={checking}
          >
            <svg
              className={
                checking ? "refresh__icon refresh__icon--spin" : "refresh__icon"
              }
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
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
                <svg
                  className={
                    checking
                      ? "refresh__icon refresh__icon--spin"
                      : "refresh__icon"
                  }
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Refresh
              </button>
            </div>
          </header>

          <ul className="service-list">
            {services.map((service) => {
              const result = data?.services.find(
                (checked) => checked.name === service.name
              );
              const state: ServiceStatus | "checking" = result
                ? result.status
                : "checking";
              const responseTime =
                result && result.responseTime !== null
                  ? `${result.responseTime}ms`
                  : "—";
              const checks = history[service.name] ?? [];

              return (
                <li key={service.url} className="service">
                  <div className="service__identity">
                    <span
                      className={`dot dot--${state}`}
                      aria-hidden="true"
                    />
                    <div className="service__text">
                      <div className="service__name-row">
                        <span className="service__name">{service.name}</span>
                        <span className={`service__state service__state--${state}`}>
                          {state === "checking" ? "Checking" : SERVICE_COPY[state]}
                        </span>
                      </div>
                      <code className="service__url">{hostOf(service.url)}</code>
                    </div>
                  </div>

                  <div className="service__meta">
                    <div className="service__checks">
                      <span className="checks__pct">
                        {formatPercent(percentOf(checks))}
                      </span>
                      <CheckBars results={checks} />
                      <span className="checks__label">recent checks</span>
                    </div>

                    <div className="service__response">
                      <span className="response__value">{responseTime}</span>
                      <span className="response__label">Response time</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
