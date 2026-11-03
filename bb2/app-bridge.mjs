/* BB2 Stage (ii) — dormant, guarded browser entry point.
 * This module is never imported by index.html. Importing it performs no I/O.
 * A future app integration must supply its own authoritative account/document
 * snapshot; absent verified multi-device protection, writes remain disabled.
 */
import { createBB2AppSessionHost } from './app-session.mjs';
import { createBB2LocalStore } from './browser-core.mjs';

export function createBB2DormantAppBridge({ runtime, ownerId, readAppSnapshot } = {}) {
  const host = createBB2AppSessionHost({ runtime, ownerId, readAppSnapshot });
  const store = createBB2LocalStore({ ownerId, ...host });
  return Object.freeze({
    key: store.key,
    status: host.status,
    read: store.read,
    initialize: store.initialize,
    saveSetup: store.saveSetup,
    commitStart: store.commitStart,
    appendEvents: store.appendEvents,
    commitFinish: store.commitFinish
  });
}
