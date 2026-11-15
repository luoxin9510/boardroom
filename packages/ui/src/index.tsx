import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { translator, type Lang, type Messages, type T } from "@boardroom/core";
import "./ui.css";

// ───────────── language ─────────────

interface LangCtx {
  lang: Lang;
  t: T;
  setLang: (l: Lang) => void;
}
const Ctx = createContext<LangCtx | null>(null);

/** Provides `t` for the current language; switching re-renders everything without touching game state. */
export function LangProvider(props: { tables: Record<Lang, Messages>; lang: Lang; onChange: (l: Lang) => void; children: ReactNode }) {
  const t = translator(props.tables, props.lang);
  return <Ctx.Provider value={{ lang: props.lang, t, setLang: props.onChange }}>{props.children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLang outside LangProvider");
  return c;
}

// ───────────── bottom sheet ─────────────

/** A panel that slides up from the bottom, within thumb reach. Tapping the backdrop closes it (if allowed). */
export function Sheet(props: { title?: ReactNode; onClose?: () => void; children: ReactNode; tall?: boolean }) {
  return (
    <div className="br-sheet-backdrop" onClick={props.onClose} data-testid="sheet">
      <div className={`br-sheet${props.tall ? " is-tall" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="br-sheet-grip" />
        {props.title && <div className="br-sheet-title">{props.title}</div>}
        <div className="br-sheet-body">{props.children}</div>
      </div>
    </div>
  );
}

// ───────────── toasts ─────────────

export interface Toast {
  id: number;
  text: string;
  tone?: "info" | "bad" | "good";
}

/** Short messages near the top; each fades after a few seconds. */
export function useToasts(): { toasts: Toast[]; push: (text: string, tone?: Toast["tone"]) => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((text: string, tone?: Toast["tone"]) => {
    const id = next.current++;
    setToasts((ts) => [...ts.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3200);
  }, []);
  return { toasts, push };
}

export function Toasts(props: { toasts: Toast[] }) {
  return (
    <div className="br-toasts" aria-live="polite">
      {props.toasts.map((t) => (
        <div key={t.id} className={`br-toast is-${t.tone ?? "info"}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ───────────── small controls ─────────────

export function Stepper(props: { value: number; min: number; max: number; onChange: (v: number) => void; label: ReactNode }) {
  return (
    <div className="br-stepper">
      <span className="br-stepper-label">{props.label}</span>
      <button className="br-btn" disabled={props.value <= props.min} onClick={() => props.onChange(props.value - 1)} aria-label="−">
        −
      </button>
      <span className="br-stepper-value">{props.value}</span>
      <button className="br-btn" disabled={props.value >= props.max} onClick={() => props.onChange(props.value + 1)} aria-label="+">
        +
      </button>
    </div>
  );
}

/** Keeps the screen awake while mounted, where the browser allows it; re-acquires when the page comes back. */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release(): Promise<void> } | null = null;
    let alive = true;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible") lock = await (navigator as unknown as { wakeLock: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock.request("screen");
      } catch {
        /* not allowed right now; try again on the next visibility change */
      }
      if (!alive && lock) void lock.release();
    };
    void acquire();
    const onVis = () => void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      if (lock) void lock.release();
    };
  }, [enabled]);
}
