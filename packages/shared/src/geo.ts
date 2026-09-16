import type { Agency, LatLng } from "./types";

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** PRD §9 nearest-agency logic. */
export function nearestAgency(agencies: Agency[], point: LatLng, pincode?: string): Agency | null {
  const approved = agencies.filter((a) => a.status === "approved");
  const eligible = approved.filter(
    (a) =>
      (pincode && a.serviceArea.pincodes.includes(pincode)) ||
      haversineKm(a.serviceArea.center, point) <= a.serviceArea.radiusKm,
  );
  const pool = eligible.length ? eligible : approved;
  if (!pool.length) return null;
  return [...pool].sort((x, y) => {
    const d = haversineKm(x.serviceArea.center, point) - haversineKm(y.serviceArea.center, point);
    return Math.abs(d) < 0.05 ? y.rating - x.rating : d;
  })[0];
}

/** Build a gently curved polyline of n points between two coordinates (mock road route). */
export function buildRoute(from: LatLng, to: LatLng, n = 40, seed = 1): LatLng[] {
  const pts: LatLng[] = [];
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const len = Math.hypot(dLat, dLng) || 0.001;
  // unit perpendicular vector
  const px = -dLng / len;
  const py = dLat / len;
  const sign = seed % 2 === 0 ? 1 : -1;
  const amp = len * 0.18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // one broad bend plus a smaller secondary bend — looks like following roads, no zig-zag
    const off = sign * amp * (Math.sin(t * Math.PI) + 0.35 * Math.sin(t * Math.PI * 2 + seed));
    pts.push({ lat: from.lat + dLat * t + py * off, lng: from.lng + dLng * t + px * off });
  }
  return pts;
}
