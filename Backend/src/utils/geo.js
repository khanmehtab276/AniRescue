/**
 * Great-circle distance between two lat/lng points, in kilometers.
 * Mirrors the SQL Haversine formula already used for nearby-volunteer
 * search, but computed in JS for single-row jurisdiction checks where
 * a full SQL round-trip isn't worth it.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  if (
    lat1 === null || lat1 === undefined ||
    lng1 === null || lng1 === undefined ||
    lat2 === null || lat2 === undefined ||
    lng2 === null || lng2 === undefined
  ) {
    return null;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;

  const earthRadiusKm = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

module.exports = { haversineKm };
