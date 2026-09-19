import { services } from "@/lib/services";
import type {
  CheckedService,
  OverallStatus,
  StatusResponse,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

async function checkService(
  service: (typeof services)[number]
): Promise<CheckedService> {
  const startedAt = performance.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(service.url, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "ujjwaluzu-status-check/1.0" },
        cache: "no-store",
      });

      const responseTime = Math.max(
        0,
        Math.round(performance.now() - startedAt)
      );
      const reachable = response.ok;

      try {
        await response.body?.cancel();
      } catch {
        // Body already consumed or closed; the reachability check still holds.
      }

      return {
        name: service.name,
        url: service.url,
        status: reachable ? "up" : "down",
        responseTime,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return {
      name: service.name,
      url: service.url,
      status: "down",
      responseTime: null,
    };
  }
}

export async function GET() {
  const checked = await Promise.all(services.map(checkService));

  const downCount = checked.filter((s) => s.status === "down").length;
  let overall: OverallStatus;
  if (downCount === 0) {
    overall = "operational";
  } else if (downCount < checked.length) {
    overall = "degraded";
  } else {
    overall = "down";
  }

  const payload: StatusResponse = {
    overall,
    services: checked,
    checkedAt: new Date().toISOString(),
  };

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}