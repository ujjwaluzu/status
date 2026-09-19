"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hostOf, services } from "@/lib/services";
import type { OverallStatus, StatusResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;
const TICK_INTERVAL_MS = 1_000;

const OVERALL_COPY: Record<OverallStatus, string> = {
  operational: "All systems operational",
  degraded: "Some systems are experiencing issues",
  down: "Systems are currently experiencing issues",
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
    setFailed(false);
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Status endpoint returned ${response.status}`);
      }
      const payload = (await response.json()) as StatusResponse;
      setData(payload);
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
  const overallClass = verdict ?? "checking";
  const overallCopy = verdict
    ? OVERALL_COPY[verdict]
    : "Checking system status…";

  const showError = failed && data === null;

  return (
    <>
      <section className="hero" aria-labelledby="status-heading">
        <h1 className="hero__title" id="status-heading">
          Ujjwaluzu Status
        </h1>

        <p
          className={`overall overall--${overallClass}`}
          role="status"
          aria-live="polite"
        >
          {overallCopy}
        </p>

        <div className="meta">
          <span className="meta__line">
            {elapsed === null ? (
              <>Last checked · —</>
            ) : (
              <>Last checked · {formatElapsed(elapsed)}</>
            )}
          </span>
          {failed && data !== null && (
            <span className="meta__failed">refresh failed</span>
          )}
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
      </section>

      {showError ? (
        <div className="status-error" role="alert">
          <p>Unable to retrieve system status</p>
          <button
            type="button"
            className="refresh"
            onClick={() => void runCheck()}
            disabled={checking}
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
            Retry
          </button>
        </div>
      ) : (
        <ul className="services" aria-label="Services">
          {services.map((service) => {
            const result = data?.services.find(
              (checked) => checked.name === service.name
            );
            const state = result ? result.status : "checking";
            const responseTime =
              result && result.responseTime !== null
                ? `${result.responseTime}ms`
                : "—";

            return (
              <li key={service.url} className="service">
                <div className="service__top">
                  <h2 className="service__name">{service.name}</h2>
                  <span
                    className={`pill pill--${state}`}
                    aria-label={`${service.name} ${state}`}
                    title={state === "checking" ? "Checking" : state.toUpperCase()}
                  >
                    {state === "checking" ? "Checking" : state.toUpperCase()}
                  </span>
                </div>

                <code className="service__url">{hostOf(service.url)}</code>

                <dl className="service__stats">
                  <div className="service__stat">
                    <dt>Response time</dt>
                    <dd>{responseTime}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}