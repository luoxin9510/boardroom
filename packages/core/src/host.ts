/**
 * What a game needs from the place it runs in (the PWA). Content paths are relative to the root of
 * the game's content pack, which mirrors the author's vault: 卡牌/…, 规则/…
 */
export interface Host {
  /** Every markdown note under `folder` (recursively), with its text. */
  readNotes(folder: string): Promise<{ path: string; text: string }[]>;
  /** A URL the page can show for an image in the vault, or null if the file is missing. */
  imageUrl(path: string): string | null;
  /** A file's text, or null if it does not exist. */
  readFile(path: string): Promise<string | null>;
  /** Creates or replaces a file, creating folders as needed. */
  writeFile(path: string, text: string): Promise<void>;
  /** Paths of the files directly in `folder` (not recursive). */
  listFiles(folder: string): Promise<string[]>;
  /** Small per-device settings, such as the chosen language. */
  getSetting<V>(key: string): V | undefined;
  setSetting(key: string, value: unknown): Promise<void>;
  /** The device's language, e.g. navigator.language. */
  locale(): string;
  /** Called when content notes change; returns an unsubscribe function. */
  onContentChange(cb: () => void): () => void;
  /** Leaves the game screen (back to the library). Optional. */
  exit?(): void;
  /** Hands a text file to the user: the share sheet on phones, a download elsewhere. */
  share(name: string, text: string, type: string): Promise<void>;
}
