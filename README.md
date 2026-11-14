<div align="center">

# SwachhGrid

### येथे कचरा टाकू नये. Or report it.

**A live sanitation map for Nagpur's densest bastis.** Residents report in Marathi, Hindi or English in three taps. Crews get jobs ranked by how many people live beside the waste. A job closes only with an after-photo taken on the spot. Officers watch it all on a 3D map built from **1,35,721 real building footprints**.

`Next.js 16` · `React 19` · `MapLibre GL` · `deck.gl` · `Tailwind CSS 4` · `Zustand` · `Overture Maps` · `Open-Meteo`

[Landing](#the-four-surfaces) · [Demo script](docs/DEMO.md) · [Architecture](docs/ARCHITECTURE.md) · [Data](docs/DATA.md) · [Design system](docs/DESIGN-SYSTEM.md) · [Roadmap](docs/ROADMAP.md)

</div>

![SwachhGrid landing page: a chrome-yellow painted signboard with the Marathi line "येथे कचरा टाकू नये." beside a duotone satellite of Mominpura with live report dots](docs/images/landing.png)

---

## The problem

> YCCE Hackathon · PPT round · Theme 03, Social Issues · **PS1: Urban Slum Sanitation and Waste Management Tracker**

Irregular garbage clearance, overflowing bins and blocked drains in dense urban pockets lead to vector-borne and waterborne outbreaks such as malaria and cholera. Nagpur has **426 slum settlements, 298 of them notified** (2024 press reports citing NMC). A 2016 NMC survey counted about **8.6 lakh slum residents**. Complaints today are scattered across calls, WhatsApp groups and ward offices. Nobody can see which homes are living next to waste that was reported a week ago.

## What SwachhGrid does differently

| | Typical complaint portal | SwachhGrid |
|---|---|---|
| **Map** | A pin on a generic street map | A 3D twin of the real neighbourhood: 1,35,721 building footprints, satellite imagery, real roads and rivers |
| **Priority** | First come, first served | **People exposed × days open × severity**: the dump beside 900 homes beats the one beside 40 |
| **Closing a ticket** | Officer clicks "resolved" | Crew must take an **after-photo within 50 m** of the report. The resident sees before/after and can **reopen** it |
| **Duplicates** | Ten complaints for one pile | A report within **30 m** of an open one becomes "me too" support |
| **Language** | English forms | **Marathi first**, Hindi, English; icon-led and large-type for low literacy |
| **Health** | Separate department | **Mosquito-breeding watch** per zone from old stagnant-water and drain reports plus live rainfall |
| **Accountability** | Status text | A **custody line** on every report (reported → assigned → work started → cleared with proof), **deadlines**, **escalation** and a **30-day replay** |

## The four surfaces

| Route | Who | What it is |
|---|---|---|
| [`/`](src/app/page.tsx) | Everyone, judges first | The signboard landing: live open and past-deadline tallies, the duotone satellite of Mominpura with live reports, the custody story, and the real top of the priority queue |
| [`/report`](src/components/ReportFlow.tsx) | Residents | Three-step report in Marathi / Hindi / English: pick a painted sign, take a photo, drop the pin. Duplicate detection, "my reports" with the custody line and a reopen button |
| [`/worker`](src/components/WorkerApp.tsx) | Sanitation crews | The duty board: jobs per zone ranked by people affected, navigate, start work, and **proof of clean** with a geofenced after-photo. The CLEARED / साफ stamp lands when the job closes |
| [`/command`](src/components/CommandCenter.tsx) | Zonal and health officers | The 3D command centre: exposure-tinted buildings, chronic-spot columns, priority queue, zone meters, breeding-risk watch, report detail with escalation, and a 30-day replay |

<table>
<tr>
<td width="62%"><img src="docs/images/command-centre.png" alt="Command centre: 3D buildings around a selected overflowing bin glow red within a 100 m ring; priority queue on the left, report detail with custody line on the right"></td>
<td><img src="docs/images/crew-cleared.png" alt="Crew app: a cleared job with the red CLEARED stamp over the custody line"></td>
</tr>
<tr>
<td colspan="2">
<img src="docs/images/resident-categories.png" width="24%" alt="Resident app: six painted category signs in Marathi">
<img src="docs/images/resident-location.png" width="24%" alt="Resident app: confirm the location on satellite imagery">
<img src="docs/images/resident-filed.png" width="24%" alt="Resident app: report filed with its custody line">
<img src="docs/images/crew-job.png" width="24%" alt="Crew app: job detail with people exposed and proof of clean">
</td>
</tr>
</table>

## Try the whole loop in 90 seconds

1. Open **`/report`** on your phone. Pick **तुंबलेले गटार** (blocked drain), skip or take a photo, drag the map so the pin sits on a lane in Mominpura, press **पाठवा**.
2. Open **`/command`** on a laptop in the same browser. The count rises, the new report sits in the queue, and the homes around it glow amber.
3. Click it. The camera flies down to the lane. Press **Assign**, then **Open in crew app**.
4. In **`/worker`**, take the after-photo. Away from the spot, the job refuses to close; tick the demo override. Press **Close job**: the stamp lands.
5. Back in `/report`, **My reports** shows before and after, with **Not cleaned** to reopen.
6. In `/command`, press **Replay 30 days** and watch hotspots grow and clear.

The full judge walkthrough, with talking points, is in [docs/DEMO.md](docs/DEMO.md).

> **Demo data, honestly labelled.** The 330 existing reports are seeded beside real small buildings in the densest clusters and carry no photos. Reports you file are stored in your browser and sync across tabs, not across devices; a shared database is the first item on the [roadmap](docs/ROADMAP.md). Zone areas are approximate, building heights are estimated from footprint size, and "people exposed" assumes 4.5 residents per building.

## Pilot area

Three NMC zones, chosen from the data: **Gandhibagh (Zone 6)**, **Lakadganj (Zone 8)** and **Ashi Nagar (Zone 9)**. They cover the old-city cores of Mominpura, Itwari and Mahal, and the dense eastern edge towards Kalamna and Pardi. Ashi Nagar had the most slums of any zone in NMC's 2016 survey (63). The densest small-building clusters in the Overture data fall inside these zones. Details are in [docs/DATA.md](docs/DATA.md).

## How it works

```mermaid
flowchart LR
  subgraph Build time
    OV[Overture Maps buildings<br/>S3 GeoParquet] -->|scripts/fetch_buildings.py<br/>DuckDB + spatial| DB[(nagpur.duckdb)]
    DB -->|scripts/export_data.py| T[public/data/tiles/14/x/y.json<br/>1,35,721 footprints]
    DB --> D[public/data/density.json<br/>55 m building-count grid]
    DB --> S[public/data/seed.json<br/>330 demo reports]
  end
  subgraph Browser
    T --> CC[Command centre<br/>deck.gl SolidPolygonLayer]
    D --> EX[Exposure: people within 100 m]
    S --> ST[Zustand store<br/>+ localStorage]
    R[Resident app] --> ST
    W[Crew app] --> ST
    ST --> CC
    EX --> Q[Priority queue]
    OM[Open-Meteo rainfall] --> BW[Breeding watch]
  end
  ESRI[Esri World Imagery] --> CC
  OFM[OpenFreeMap vector tiles<br/>OSM roads, rivers, names] --> CC
```

**Priority** = (people within 100 m + 20) × days open × (0.6 + 0.4 × severity) × (1 + 0.1 × neighbours agreeing). **People within 100 m** = buildings in the 55 m density cells whose centres fall inside the radius × 4.5. The full model and its assumptions are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-models).

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. `npm install` also copies MapLibre's worker into `public/maplibre` (see [`scripts/copy-maplibre.mjs`](scripts/copy-maplibre.mjs)). No API keys are needed: every map and data source is open.

To deploy, import the repository into Vercel with the default Next.js settings. Every route is statically prerendered.

To rebuild the map data from scratch (about 2 minutes, needs Python 3.11):

```bash
pip install --target .pylib duckdb
```

```bash
python scripts/fetch_buildings.py .pylib nagpur.duckdb
```

```bash
python scripts/export_data.py .pylib nagpur.duckdb public/data
```

## Project map

```
src/
  app/                 routes: / (landing), /report, /worker, /command
  components/
    CommandCenter.tsx  3D map, queue, zone meters, detail, replay
    ReportFlow.tsx     resident three-step report, duplicates, my reports
    WorkerApp.tsx      crew duty board and proof of clean
    LandingLive.tsx    duotone hero map, live tally, top of queue
    paint.tsx          Stamp and CustodyLine, the shared signature components
    MiniMap.tsx        drag-the-map pin picker
  lib/
    domain.ts          categories, deadlines, zones, exposure and priority models
    store.ts           Zustand store, localStorage persistence, cross-tab sync
    buildings.ts       building tile loader and height estimate
    mapStyle.ts        satellite + OSM style
    i18n.ts            Marathi, Hindi, English strings
scripts/               data pipeline (DuckDB) and MapLibre worker copy
public/data/           exported building tiles, density grid, seeded reports
docs/                  architecture, data, design system, demo script, roadmap
```

## Documentation

| Doc | What is in it |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Product truth: users, purpose, positioning, constraints, principles |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, data flow, state, every model with its formula and assumptions, performance notes |
| [docs/DATA.md](docs/DATA.md) | Every dataset, licence, how the pilot zones were chosen, what is real vs estimated vs seeded |
| [docs/FEATURES.md](docs/FEATURES.md) | Every feature mapped to the problem statement, by role, with its file |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | The Painted Notice visual language: palette, type, components, motion, accessibility |
| [docs/DEMO.md](docs/DEMO.md) | A timed walkthrough for judges and the questions to expect |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What to build next, ranked by impact for the competition and for real use |

## Credits and licences

Buildings © [Overture Maps Foundation](https://overturemaps.org) (Google Open Buildings, Microsoft ML Buildings, OpenStreetMap), ODbL / CDLA. Imagery © Esri, Maxar, Earthstar Geographics. Roads, rivers and place names © OpenStreetMap contributors via [OpenFreeMap](https://openfreemap.org). Rainfall from [Open-Meteo](https://open-meteo.com). Fonts: Yatra One, Teko and Mukta (SIL Open Font License).

SwachhGrid is an independent civic project built for the YCCE Hackathon. It is not affiliated with Nagpur Municipal Corporation or Swachh Bharat Mission.
