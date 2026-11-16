import { createContext, useContext, type ReactNode } from "react";

/**
 * Optional decoration from the content pack's 界面/ folder (spec §3). Fixed file names, any of .jpg/.png/.webp:
 *   封面  the campaign list's cover          背景  a faint background behind every screen
 *   角色 行动 誓言 先知 日志  a banner at the top of each tab
 *   类别-adventure … 类别-fate  a banner at the top of a move's sheet, by move category
 *   建角-truths … 建角-inciting  a banner for each step of the character wizard
 * Anything missing is simply not shown, so the game looks the same without it.
 */
export const ART_FOLDER = "界面";
export type Art = (name: string) => string | null;

const Ctx = createContext<Art>(() => null);

export function ArtProvider(props: { art: Art; children: ReactNode }) {
  return <Ctx.Provider value={props.art}>{props.children}</Ctx.Provider>;
}

export const useArt = () => useContext(Ctx);

/** Looks an image up by its name without extension. */
export function artFrom(imageUrl: (path: string) => string | null): Art {
  return (name) => {
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      const url = imageUrl(`${ART_FOLDER}/${name}.${ext}`);
      if (url) return url;
    }
    return null;
  };
}

/** A wide picture that fades into the page, with an optional title over it. Renders nothing when the pack has no such image. */
export function Banner(props: { name: string; title?: ReactNode; tall?: boolean; testid?: string }) {
  const url = useArt()(props.name);
  if (!url) return null;
  return (
    <div className={`iw-banner${props.tall ? " is-tall" : ""}`} data-testid={props.testid ?? `banner-${props.name}`}>
      <img src={url} alt="" />
      {props.title && <div className="iw-banner-title">{props.title}</div>}
    </div>
  );
}
