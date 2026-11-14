# Features

Every feature below is built and runs in the deployed app unless it is marked **Not built**. The left column maps each one to the problem statement's core features.

## Coverage of the problem statement

| Problem statement asks for | SwachhGrid | Where |
|---|---|---|
| Geo-tagged photo reporting for uncollected garbage and blocked drains | Camera photo, GPS with a drag-the-map pin to correct it, six categories including "truck did not come" | [`ReportFlow.tsx`](../src/components/ReportFlow.tsx), [`MiniMap.tsx`](../src/components/MiniMap.tsx) |
| Automated ticket assignment to zonal sanitation supervisors | The pin decides the zone, the zone decides the supervisor; one-click assign; priority by people exposed | [`domain.ts`](../src/lib/domain.ts) `zoneFor`, `priority` |
| Real-time status tracking for residents and authorities | Custody line on every report; status visible in My reports, the crew app and the command centre; cross-tab live sync | [`paint.tsx`](../src/components/paint.tsx) `CustodyLine`, [`store.ts`](../src/lib/store.ts) |
| Public health alerts for localised disease outbreaks | Mosquito-breeding watch per zone from old water reports plus live rainfall | [`CommandCenter.tsx`](../src/components/CommandCenter.tsx) `meters` |
| Analytics to find chronic waste accumulation zones | 3D chronic-spot columns, 30-day replay, zone meters, median time to clear, exposure tinting | `CommandCenter.tsx` |
| Mobile-responsive citizen interface and ward dashboard | Phone-first resident and crew apps; desktop command centre | all routes |

## Moving parts (what makes the demo alive)

| Feature | What you see | Why it matters | Where |
|---|---|---|---|
| **Collection vans (ghanta gaadi)** | Six vans drive real Nagpur roads in 3D with fading trails, labelled GB-1 to AN-2, at 20× speed | Irregular collection is the root cause in the problem statement; nobody shows it | [`vans.ts`](../src/lib/vans.ts), `CommandCenter.tsx` |
| **Lane coverage** | Lanes a van drove today are thin white lines; lanes it skipped are red dashes | Turns "the truck never comes to our gali" into evidence | `scripts/export_routes.py` |
| **Route check on complaints** | A "truck did not come" report next to a skipped lane says *Confirmed by route data: van GB-1 skipped this lane* | The complaint is verified automatically, with no field visit | `ReportDetail` |
| **Van detail** | Click a van: round progress, lanes driven and skipped, and the residents' complaints the route data confirms | A supervisor can act on one van's performance | [`CommandPanels.tsx`](../src/components/CommandPanels.tsx) `VanPanel` |
| **Live morning simulation** | One button: residents report, neighbours agree, supervisors assign, crews start and clear jobs, late jobs escalate, every 3 s | The map moves on its own while you talk; nothing is pre-recorded | [`simulate.ts`](../src/lib/simulate.ts) |
| **Live activity feed** | Every event lands in a feed (also across tabs); click one to fly to it | Fills the officer's screen with what is happening now | `ActivityFeed` |
| **Report ripples** | New reports drop in with two expanding chrome rings; clean-ups send a green pulse | You can see the city react | `CommandCenter.tsx` animation loop |
| **Health alert broadcast** | From a zone with Watch or High breeding risk: households within 300 m, a Marathi and English message, channels (SMS, WhatsApp, the van's loudspeaker); Send makes waves spread from each water spot and a SENT stamp land | Closes the loop from sanitation to public health | `AlertPanel` |
| **30-day timeline** | Bars per day above the scrubber: reports (chrome) and clean-ups (green); click a day to jump there | Shows the backlog building or clearing at a glance | `Timeline` |
| **Resident van ETA** | "Your collection van GB-1 arrives in about 7 min", with a moving marker, plus open and cleared reports within 300 m | Answers the question residents actually ask | [`VanCards.tsx`](../src/components/VanCards.tsx) |
| **Crew van rounds** | The zone's vans with live round progress and lanes skipped | Crew and van driver coordinate | `ZoneRounds` |
| **Landing vans** | A van drives across the Mominpura satellite with its trail; a legend explains the marks | The first screen already moves | [`LandingLive.tsx`](../src/components/LandingLive.tsx) |
| **Monsoon simulator** | A rain slider (0–150 mm). Water rises in the low lanes from real elevation data and shimmers; open blocked drains overflow with blue rings; a counter shows people in waterlogged lanes; breeding risk turns High zone by zone and the Alert buttons pulse | Shows in one gesture why a blocked drain matters before the monsoon | [`flood.ts`](../src/lib/flood.ts), `scripts/export_terrain.py` |
| **Sun and night** | Buildings lit from the real sun position over Nagpur at the scrubber's time; replay runs through day and night; at night the satellite dims and open reports glow | Looks spectacular on a projector, and shows which spots stay unattended after dark | [`sun.ts`](../src/lib/sun.ts) |
| **Then and now** | A draggable divider across the 3D city: left is 7–28 days ago, right is now. Labels count open reports on each side; reports cleared since get a green ring | One image for a review meeting: what changed | `SplitDivider` in `CommandCenter.tsx` |
| **Play tour** | One button runs a scripted 70-second flight in eight captioned scenes, from the whole pilot area to the health alert | The demo runs itself while you talk, and cannot go wrong on stage | `runTour` in `CommandCenter.tsx` |

## Resident app (`/report`)

- **Three steps, Marathi first.** What is the problem → photo → where. Language switch for मराठी, हिंदी and English; every label, category, status and custody step is translated ([`i18n.ts`](../src/lib/i18n.ts)).
- **Six painted category signs.** Garbage dump, overflowing bin, blocked drain, stagnant water, truck did not come, dead animal. Large type and icons for low-literacy users.
- **Photo.** Opens the rear camera on phones (`capture="environment"`). The image is downscaled to 720 px in the browser before it is stored.
- **Location.** Uses GPS when the user is inside the pilot area; otherwise says so and lets them drag the satellite map under a fixed pin. Open reports nearby are shown on the map.
- **Duplicate detection.** A same-category open report within 30 m triggers "This is already reported" with a one-tap **me too**. Supporting an existing report raises its priority by 10 % per neighbour.
- **Your collection van.** Under the categories: which van serves this spot, its ETA in minutes with a live marker, and how many reports are open or were cleared within 300 m today. Fully translated.
- **Filed confirmation.** Report ID, locality, zone and number, and the custody line.
- **My reports.** Every report the resident filed, with status, before and after photos, the CLEARED stamp when done, and **Not cleaned** to reopen.

## Crew app (`/worker`)

- **Duty board per zone.** Open jobs and past-deadline count; jobs ranked by people affected × days open.
- **Job detail.** Location map, people within 100 m, time open, the resident's photo, and a warning if the resident reopened it.
- **Today's van rounds** for the zone: each van's round progress and lanes skipped, moving live.
- **Navigate** opens turn-by-turn directions in Google Maps.
- **Start work** moves the job to in progress, visible to the officer and the resident.
- **Proof of clean.** The after-photo is checked against GPS: within 50 m the job can close; otherwise the app states the distance and refuses. A labelled demo override exists for judging from a desk.
- **The stamp.** Closing a job strikes the CLEARED / साफ stamp onto the custody card.
- **Deep link.** `/worker?id=NGP-1011` opens a job directly; the command centre links to it.

## Command centre (`/command`)

- **3D digital twin.** 1,35,721 real building footprints extruded on satellite imagery, with real roads, rivers and nallahs, and place names.
- **Homes beside waste.** Buildings within 100 m of an open report tint from chrome yellow to vermilion as days pass.
- **Priority queue.** All zones or one; each row shows people exposed and time open, red when late. Fresh reports from the resident app flash in.
- **One continuous tally.** Open reports, past deadline, people beside open waste, median time to clear, cleared in 7 days. All follow the time scrubber.
- **Zone meters.** One identical instrument per zone: open reports with the late share in red, and mosquito-breeding risk.
- **Report detail.** Photo or a note that it is seeded, people within 100 m, time open, neighbours agreeing, deadline bar, custody line, stamp when cleared. **Assign**, **Escalate** (once late) and **Open in crew app**.
- **Fly-to.** Selecting a report flies the camera down to the lane with a 100 m ring.
- **Layers.** Homes beside waste, chronic spots (3D hexagon columns of 30-day report counts), cleared reports, whole-pilot-area view.
- **30-day replay.** Scrub or play; every number and colour shows the city at that moment.
- **Deep link.** `/command?id=NGP-1011` opens focused on one report.
- **Reset demo** clears everything the visitor changed.

## Landing (`/`)

- The painted signboard with **येथे कचरा टाकू नये.**, the product in one paragraph, and the two main actions.
- A duotone satellite of Mominpura with the live open reports, and a tally of open and past-deadline reports.
- "One report, three hands, one proof": the custody story with real UI fragments and the stamp striking on scroll.
- "Ranked by people, not by who shouted first": the real top five of the priority queue, computed live from the data.
- A directory board into the three apps.

## Not built yet

- Shared database and realtime across devices
- Real NMC prabhag boundaries
- SMS, WhatsApp and push notifications
- AI photo classification
- Offline queue for reports
- Public ward scorecards

These and more are planned in [ROADMAP.md](ROADMAP.md).
