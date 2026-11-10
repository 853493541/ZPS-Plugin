'use strict';

function createUpdateChecks({
  updater,
  getState,
  onError,
  intervalMs = 300000,
  focusCooldownMs = 60000,
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
}) {
  const protectedStatuses = new Set(['available', 'downloading', 'ready']);
  let running = false;
  let timer = null;
  let inFlight = null;
  let lastCheckAt = -Infinity;

  function check({ force = false } = {}) {
    if (!running) return Promise.resolve(null);
    if (inFlight) return inFlight;
    if (protectedStatuses.has(getState().status)) return Promise.resolve(null);
    const timestamp = now();
    if (!force && timestamp - lastCheckAt < focusCooldownMs) return Promise.resolve(null);
    lastCheckAt = timestamp;
    inFlight = Promise.resolve()
      .then(() => updater.checkForUpdates())
      .catch(error => {
        try {
          Promise.resolve(onError(error)).catch(() => {});
        } catch {}
        return null;
      })
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  function start() {
    if (running) return inFlight || Promise.resolve(null);
    running = true;
    timer = setIntervalFn(() => { void check({ force: true }); }, intervalMs);
    timer?.unref?.();
    return check({ force: true });
  }

  function stop() {
    running = false;
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
  }

  return { start, check, stop };
}

module.exports = { createUpdateChecks };
