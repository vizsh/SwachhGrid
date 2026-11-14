# Roadmap: what to build next

Ranked by what wins the room first and what makes the product real second. Each item has the **edge** it gives over other teams, the **build** in one paragraph, and an **effort** estimate for one developer.

The judging reality: most teams in this problem statement will show a complaint form, a list of tickets and a 2D map with pins. SwachhGrid already beats that on the map, the priority model and proof of clean. The next moves should make judges **take part** in the demo, and should prove numbers nobody else can claim.

---

## Tier 1: build before the demo

### 1. Live audience loop (shared database + QR)
**Edge:** judges scan a QR on your slide, report from their own phones, and watch their reports drop onto the 3D city on the projector seconds later. No other team will have a live, multi-device demo.

**Build:** Supabase (Postgres + PostGIS, Storage for photos, Realtime channel). Replace [`store.ts`](../src/lib/store.ts) with a thin client: `insert` on report, subscribe to `tickets` changes, upload photos to a bucket. Add a **"Scan to report"** QR panel in the command centre (presentation mode) and an arrival animation: a pin drops from above and the surrounding roofs warm up. Use row-level security so anonymous users can insert and read but only crews can resolve.

**Effort:** 5–7 h.

### 2. AI photo triage and clean-up verification
**Edge:** the photo does the work. The category and severity are filled in automatically; faces and number plates are blurred before storage; and at closing, the AI compares before and after: "garbage still visible, cannot close". This answers the fraud question better than GPS alone.

**Build:** a Vercel route handler calling a vision model with the downscaled photo. Return `{category, severity, isSanitationIssue, confidence, hazards[]}` as structured output. Pre-select the category on the resident's screen and let them change it. On close, send both photos and require `cleared: true` with a confidence threshold; otherwise flag the job for supervisor review. Rate-limit by IP.

**Effort:** 4–5 h.

### 3. Person-days of exposure avoided
**Edge:** one honest, original impact number that no complaint portal can compute: *"This week, SwachhGrid avoided 18,400 person-days of exposure in Gandhibagh."* It turns the 3D map into a measurable public-health outcome.

**Build:** for each resolved report, `peopleExposed × (baselineDays − actualDays)`, where the baseline is the zone's historical median time to clear (or an NMC-stated figure when available). Show it as the headline tally, per zone, and on the landing page. Document the formula in [ARCHITECTURE.md](ARCHITECTURE.md).

**Effort:** 2 h.

### 4. Real NMC ward (prabhag) boundaries
**Edge:** credibility. Routing to the real 38 prabhags of the 2025 delimitation, with ward polygons on the map, shows you did the civic homework.

**Build:** georeference NMC's published QGIS PDF maps (QGIS Georeferencer with OSM control points), digitise the pilot prabhags, export GeoJSON. Replace `zoneFor` with point-in-polygon (Turf.js). Draw ward outlines as painted dashed lines; click a ward to filter.

**Effort:** 4–6 h for the three pilot zones.

### 5. Crew route of the day
**Edge:** turns the priority queue into an actual plan: "Crew 6A: 9 stops, 7.2 km, clears ~4,300 exposure-person-days." Animated trucks drive real roads in 3D.

**Build:** greedy priority-weighted nearest-neighbour or a small VRP solver over the top N open jobs per zone; road distances from the public OSRM demo or an OpenRouteService key. Draw the route with deck.gl `TripsLayer` on the command centre and as a stop list in the crew app.

**Effort:** 5 h.

---

### Built since: planning tools
What-if planner (new bin and extra van shift), smart-bin twins with printable QR stickers and a one-tap scan page, clean-lane ribbons with a share card, and the next-week hotspot forecast are built. **Next:** real bin locations from NMC, scan data from real stickers, and a trained forecast once there are a few months of real reports.

### Built since: visual layer for the demo
Monsoon simulator, sun and night, then-and-now split, and the cinematic tour are built (see [FEATURES.md](FEATURES.md#moving-parts-what-makes-the-demo-alive)). **Next:** a higher-resolution terrain model (CartoDEM or a drone survey) and real drain lines for the simulator; cast shadows once deck.gl's shadow support is stable.

## Tier 2: makes it a real product

### 6. WhatsApp and missed-call reporting
**Edge:** reaches residents without the app or a smartphone, which is most of the target population.

**Build:** a WhatsApp Business (or Twilio sandbox) webhook: send a photo and a location pin, get a report ID and status updates. A missed-call number that creates a "call back" task for the ward office. SMS on status changes.

**Effort:** 6–8 h.

### 7. Marathi voice reporting and read-aloud
**Edge:** genuine low-literacy design: speak *"इथे गटार तुंबले आहे"* and it fills the report.

**Build:** a record button calling a speech-to-text API with Marathi support; map the transcript to a category with the same model as item 2. Add read-aloud (Web Speech API, or pre-generated audio) for every step.

**Effort:** 4 h.

### 8. Outbreak early-warning layer
**Edge:** connects sanitation to health outcomes, which is the problem statement's real goal.

**Build:** per ward and per week, combine old stagnant-water and drain reports, rainfall and temperature (Open-Meteo), and the monsoon dengue season curve into a transparent risk score. A health officer can broadcast an alert to everyone who reported within the ward. If NMC or IDSP case counts become available, overlay them.

**Effort:** 5 h.

### 9. Collection vehicle (ghanta gaadi) coverage: simulated version built
**Edge:** catches the root cause of "irregular garbage clearance". Lanes the van did not visit glow; "truck did not come" reports are cross-checked against the van's trail automatically.

**Built:** six simulated vans on real roads, lane coverage, skipped lanes, route-confirmed complaints, the resident ETA and crew rounds. **Next:** ingest the vendors' real vehicle GPS (NMC's vendors already track vehicles). Snap trails to OSM roads, mark lane segments as covered or missed per day, and compare with missed-collection reports.

**Effort:** 6 h with simulated data.

### 10. Offline-first PWA
**Edge:** works in lanes with poor signal, which is where it is needed.

**Build:** installable manifest and a service worker; queue reports in IndexedDB and retry with idempotency keys so a dropped connection never creates duplicates.

**Effort:** 3–4 h.

### 11. Public ward scorecards and shareable cards
**Edge:** transparency and pressure. Each ward gets a public page: median time to clear, deadline compliance, reopen rate, person-days avoided. One tap makes a shareable image card for WhatsApp groups.

**Build:** `/ward/[id]` static pages with Open Graph images (`next/og`) painted in the signboard style.

**Effort:** 4 h.

### 12. QR stickers on community bins (built, with a demo bin registry)
**Edge:** a physical touchpoint. Scan a sticker on a bin and report "overflowing" in one tap; each bin becomes a tiny digital twin with a fill history.

**Build:** bin registry, a printable sticker sheet (PDF) in the Painted Notice style, and `/bin/[id]` one-tap reports.

**Effort:** 3 h.

---

## Tier 3: the long game

| Idea | What it adds |
|---|---|
| **Hotspot forecasting** | Predict next week's dumping hotspots from history (per-hexagon Poisson or gradient boosting) and suggest where to place bins or schedule extra pickups |
| **Crowdsourced lane mapping** | Resident GPS traces fill lanes missing from maps, the gap NMC census teams reported in 2026; contribute them back to OpenStreetMap |
| **ASHA and NGO role** | Community health workers verify reports, log fever cases, and run awareness drives from the same map |
| **Health facility layer** | Nearest UPHC and dispensary for each alert area |
| **NMC integration** | Push tickets into NMC's grievance system and pull status back; SwachhGrid becomes the map and accountability layer on top |
| **Analytics exports** | Weekly PDF and CSV for zonal review meetings: compliance trends, category mix, worst lanes |
| **Recognition** | "Swachh Mitra" recognition for residents whose reports led to verified clean-ups (no points or leaderboards for complaints, to avoid gaming) |

---

## Polishing the current build

The independent design review's material fixes are done: the phone landing now opens on the duotone map and tally; the category picker is a painted directory board; category colours stay in the paint palette; the crew map has a satellite-tile fallback; map credits are a small dark caption; labels no longer sit above headings; the tally says "Demo data" at the claim; pending custody steps have higher contrast; and place labels no longer hide under the location pin.

Still open from the review's craft ceiling:

- Give the tally real hanging hardware (painted hooks and a rope), so it hangs instead of floating.
- Paint the pinstripe as a double line with corner flourishes, as board painters do.
- Add a tiny legend for the landing map dots (white: open, red: past deadline).

## Suggested 48-hour plan

| Block | Build |
|---|---|
| Hours 0–7 | 1. Live audience loop |
| Hours 7–11 | 2. AI triage and verification |
| Hours 11–13 | 3. Person-days avoided |
| Hours 13–18 | 5. Crew route of the day |
| Hours 18–22 | Design review polish and a rehearsed demo |
| If time allows | 4. Ward boundaries, then 7. Marathi voice |
