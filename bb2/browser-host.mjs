/* BB2 Stage (ii) — dormant browser boundary for the local writer.
 * Importing this module performs no I/O and registers no app handler.
 * The host must prove authenticated/local ownership and an enabled writer on
 * every write. Unsupported or contended Web Locks never fall back to a lease.
 */

export const BB2_BROWSER_LOCK_PROTOCOL = 'bvom-bb2-writer-v1:';
const PREFIX = 'bvom.bb2.local.v1.';

const fail = reason => { throw Error('BB2 browser: ' + reason); };

export function createBB2BrowserHost({
  runtime, ownerId, getAuthenticatedOwnerId, getLocalOwnerId, canWrite
} = {}) {
  if (typeof ownerId !== 'string' || !ownerId.trim() || ownerId.includes('|')) {
    fail('invalid owner identity');
  }
  if (!runtime?.localStorage ||
      typeof runtime.localStorage.getItem !== 'function' ||
      typeof runtime.localStorage.setItem !== 'function' ||
      typeof getAuthenticatedOwnerId !== 'function' ||
      typeof getLocalOwnerId !== 'function' ||
      typeof canWrite !== 'function') {
    fail('explicit browser storage, identity and writer guards are required');
  }

  const key = PREFIX + encodeURIComponent(ownerId);
  const lockName = BB2_BROWSER_LOCK_PROTOCOL + key;
  let holdingLock = false;

  function assertKey(candidate) {
    if (candidate !== key) fail('foreign or legacy storage key');
  }
  function assertOwner() {
    if (getAuthenticatedOwnerId() !== ownerId || getLocalOwnerId() !== ownerId) {
      fail('signed-in or local owner changed');
    }
  }
  function assertWriter() {
    assertOwner();
    if (canWrite() !== true) fail('BB2 writer disabled or client not trusted');
  }

  const storage = Object.freeze({
    getItem(candidate) {
      assertKey(candidate);
      assertOwner();
      return runtime.localStorage.getItem(candidate);
    },
    setItem(candidate, value) {
      assertKey(candidate);
      assertWriter();
      if (!holdingLock) fail('write without exclusive Web Lock');
      return runtime.localStorage.setItem(candidate, value);
    }
  });

  async function withExclusiveLock(candidate, criticalSection) {
    assertKey(candidate);
    if (typeof criticalSection !== 'function') fail('invalid critical section');
    assertWriter();
    const request = runtime.navigator?.locks?.request;
    if (typeof request !== 'function') fail('Web Locks unavailable; read-only');
    // An immediate refusal is safer than waiting with a stale setup/revision.
    return runtime.navigator.locks.request(lockName,
      { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) fail('another BB2 tab owns the writer');
        if (holdingLock) fail('re-entrant BB2 writer');
        assertWriter();
        holdingLock = true;
        try {
          return await criticalSection();
        } finally {
          holdingLock = false;
        }
      });
  }

  return Object.freeze({ key, lockName, storage, withExclusiveLock });
}
