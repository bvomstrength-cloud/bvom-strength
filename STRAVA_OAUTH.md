# BVOM Strength — Strava OAuth Architecture

Status: design contract for the first Strava account-connection layer. This document does not enable workout upload.

References:
- https://developers.strava.com/docs/authentication/
- https://developers.strava.com/docs/webhooks/
- https://developers.strava.com/docs/getting-started/

## Product boundary

BVOM remains the workout authority. The Strava integration is one-way.

For the first connection implementation:

- request only `activity:write`
- do not request activity read, profile read, weight, health, or other read scopes
- do not read Strava activities back into BVOM
- do not expose Strava access tokens, refresh tokens, authorization codes, client secrets, or OAuth state to the PWA
- do not store Strava tokens in localStorage, sessionStorage, BVOM backup data, History, or cloud workout data
- the browser may know only whether Strava is connected and that the granted scope is `activity:write`
- workout upload remains a separate later increment

## Why OAuth must be server-side

Strava's authorization-code exchange requires the application's client secret. Strava access tokens are short-lived and refresh tokens may rotate. The client secret and all tokens therefore belong on the server side of the BVOM/Supabase boundary.

The existing Supabase Edge Function pattern should be reused rather than adding a second backend.

## Browser-side contract

The PWA talks only to the existing authenticated Edge Function surface.

Proposed actions:

### Start

Request:

```json
{
  "action": "strava_oauth_start",
  "returnPath": "/"
}
```

The PWA must accept only a server response containing a validated Strava web authorization URL.

The server, not the browser, owns:

- client ID
- requested scope
- callback URL
- anti-CSRF state generation

The requested scope is hard-coded server-side to:

`activity:write`

The PWA must reject authorization URLs that:

- are not `https://www.strava.com/oauth/authorize`
- request any scope other than exactly `activity:write`
- do not use `response_type=code`
- omit a strong state value
- use a non-HTTPS callback
- contain client secrets, tokens, or authorization codes

### Status

Request:

```json
{
  "action": "strava_status"
}
```

Allowed browser response when connected:

```json
{
  "connected": true,
  "scope": "activity:write"
}
```

Allowed browser response when disconnected:

```json
{
  "connected": false
}
```

The response must not include athlete profile data, access tokens, refresh tokens, authorization codes, client secret, OAuth state, or token expiry details.

### Disconnect

Request:

```json
{
  "action": "strava_disconnect"
}
```

The server revokes the Strava connection and removes the server-side BVOM connection record. The PWA receives only a success/failure result.

## Server-side authorization flow

### 1. Authenticated start request

The Edge Function verifies the current Supabase user.

It generates a cryptographically random OAuth state and stores only the server-side state record needed to bind the callback to that BVOM account.

Suggested state record:

- state hash
- BVOM user ID
- safe return path
- created time
- expiry time
- consumed time / one-use marker

State should be short-lived and single-use.

The server builds the Strava web authorization URL using:

- registered Strava client ID
- server callback URL
- `response_type=code`
- exact scope `activity:write`
- generated state

### 2. Strava callback

The Strava redirect URI points to the Supabase Edge Function, not the static BVOM PWA.

That is deliberate: the authorization code must never land in the browser app.

The callback must:

1. validate state exists, matches, is unexpired, and is unused
2. mark/consume state so replay is rejected
3. handle `error=access_denied` without creating a connection
4. require a short-lived authorization code
5. exchange the code server-side using client ID and client secret
6. verify the granted scope is exactly `activity:write`
7. store the newest refresh token returned by Strava
8. associate the Strava athlete ID with the authenticated BVOM account for webhook deauthorization lookup
9. redirect back to the safe BVOM return path with only a non-sensitive marker

Allowed browser return markers:

- `?strava=connected`
- `?strava=denied`
- `?strava=error&reason=<safe-code>`

The browser return URL must never contain Strava `code`, `state`, access token, refresh token, or client secret.

## Server-side connection storage

Use a server-only table or equivalent storage surface that is not directly readable by browser clients.

Minimum connection data needed for future upload:

- BVOM user ID
- Strava athlete ID
- granted scope
- access token
- access-token expiry
- latest refresh token
- connected/updated timestamps

Token rows must not be exposed by ordinary client RLS/API access.

The newest refresh token returned by Strava replaces the prior stored refresh token.

No Strava workout or athlete profile data needs to be copied into BVOM.

## Token refresh

Future workout upload code must execute server-side.

Before an upload:

1. check access-token expiry
2. if refresh is needed, call Strava's OAuth token endpoint server-side
3. persist the newest refresh token returned
4. use the valid access token for the upload
5. never return either token to the PWA

The browser should receive only upload status and any safe Strava activity identifier needed for duplicate/audit handling.

## Disconnect / revoke

Use Strava's current recommended revocation endpoint:

`POST https://www.strava.com/oauth/revoke`

The request is server-side and authenticated with HTTP Basic Auth using the Strava client ID and client secret.

After a disconnect attempt, BVOM should clear its server-side connection/token record once revocation succeeds. Error handling should be idempotent so repeated disconnect attempts are safe.

## Webhook requirement

BVOM needs a Strava webhook subscription before public multi-athlete use so it learns when an athlete revokes the app from Strava.

The webhook endpoint is server-side.

Verification GET:

- validate the configured verify token
- echo `hub.challenge`
- respond promptly

Event POST:

- acknowledge quickly
- for an athlete deauthorization event (`object_type=athlete`, authorization changed to false), identify the connection by Strava athlete/owner ID and remove or invalidate the BVOM Strava connection
- ignore activity create/update/delete events for this one-way integration unless a later product requirement explicitly needs them
- do not react by fetching activities, because BVOM does not read Strava workout data back

The webhook subscription ID should be treated as configuration and checked where practical.

## Secrets / configuration

Do not commit these values to Git:

- Strava client secret
- webhook verification token
- access tokens
- refresh tokens

Server configuration will need values equivalent to:

- Strava client ID
- Strava client secret
- registered OAuth callback URL
- webhook verification token
- BVOM public return origin

## App registration checkpoint

Before the connection can be made live, the owner must create/configure the Strava API application and provide the non-secret registration details to the server configuration process. The client secret must go directly into secure server-side configuration and must never be pasted into front-end source, committed to Git, or stored in BVOM backup data.

The registered Authorization Callback Domain must match the domain used by the server callback.

## Not included in this increment

This OAuth architecture intentionally does not yet add:

- a Settings "Connect with Strava" button
- actual Edge Function actions
- actual token exchange
- actual token persistence
- a webhook endpoint
- workout upload transport
- automatic post-workout upload
- Strava activity readback
- Strava profile display

Those are separate reviewable increments.
