import type { MonitoredService } from "@/lib/types";

export const services: MonitoredService[] = [
  {
    id: "ujjwaluzu",
    name: "ujjwaluzu",
    url: "https://ujjwaluzu.in",
  },
  {
    id: "ujjwaluzu-blogs",
    name: "ujjwaluzu blogs",
    url: "https://blog.ujjwaluzu.in",
  },
  {
    id: "uzzutv",
    name: "uzzutv",
    url: "https://uzzutv.pythonanywhere.com",
  },
  {
    id: "auction",
    name: "auction",
    url: "https://auction16.pythonanywhere.com",
  },
  {
    id: "wiki",
    name: "wiki",
    url: "https://ujjwaluzu16.pythonanywhere.com",
  },
  {
    id: "crewlab",
    name: "CrewLab",
    url: "https://crewlab.ujjwaluzu.in",
  },
  {
    id: "appcrewlab",
    name: "appCrewlab",
    url: "https://app.crewlab.ujjwaluzu.in",
  },
  {
    id: "tools",
    name: "Tools",
    url: "https://tools.ujjwaluzu.in",
  },
];

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
