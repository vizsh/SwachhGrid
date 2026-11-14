export type Category =
  | "garbage_dump"
  | "overflowing_bin"
  | "blocked_drain"
  | "stagnant_water"
  | "missed_collection"
  | "dead_animal";

export type Status = "open" | "assigned" | "in_progress" | "resolved";
export type ZoneId = "gandhibagh" | "lakadganj" | "ashinagar";

export interface Ticket {
  id: string;
  lat: number;
  lon: number;
  cat: Category;
  sev: 1 | 2 | 3;
  createdAt: number;
  status: Status;
  resolvedAt?: number;
  meToo: number;
  zone: ZoneId;
  locality: string;
  photo?: string;
  afterPhoto?: string;
  note?: string;
  source: "seed" | "user" | "sim";
  reopened?: boolean;
  escalated?: boolean;
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

/** Pilot area covered by the exported building tiles. */
export const PILOT = { lat0: 21.135, lat1: 21.19, lon0: 79.085, lon1: 79.175 };
export const PILOT_CENTER: [number, number] = [79.118, 21.158];
export const BUILDING_TILES: [number, number][] = [];
for (let x = 11791; x <= 11795; x++) for (let y = 7204; y <= 7207; y++) BUILDING_TILES.push([x, y]);

/** Resolution deadlines in hours. Product defaults, not NMC policy. */
export const CATEGORIES: Record<Category, { label: string; slaH: number; color: [number, number, number] }> = {
  garbage_dump: { label: "Garbage dump", slaH: 24, color: [242, 183, 5] },
  overflowing_bin: { label: "Overflowing bin", slaH: 12, color: [244, 241, 232] },
  blocked_drain: { label: "Blocked drain", slaH: 48, color: [47, 109, 181] },
  stagnant_water: { label: "Stagnant water", slaH: 48, color: [126, 170, 222] },
  missed_collection: { label: "Truck did not come", slaH: 12, color: [217, 154, 0] },
  dead_animal: { label: "Dead animal", slaH: 12, color: [215, 55, 43] },
};
export const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[];

/**
 * APPROXIMATE zone areas. NMC publishes its zone/prabhag boundaries only as PDF maps,
 * so these are rough rectangles for routing in the demo, to be replaced by traced boundaries.
 */
export const ZONES: Record<ZoneId, { name: string; no: number; supervisor: string }> = {
  gandhibagh: { name: "Gandhibagh", no: 6, supervisor: "Zonal Supervisor, Zone 6" },
  lakadganj: { name: "Lakadganj", no: 8, supervisor: "Zonal Supervisor, Zone 8" },
  ashinagar: { name: "Ashi Nagar", no: 9, supervisor: "Zonal Supervisor, Zone 9" },
};
export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

export function zoneFor(lat: number, lon: number): ZoneId {
  if (lon < 79.118) return lat < 21.165 ? "gandhibagh" : "ashinagar";
  return lat < 21.17 ? "lakadganj" : "ashinagar";
}

const LOCALITIES: [string, number, number][] = [
  ["Mominpura", 21.1561, 79.0963],
  ["Gandhibagh", 21.15, 79.1024],
  ["Itwari", 21.1569, 79.1103],
  ["Mahal", 21.143, 79.1102],
  ["Santra Market", 21.1526, 79.091],
  ["Lashkaribagh", 21.1663, 79.0982],
  ["Vaishali Nagar", 21.1701, 79.1127],
  ["Kalamna", 21.1679, 79.1409],
  ["Yashodhara Nagar", 21.1847, 79.1261],
  ["Nandanvan", 21.1376, 79.1227],
  ["Pardi", 21.1556, 79.1676],
];

export function metres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dy = (lat2 - lat1) * 111_000;
  const dx = (lon2 - lon1) * 111_000 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

export function localityFor(lat: number, lon: number): string {
  let best = LOCALITIES[0];
  let bd = Infinity;
  for (const l of LOCALITIES) {
    const d = metres(lat, lon, l[1], l[2]);
    if (d < bd) {
      bd = d;
      best = l;
    }
  }
  return bd < 900 ? best[0] : `near ${best[0]}`;
}

/** "in Mominpura" or "near Itwari", for sentences. */
export function inPlace(locality: string): string {
  return locality.startsWith("near ") ? locality : `in ${locality}`;
}

export function inPilot(lat: number, lon: number): boolean {
  return lat >= PILOT.lat0 && lat <= PILOT.lat1 && lon >= PILOT.lon0 && lon <= PILOT.lon1;
}

/* ---------- exposure: real building counts around a point ---------- */

export interface Density {
  lat0: number;
  lon0: number;
  cell: number;
  counts: Record<string, number>;
}

/** Estimated residents per building. A planning assumption, shown as an estimate in the UI. */
export const PEOPLE_PER_BUILDING = 4.5;

export function buildingsWithin(d: Density, lat: number, lon: number, radiusM = 100): number {
  const ci = Math.floor((lat - d.lat0) / d.cell);
  const cj = Math.floor((lon - d.lon0) / d.cell);
  const r = Math.ceil(radiusM / 52) + 1;
  let n = 0;
  for (let a = -r; a <= r; a++)
    for (let b = -r; b <= r; b++) {
      const c = d.counts[`${ci + a}_${cj + b}`];
      if (!c) continue;
      const clat = d.lat0 + (ci + a + 0.5) * d.cell;
      const clon = d.lon0 + (cj + b + 0.5) * d.cell;
      if (metres(lat, lon, clat, clon) <= radiusM) n += c;
    }
  return n;
}

export function peopleExposed(d: Density | null, t: { lat: number; lon: number }): number {
  if (!d) return 0;
  return Math.round(buildingsWithin(d, t.lat, t.lon) * PEOPLE_PER_BUILDING);
}

/* ---------- ticket state at a point in time ---------- */

export function isOpenAt(t: Ticket, at: number): boolean {
  return t.createdAt <= at && (t.resolvedAt === undefined || t.resolvedAt > at);
}
export function ageHours(t: Ticket, at: number): number {
  return Math.max(0, (at - t.createdAt) / HOUR);
}
export function isOverdue(t: Ticket, at: number): boolean {
  return isOpenAt(t, at) && ageHours(t, at) > CATEGORIES[t.cat].slaH;
}
/** People exposed x days open x severity. Higher is more urgent. */
export function priority(t: Ticket, exposed: number, at: number): number {
  const days = Math.max(0.25, ageHours(t, at) / 24);
  return Math.round((exposed + 20) * days * (0.6 + t.sev * 0.4) * (1 + t.meToo * 0.1));
}

export function fmtAge(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

export interface SeedRow {
  id: string;
  lat: number;
  lon: number;
  cat: Category;
  sev: 1 | 2 | 3;
  ageH: number;
  resolvedAgoH: number | null;
  meToo: number;
}

export function hydrateSeed(rows: SeedRow[], now: number): Ticket[] {
  return rows.map((r, i) => {
    const resolved = r.resolvedAgoH !== null;
    const status: Status = resolved ? "resolved" : r.ageH < 6 ? "open" : i % 3 === 0 ? "in_progress" : "assigned";
    return {
      id: r.id,
      lat: r.lat,
      lon: r.lon,
      cat: r.cat,
      sev: r.sev,
      createdAt: now - r.ageH * HOUR,
      resolvedAt: resolved ? now - (r.resolvedAgoH as number) * HOUR : undefined,
      status,
      meToo: r.meToo,
      zone: zoneFor(r.lat, r.lon),
      locality: localityFor(r.lat, r.lon),
      source: "seed",
    };
  });
}
