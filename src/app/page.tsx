import Link from "next/link";
import { ArrowRight, ArrowUpRight, Camera, HardHat, MonitorDot } from "lucide-react";
import { HeroMapClient, StampClient, TallyClient, TopQueueClient } from "@/components/ClientOnly";

const ROLES = [
  {
    href: "/report",
    icon: Camera,
    mr: "रहिवासी",
    en: "Resident",
    line: "Report garbage, a blocked drain or a missed truck in three taps. Marathi, Hindi or English.",
    paint: "bg-chrome text-ink",
  },
  {
    href: "/worker",
    icon: HardHat,
    mr: "सफाई कर्मचारी",
    en: "Sanitation crew",
    line: "Jobs ranked by people affected. Close a job only with an after-photo taken on the spot.",
    paint: "bg-board text-letter",
  },
  {
    href: "/command",
    icon: MonitorDot,
    mr: "झोन अधिकारी",
    en: "Zonal officer",
    line: "Every open report on a 3D map of the real city, with deadlines, escalation and a 30-day replay.",
    paint: "bg-vermilion text-letter",
  },
];

export default function Home() {
  return (
    <main className="bg-ink text-letter">
      {/* ---------- first viewport: the signboard and the real place ---------- */}
      <section className="grid min-h-dvh lg:grid-cols-[46fr_54fr]">
        <div className="pinstripe grain relative flex flex-col bg-chrome px-6 pb-10 pt-6 text-ink [--stripe:var(--color-ink)] sm:px-12 lg:px-14">
          <nav className="relative z-10 flex items-center justify-between gap-4 pt-2">
            <Link href="/" className="painted text-[26px]">
              SwachhGrid
            </Link>
            <div className="flex gap-5 text-[15px] font-bold max-sm:hidden">
              <Link href="/report" className="underline-offset-4 hover:underline">
                Resident
              </Link>
              <Link href="/worker" className="underline-offset-4 hover:underline">
                Crew
              </Link>
              <Link href="/command" className="underline-offset-4 hover:underline">
                Command centre
              </Link>
            </div>
          </nav>

          <div className="relative z-10 my-auto py-7 lg:py-12">
            <h1 className="painted text-balance text-[clamp(2.7rem,7.2vw,6rem)] text-ink">येथे कचरा टाकू नये.</h1>
            <p className="sign mt-5 max-w-[15ch] text-[clamp(2.4rem,4.6vw,4rem)] text-vermilion-deep">Or report it. The city answers in paint.</p>
            <p className="mt-6 max-w-[44ch] text-[18px] font-medium leading-relaxed">
              SwachhGrid routes every sanitation complaint in Nagpur&apos;s densest bastis to a crew with a deadline, ranks it by how many
              people live beside it, and closes it only with photo proof from the spot.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/report" className="btn-paint bg-ink text-chrome hover:bg-night">
                Report a problem <ArrowRight size={20} strokeWidth={2.5} />
              </Link>
              <Link href="/command" className="btn-paint border-[3px] border-ink text-ink hover:bg-ink/10">
                Open the command centre
              </Link>
            </div>
          </div>

          <p className="relative z-10 text-[14px] font-semibold">Pilot: Gandhibagh, Lakadganj and Ashi Nagar zones, Nagpur Municipal Corporation area</p>
        </div>

        <div className="relative h-[36vh] min-h-[250px] overflow-hidden max-lg:order-first lg:h-auto lg:min-h-[70vh]">
          <HeroMapClient />
          <div className="absolute right-5 top-5 sm:right-8 sm:top-8">
            <TallyClient />
          </div>
          <div className="absolute bottom-5 left-5 rounded-[4px] bg-ink px-3.5 py-2 text-[14px] font-bold text-letter max-sm:hidden sm:bottom-8 sm:left-8">
            Mominpura, Gandhibagh zone. Real roofs, live reports.
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-letter/75">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-letter ring-1 ring-letter/40" /> open
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-vermilion" /> past deadline
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded-full bg-letter" /> collection van (simulated)
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* ---------- the custody line: one report, three hands ---------- */}
      <section className="grain bg-board px-6 py-24 sm:px-12 lg:px-20">
        <h2 className="painted max-w-[18ch] text-balance text-[clamp(2.4rem,5vw,4.4rem)]">एक तक्रार, तीन हात.</h2>
        <p className="sign mt-3 text-[clamp(1.8rem,3vw,2.6rem)] text-chrome">One report, three hands, one proof.</p>

        <div className="relative mt-16 grid gap-14 lg:grid-cols-3 lg:gap-10">
          <span aria-hidden className="absolute left-0 right-0 top-[11px] hidden h-[4px] bg-chrome lg:block" />
          {[
            {
              who: "The resident reports",
              body: "Picks the problem from six painted signs, takes a photo, drops the pin. If a neighbour already reported it within 30 m, they add their voice instead of a duplicate.",
              demo: (
                <div className="flex items-center gap-3 rounded-[4px] bg-letter px-4 py-3 text-ink">
                  <span className="h-10 w-10 shrink-0 rounded-full bg-sign-blue" />
                  <span>
                    <span className="painted block text-[22px] leading-none">तुंबलेले गटार</span>
                    <span className="text-[14px] font-semibold">Mominpura · Zone 6 · +4 neighbours</span>
                  </span>
                </div>
              ),
            },
            {
              who: "The crew is assigned",
              body: "The pin decides the zone, the zone decides the supervisor. Jobs are ranked by estimated people within 100 m multiplied by days open, and escalate when the deadline passes.",
              demo: (
                <div className="flex items-baseline justify-between gap-3 rounded-[4px] bg-ink px-4 py-3">
                  <span className="text-[17px] font-bold">Overflowing bin, Mominpura</span>
                  <span className="sign tabular text-[26px] text-vermilion">14 d late</span>
                </div>
              ),
            },
            {
              who: "The city proves it",
              body: "A job closes only with an after-photo taken within 50 m of the report. The resident sees before and after, and can reopen it if the spot is still dirty.",
              demo: (
                <div className="grid h-[86px] place-items-center rounded-[4px] bg-letter">
                  <StampClient />
                </div>
              ),
            },
          ].map((s) => (
            <article key={s.who} className="relative lg:pt-10">
              <span aria-hidden className="absolute left-0 top-0 hidden h-[26px] w-[26px] rounded-full border-[4px] border-chrome bg-board lg:block" />
              <h3 className="sign text-[34px] text-letter">{s.who}</h3>
              <p className="mt-3 max-w-[40ch] text-[17px] leading-relaxed text-letter/85">{s.body}</p>
              <div className="mt-6 max-w-[380px]">{s.demo}</div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- ranked by people ---------- */}
      <section className="grain bg-night px-6 py-24 sm:px-12 lg:px-20">
        <div className="grid gap-14 lg:grid-cols-[5fr_7fr] lg:gap-20">
          <div>
            <h2 className="sign text-balance text-[clamp(2.8rem,5vw,4.6rem)] text-chrome">Ranked by people, not by who shouted first.</h2>
            <p className="mt-6 max-w-[46ch] text-[18px] leading-relaxed text-letter/85">
              We mapped <strong className="text-chrome">1,35,721 real buildings</strong> across the three pilot zones from open satellite
              footprints, so every open report knows roughly how many homes stand within 100 m. Nagpur has{" "}
              <strong className="text-chrome">426 slum settlements</strong>, 298 of them notified. The densest ones are where a pile left
              for a week does the most harm.
            </p>
            <Link href="/command" className="btn-paint mt-9 bg-chrome text-ink hover:bg-chrome-deep">
              See it on the 3D map <ArrowUpRight size={20} strokeWidth={2.5} />
            </Link>
          </div>
          <div>
            <p className="mb-4 text-[15px] font-bold text-letter/70">The top of the queue right now (demo data)</p>
            <TopQueueClient />
          </div>
        </div>
      </section>

      {/* ---------- directory board: pick a role ---------- */}
      <section aria-label="Open an app">
        {ROLES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className={`group grain grid items-center gap-x-8 gap-y-2 px-6 py-9 transition-[padding] duration-300 hover:pl-9 sm:grid-cols-[minmax(0,22rem)_1fr_auto] sm:px-12 lg:px-20 lg:hover:pl-24 ${r.paint}`}
          >
            <span className="flex items-center gap-4">
              <r.icon size={34} strokeWidth={2.25} />
              <span>
                <span className="painted block text-[34px] leading-none">{r.mr}</span>
                <span className="sign block text-[24px]">{r.en}</span>
              </span>
            </span>
            <span className="max-w-[56ch] text-[17px] font-medium leading-relaxed">{r.line}</span>
            <ArrowRight size={36} strokeWidth={2.5} className="transition-transform duration-300 group-hover:translate-x-2 max-sm:hidden" />
          </Link>
        ))}
      </section>

      <footer className="px-6 py-12 text-[14px] leading-relaxed text-letter/65 sm:px-12 lg:px-20">
        <p className="painted text-[24px] text-letter">SwachhGrid</p>
        <p className="mt-3 max-w-[90ch]">
          Demo build for the YCCE Hackathon. The 330 existing reports are seeded demo data and stay in your browser. Zone areas are
          approximate. People within 100 m is an estimate at 4.5 residents per building. Slum counts: 2024 press reports citing NMC.
        </p>
        <p className="mt-2 max-w-[90ch]">
          Buildings © Overture Maps Foundation (Google Open Buildings, Microsoft, OpenStreetMap). Imagery © Esri, Maxar, Earthstar
          Geographics. Roads and rivers © OpenStreetMap contributors. Rainfall: Open-Meteo.
        </p>
      </footer>
    </main>
  );
}
