export function startCloudSyncLifecycle(
  synchronize: () => Promise<void>,
  onError: (error: unknown) => void,
) {
  let isRunning = false;
  let disposed = false;

  async function check() {
    if (disposed || isRunning || document.visibilityState === "hidden" || !navigator.onLine) return;
    isRunning = true;
    try {
      await synchronize();
    } catch (error) {
      if (!disposed) onError(error);
    } finally {
      isRunning = false;
    }
  }

  const trigger = () => { void check(); };
  trigger();
  const timer = window.setInterval(trigger, 30000);
  window.addEventListener("focus", trigger);
  window.addEventListener("online", trigger);
  document.addEventListener("visibilitychange", trigger);

  return () => {
    disposed = true;
    window.clearInterval(timer);
    window.removeEventListener("focus", trigger);
    window.removeEventListener("online", trigger);
    document.removeEventListener("visibilitychange", trigger);
  };
}
