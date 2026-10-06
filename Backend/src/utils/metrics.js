const counters = new Map();

function recordRequest({ method, route, statusCode, durationMs }) {
  const key = `${method} ${route} ${statusCode}`;
  const current = counters.get(key) || {
    count: 0,
    totalMs: 0,
    maxMs: 0,
  };

  current.count += 1;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  counters.set(key, current);
}

function snapshotMetrics() {
  return [...counters.entries()]
    .map(([key, value]) => ({
      key,
      count: value.count,
      averageMs: Number((value.totalMs / value.count).toFixed(2)),
      maxMs: Number(value.maxMs.toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count);
}

module.exports = {
  recordRequest,
  snapshotMetrics,
};
