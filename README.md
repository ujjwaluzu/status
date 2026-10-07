This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Monitoring backend (UptimeRobot)

This status page does not check services itself. [UptimeRobot](https://uptimerobot.com/api/) performs the monitoring (periodic checks, uptime history, response times, downtime) and this Next.js app acts as a secure API adapter plus the custom frontend.

```
Browser → status.ujjwaluzu.in → GET /api/status → UptimeRobot API → monitor history
```

The browser never talks to UptimeRobot, and the API key never leaves the server.

### Environment

Copy the example file and add your key:

```bash
cp .env.example .env.local
```

```bash
UPTIMEROBOT_API_KEY=your_read_only_api_key
```

- Server-only. Do **not** prefix it with `NEXT_PUBLIC_`.
- `.env.local` is gitignored; the real key must never be committed.
- A read-only API key is sufficient (Integrations & API → API → Read-only).

Without the key, `GET /api/status` responds with `503` and the page shows "Unable to retrieve monitoring data".

### Service registry

`lib/services.ts` is the single source of truth for the services shown on the page. Each entry is matched to its UptimeRobot monitor by URL (exact URL first, then hostname), so monitor array order does not matter. To pin a monitor explicitly, set its id:

```ts
{
  id: "crewlab",
  name: "CrewLab",
  url: "https://crewlab.ujjwaluzu.in",
  uptimeRobotMonitorId: "777749809",
}
```

### Data flow

- `lib/uptimerobot.ts` — server-only UptimeRobot v3 client (bearer auth, pagination, error mapping, 10 req/min-safe rate limiter).
- `lib/monitoring.ts` — server-side cache, monitor matching, and normalization into the app's own response shape.
- `app/api/status/route.ts` — `GET /api/status` returns the normalized payload (`503` if monitoring data is unavailable).

UptimeRobot responses are cached on the server (monitors 60s, uptime/response-time stats 10 min, incidents 5 min), so browser polling never causes a matching UptimeRobot request.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
