export function bindPageLifecycleCleanup({ cleanup, target = window }) {
  let hasCleanedUp = false;

  function runCleanup() {
    if (hasCleanedUp) {
      return;
    }

    hasCleanedUp = true;
    cleanup();
  }

  target.addEventListener("pagehide", runCleanup);
  target.addEventListener("beforeunload", runCleanup);

  return function unbindPageLifecycleCleanup() {
    target.removeEventListener("pagehide", runCleanup);
    target.removeEventListener("beforeunload", runCleanup);
  };
}
