const { recordRequest } = require("../utils/metrics");

function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    const route = req.route?.path || req.path || req.originalUrl;

    recordRequest({
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs,
    });

    if (
      req.path !== "/health" &&
      req.path !== "/health/live" &&
      req.path !== "/health/ready" &&
      req.path !== "/health/worker"
    ) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          event: "http_request",
          request_id: req.requestId,
          method: req.method,
          route,
          status: res.statusCode,
          duration_ms: Number(durationMs.toFixed(2)),
        }),
      );
    }
  });

  next();
}

module.exports = { requestLogger };
