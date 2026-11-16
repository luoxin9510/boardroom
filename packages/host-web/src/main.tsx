import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Shell } from "./Shell";
import { deviceLocale } from "./host";

/**
 * Registers the service worker (production builds only) and tells the shell once the app is cached for offline use.
 * The app is cache-first, so a new version downloads in the background while the old one keeps running; when it
 * has taken over, a banner offers to reload into it (games are saved after every move, so nothing is lost).
 */
function Root() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    // With no controller yet, the first takeover is the first install (clients.claim), not an update; any later one is.
    let had = !!sw.controller;
    const onChange = () => {
      if (had) setUpdated(true);
      had = true;
    };
    sw.addEventListener("controllerchange", onChange);
    let reg: ServiceWorkerRegistration | undefined;
    sw.register("./sw.js")
      .then((r) => (reg = r))
      .then(() => sw.ready)
      .then(() => setOfflineReady(true))
      .catch(() => {});
    // A home-screen app is usually resumed, not reloaded: look for a new version each time it comes back.
    const onVisible = () => document.visibilityState === "visible" && void reg?.update().catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    // Ask the browser not to evict our data under storage pressure (granted automatically for home-screen apps on iOS).
    void navigator.storage?.persist?.();
    return () => {
      sw.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const zh = deviceLocale().toLowerCase().startsWith("zh");
  return (
    <>
      <Shell offlineReady={offlineReady} />
      {updated && (
        <div className="app-update">
          <button className="app-update-go" onClick={() => location.reload()} data-testid="app-update">
            {zh ? "新版本已下载，点这里更新" : "A new version is ready, tap to update"}
          </button>
          <button className="app-update-x" onClick={() => setUpdated(false)} aria-label={zh ? "稍后" : "Later"} data-testid="app-update-later">
            ✕
          </button>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(<Root />);
