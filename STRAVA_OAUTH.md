# BVOM Strength — Strava Integration Architecture

Status: approved design contract for the Strava backend direction. This document does not enable live OAuth, token storage, webhook handling, or workout upload.

Production BVOM remains v2.8.9. The existing BVOM Supabase Auth, Stripe/subscription, entitlement, and cloud-sync systems remain unchanged.

## 1. Product boundary

BVOM remains the workout source of truth.

The Strava integration is one-way:

```text
Completed BVOM History record
        ↓
Destination-neutral BVOM Export v1
        ↓
Pure Strava adapter
        ↓
Cloudflare Strava backend
        ↓
Strava
```

The integration must:

- request only Strava `activity:write`
- never request Strava activity readback for normal operation
- never make Strava the authority for BVOM training data
- never block workout completion, History, login, entitlement, local save, or BVOM cloud sync
- fail as "Strava unavailable" rather than "BVOM unavailable"

No Strava access token, refresh token, client secret, authorization code, or raw OAuth state may be stored in the PWA, localStorage, sessionStorage, BVOM backup data, History, or BVOM cloud data.

## 2. Final infrastructure direction

Strava will not use the existing BVOM Supabase project as its application backend.

The preferred architecture is:

```text
                    BVOM PWA
                   /        \
                  /          \
                 v            v
        Existing Supabase    Cloudflare
        -----------------    ----------------
        Auth                 strava-api
        Stripe               strava-oauth
        Entitlements         strava-webhook
        Cloud sync           D1
                             Durable Objects
                                  |
                                  v
                                Strava
```

This preserves the intended blast radius:

- Cloudflare failure → Strava connect/upload unavailable
- D1 failure → Strava connect/upload unavailable
- Strava failure → Strava connect/upload unavailable

Those failures must not affect:

- BVOM sign-in
- Stripe/subscription handling
- entitlement checks
- local workout saving
- progression logic
- History
- BVOM cloud backup/sync
- LEAKwise

## 3. Existing BVOM Supabase remains untouched

The current BVOM Supabase project continues to own:

- Supabase Auth
- BVOM user identity
- Stripe/subscription backend
- entitlement state
- BVOM cloud sync

The Strava backend must not receive:

- Supabase service-role/secret credentials
- Stripe secrets
- database credentials for BVOM tables
- LEAKwise credentials
- privileged Auth-admin credentials

The only identity bridge is the existing BVOM user access token.

## 4. BVOM identity verification from Cloudflare

Cloudflare treats Supabase Auth as the identity authority.

For every authenticated Strava operation, the Worker receives the current BVOM bearer token and derives the user only from the verified token. A request body must never be allowed to choose its own `user_id`.

Required claim checks include:

- valid signature or authoritative online validation
- expected Supabase issuer
- `aud = authenticated`
- unexpired `exp`
- valid `sub` UUID
- authenticated role

### 4.1 Signing-mode compatibility

Do not migrate or change BVOM Auth merely for Strava.

The current project exposes both a modern publishable key and a legacy anon key. That does not, by itself, identify how current user session JWTs are signed.

The Cloudflare verifier must therefore support both safe paths:

1. **Asymmetric session JWT**
   - verify locally using Supabase's public JWKS
   - allow only the expected signing algorithms
   - cache keys briefly
   - refetch once on an unknown `kid`
   - never hard-code a signing key

2. **Legacy HS256 session JWT**
   - do not give Cloudflare the Supabase JWT secret
   - validate the bearer token against Supabase Auth's user endpoint using the public BVOM publishable key
   - fail closed if authoritative validation is unavailable

The existing BVOM Auth configuration is not to be modified as part of Strava implementation.

## 5. Cloudflare service separation

Use separate Workers so public parsing surfaces do not automatically share all high-value secrets.

### 5.1 `strava-api`

Authenticated BVOM-facing Worker.

Responsibilities:

- connection status
- OAuth start
- OAuth finalize
- disconnect
- future workout upload
- token refresh orchestration
- safe upload-status responses

Bindings/secrets may include:

- D1
- Durable Object namespace
- Strava client configuration where required
- token-encryption keyring

### 5.2 `strava-oauth`

Public OAuth callback Worker.

Responsibilities:

- receive Strava authorization callback
- validate and atomically consume OAuth state
- exchange Strava authorization code server-side
- verify granted scope includes `activity:write`
- create/update a pending connection
- issue one-time BVOM handoff material
- redirect back to BVOM

It may require:

- D1
- Strava client ID/secret
- token-encryption keyring

### 5.3 `strava-webhook`

Public webhook-only Worker.

Responsibilities:

- Strava webhook verification handshake
- receive deauthorization events
- ignore activity events unless a later approved requirement changes this
- mark a connection as suspect/reauth-required rather than immediately destroying credentials solely from an unsigned webhook event

This Worker should not receive the token-encryption key or Strava client secret unless a verified requirement demands them.

## 6. Browser-side contract

The current v2.8.9 browser OAuth helpers are safety scaffolding only. They still contain an earlier Supabase-callback assumption and must be adjusted in a later client-integration increment to trust the final Cloudflare callback origin.

The safety rules remain:

- only `activity:write`
- reject unexpected authorization hosts
- reject unexpected callback destinations
- reject leaked Strava codes, state, access tokens, refresh tokens, or client secrets
- expose only safe connection state to the PWA
- keep Strava optional to the workout flow

The browser may know safe status such as:

```json
{
  "connected": true,
  "scope": ["activity:write"]
}
```

or:

```json
{
  "connected": false
}
```

## 7. OAuth start

Authenticated flow:

1. PWA calls `strava-api`.
2. `strava-api` verifies the current BVOM user.
3. It generates at least 32 bytes of cryptographically secure random OAuth state.
4. D1 stores only a hash of the state and server-side binding metadata.
5. State is short-lived and single-use.
6. The Strava authorization URL is built server-side.
7. Requested scope is hard-coded to `activity:write`.
8. Redirect URI is hard-coded configuration, never supplied freely by the browser.

Suggested OAuth-state row:

- state hash
- BVOM user ID
- safe return-target enum/key
- created timestamp
- expiry timestamp
- consumed timestamp

Do not store in the state row:

- BVOM JWT
- Strava tokens
- free-form redirect URLs
- unnecessary PII

State consumption must be atomic so concurrent callback attempts cannot both succeed.

## 8. OAuth callback and account-linking protection

The Strava authorization code must terminate at `strava-oauth`, not at the static PWA.

The callback must:

1. validate state format
2. atomically consume matching unexpired state
3. handle user denial safely
4. exchange the authorization code server-side
5. verify the returned grant includes `activity:write`
6. associate the returned Strava athlete ID with the original BVOM user
7. store the connection as `pending`
8. generate a high-entropy one-time BVOM handoff code
9. store only the handoff hash, bound to the same BVOM user and pending connection
10. redirect to BVOM with the handoff in the URL fragment, not the query string

Example shape:

```text
https://www.bvomstrength.com/#strava=pending&h=<opaque-one-time-value>
```

The handoff:

- is not a Strava OAuth artifact
- contains no user ID
- contains no Strava secret
- expires quickly, approximately two minutes
- is single-use

The PWA must immediately remove the fragment with `history.replaceState` after reading it.

## 9. OAuth finalize

The PWA calls authenticated `strava-api` with the one-time handoff.

Finalize succeeds only when:

- the handoff hash exists
- it is unexpired
- it is unused
- the currently verified BVOM JWT `sub` equals the BVOM user ID bound to the handoff

Finalize then atomically:

- consumes the handoff
- promotes the pending connection to `active`

This explicit finalize step is retained to defend against account-linking CSRF.

A person who obtains another user's handoff but is signed into a different BVOM account must not be able to activate the connection.

## 10. D1 as durable Strava store

D1 stores only Strava-integration state.

Expected logical tables:

### 10.1 `strava_connections`

Minimum fields:

- connection UUID
- BVOM user ID
- Strava athlete ID
- status
- granted scope
- encrypted access token
- encrypted refresh token
- access-token expiry
- token version
- encryption key ID/version
- writer/recovery metadata
- connected timestamp
- updated timestamp

Expected statuses include:

- `pending`
- `active`
- `reauth_required`
- `reauth_suspect`
- `disconnect_pending`

Enforce uniqueness where appropriate, including preventing one Strava athlete from being silently linked to multiple BVOM accounts.

### 10.2 `strava_oauth_states`

Contains hashed OAuth state and hashed one-time handoff state with expiry/consumption metadata.

### 10.3 `strava_uploads`

Minimum fields:

- row ID
- BVOM user ID
- Strava athlete ID
- stable BVOM export/workout ID
- export schema version
- stable Strava `external_id`
- payload hash
- status
- Strava upload ID when known
- Strava activity ID when known
- attempt count
- safe error code
- lease/claim metadata if needed
- timestamps

Do not store full workout payloads merely for the ledger unless a later requirement clearly justifies it.

## 11. Token encryption

Encrypt Strava access and refresh tokens at the application layer before D1 storage.

Use AES-GCM with:

- a fresh random 96-bit IV for every encryption
- non-extractable Web Crypto keys where practical
- explicit encryption version
- explicit key ID
- a keyring in Worker secrets to support rotation

Associated data should bind ciphertext to immutable connection context, for example:

```text
v1 | connection_uuid | athlete_id | token_type | key_id
```

where `token_type` is `access` or `refresh`.

This prevents valid ciphertext being silently swapped between users, connections, or token fields.

Never log plaintext tokens or encryption keys.

## 12. Durable Object coordinator

Use a per-BVOM-user Durable Object as a coordination primitive for operations where concurrent external calls could corrupt Strava state.

Primary use:

- serialize/single-flight refresh-token rotation

Potential later use:

- upload claim coordination where it materially simplifies correctness

D1 remains the durable source of record. The Durable Object is a coordinator, not the sole token database.

### 12.1 Important Durable Object caveat

Do not assume "single-threaded" automatically means a Strava refresh race is impossible.

Durable Object events may interleave around awaited external I/O depending on implementation.

The object must implement an explicit single-flight pattern:

1. establish the in-flight refresh promise/state before yielding
2. if another request arrives while refresh is in flight, await or join that same operation
3. only the owner performs the Strava refresh request
4. persist the new token state to D1
5. clear in-flight state

Do not routinely hold `blockConcurrencyWhile()` across slow external network calls.

## 13. Refresh-token rotation

Strava refresh-token rotation is a high-risk boundary.

Required sequence:

1. load the active connection
2. if current access token remains sufficiently valid, use it
3. otherwise enter the user's Durable Object
4. establish single-flight refresh ownership before the Strava call
5. re-read durable token/version state if required
6. call Strava exactly once for that refresh generation
7. encrypt new tokens
8. write the newest access token, refresh token, expiry, and incremented token version to D1
9. use writer/attempt metadata so an ambiguous D1 write can be recognized/reconciled
10. clear single-flight state

If Strava returns `invalid_grant`:

- re-read durable D1 state first
- if token version changed, another refresh may already have succeeded
- use the newer durable state
- only mark `reauth_required` when the stored generation is genuinely unusable

Even with Durable Objects, acknowledge the unavoidable failure window where Strava may rotate a token and the process can fail before durable storage completes. The recovery outcome may be "Reconnect Strava"; it must never corrupt BVOM workout data.

## 14. Workout upload contract

BVOM already has:

```text
History → Export v1 → Strava adapter
```

The backend accepts only a strictly validated supported export/upload payload.

Future upload flow:

1. PWA sends the completed export/upload request to authenticated `strava-api`
2. verify BVOM identity
3. validate schema and size
4. create/claim upload-ledger row
5. obtain a valid Strava access token
6. submit the structured JSON strength upload
7. store Strava upload ID
8. poll Strava upload status at a safe interval
9. store activity ID when processing succeeds
10. return safe status to the PWA

The Strava adapter remains independent of transport and authentication.

## 15. Upload idempotency and ambiguity

Use both:

- stable Strava `external_id`
- internal D1 upload ledger

Suggested external ID:

```text
bvom:<workout_id>:<export_schema_version>
```

Ledger uniqueness should include the BVOM user and stable export identity.

Expected states include:

- `pending`
- `in_flight`
- `processing`
- `succeeded`
- `retryable`
- `permanent`
- `unknown`

Before relying on duplicate recovery semantics, prove with a staging Strava spike exactly what happens when:

- the same `external_id` is posted again
- the first upload succeeded but the client lost the response
- Strava returns a duplicate result
- an upload is still processing

Do not promise automatic recovery behavior that has not been verified against Strava.

## 16. Disconnect

Authenticated disconnect:

1. mark connection `disconnect_pending`
2. block new uploads immediately
3. obtain a valid token if necessary
4. revoke Strava authorization server-side using the current supported revocation endpoint
5. treat a definitively invalid token as already revoked where appropriate
6. remove/disable stored token material after successful revocation
7. make retries idempotent

If Strava revoke succeeds but D1 cleanup fails, the Strava tokens are no longer useful; retry local cleanup.

If the Strava call fails, keep the connection blocked and retry safely.

User-visible state may become disconnected immediately, but backend cleanup must remain auditable and recoverable.

## 17. Webhook

Strava webhook handling is intentionally minimal.

The `strava-webhook` Worker:

- validates request shape and size before D1 work
- handles subscription verification
- checks expected subscription configuration
- acknowledges promptly
- ignores activity create/update/delete events for BVOM's one-way design
- treats athlete deauthorization as an untrusted hint
- marks the matching connection `reauth_suspect` / blocks further uploads
- confirms invalid authorization through a later trusted token operation before destructive cleanup where appropriate
- is idempotent

Do not fetch Strava activities in response to webhook events.

## 18. CORS and browser network boundary

Authenticated Cloudflare routes must use an exact allowlist of approved BVOM origins.

Do not use:

- `Access-Control-Allow-Origin: *`
- wildcard Netlify preview domains
- reflected untrusted origins

CORS is not authentication; bearer-token verification remains mandatory.

OAuth callback and webhook routes do not need browser API CORS.

Adding the Cloudflare backend to BVOM's CSP/connect-src must be a separate reviewed frontend change.

## 19. Logging and secret hygiene

Do not log:

- Supabase bearer JWTs
- Strava authorization codes
- raw OAuth state
- one-time handoff values
- access tokens
- refresh tokens
- client secret
- token-encryption keys
- full callback query strings

Use enum/safe error codes for browser-facing errors.

The callback should set:

- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`

Secrets must be stored with Cloudflare secret tooling, not committed as configuration vars.

## 20. Rate limits and abuse controls

Protect public and authenticated routes independently.

Public routes:

- strict method checks
- strict body/query size limits
- cheap validation before D1 access
- Cloudflare rate limiting/WAF where appropriate
- global abuse ceilings

Authenticated routes:

- per-user limits
- global Strava budget protection
- strict schema/size validation

Strava rate limits are shared across BVOM users, so the backend must treat them as a global resource.

## 21. BVOM frontend failure semantics

Strava is an optional enhancement.

A Cloudflare or Strava failure must never:

- block workout completion
- block History
- change progression
- block local persistence
- block BVOM cloud sync
- block login
- block subscription checks

Expected UX:

```text
Workout saved in BVOM.
Strava unavailable — send later.
```

Use bounded request timeouts and a small client-side breaker so repeated Strava failures do not create repeated delays.

Manual retry from History is preferable to hidden retry loops.

## 22. BVOM account lifecycle

Because Strava data lives outside Supabase, BVOM account deletion does not automatically delete Cloudflare state.

Before a BVOM account is deleted, the BVOM account-deletion flow should make a best-effort authenticated Strava disconnect/revoke request.

Do not add production Auth/database triggers merely to support Strava unless separately reviewed.

If account cleanup cannot contact Cloudflare, retain a documented recovery/retention policy rather than coupling account deletion to Cloudflare availability.

## 23. Entitlement policy

Do not couple Cloudflare to Stripe or BVOM entitlement state unless the product explicitly decides Strava is a paid-only feature.

Default architectural preference:

- a valid authenticated BVOM account may connect Strava
- Cloudflare verifies identity only
- no Stripe secret
- no BVOM entitlement-table access

This keeps the Strava backend isolated.

## 24. Staging and rollout

Do not use production D1 as the first test environment.

Before public connection work:

1. create Cloudflare staging resources
2. use a Strava development/test app where practical
3. verify BVOM JWT validation behavior
4. prove OAuth flow and finalize
5. prove token-refresh concurrency
6. prove upload processing and duplicate behavior
7. perform failure injection
8. only then configure production Cloudflare resources

LEAKwise remains untouched.

## 25. Required red-proof contracts

Before enabling each layer, executable tests should cover at least:

### Identity

- expired JWT
- wrong issuer
- wrong audience
- missing/invalid `sub`
- unauthenticated/anon credential
- unsupported algorithm
- asymmetric unknown `kid` refetch
- legacy validation failure
- identity failure never falls back to trusting request body

### OAuth

- state replay
- expired state
- concurrent double callback
- denied authorization
- missing `activity:write`
- handoff replay
- expired handoff
- finalize by the wrong BVOM user
- no Strava secret/code/state leakage to browser or logs

### Crypto

- token decrypt succeeds only with correct AAD
- ciphertext swap fails
- tampering fails
- old key can decrypt during key rotation

### Refresh concurrency

- simultaneous requests result in one refresh call for one token generation
- joined callers receive the new durable token
- refresh failure does not overwrite newer state
- ambiguous D1 write recovery
- process failure after Strava rotation results in reauth rather than corrupt state

### Upload

- duplicate BVOM export claim
- asynchronous processing state
- timeout/unknown outcome
- 429/backoff
- invalid/oversized payload
- disconnected/reauth-required connection blocked

### Webhook/CORS

- malformed webhook
- forged deauth cannot directly destroy credentials
- activity events ignored
- invalid verification request rejected safely
- disallowed browser origin gets no authenticated CORS access

### BVOM isolation

- blackholed Cloudflare backend does not affect login
- blackholed Cloudflare backend does not affect workout saving
- blackholed Cloudflare backend does not affect History
- blackholed Cloudflare backend does not affect cloud sync
- blackholed Cloudflare backend does not affect subscription checks

## 26. Implementation sequence

1. Document/freeze this architecture.
2. Build a minimal staging identity-verification spike.
3. Prove Strava upload/duplicate/processing semantics in staging.
4. Create staging D1 schema.
5. Create Durable Object single-flight coordinator and concurrency tests.
6. Build authenticated `strava-api` status/start endpoints.
7. Build public `strava-oauth` callback and authenticated finalize.
8. Add disconnect.
9. Add refresh lifecycle.
10. Add `strava-webhook`.
11. Add upload ledger and actual upload transport.
12. Add frontend CSP/network endpoint as its own PR.
13. Add Settings connect/disconnect UI.
14. Add manual History send/retry.
15. Failure-injection testing.
16. Production Cloudflare rollout.
17. Public Strava rollout only after capacity/rate-limit requirements are understood.

## 27. Not included yet

This document does not authorize or implement:

- Cloudflare account creation or billing changes
- Worker deployment
- D1 creation
- Durable Object creation
- Strava app registration
- Strava secrets
- live OAuth
- live webhook subscription
- live workout upload
- BVOM Settings UI
- automatic workout export
- Supabase Auth migration
- any change to LEAKwise

Those remain separate reviewable increments.
