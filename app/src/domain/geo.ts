// Distances for "Nearest first" (D-22). Pure functions only: no location is read or stored here.
export interface LatLng { lat: number; lng: number }

export const I8_MARKAZ: LatLng & { label: string } = { label: 'I-8 Markaz, Islamabad', lat: 33.668, lng: 73.075 };

export const isLat = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
export const isLng = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;

/** A coordinate pair that is finite and in range, else null. Numeric strings are not accepted. */
export function validLatLng(lat: unknown, lng: unknown): LatLng | null {
  return isLat(lat) && isLng(lng) ? { lat, lng } : null;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle (haversine) distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "~0.4 km" under 1 km (one decimal), "~2.1 km" up to 10 km, "~12 km" (whole) beyond. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km >= 9.95) return `~${Math.round(km)} km`;
  return `~${(Math.round(km * 10) / 10).toFixed(1)} km`;
}

/** Rounded to 3 decimals (about 100 m), which is all this app ever keeps of a position. */
export const round3 = (n: number): number => Math.round(n * 1000) / 1000;
