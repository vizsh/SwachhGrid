# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience for now: hackathon judges (YCCE Hackathon, PPT round, Social Issues PS1) opening a Vercel link on a laptop or their own phone, with a few minutes to understand and try the product.

The product itself serves three roles in Nagpur Municipal Corporation slum and dense pockets:
- **Residents** report sanitation hazards (garbage dumps, overflowing bins, blocked drains, stagnant water, missed collection, dead animals) from a phone, often in Marathi or Hindi, often with low literacy.
- **Sanitation crews** work a ranked job list in the field and close jobs with an on-site "after" photo.
- **Zonal officers / health officers** monitor open reports, deadlines, exposure and outbreak risk across zones.

## Product Purpose

Turn scattered sanitation complaints into a routed, deadline-tracked, publicly verifiable workflow, and show officers which homes are living next to uncollected waste. Success for the demo: a judge files a report on one screen and watches it arrive, get prioritised and get closed on the others.

## Positioning

A live digital twin built on real data: 135,721 real building footprints (Overture Maps: Google Open Buildings, Microsoft, OSM) for the pilot area, real satellite imagery, real roads and rivers. Reports are prioritised by estimated people exposed within 100 m × days open, not first-come-first-served. Jobs close only with a geofenced (50 m) after-photo.

## Operating Context

- Pilot zones: Gandhibagh (Zone 6), Lakadganj (Zone 8), Ashi Nagar (Zone 9). Localities include Mominpura, Itwari, Mahal, Santra Market, Lashkaribagh, Vaishali Nagar, Kalamna, Yashodhara Nagar, Pardi.
- Routes: `/` landing, `/report` resident app, `/worker` crew app, `/command` officer command centre.
- Context figures with sources: Nagpur has 426 slums (298 notified) per 2024 reports; 2016 NMC survey counted ~8.59 lakh slum residents.

## Capabilities and Constraints

- Next.js on Vercel; MapLibre + deck.gl for the 3D map; Esri satellite tiles, OpenFreeMap vector tiles, Open-Meteo rainfall.
- Demo data: 330 seeded reports (no photos) plus anything a visitor files; stored in the visitor's browser only. Shared database not built yet.
- Zone areas are approximate rectangles (NMC publishes boundaries as PDFs only). Building heights are estimated from footprint size. People exposed assumes 4.5 residents per building. Category deadlines (12–48 h) are product defaults, not NMC policy.
- Marathi, Hindi, English in the resident app.

## Brand Commitments

- Name: SwachhGrid (keep).
- Independent civic product: do not imitate official NMC or Swachh Bharat logos or branding.

## Evidence on Hand

Real building, road, river and satellite data; live rainfall. No real complaints, photos, testimonials, partners or pilots exist: never fabricate them. Seeded reports must stay identifiable as demo data.

## Product Principles

1. Real place, honest data: show what is real, label what is estimated or seeded.
2. Every report has an owner, a deadline and proof.
3. Prioritise by people affected, not by who shouted first.
4. The resident flow must work for a low-literacy user in Marathi in three taps.
5. Each role sees the others' actions live, so the loop is demonstrable in one sitting.

## Accessibility & Inclusion

Large touch targets, icon-led choices and Devanagari-first text in the resident app; readable contrast on the dark command centre; respect reduced motion.
