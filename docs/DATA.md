# Data

SwachhGrid's rule: **show what is real, label what is estimated, and keep demo data identifiable.** This document lists every source, what it is used for, and which category each number on screen falls into.

## Sources

| Source | What we use | Licence | Real / estimated / seeded |
|---|---|---|---|
| [Overture Maps](https://overturemaps.org) buildings, release `2026-10-21.0` | 4,36,931 footprints for Nagpur; 1,35,721 in the pilot box are rendered | ODbL / CDLA-Permissive (per source) | **Real** shapes |
| Esri World Imagery | Satellite ground in every map | Esri terms of use, attribution shown | **Real** |
| OpenStreetMap via [OpenFreeMap](https://openfreemap.org) | Roads, rivers and nallahs, place and road names | ODbL | **Real** |
| [Open-Meteo](https://open-meteo.com) | Rainfall in Nagpur over the last 72 h | CC BY 4.0 | **Real**, live |
| OpenStreetMap roads via the Overpass API | 8,636 road segments in the pilot box, for van routes | ODbL | **Real** roads |
| Route simulator in `scripts/export_routes.py` | Six van routes, 846 driven and 64 skipped lanes | — | **Simulated** on real roads |
| [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (terrarium) | Elevation for the monsoon simulator, resampled to 27 m cells | Public domain (SRTM / NASADEM) | **Real** elevation, **simulated** water |
| Seed generators in `scripts/export_data.py` and `export_routes.py` | 330 reports over 30 days, plus 12 "truck did not come" reports beside skipped lanes | — | **Seeded demo data** |

### What the building data looks like

Of the 4,36,931 footprints in the Nagpur bounding box (`78.98–79.18 E, 21.05–21.22 N`):

| Source inside Overture | Footprints | Median area |
|---|---|---|
| Google Open Buildings | 2,94,276 | 72 m² |
| Microsoft ML Buildings | 82,278 | 67 m² |
| OpenStreetMap | 60,377 | 102 m² |

OpenStreetMap alone maps about 14 % of the city's buildings, and almost none in informal settlements. The satellite-derived sets are what make the slum layouts visible: tiny, irregular, tightly packed roofs. Only 277 footprints carry a height, so heights are **estimated** from area in [`buildings.ts`](../src/lib/buildings.ts): under 45 m² ≈ 2.6–3.8 m (one storey), under 120 m² ≈ 5–7 m, under 400 m² ≈ 8.5–11.5 m, larger ≈ 11–16 m, with a deterministic jitter so roofs don't look machined.

## How the pilot zones were chosen

There is no downloadable slum or zone boundary file for Nagpur (checked: OpenStreetMap has no slum tagging and no NMC zone relations; the DataMeet municipal collection has no Nagpur folder; NMC publishes its 2025 prabhag maps as PDFs). So the pilot came from the buildings themselves:

1. Bucket every footprint into about 250 m cells.
2. Keep cells with **250 or more buildings and a median footprint under 50 m²**. Those are the densest small-building clusters, the physical signature of bastis.
3. Reverse-geocode the strongest clusters: Mominpura, Santra Bazaar / Gandhibagh, Itwari, Mahal, and the eastern edge towards Kalamna and Pardi (PIN 440035).
4. Match them to NMC zones from news reports and NMC notices: **Gandhibagh (Zone 6)**, **Lakadganj (Zone 8)** and **Ashi Nagar (Zone 9)**.

Supporting context:

- A 2020 Hitavada report says the entire Itwari, Gandhibagh and Central Avenue area is notified as slum.
- NMC's 2016 survey found Ashi Nagar zone had the most slums (63) and that 71 % of slums were in east Nagpur.
- An NMC notice lists Kalamna and Pardi under the Lakadganj side of the city.

The pilot box rendered in the app is `79.085–79.175 E, 21.135–21.190 N`.

## The seeded reports

`export_data.py` places 330 reports beside real small buildings (under 45 m²) in cells with more than 170 buildings within about 125 m:

- **14 chronic spots** get 6–11 repeat reports each, mostly the same category, so the chronic-spot columns and the replay have something real to show.
- The rest are spread across the dense cells with a category mix of garbage dumps 34 %, blocked drains 20 %, overflowing bins 18 %, stagnant water 12 %, missed collection 12 %, dead animals 4 %.
- Ages span 30 days. Older reports are more likely to be resolved, with resolution times drawn from 6 h to about 6 days.
- Severity: 45 % low, 38 % medium, 17 % high. "Me too" counts are skewed towards zero.

Seeded reports carry no photos, and the command centre says so in their detail panel. The generator uses a fixed random seed (`7`), so the export is reproducible.

## Numbers on screen and what they are

| On screen | Category | Basis |
|---|---|---|
| 1,35,721 real buildings | Real | Overture footprints in the pilot box |
| ~657 people within 100 m | Estimate | Real building count × 4.5 assumed residents |
| People beside open waste (total) | Estimate | Same, with cells de-duplicated across reports |
| Open reports, past deadline, median time to clear | Demo data | Seeded and visitor reports |
| Deadline 12 h / 24 h / 48 h | Product default | Not NMC policy |
| Rain mm, last 72 h | Real, live | Open-Meteo |
| 426 slum settlements, 298 notified | Cited | 2024 press reports citing NMC |
| ~8.6 lakh slum residents | Cited | NMC survey reported by Nagpur Today, 2016 |

## Van routes

No live collection-vehicle GPS is public for Nagpur, so the vans are simulated: two per pilot zone, each on a 6.2 km beat around a dense locality (Mominpura, Itwari–Mahal, Kalamna, Pardi, Vaishali Nagar, Yashodhara Nagar). The roads they drive are real OpenStreetMap roads. Everything derived from them (positions, ETAs, lanes skipped, route checks) is labelled as simulated where it appears. NMC's collection vendors track their vehicles; with that feed, `routes.json` would be replaced by real trails.

The roads came from this Overpass query:

```
[out:json][timeout:120];
way["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|service|primary_link|secondary_link|tertiary_link)$"](21.135,79.085,21.19,79.175);
(._;>;);out skel qt;
```

## Rebuilding the data

```bash
pip install --target .pylib duckdb
```

```bash
python scripts/fetch_buildings.py .pylib nagpur.duckdb
```

```bash
python scripts/export_data.py .pylib nagpur.duckdb public/data
```

```bash
python scripts/export_routes.py roads.json public/data
```

```bash
python scripts/export_terrain.py public/data
```

Run `export_routes.py` after `export_data.py`, because it appends its seeded reports to `seed.json`. `export_terrain.py` needs only NumPy and Pillow and downloads 15 small PNG tiles.

`fetch_buildings.py` reads only the row groups whose bounding boxes intersect Nagpur, so it downloads a few hundred MB, not the whole planet. It takes about 90 seconds on a home connection.

## Sources for cited figures

- Hitavada, "NMC to reclassify slums in city", 23 Feb 2020
- Nagpur Today, NMC slum survey report, 26 Aug 2016
- Nagpur Today, 15 Jul 2024, and Navbharat, on 426 bastis (298 notified)
- NMC public notice, Diwali waste collection centres, 21 Oct 2024
- NMC 2025 ward formation maps (PDF), nmcnagpur.gov.in
- Hitavada, 18 May 2026, on census teams and missing slum lanes in Google Maps
