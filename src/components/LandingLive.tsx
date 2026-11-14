"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, ZONES, ageHours, fmtAge, isOpenAt, isOverdue, peopleExposed, priority } from "@/lib/domain";
import { useStore, useTickets } from "@/lib/store";

const HERO = { lon: 79.0985, lat: 21.1575 }; // Mominpura / Gandhibagh
const Z = 16;
const TILE = 256;
const WORLD = TILE * 2 ** Z;

function project(lon: number, lat: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * WORLD, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD };
}

/**
 * Duotone (paint black to chrome yellow) satellite of Mominpura with live open reports as paint dots.
 * Plain image tiles rather than a WebGL map: loads fast, no GPU, and the SVG filter applies reliably.
 */
export function HeroMap() {
  const load = useStore((s) => s.load);
  const tickets = useTickets();
  const el = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!el.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el.current);
    return () => ro.disconnect();
  }, []);

  const c = project(HERO.lon, HERO.lat);
  const ox = c.x - size.w / 2;
  const oy = c.y - size.h / 2;

  const tiles = useMemo(() => {
    if (!size.w) return [];
    const out: { x: number; y: number; left: number; top: number }[] = [];
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + size.w) / TILE); tx++)
      for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + size.h) / TILE); ty++)
        out.push({ x: tx, y: ty, left: tx * TILE - ox, top: ty * TILE - oy });
    return out;
  }, [ox, oy, size.w, size.h]);

  const dots = useMemo(
    () =>
      tickets
        .filter((t) => isOpenAt(t, now) || (t.source === "user" && t.status !== "resolved"))
        .map((t) => {
          const p = project(t.lon, t.lat);
          return { t, x: p.x - ox, y: p.y - oy };
        })
        .filter((d) => d.x > -20 && d.y > -20 && d.x < size.w + 20 && d.y < size.h + 20),
    [tickets, now, ox, oy, size.w, size.h],
  );

  return (
    <div ref={el} className="absolute inset-0 overflow-hidden bg-[#6b5a1c]">
      <svg aria-hidden width="0" height="0" className="absolute">
        <filter id="paint-duotone" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.086 0.87" />
            <feFuncG type="table" tableValues="0.075 0.6" />
            <feFuncB type="table" tableValues="0.059 0.0" />
          </feComponentTransfer>
        </filter>
      </svg>
      <div aria-hidden className="absolute inset-0 [filter:url(#paint-duotone)_contrast(1.15)]">
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${t.x}-${t.y}`}
            src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${t.y}/${t.x}`}
            alt=""
            width={TILE}
            height={TILE}
            className="absolute max-w-none select-none"
            style={{ left: t.left, top: t.top }}
            draggable={false}
          />
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {dots.map(({ t, x, y }) => (
          <span
            key={t.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-ink"
            style={{
              left: x,
              top: y,
              width: 12 + t.sev * 4,
              height: 12 + t.sev * 4,
              background: isOverdue(t, now) ? "#d7372b" : "#f4f1e8",
            }}
          />
        ))}
      </div>
      <p className="absolute bottom-1 right-2 text-[10px] font-semibold text-letter/80">Imagery © Esri, Maxar, Earthstar Geographics</p>
    </div>
  );
}

/** The hanging tally board: live counts painted on a night board. */
export function Tally() {
  const load = useStore((s) => s.load);
  const tickets = useTickets();
  const loaded = useStore((s) => s.loaded);
  const [now] = useState(() => Date.now());
  useEffect(() => void load(), [load]);
  const open = tickets.filter(
    (t) => isOpenAt(t, now) || (t.source === "user" && t.status !== "resolved"),
  );
  const late = open.filter((t) => isOverdue(t, now)).length;
  return (
    <div className="pinstripe grain w-[min(300px,80vw)] rounded-[6px] bg-night px-5 pb-4 pt-4 text-letter shadow-[0_18px_40px_rgb(0_0_0/0.45)] [--stripe:var(--color-chrome)] [--stripe-opacity:.55] sm:px-6 sm:pb-5 sm:pt-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="sign tabular text-[48px] font-semibold text-chrome sm:text-[72px]">
            {loaded ? open.length : "–"}
          </div>
          <div className="sign text-[19px]">open reports</div>
        </div>
        <div className="text-right">
          <div className="sign tabular text-[48px] font-semibold text-vermilion sm:text-[72px]">
            {loaded ? late : "–"}
          </div>
          <div className="sign text-[19px]">past deadline</div>
        </div>
      </div>
      <p className="mt-2 text-[12px] font-semibold text-letter/70">Demo data, three pilot zones</p>
    </div>
  );
}

/** The real top of the priority queue, computed from the demo data. */
export function TopQueue() {
  const load = useStore((s) => s.load);
  const density = useStore((s) => s.density);
  const tickets = useTickets();
  const [now] = useState(() => Date.now());
  useEffect(() => void load(), [load]);
  const top = useMemo(
    () =>
      tickets
        .filter((t) => isOpenAt(t, now))
        .map((t) => {
          const exposed = peopleExposed(density, t);
          return { t, exposed, score: priority(t, exposed, now) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
    [tickets, density, now],
  );
  if (!density) return <div className="h-[340px]" />;
  return (
    <ol className="divide-y-2 divide-dashed divide-letter/15 border-y-2 border-letter/80">
      {top.map(({ t, exposed }, i) => (
        <li
          key={t.id}
          className="grid grid-cols-[2.2rem_1fr_auto] items-baseline gap-x-4 py-3.5 sm:grid-cols-[2.6rem_1fr_9rem_7rem]"
        >
          <span className="sign tabular text-[34px] text-chrome">{i + 1}</span>
          <span className="min-w-0">
            <span className="block truncate text-[19px] font-bold leading-tight">
              {CATEGORIES[t.cat].label}
            </span>
            <span className="block truncate text-[15px] opacity-70">
              {t.locality} · {ZONES[t.zone].name} zone
            </span>
          </span>
          <span className="sign tabular text-right text-[28px] text-chrome max-sm:col-start-3">
            ~{exposed.toLocaleString("en-IN")}
            <span className="ml-1 font-sans text-[13px] normal-case tracking-normal text-letter/70">
              people
            </span>
          </span>
          <span
            className={`sign tabular text-right text-[24px] max-sm:hidden ${isOverdue(t, now) ? "text-vermilion" : ""}`}
          >
            {fmtAge(ageHours(t, now))} open
          </span>
        </li>
      ))}
    </ol>
  );
}
