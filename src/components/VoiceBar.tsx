"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard, Mic, Square, Volume2 } from "lucide-react";
import type { Category } from "@/lib/domain";
import { type Lang, T } from "@/lib/i18n";
import { matchCategory, speak, useSpeechInput } from "@/lib/voice";

/** A small "listen" button that reads any text aloud in the resident's language. */
export function SayButton({ text, lang, className = "" }: { text: string; lang: Lang; className?: string }) {
  const [ok] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);
  if (!ok) return null;
  return (
    <button
      onClick={() => speak(text, lang)}
      aria-label={T[lang].listen}
      title={T[lang].listen}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-[2.5px] border-ink bg-chrome text-ink active:bg-ink active:text-chrome ${className}`}
    >
      <Volume2 size={21} strokeWidth={2.4} />
    </button>
  );
}

/**
 * Speak the problem: "इथे गटार तुंबले आहे" → Blocked drain, with the words kept as the report's note.
 * Where the browser has no speech recognition, the same matcher runs on typed text.
 */
export function VoiceBar({ lang, onPick }: { lang: Lang; onPick: (c: Category, note: string) => void }) {
  const t = T[lang];
  const sp = useSpeechInput(lang);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [heard, setHeard] = useState<{ cat: Category | null; text: string } | null>(null);
  const wasListening = useRef(false);

  // when listening ends, match what was said
  useEffect(() => {
    if (wasListening.current && !sp.listening) {
      const text = sp.transcript.trim();
      setHeard(text ? { cat: matchCategory(text), text } : { cat: null, text: "" });
    }
    wasListening.current = sp.listening;
  }, [sp.listening, sp.transcript]);

  // a recognised problem moves on by itself after a beat, so the resident sees what was understood
  useEffect(() => {
    if (!heard?.cat) return;
    speak(`${t.heard} ${t.cat[heard.cat]}`, lang);
    const id = setTimeout(() => onPick(heard.cat as Category, heard.text), 1600);
    return () => clearTimeout(id);
  }, [heard, lang, onPick, t]);

  const submitTyped = () => {
    const text = typed.trim();
    if (text) setHeard({ cat: matchCategory(text), text });
  };

  return (
    <div className="mb-4 rounded-[6px] border-[3px] border-ink bg-letter p-3">
      <div className="flex items-center gap-3">
        {sp.supported && !typing ? (
          <button
            onClick={() => (sp.listening ? sp.stop() : (setHeard(null), sp.start()))}
            className={`flex h-16 flex-1 items-center justify-center gap-3 rounded-[5px] text-[22px] font-bold ${
              sp.listening ? "bg-vermilion text-letter" : "bg-ink text-chrome"
            }`}
            aria-pressed={sp.listening}
          >
            {sp.listening ? <Square size={22} fill="currentColor" /> : <Mic size={28} strokeWidth={2.4} />}
            <span className={lang === "en" ? "sign text-[26px]" : "painted"}>{sp.listening ? t.listening.split("…")[0] + "…" : t.speak}</span>
            {sp.listening && (
              <span className="flex h-7 items-end gap-[3px]" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="voice-bar w-[4px] rounded-full bg-letter" style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
            )}
          </button>
        ) : (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t.voiceHint}
              aria-label={t.typeIt}
              className="h-14 min-w-0 flex-1 rounded-[5px] border-[2.5px] border-ink bg-white px-3 text-[18px] font-semibold"
            />
            <button className="sign h-14 rounded-[5px] bg-ink px-4 text-[22px] text-chrome">OK</button>
          </form>
        )}
        <SayButton
          lang={lang}
          text={`${t.whatProblem} ${Object.values(t.cat).join(", ")}`}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[14px] font-semibold">
        <span className="min-w-0 truncate">
          {sp.listening
            ? sp.transcript || t.voiceHint
            : heard?.cat
              ? `${t.heard} ${t.cat[heard.cat]}`
              : heard
                ? t.notUnderstood
                : t.voiceHint}
        </span>
        {sp.supported && (
          <button onClick={() => setTyping((x) => !x)} className="flex shrink-0 items-center gap-1 underline underline-offset-2">
            {typing ? <Mic size={14} /> : <Keyboard size={14} />} {typing ? t.speak : t.typeIt}
          </button>
        )}
      </div>
      {heard?.text && (
        <p className={`mt-1.5 rounded-[3px] px-2 py-1 text-[14px] ${heard.cat ? "bg-board text-letter" : "bg-vermilion text-letter"}`}>“{heard.text}”</p>
      )}
    </div>
  );
}
