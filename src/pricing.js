// Illustrative route estimates. Distances use approximate state population
// centres with a road-distance factor; they are not carrier quotes.
const STATE_POINTS = {
  AL: [32.8, -86.8],
  AK: [61.2, -149.9],
  AZ: [33.4, -112.0],
  AR: [34.8, -92.3],
  CA: [35.5, -119.4],
  CO: [39.7, -105.0],
  CT: [41.6, -72.7],
  DE: [39.4, -75.6],
  DC: [38.9, -77.0],
  FL: [27.8, -81.7],
  GA: [33.5, -84.2],
  HI: [21.3, -157.8],
  ID: [43.6, -116.2],
  IL: [41.3, -88.4],
  IN: [39.8, -86.2],
  IA: [41.9, -93.0],
  KS: [38.5, -97.4],
  KY: [37.8, -85.5],
  LA: [30.7, -91.4],
  ME: [44.0, -70.2],
  MD: [39.1, -76.8],
  MA: [42.3, -71.4],
  MI: [42.9, -84.2],
  MN: [45.2, -93.6],
  MS: [32.5, -89.7],
  MO: [38.4, -92.2],
  MT: [46.4, -110.0],
  NE: [41.2, -96.8],
  NV: [36.6, -115.5],
  NH: [43.0, -71.5],
  NJ: [40.4, -74.4],
  NM: [35.0, -106.4],
  NY: [41.5, -74.6],
  NC: [35.6, -79.4],
  ND: [47.3, -99.0],
  OH: [40.5, -82.6],
  OK: [35.6, -96.8],
  OR: [44.7, -122.6],
  PA: [40.5, -76.9],
  RI: [41.8, -71.4],
  SC: [34.0, -81.0],
  SD: [43.9, -97.9],
  TN: [35.8, -86.4],
  TX: [31.0, -97.4],
  UT: [40.5, -111.8],
  VT: [44.3, -72.8],
  VA: [37.8, -77.8],
  WA: [47.3, -121.6],
  WV: [38.6, -81.1],
  WI: [43.7, -88.8],
  WY: [42.2, -106.8],
};
// Alaska, Hawaii and territories need ocean, air or cross-border legs that a
// road estimate cannot represent; those routes require a carrier quote.
const QUOTE_ONLY = new Set(["AK", "HI", "PR", "GU", "VI", "AS", "MP"]);
export const PRIORITY_MIN_SURCHARGE = 175;
export const SERVICE_FEE = 45;

export function stateOf(location = "") {
  const match = /,\s*([A-Za-z]{2})\s*$/.exec(location.trim());
  return match ? match[1].toUpperCase() : null;
}
function pointFor(location) {
  const state = stateOf(location);
  return state ? STATE_POINTS[state] : null;
}
function haversineMiles([lat1, lon1], [lat2, lon2]) {
  const r = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(a));
}
/**
 * Returns { miles, standard, priority, standardDays, priorityDays } or null
 * when the route cannot be estimated (unknown state or quote-only region).
 */
export function estimateRoute({ from, to, pallets = 1 }) {
  const a = stateOf(from),
    b = stateOf(to);
  if (!a || !b || QUOTE_ONLY.has(a) || QUOTE_ONLY.has(b)) return null;
  const pa = pointFor(from),
    pb = pointFor(to);
  if (!pa || !pb) return null;
  // Same-state routes still have real distance; assume a short regional haul.
  const miles = Math.max(60, Math.round(haversineMiles(pa, pb) * 1.2));
  const load =
    0.55 + (0.45 * Math.min(Math.max(Number(pallets) || 1, 1), 26)) / 26;
  const freight = Math.max(350, 200 + miles * 2.1 * load);
  const standard = Math.round((freight + SERVICE_FEE) / 5) * 5;
  const priority =
    standard +
    Math.max(PRIORITY_MIN_SURCHARGE, Math.round((standard * 0.15) / 5) * 5);
  // Solo driver ~500 mi/day; team or expedited ~800 mi/day.
  const standardDays = Math.max(1, Math.ceil(miles / 500));
  const priorityDays = Math.max(1, Math.ceil(miles / 800));
  return { miles, standard, priority, standardDays, priorityDays };
}
export function transitLabel(days, priority) {
  if (priority)
    return days <= 1 ? "Target next-day" : `Target ${days}-day transit`;
  return days <= 1
    ? "Typical 1-day transit"
    : `Typical ${days}–${days + 1} day transit`;
}
