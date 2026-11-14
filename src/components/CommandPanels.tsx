"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Megaphone, QrCode, Radio, ThumbsUp, Truck, UserCheck, Wrench, X } from "lucide-react";
import { DAY, HOUR, type Ticket, ZONES, type ZoneId, metres } from "@/lib/domain";
import type { FeedEvent, FeedKind } from "@/lib/store";
import { type Routes, TIME_LAPSE, VAN_SPEED_MS, type Van, vanDistance } from "@/lib/vans";
import { Stamp } from "./paint";

/* ---------------- Live activity feed ---------------- */

const KIND: Record<FeedKind, { icon: typeof Radio; tone: string; label: string }> = {
  reported: { icon: Radio, tone: "text-chrome", label: "New report" },
  metoo: { icon: ThumbsUp, tone: "text-letter", label: "Neighbour agrees" },
  assigned: { icon: UserCheck, tone: "text-letter", label: "Assigned" },
  started: { icon: Wrench, tone: "text-letter", label: "Work started" },
  cleared: { icon: CheckCircle2, tone: "text-leaf", label: "Cleared" },
  escalated: { icon: AlertTriangle, tone: "text-vermilion", label: "Escalated" },
  reopened: { icon: AlertTriangle, tone: "text-vermilion", label: "Reopened" },
  alert: { icon: Megaphone, tone: "text-chrome", label: "Health alert" },
  bin: { icon: QrCode, tone: "text-chrome", label: "Bin full (QR)" },
};

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export function ActivityFeed({
  feed,
  now,
  simulating,
  onSimulate,
  onPick,
}: {
  feed: FeedEvent[];
  now: number;
  simulating: boolean;
  onSimulate: () => void;
  onPick: (e: FeedEvent) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b-2 border-night-line px-4 pb-2 pt-3">
        <h2 className="sign text-[22px] text-chrome">Live activity</h2>
        <button
          onClick={onSimulate}
          aria-pressed={simulating}
          className={`sign flex items-center gap-2 rounded-[3px] px-3 pb-0.5 pt-1.5 text-[16px] transition-colors ${
            simulating ? "bg-vermilion text-letter" : "bg-chrome text-ink hover:bg-chrome-deep"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${simulating ? "animate-pulse bg-letter" : "bg-ink"}`} />
          {simulating ? "Stop live morning" : "Run a live morning"}
        </button>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {feed.length === 0 && (
          <li className="px-4 py-6 text-[14px] leading-relaxed text-letter/65">
            Every report, assignment, clean-up and alert lands here as it happens. File a report from the resident app in another tab,
            or press <strong className="text-chrome">Run a live morning</strong> to watch the city work for a few minutes.
          </li>
        )}
        {feed.map((e) => {
          const k = KIND[e.kind];
          const fresh = now - e.at < 4000;
          return (
            <li key={e.id}>
              <button
                onClick={() => onPick(e)}
                disabled={!e.ticketId && e.lat === undefined}
                className={`grid w-full grid-cols-[1.4rem_1fr] gap-x-2 border-b border-dashed border-night-line px-4 py-2.5 text-left hover:bg-night-line/70 ${
                  fresh ? "arrive" : ""
                }`}
              >
                <k.icon size={17} className={`mt-0.5 ${k.tone}`} />
                <span>
                  <span className="block text-[14px] font-semibold leading-snug">{e.text}</span>
                  <span className="text-[12px] text-letter/55">
                    {k.label} · {e.zone ? `${ZONES[e.zone as ZoneId]?.name ?? e.zone} · ` : ""}
                    {ago(now - e.at)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------- Collection van detail ---------------- */

export function VanPanel({
  van,
  index,
  routes,
  tickets,
  now,
  onClose,
  onPick,
}: {
  van: Van;
  index: number;
  routes: Routes;
  tickets: Ticket[];
  now: number;
  onClose: () => void;
  onPick: (t: Ticket) => void;
}) {
  const d = vanDistance(van, now, index);
  const lanes = routes.lanes.filter((l) => l[4] === van.id);
  const skipped = lanes.filter((l) => !l[5]);
  const confirmed = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.cat === "missed_collection" &&
          t.status !== "resolved" &&
          skipped.some((l) => metres(t.lat, t.lon, (l[1] + l[3]) / 2, (l[0] + l[2]) / 2) <= 60),
      ),
    [tickets, skipped],
  );
  const loopMin = van.lengthM / VAN_SPEED_MS / 60;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="sign flex items-center gap-2.5 text-[32px]">
            <Truck size={24} className="text-chrome" /> Van {van.id}
          </h2>
          <p className="text-[14px] text-letter/70">
            {van.name} · {ZONES[van.zone].name} zone
          </p>
        </div>
        <button onClick={onClose} className="rounded-[3px] p-1.5 text-letter/70 hover:bg-night-line" aria-label="Close van">
          <X size={18} />
        </button>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[13px] font-semibold text-letter/70">
          <span>Round progress</span>
          <span className="sign tabular text-[17px] text-letter">{Math.round((d / van.lengthM) * 100)}%</span>
        </div>
        <div className="h-[8px] overflow-hidden rounded-[2px] bg-night-line">
          <div className="h-full bg-chrome" style={{ width: `${(d / van.lengthM) * 100}%` }} />
        </div>
      </div>
      <dl className="grid grid-cols-3 divide-x-2 divide-night-line rounded-[3px] bg-night-deep text-center">
        <div className="px-1.5 py-2.5">
          <dd className="sign tabular text-[24px]">{(van.lengthM / 1000).toFixed(1)} km</dd>
          <dt className="text-[11px] text-letter/60">one round, ~{Math.round(loopMin)} min</dt>
        </div>
        <div className="px-1.5 py-2.5">
          <dd className="sign tabular text-[24px] text-letter">{lanes.length - skipped.length}</dd>
          <dt className="text-[11px] text-letter/60">lanes driven</dt>
        </div>
        <div className="px-1.5 py-2.5">
          <dd className="sign tabular text-[24px] text-vermilion">{skipped.length}</dd>
          <dt className="text-[11px] text-letter/60">lanes skipped</dt>
        </div>
      </dl>
      <div>
        <h3 className="sign text-[20px] text-chrome">Skipped lanes residents noticed</h3>
        <p className="mb-2 text-[13px] leading-snug text-letter/65">
          Open &ldquo;truck did not come&rdquo; reports within 60 m of a lane this van skipped. The route data confirms the complaint.
        </p>
        {confirmed.length === 0 ? (
          <p className="text-[13px] text-letter/55">None on this beat right now.</p>
        ) : (
          <ul className="space-y-1">
            {confirmed.slice(0, 6).map((t) => (
              <li key={t.id}>
                <button onClick={() => onPick(t)} className="flex w-full justify-between rounded-[3px] bg-night-deep px-3 py-2 text-left text-[14px] hover:bg-night-line">
                  <span className="font-semibold">{t.locality}</span>
                  <span className="sign tabular text-[16px] text-vermilion">{t.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[12px] leading-snug text-letter/50">
        Simulated van on real OpenStreetMap roads, shown at {TIME_LAPSE}× speed. With the vendor&apos;s GPS feed, the same view shows the real
        round.
      </p>
    </div>
  );
}

/* ---------------- Health alert broadcast ---------------- */

export function AlertPanel({
  zone,
  level,
  waterReports,
  households,
  onSend,
  onClose,
  sentAt,
}: {
  zone: ZoneId;
  level: string;
  waterReports: Ticket[];
  households: number;
  onSend: () => void;
  onClose: () => void;
  sentAt: number | null;
}) {
  const [channels, setChannels] = useState({ sms: true, whatsapp: true, van: true });
  const name = ZONES[zone].name;
  return (
    <div className="relative flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="sign flex items-center gap-2.5 text-[30px]">
            <Megaphone size={24} className="text-chrome" /> Health alert
          </h2>
          <p className="text-[14px] text-letter/70">
            {name} zone · breeding risk <span className={level === "High" ? "font-bold text-vermilion" : "font-bold text-chrome"}>{level}</span>
          </p>
        </div>
        <button onClick={onClose} className="rounded-[3px] p-1.5 text-letter/70 hover:bg-night-line" aria-label="Close alert">
          <X size={18} />
        </button>
      </div>
      <p className="text-[14px] leading-snug text-letter/75">
        {waterReports.length} stagnant-water and blocked-drain reports in this zone have been open for more than three days. Warn the
        households around them before the mosquitoes breed.
      </p>
      <dl className="grid grid-cols-2 divide-x-2 divide-night-line rounded-[3px] bg-night-deep text-center">
        <div className="px-2 py-2.5">
          <dd className="sign tabular text-[28px] text-chrome">~{households.toLocaleString("en-IN")}</dd>
          <dt className="text-[11px] text-letter/60">households within 300 m</dt>
        </div>
        <div className="px-2 py-2.5">
          <dd className="sign tabular text-[28px]">{waterReports.length}</dd>
          <dt className="text-[11px] text-letter/60">water spots to clear first</dt>
        </div>
      </dl>
      <figure className="rounded-[4px] bg-letter p-3.5 text-ink">
        <figcaption className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/60">Message preview</figcaption>
        <p className="painted text-[17px] leading-snug">
          सावधान! आपल्या भागात साचलेले पाणी आहे. डास वाढू शकतात. घरातील भांडी रिकामी करा, मच्छरदाणी वापरा. ताप आल्यास जवळच्या आरोग्य केंद्रात जा.
        </p>
        <p className="mt-2 text-[13px] leading-snug text-ink/75">
          Warning: stagnant water near you. Empty containers at home, use a mosquito net, and visit the nearest health centre if you have
          a fever. – NMC {name} zone
        </p>
      </figure>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-[13px] font-bold text-letter/70">Send through</legend>
        {(
          [
            ["sms", "SMS to registered numbers"],
            ["whatsapp", "WhatsApp to residents who reported"],
            ["van", "Announcement on the zone's collection vans"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2.5 text-[14px]">
            <input
              type="checkbox"
              checked={channels[k]}
              onChange={(e) => setChannels((c) => ({ ...c, [k]: e.target.checked }))}
              className="h-4 w-4 accent-[#f2b705]"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {sentAt ? (
        <div className="flex items-center justify-between gap-3 rounded-[4px] bg-letter p-3 text-ink">
          <span className="text-[14px] font-semibold">Alert sent. Watch it spread on the map.</span>
          <Stamp top="SENT" bottom="पाठवले" strike size="sm" />
        </div>
      ) : (
        <button
          onClick={onSend}
          disabled={!channels.sms && !channels.whatsapp && !channels.van}
          className="btn-paint bg-chrome text-[19px] text-ink hover:bg-chrome-deep"
        >
          <Megaphone size={18} /> Send alert
        </button>
      )}
      <p className="text-[12px] leading-snug text-letter/50">Demo: nothing is actually sent. Households estimated from real buildings.</p>
    </div>
  );
}

/* ---------------- 30-day timeline histogram ---------------- */

export function Timeline({
  tickets,
  now,
  windowH,
  offsetH,
  onPick,
}: {
  tickets: Ticket[];
  now: number;
  windowH: number;
  offsetH: number;
  onPick: (offsetH: number) => void;
}) {
  const days = Math.round(windowH / 24);
  const bins = useMemo(() => {
    const start = now - windowH * HOUR;
    const b = Array.from({ length: days }, () => ({ reported: 0, cleared: 0 }));
    for (const t of tickets) {
      const i = Math.floor((t.createdAt - start) / DAY);
      if (i >= 0 && i < days) b[i].reported++;
      if (t.resolvedAt !== undefined) {
        const j = Math.floor((t.resolvedAt - start) / DAY);
        if (j >= 0 && j < days) b[j].cleared++;
      }
    }
    return b;
  }, [tickets, now, windowH, days]);
  const max = Math.max(4, ...bins.map((b) => Math.max(b.reported, b.cleared)));
  const cursor = Math.min(days - 1, Math.floor(offsetH / 24));
  return (
    <div className="mb-1.5 flex h-[34px] items-end gap-[3px]" role="group" aria-label="Reports and clean-ups per day">
      {bins.map((b, i) => (
        <button
          key={i}
          onClick={() => onPick(Math.min(windowH, (i + 1) * 24))}
          title={`${b.reported} reported, ${b.cleared} cleared`}
          className={`group flex h-full flex-1 items-end gap-px rounded-[1px] ${i === cursor ? "bg-night-line" : "hover:bg-night-line/60"}`}
        >
          <span className="w-1/2 rounded-t-[1px] bg-chrome" style={{ height: `${(b.reported / max) * 100}%` }} />
          <span className="w-1/2 rounded-t-[1px] bg-leaf" style={{ height: `${(b.cleared / max) * 100}%` }} />
        </button>
      ))}
    </div>
  );
}
