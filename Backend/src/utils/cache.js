const NodeCache = require("node-cache");

// Shared instance — flushed by mutating case endpoints, read by GET endpoints.
const apiCache = new NodeCache({ stdTTL: 15 });

module.exports = apiCache;
