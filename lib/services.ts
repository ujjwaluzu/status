import type { MonitoredService } from "@/lib/types";

export const services: MonitoredService[] = [
  {
    name: "ujjwaluzu",
    url: "https://ujjwaluzu.in",
  },
  {
    name: "ujjwaluzu blogs",
    url: "https://blog.ujjwaluzu.in",
  },
  {
    name: "uzzutv",
    url: "https://uzzutv.pythonanywhere.com",
  },
  {
    name: "auction",
    url: "https://auction16.pythonanywhere.com",
  },
  {
    name: "wiki",
    url: "https://ujjwaluzu16.pythonanywhere.com",
  },
];

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}