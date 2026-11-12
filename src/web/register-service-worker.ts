/**
 * Registers the service worker once, at startup (plan J1.14). Without a scope option, the scope
 * is the script's directory: `/` for /sw.js, the whole site (W3C Service Workers). Where the
 * browser has no service workers (an http: page, an old browser), nothing happens; a refused
 * registration only leaves the page without notifications.
 */
export const registerServiceWorker = async (
  container: { register(url: string): Promise<unknown> } | undefined,
  url: string,
): Promise<void> => {
  try {
    await container?.register(url);
  } catch (error) {
    console.warn("Service worker not registered", error);
  }
};
