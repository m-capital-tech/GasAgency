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

/** Build a slightly wobbly polyline of n points between two coordinates (mock route). */
export function buildRoute(from: LatLng, to: LatLng, n = 40, seed = 1): LatLng[] {
  const pts: LatLng[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wobble = Math.sin(t * Math.PI) * 0.004;
    pts.push({
      lat: from.lat + (to.lat - from.lat) * t + rand() * wobble,
      lng: from.lng + (to.lng - from.lng) * t + rand() * wobble,
    });
  }
  return pts;
}
