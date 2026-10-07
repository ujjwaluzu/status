import { getStatusSnapshot } from "@/lib/monitoring";
import type {
  MonitoringErrorCode,
  StatusErrorResponse,
  StatusResponse,
} from "@/lib/types";
import { UptimeRobotError } from "@/lib/uptimerobot";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function failureResponse(error: unknown): Response {
  let code: MonitoringErrorCode = "unexpected";

  if (error instanceof UptimeRobotError) {
    code = error.code;
  }

  const message =
    code === "not_configured"
      ? "Monitoring is not configured on this server."
      : "Unable to retrieve monitoring data.";

  const payload: StatusErrorResponse = { error: { code, message } };

  return Response.json(payload, { status: 503, headers: { ...HEADERS } });
}

export async function GET() {
  try {
    const payload: StatusResponse = await getStatusSnapshot();
    return Response.json(payload, { headers: { ...HEADERS } });
  } catch (error) {
    return failureResponse(error);
  }
}
