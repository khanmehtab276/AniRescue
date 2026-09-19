const normalizeEnum = (val) => (val ? String(val).trim().toUpperCase() : null);

module.exports = { normalizeEnum };
