type SecurityCounterKey = "http_401" | "http_403" | "http_429" | "csrf_invalid";

const counters: Record<SecurityCounterKey, number> = {
  http_401: 0,
  http_403: 0,
  http_429: 0,
  csrf_invalid: 0,
};

export function incrementSecurityMetric(key: SecurityCounterKey): void {
  counters[key] += 1;
}

export function readSecurityMetrics(): Record<SecurityCounterKey, number> {
  return { ...counters };
}

