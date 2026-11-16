import { createRoot } from "react-dom/client";
import type { Host } from "@boardroom/core";
import { App } from "./App";

/** Renders the game into `el`; returns a function that unmounts it. */
export function mount(el: HTMLElement, host: Host): () => void {
  const root = createRoot(el);
  root.render(<App host={host} />);
  return () => root.unmount();
}

export { App };
