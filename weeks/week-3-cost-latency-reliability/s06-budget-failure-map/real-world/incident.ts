/**
 * A fixed production incident, so the investigator has something real to chew on
 * and every run is reproducible.
 *
 * The story: checkout-api v482 shipped at 14:02. Four minutes later the 5xx rate
 * crosses the alert line. Three log lines explain it. They are sitting in a
 * thirty-second window that also contains about twelve hundred lines of ordinary
 * traffic, which is the honest ratio and the whole reason this job is hard.
 *
 * The noise is generated deterministically rather than pasted, so the file stays
 * readable and every run sees the same window.
 */

export interface Deploy {
  at: string;
  service: string;
  version: string;
  summary: string;
}

export interface LogLine {
  at: string;
  service: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface Alert {
  at: string;
  service: string;
  metric: string;
  summary: string;
}

export const ALERT: Alert = {
  at: "14:06",
  service: "checkout-api",
  metric: "http_5xx_rate",
  summary: "5xx rate on checkout-api at 3.4 percent (threshold 2), p95 latency 4.1s",
};

export const DEPLOYS: Deploy[] = [
  { at: "14:02", service: "checkout-api", version: "v482", summary: "batch the cart line-item lookups" },
  { at: "13:10", service: "web", version: "v1201", summary: "new footer" },
  { at: "09:40", service: "search-api", version: "v77", summary: "bump rerank timeout to 400ms" },
];

/** The lines that actually explain the outage. Eighteen of them, in a window of twelve hundred. */
export const SIGNAL: LogLine[] = [
  { at: "14:06:01", service: "checkout-api", level: "warn", message: "db pool: 20/20 connections in use, 4 waiting" },
  { at: "14:06:02", service: "checkout-api", level: "info", message: "GET /cart/8823 200 in 890ms" },
  { at: "14:06:03", service: "checkout-api", level: "error", message: "PoolTimeoutError: timed out acquiring a connection after 2000ms" },
  { at: "14:06:04", service: "checkout-api", level: "error", message: "POST /checkout 500 in 2043ms" },
  { at: "14:06:05", service: "checkout-api", level: "warn", message: "db pool: 20/20 connections in use, 17 waiting" },
  { at: "14:06:06", service: "checkout-api", level: "info", message: "cart 8830: issuing 34 line-item queries" },
  { at: "14:06:07", service: "checkout-api", level: "error", message: "PoolTimeoutError: timed out acquiring a connection after 2000ms" },
  { at: "14:06:08", service: "checkout-api", level: "error", message: "POST /checkout 500 in 2011ms" },
  { at: "14:06:09", service: "checkout-api", level: "warn", message: "db pool: 20/20 connections in use, 22 waiting" },
  { at: "14:06:10", service: "checkout-api", level: "info", message: "cart 8834: issuing 41 line-item queries" },
  { at: "14:06:11", service: "checkout-api", level: "error", message: "PoolTimeoutError: timed out acquiring a connection after 2000ms" },
  { at: "14:06:12", service: "checkout-api", level: "error", message: "POST /checkout 500 in 2004ms" },
  { at: "14:06:14", service: "checkout-api", level: "error", message: "POST /checkout 500 in 2019ms" },
  { at: "14:06:15", service: "checkout-api", level: "warn", message: "db pool: 20/20 connections in use, 31 waiting" },
  { at: "14:06:17", service: "checkout-api", level: "error", message: "PoolTimeoutError: timed out acquiring a connection after 2000ms" },
  { at: "14:06:19", service: "checkout-api", level: "error", message: "POST /checkout 500 in 2008ms" },
  { at: "14:06:21", service: "checkout-api", level: "warn", message: "db pool: 20/20 connections in use, 38 waiting" },
  { at: "14:06:23", service: "checkout-api", level: "error", message: "PoolTimeoutError: timed out acquiring a connection after 2000ms" },
];

/** Ordinary traffic. Deterministic, so the window is identical on every run. */
function noise(count: number): LogLine[] {
  const services = ["web", "search-api", "notifications", "checkout-api", "auth", "images"];
  const messages = [
    (n: number) => `GET /cart/${8000 + n} 200 in ${30 + (n % 40)}ms`,
    (n: number) => `GET / 200 in ${12 + (n % 20)}ms`,
    (n: number) => `rerank ${110 + (n % 30)}ms`,
    (n: number) => `session ${n} refreshed`,
    (n: number) => `render footer variant ${n % 2 === 0 ? "a" : "b"}`,
    (n: number) => `digest queued for user ${n}`,
    (n: number) => `thumbnail ${n} served from cache`,
    (n: number) => `POST /checkout 200 in ${180 + (n % 90)}ms`,
  ];
  const lines: LogLine[] = [];
  for (let n = 0; n < count; n++) {
    const second = String(58 + Math.floor(n / 45)).padStart(2, "0");
    const minute = Number(second) >= 60 ? "06" : "05";
    lines.push({
      at: `14:${minute}:${Number(second) >= 60 ? String(Number(second) - 60).padStart(2, "0") : second}`,
      service: services[n % services.length] as string,
      level: n % 97 === 0 ? "warn" : "info",
      message: (messages[n % messages.length] as (n: number) => string)(n),
    });
  }
  return lines;
}

/** The full window an investigator would face: signal plus everything else. */
export const LOGS: LogLine[] = [...noise(600), ...SIGNAL, ...noise(600)].sort((a, b) =>
  a.at.localeCompare(b.at),
);

/**
 * What a real log search does, and the reason it is the lever rather than the
 * model: filter to the service and levels asked for, most recent first, take N.
 *
 * Note what this buys you. Ranking errors and warnings above info is the entire
 * difference between twenty useful lines and twenty lines about thumbnails.
 */
export function searchLogs(query: string, limit: number, logs: LogLine[] = LOGS): LogLine[] {
  const service = query.split(/\s+/)[0] ?? "";
  const level = /level:(\w+)/.exec(query)?.[1];
  const weight = { error: 0, warn: 1, info: 2 } as const;
  return logs
    .filter((l) => l.service === service && (level ? l.level === level : true))
    .sort((a, b) => weight[a.level] - weight[b.level] || b.at.localeCompare(a.at))
    .slice(0, limit);
}

/** What actually happened. The demo grades against this; production will not. */
export const TRUE_CAUSE =
  "checkout-api v482 turned one cart lookup into one query per line item, exhausting the 20-connection database pool";

/** The lines a good investigation should be able to point at. */
export const KEY_EVIDENCE = ["PoolTimeoutError", "db pool: 20/20", "line-item queries"];
