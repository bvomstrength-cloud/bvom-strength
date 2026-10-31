/* BB2 Stage (ii) — dormant BVOM document/account adapter.
 * Its caller supplies a synchronous snapshot of existing BVOM app state.
 * No import-time work, cloud access, auth calls, UI, or app registration.
 */
import { createBB2BrowserHost } from './browser-host.mjs';

const denied = reason => ({ allowed: false, reason });

export function bb2AppWriteStatus(snapshot, ownerId) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return denied('no trustworthy app snapshot');
  }
  if (typeof ownerId !== 'string' || !ownerId.trim() ||
      snapshot.authUserId !== ownerId || snapshot.cloudUserId !== ownerId ||
      snapshot.localOwnerId !== ownerId) return denied('account ownership differs');
  if (snapshot.appVisible !== true || snapshot.entitlementAllowed !== true) {
    return denied('BVOM account access not open');
  }
  if (snapshot.documentLockOwned !== true || snapshot.documentLockState !== 'owned' ||
      snapshot.legacyRecoveryBlocked !== false || snapshot.tabOwnerCompatible !== true) {
    return denied('BVOM document does not own editing');
  }
  if (snapshot.accountSwitchDeferred !== false || snapshot.recoveryBusy !== false ||
      snapshot.localPersistenceHealthy !== true || snapshot.localBlobUnchanged !== true) {
    return denied('account transition or local-save integrity hold');
  }
  if (snapshot.legacyWorkoutActive !== false || snapshot.cloudConflict !== false) {
    return denied('existing training or cloud conflict not resolved');
  }
  // Both remain FALSE for real BVOM users during this isolated development
  // stage. Only separately reviewed multi-device protection may enable them.
  if (snapshot.bb2WriterEnabled !== true || snapshot.multiDeviceFenceVerified !== true) {
    return denied('BB2 feature or cross-device writer protection disabled');
  }
  return Object.freeze({ allowed: true, reason: 'eligible' });
}

export function createBB2AppSessionHost({ runtime, ownerId, readAppSnapshot } = {}) {
  if (typeof readAppSnapshot !== 'function') {
    throw Error('BB2 app: a synchronous BVOM snapshot reader is required');
  }
  const read = () => readAppSnapshot();
  const host = createBB2BrowserHost({
    runtime, ownerId,
    getAuthenticatedOwnerId: () => {
      const state = read();
      return state?.authUserId === state?.cloudUserId ? state?.authUserId : null;
    },
    getLocalOwnerId: () => read()?.localOwnerId,
    canWrite: () => bb2AppWriteStatus(read(), ownerId).allowed
  });
  return Object.freeze({ ...host, status: () => bb2AppWriteStatus(read(), ownerId) });
}
