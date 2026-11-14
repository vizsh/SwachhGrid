# Demo script

A five-minute walkthrough for judges. It works from one laptop with two browser tabs, or a laptop plus your phone if both use the same browser profile. (Reports sync between tabs of one browser; cross-device sync needs the shared database on the roadmap.)

Before you start: open `/command` once so the building tiles are cached, and press **Reset demo** in its footer.

## 0:00 The hook (landing, `/`)

- Point at the headline: *"येथे कचरा टाकू नये"* is painted on walls all over Nagpur's bastis. "We built the city's answer to that wall."
- The right half is **real**: actual roofs of Mominpura, Gandhibagh zone. The dots are open reports; red ones are past deadline.
- Scroll once: **one report, three hands, one proof.** Watch the stamp strike.
- Scroll again: the top of the queue is ranked by **how many people live beside the waste**, computed from 1,35,721 real buildings.

## 0:45 The resident (`/report`, phone size)

- It opens in **Marathi**. Under the six signs: *your ghanta gaadi GB-1 arrives in about 7 minutes*, with a moving marker.
- Switch to Hindi and back to show all three languages.
- Tap **तुंबलेले गटार** (blocked drain). Take a photo, or skip it.
- The map is satellite imagery; drag it so the pin sits on a lane. Press **पाठवा**.
- Show the filed card: ID, locality, **Zone 6**, the custody line at step 1.
- Optional: file the same category at the same spot again. It catches the duplicate and offers **me too** instead.

## 1:45 The officer (`/command`)

- The tally changed. The new report is in the queue and pulses once.
- Click it: the camera **flies down to the lane**. The buildings within 100 m glow; this is the "people exposed" number.
- Point at the deadline bar and the custody line. Press **Assign to Gandhibagh crew**.
- Click the top queue item instead: it is 29 days late. Press **Escalate**.
- Toggle **Chronic spots**: 3D columns show where reports keep coming back.
- Press **Replay 30 days**: hotspots grow and clear, and the numbers rewind with them.
- Point at **Zones**: Ashi Nagar shows **High** breeding risk from week-old stagnant water; the rainfall figure is live.

## 2:45 The city moves (`/command`)

- Press **Run a live morning** on the Live activity board. Reports drop in with rings, neighbours back them, crews start and clear jobs (green pulses), and every event lands in the feed.
- Point at the yellow vans with trails: "these are the ghanta gaadis, on real roads." Red dashed lanes are lanes a van skipped today.
- Click a **truck did not come** report beside a red lane: *Confirmed by route data: van GB-1 skipped this lane.* Click the van: its round, lanes skipped, and every complaint the route confirms.
- In **Zones**, press **Alert** on Ashi Nagar (High). Show the Marathi message and households reached, then press **Send alert**: waves spread from each water spot and the SENT stamp lands.
- Click a bar in the timeline above the scrubber to jump to that day.

## 3:30 The crew (`/worker`)

- From the report detail, press **Open in crew app**.
- Jobs are ranked by people affected; red means late.
- Press **Start work**, then take the after-photo. From the desk the app says *"You are 4 km away. This job cannot be closed from here."* That is the anti-fraud rule.
- Tick **Demo only: pretend I am on the spot** and press **Close job**. **The stamp lands.**

## 4:15 Back to the resident

- In `/report`, open **My reports**: before and after photos with the stamp.
- **Not cleaned** reopens it, and it goes back to the crew with a warning.

## 4:45 Close

"Real map, honest numbers, every report owned, deadlined and proven. Next we connect it to NMC's real ward boundaries, a shared database, and WhatsApp." See [ROADMAP.md](ROADMAP.md).

## Questions to expect

**Is the data real?**
The buildings, imagery, roads, rivers and rainfall are real. The 330 reports are seeded demo data, placed beside real small buildings in the densest clusters, and say so. People exposed is an estimate: the building count times 4.5.

**How do you stop crews faking clean-ups?**
GPS geofence on the after-photo (50 m), before and after shown to the resident, and the resident can reopen. Next: EXIF time checks and AI before/after comparison.

**How does it reach people without smartphones?**
Planned: a WhatsApp bot, a missed-call line to the ward office, and QR stickers on community bins. See the roadmap.

**What does it cost NMC?**
Open data and open-source maps; no per-map-load fees. Hosting is a static site plus a small Postgres database.

**Why these three zones?**
The densest small-building clusters in the satellite data fall in Gandhibagh, Lakadganj and Ashi Nagar. Ashi Nagar had the most slums of any zone in NMC's 2016 survey.

**Why not just use Google Maps?**
Its photorealistic 3D does not cover these lanes, and the footprints we use come from Google's own Open Buildings release anyway, under an open licence.
