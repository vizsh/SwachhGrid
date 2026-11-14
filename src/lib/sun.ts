/** Sun altitude in radians for a place and time (the standard low-precision solar position formula). */
export function sunAltitude(ts: number, lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const d = ts / 86400000 - 10957.5; // days since J2000
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const e = rad * 23.4397;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const sidereal = rad * (280.16 + 360.9856235 * d) + rad * lon;
  const H = sidereal - ra;
  const phi = rad * lat;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
}

/** 0 at night, 1 in full daylight, a smooth ramp through dawn and dusk. */
export function daylight(ts: number, lat: number, lon: number): number {
  const alt = sunAltitude(ts, lat, lon) * (180 / Math.PI);
  return Math.max(0, Math.min(1, (alt + 4) / 22));
}
