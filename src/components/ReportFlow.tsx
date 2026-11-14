"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, ArrowRight, Camera, Droplets, LocateFixed, type LucideIcon, PawPrint, ThumbsUp, Trash2, Truck, Waves } from "lucide-react";
import { type Category, CATEGORY_IDS, type Ticket, ZONES, fmtAge, inPilot } from "@/lib/domain";
import { type Lang, LANGS, T } from "@/lib/i18n";
import { fileToSmallDataUrl, getPosition } from "@/lib/photo";
import { findDuplicate, useStore, useTickets } from "@/lib/store";
import MiniMap from "./MiniMap";
import { VanEtaCard } from "./VanCards";
import { useClock, useRoutes } from "@/lib/vans";
import { CAT_PAINT, CustodyLine, Stamp } from "./paint";

const ICONS: Record<Category, LucideIcon> = {
  garbage_dump: Trash2,
  overflowing_bin: Archive,
  blocked_drain: Waves,
  stagnant_water: Droplets,
  missed_collection: Truck,
  dead_animal: PawPrint,
};
const DEFAULT_POS = { lat: 21.1561, lon: 79.0963 }; // Mominpura

type Step = "cat" | "photo" | "where" | "dup" | "done";

export default function ReportFlow() {
  const load = useStore((s) => s.load);
  const addTicket = useStore((s) => s.addTicket);
  const meToo = useStore((s) => s.meToo);
  const patch = useStore((s) => s.patch);
  const tickets = useTickets();

  const [lang, setLang] = useState<Lang>("mr");
  const [step, setStep] = useState<Step>("cat");
  const [cat, setCat] = useState<Category | null>(null);
  const [photo, setPhoto] = useState<string | undefined>();
  const [pos, setPos] = useState(DEFAULT_POS);
  const [outside, setOutside] = useState(false);
  const [dup, setDup] = useState<Ticket | null>(null);
  const [filedId, setFiledId] = useState<string | null>(null);
  const [view, setView] = useState<"report" | "mine">("report");
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const t = T[lang];

  useEffect(() => void load(), [load]);
  const routes = useRoutes();
  const tick = useClock(0.5);

  const openNearby = useMemo(() => tickets.filter((x) => x.status !== "resolved"), [tickets]);
  const mine = useMemo(() => tickets.filter((x) => x.source === "user").reverse(), [tickets]);
  const filed = tickets.find((x) => x.id === filedId) ?? null;

  async function locate() {
    const p = await getPosition();
    if (p && inPilot(p.lat, p.lon)) {
      setPos(p);
      setOutside(false);
    } else setOutside(true);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(await fileToSmallDataUrl(f));
  }

  function submit(force = false) {
    if (!cat) return;
    const d = force ? undefined : findDuplicate(tickets, pos.lat, pos.lon, cat);
    if (d) {
      setDup(d);
      setStep("dup");
      return;
    }
    setFiledId(addTicket({ lat: pos.lat, lon: pos.lon, cat, sev: 2, photo }).id);
    setStep("done");
  }

  function restart() {
    setCat(null);
    setPhoto(undefined);
    setDup(null);
    setFiledId(null);
    setStep("cat");
  }

  const stepNo = step === "cat" ? 1 : step === "photo" ? 2 : 3;
  const display = lang === "en" ? "sign" : "painted";

  return (
    <div className="grain mx-auto flex min-h-dvh w-full max-w-md flex-col bg-chrome text-ink [color-scheme:light]">
      <header className="sticky top-0 z-20 bg-chrome px-4 pb-0 pt-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="painted text-[22px]">
            SwachhGrid
          </Link>
          <div className="flex rounded-[4px] border-[2.5px] border-ink p-0.5" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLang(l.id)}
                aria-pressed={lang === l.id}
                className={`rounded-[2px] px-2.5 py-1 text-[14px] font-bold ${lang === l.id ? "bg-ink text-chrome" : ""}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <nav className="mt-3 grid grid-cols-2 text-[16px] font-bold">
          {(["report", "mine"] as const).map((v) => (
            <button
              key={v}
              onClick={() => {
                setNow(Date.now());
                setView(v);
              }}
              className={`border-b-[4px] pb-2 pt-1 ${view === v ? "border-ink" : "border-ink/15 text-ink/55"}`}
            >
              {v === "report" ? t.title : `${t.myReports} (${mine.length})`}
            </button>
          ))}
        </nav>
      </header>

      {view === "mine" ? (
        <main className="flex-1 space-y-4 p-4">
          {mine.length === 0 && (
            <div className="pt-14 text-center">
              <p className={`${display} text-[28px]`}>{t.noReports}</p>
              <button onClick={() => setView("report")} className="btn-paint mt-6 bg-ink text-chrome">
                {t.title}
              </button>
            </div>
          )}
          {mine.map((m) => (
            <article key={m.id} className="overflow-hidden rounded-[6px] bg-ink text-letter">
              {m.photo && (
                <div className={`grid ${m.afterPhoto ? "grid-cols-2 gap-0.5" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.photo} alt="" className="aspect-[4/3] w-full object-cover" />
                  {m.afterPhoto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.afterPhoto} alt="" className="aspect-[4/3] w-full object-cover" />
                  )}
                </div>
              )}
              <div className="relative p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className={`${display} text-[26px] leading-tight`}>{t.cat[m.cat]}</h3>
                    <p className="text-[14px] text-letter/70">
                      {m.id} · {m.locality} · {fmtAge((now - m.createdAt) / 3600_000)}
                    </p>
                  </div>
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: CAT_PAINT[m.cat] }} />
                </div>
                <div className="mt-4">
                  <CustodyLine t={m} labels={t.steps} />
                </div>
                {m.status === "resolved" && (
                  <>
                    <div className="absolute bottom-16 right-4">
                      <Stamp top="साफ" bottom="CLEARED · photo proof" />
                    </div>
                    <button
                      onClick={() => patch(m.id, { status: "assigned", resolvedAt: undefined, afterPhoto: undefined, reopened: true })}
                      className="btn-paint mt-4 w-full border-[2.5px] border-vermilion text-vermilion"
                    >
                      {t.notCleaned}
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </main>
      ) : (
        <main className="flex flex-1 flex-col">
          {(step === "cat" || step === "photo" || step === "where") && (
            <div className="flex items-center gap-3 px-4 pt-4">
              {step !== "cat" && (
                <button
                  onClick={() => setStep(step === "where" ? "photo" : "cat")}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-chrome"
                  aria-label={t.back}
                >
                  <ArrowLeft size={22} strokeWidth={2.5} />
                </button>
              )}
              <div className="flex flex-1 gap-1.5" aria-label={`${stepNo} / 3`}>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={`h-[7px] flex-1 rounded-[2px] ${n <= stepNo ? "bg-ink" : "bg-ink/15"}`} />
                ))}
              </div>
            </div>
          )}

          {step === "cat" && (
            <section className="p-4">
              <h1 className={`${display} mb-5 text-[38px] leading-none`}>{t.whatProblem}</h1>
              {/* a painted directory board: one signboard row per problem */}
              <ul className="overflow-hidden rounded-[6px] bg-ink">
                {CATEGORY_IDS.map((c, i) => {
                  const Icon = ICONS[c];
                  return (
                    <li key={c} className={i ? "border-t-2 border-dashed border-letter/15" : ""}>
                      <button
                        onClick={() => {
                          setCat(c);
                          setStep("photo");
                        }}
                        className="flex min-h-[70px] w-full items-center gap-4 px-4 py-3 text-left text-letter transition-colors active:bg-night"
                      >
                        <span aria-hidden className="h-9 w-[6px] shrink-0 rounded-full" style={{ background: CAT_PAINT[c] }} />
                        <span className={`${display} flex-1 text-[26px] leading-[1.1]`}>{t.cat[c]}</span>
                        <Icon size={30} strokeWidth={2.2} className="shrink-0 text-chrome" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <VanEtaCard routes={routes} lat={pos.lat} lon={pos.lon} now={tick} tickets={tickets} lang={lang} />
            </section>
          )}

          {step === "photo" && cat && (
            <section className="flex flex-1 flex-col p-4">
              <h1 className={`${display} text-[38px] leading-none`}>{t.cat[cat]}</h1>
              <p className="mb-4 mt-2 text-[17px] font-semibold">{t.photoHint}</p>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[6px] border-[3px] border-dashed border-ink bg-ink/5"
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-3">
                    <span className="grid h-20 w-20 place-items-center rounded-full bg-ink text-chrome">
                      <Camera size={40} strokeWidth={2.2} />
                    </span>
                    <span className={`${display} text-[26px]`}>{t.takePhoto}</span>
                  </span>
                )}
              </button>
              {photo && (
                <button onClick={() => fileRef.current?.click()} className="mt-3 text-[16px] font-bold underline underline-offset-4">
                  {t.retake}
                </button>
              )}
              <div className="mt-auto pt-5">
                <BigButton
                  onClick={() => {
                    setStep("where");
                    void locate();
                  }}
                >
                  {t.next} <ArrowRight size={24} strokeWidth={2.5} />
                </BigButton>
              </div>
            </section>
          )}

          {step === "where" && cat && (
            <section className="flex flex-1 flex-col">
              <div className="px-4 pb-3 pt-4">
                <h1 className={`${display} text-[34px] leading-none`}>{t.where}</h1>
                <p className={`mt-2 text-[16px] font-semibold ${outside ? "text-vermilion-deep" : ""}`}>{outside ? t.outside : t.moveMap}</p>
              </div>
              <div className="relative mx-4 min-h-[330px] flex-1 overflow-hidden rounded-[6px] border-[3px] border-ink">
                <MiniMap center={pos} tickets={openNearby} onCenter={setPos} />
                <button
                  onClick={() => void locate()}
                  className="absolute right-3 top-3 flex items-center gap-2 rounded-[4px] bg-ink px-3.5 py-2.5 text-[15px] font-bold text-chrome shadow-[0_6px_16px_rgb(0_0_0/0.35)]"
                >
                  <LocateFixed size={18} /> {t.useGps}
                </button>
              </div>
              <div className="p-4">
                <BigButton onClick={() => submit()}>{t.send}</BigButton>
              </div>
            </section>
          )}

          {step === "dup" && dup && cat && (
            <section className="flex flex-1 flex-col p-4">
              <h1 className={`${display} text-[34px] leading-tight`}>{t.dupTitle}</h1>
              <p className="mb-5 mt-2 text-[17px] font-semibold">{t.dupBody}</p>
              <div className="rounded-[6px] bg-ink p-4 text-letter">
                <div className={`${display} text-[26px]`}>{t.cat[dup.cat]}</div>
                <div className="text-[15px] text-letter/70">
                  {dup.id} · {dup.locality} · {fmtAge((now - dup.createdAt) / 3600_000)}
                </div>
                <div className="sign mt-3 text-[26px] text-chrome">+{dup.meToo} neighbours</div>
              </div>
              <div className="mt-auto space-y-3 pt-5">
                <BigButton
                  onClick={() => {
                    meToo(dup.id);
                    setFiledId(dup.id);
                    setStep("done");
                  }}
                >
                  <ThumbsUp size={24} strokeWidth={2.5} /> {t.meToo}
                </BigButton>
                <button onClick={() => submit(true)} className="w-full py-2 text-[15px] font-bold underline underline-offset-4">
                  {t.newAnyway}
                </button>
              </div>
            </section>
          )}

          {step === "done" && filed && (
            <section className="flex flex-1 flex-col p-4">
              <h1 className={`${display} mt-4 text-[40px] leading-none`}>{t.sent}</h1>
              <p className="mt-2 text-[17px] font-semibold">{t.sentBody}</p>
              <div className="mt-6 rounded-[6px] bg-ink p-5 text-letter">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`${display} text-[28px] leading-tight`}>{t.cat[filed.cat]}</span>
                  <span className="sign tabular text-[24px] text-chrome">{filed.id}</span>
                </div>
                <p className="text-[15px] text-letter/70">
                  {filed.locality} · {ZONES[filed.zone].name}, Zone {ZONES[filed.zone].no}
                </p>
                <div className="mt-5">
                  <CustodyLine t={filed} labels={t.steps} />
                </div>
              </div>
              <div className="mt-auto space-y-3 pt-6">
                <BigButton onClick={restart}>{t.reportAnother}</BigButton>
                <button
                  onClick={() => {
                    setNow(Date.now());
                    setView("mine");
                  }}
                  className="w-full py-2 text-[15px] font-bold underline underline-offset-4"
                >
                  {t.myReports}
                </button>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}

function BigButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="btn-paint w-full bg-ink py-[0.85em] text-[1.6rem] text-chrome active:bg-night">
      {children}
    </button>
  );
}
