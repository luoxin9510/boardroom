import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RichText, useLang } from "@boardroom/ui";
import { TUTORIAL, type CoachView } from "../tutorial";

/**
 * The tutorial overlay: a ring around the thing to look at and a bubble with the step's text.
 * It never blocks the board; steps that ask for an action move on when the player does it.
 */
export function Coach(props: { view: CoachView; step: number; onStep: (n: number) => void; onEnd: () => void; onTopic: (t: string) => void }) {
  const { t } = useLang();
  const step = TUTORIAL[props.step];
  const atStart = useRef<CoachView>(props.view);
  const [box, setBox] = useState<DOMRect | null>(null);

  // Remember the game as it was when this step began.
  useEffect(() => {
    atStart.current = props.view;
  }, [props.step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Steps that wait for the player: check after every change.
  useEffect(() => {
    if (step?.until?.(props.view, atStart.current)) props.onStep(props.step + 1);
  }, [props.view, step, props.step, props.onStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the highlighted element (it may scroll or appear a moment later).
  useLayoutEffect(() => {
    if (!step?.target) return setBox(null);
    // A few times a second is enough to follow scrolling and sheets opening, and cheap on a phone.
    const measure = () => {
      const el = document.querySelector(step.target as string);
      const r = el?.getBoundingClientRect() ?? null;
      setBox((b) => (r && b && r.x === b.x && r.y === b.y && r.width === b.width && r.height === b.height ? b : r));
    };
    measure();
    const timer = setInterval(measure, 150);
    return () => clearInterval(timer);
  }, [step]);

  if (!step) return null;
  const last = props.step === TUTORIAL.length - 1;
  const below = !box || box.top + box.height / 2 < window.innerHeight / 2;
  return (
    <div className="gm-coach" data-testid="coach">
      {box && <div className="gm-coach-ring" style={{ left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12 }} />}
      <div
        className={`gm-coach-bubble${box ? "" : " is-center"}`}
        style={box ? (below ? { top: Math.min(box.bottom + 14, window.innerHeight - 200) } : { bottom: Math.min(window.innerHeight - box.top + 14, window.innerHeight - 200) }) : undefined}
        data-testid={`coach-${step.id}`}
      >
        <div className="gm-coach-count">
          {t("tut.count", { n: props.step + 1, total: TUTORIAL.length })}
        </div>
        <div className="gm-coach-text">
          <RichText text={t(`tut.${step.id}`)} onTopic={props.onTopic} />
        </div>
        <div className="gm-coach-buttons">
          <button className="br-btn is-quiet" onClick={props.onEnd} data-testid="coach-skip">
            {last ? t("tut.close") : t("tut.skip")}
          </button>
          {!step.until && (
            <button className="br-btn is-primary" onClick={() => (last ? props.onEnd() : props.onStep(props.step + 1))} data-testid="coach-next">
              {last ? t("tut.finish") : t("tut.next")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
