'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpdateChecks } = require('../services/update-checks.cjs');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  let time = 0;
  let state = { status: 'idle' };
  const calls = [];
  const errors = [];
  const timers = [];
  const cleared = [];
  const checks = createUpdateChecks({
    updater: { checkForUpdates() { calls.push(time); return Promise.resolve('checked'); } },
    getState: () => state,
    onError: error => errors.push(error),
    now: () => time,
    setIntervalFn(callback, intervalMs) {
      const timer = { callback, intervalMs, unref() { this.unreferenced = true; } };
      timers.push(timer);
      return timer;
    },
    clearIntervalFn: timer => cleared.push(timer),
    ...overrides
  });
  return {
    checks, calls, errors, timers, cleared,
    advance: milliseconds => { time += milliseconds; },
    setState: status => { state = { status }; }
  };
}

test('startup checks immediately and starts one unreferenced five-minute interval', async () => {
  const f = fixture();
  assert.equal(await f.checks.check(), null);
  assert.equal(await f.checks.start(), 'checked');
  await f.checks.start();
  assert.deepEqual(f.calls, [0]);
  assert.equal(f.timers.length, 1);
  assert.equal(f.timers[0].intervalMs, 300000);
  assert.equal(f.timers[0].unreferenced, true);
});

test('focus checks have a one-minute cooldown and explicit checks bypass it', async () => {
  const f = fixture();
  await f.checks.start();
  f.advance(59999);
  await f.checks.check();
  assert.equal(f.calls.length, 1);
  f.advance(1);
  await f.checks.check();
  assert.deepEqual(f.calls, [0, 60000]);
  await f.checks.check({ force: true });
  assert.deepEqual(f.calls, [0, 60000, 60000]);
});

test('periodic callbacks check again and honor configurable intervals', async () => {
  const f = fixture({ intervalMs: 1000, focusCooldownMs: 500 });
  await f.checks.start();
  f.advance(1000);
  f.timers[0].callback();
  await f.checks.check({ force: true });
  assert.equal(f.timers[0].intervalMs, 1000);
  assert.deepEqual(f.calls, [0, 1000]);
});

test('startup, focus, explicit and periodic requests share an active check', async () => {
  const pending = deferred();
  let calls = 0;
  const f = fixture({ updater: { checkForUpdates() { calls++; return pending.promise; } } });
  const startup = f.checks.start();
  const focus = f.checks.check();
  const explicit = f.checks.check({ force: true });
  f.timers[0].callback();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(focus, startup);
  assert.equal(explicit, startup);
  pending.resolve('finished');
  assert.deepEqual(await Promise.all([startup, focus, explicit]), ['finished', 'finished', 'finished']);
  await f.checks.check({ force: true });
  assert.equal(calls, 2);
});

test('available, downloading and ready updates survive all automatic and explicit checks', async () => {
  for (const status of ['available', 'downloading', 'ready']) {
    const f = fixture();
    f.setState(status);
    await f.checks.start();
    f.advance(300000);
    f.timers[0].callback();
    await f.checks.check();
    await f.checks.check({ force: true });
    assert.deepEqual(f.calls, [], status);
    f.setState('current');
    await f.checks.check({ force: true });
    assert.equal(f.calls.length, 1, status);
  }
});

test('a failed check reports the error and later checks recover', async () => {
  const failure = new Error('network unavailable');
  let calls = 0;
  const f = fixture({
    updater: { checkForUpdates() { if (++calls === 1) return Promise.reject(failure); return Promise.resolve('recovered'); } }
  });
  assert.equal(await f.checks.start(), null);
  assert.deepEqual(f.errors, [failure]);
  assert.equal(await f.checks.check({ force: true }), 'recovered');
  assert.equal(calls, 2);
});

test('synchronous updater failures and failing error handlers never reject checks', async () => {
  for (const onError of [() => { throw new Error('report failed'); }, () => Promise.reject(new Error('report failed'))]) {
    const f = fixture({ updater: { checkForUpdates() { throw new Error('check failed'); } }, onError });
    assert.equal(await f.checks.start(), null);
    assert.equal(await f.checks.check({ force: true }), null);
  }
});

test('stop clears the interval and ignores focus, explicit and queued timer requests', async () => {
  const f = fixture();
  await f.checks.start();
  f.checks.stop();
  f.checks.stop();
  f.advance(300000);
  f.timers[0].callback();
  await f.checks.check();
  await f.checks.check({ force: true });
  assert.deepEqual(f.cleared, [f.timers[0]]);
  assert.deepEqual(f.calls, [0]);
});

test('stopping during an active check lets it settle without scheduling another check', async () => {
  const pending = deferred();
  let calls = 0;
  const f = fixture({ updater: { checkForUpdates() { calls++; return pending.promise; } } });
  const startup = f.checks.start();
  await Promise.resolve();
  f.checks.stop();
  f.timers[0].callback();
  pending.reject(new Error('late network failure'));
  await startup;
  await f.checks.check({ force: true });
  assert.equal(calls, 1);
  assert.equal(f.errors.length, 1);
});

test('browser-style numeric timers do not require unref', async () => {
  const f = fixture({ setIntervalFn: () => 0 });
  await f.checks.start();
  f.checks.stop();
  assert.deepEqual(f.cleared, [0]);
});
