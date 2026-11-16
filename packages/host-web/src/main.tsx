import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Shell } from "./Shell";

/** Registers the service worker (production builds only) and tells the shell once the app is cached for offline use. */
function Root() {
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => setOfflineReady(true))
      .catch(() => {});
    // Ask the browser not to evict our data under storage pressure (granted automatically for home-screen apps on iOS).
    void navigator.storage?.persist?.();
  }, []);
  return <Shell offlineReady={offlineReady} />;
}

createRoot(document.getElementById("app") as HTMLElement).render(<Root />);
