# GCP deployment handoff

This folder is a self-contained Node + Three.js app. Build only after the security acceptance tests pass. Do not publish the original local-only build.

## Required deployment shape

Use one persistent instance (for example a small GCE Linux VM) behind HTTPS, with a persistent private data directory. The authoritative battle and sockets are held in one Node process and events are checkpointed to JSON. Do not load balance independent instances. Do not use ephemeral Cloud Run storage for a real event. Cloud Run websocket request limits and replica replacement also require recovery semantics this build does not solve; setting max instances to one alone does not make storage durable.

The app listens on PORT (default3210; Docker8080), with WebSocket upgrade at /ws. HTTPS proxy must preserve Host, accept Upgrade/Connection, disable buffering on WS, and allow a connection longer than an event (at least30 minutes). Browser uses wss automatically. Keep the underlying Node port private, expose only HTTPS through the selected reverse proxy. Configure GCP firewall through the deployment worker with the user's required approvals, not through app startup.

## Runtime environment

- PUBLIC_MODE=1: mandatory on Internet deployments. Startup fails without a strong ADMIN_KEY.
- ADMIN_KEY: independently generated random secret, at least24 characters. Keep in the VM's protected runtime configuration, not source control, image, logs, screenshot or shared QR.
- PUBLIC_URL: canonical verified HTTPS origin, for example https://your-verified-host.example. /api/network then returns this origin only, without private network addresses. Do not use an unverified placeholder in the actual configuration.
- DATA_DIR: private persistent writable directory. Docker default /app/data. Back it up securely; it contains player/host bearer tokens and names.
- PORT:8080 inside the container.

## Access model

- Creating an event requires x-admin-key in public mode. Operator can open the private setup link ORIGIN/#admin=ADMIN_KEY. The page reads the fragment into sessionStorage and immediately removes it from the address bar. The fragment is not sent to the web server. Deliver that private link only to the user, never to attendees or in the public QR. The key is a capability, not a user-account login system.
- /api/create returns distinct hostToken and accessToken. HostToken stays in the operator's browser storage; it is never in the QR or public state.
- The attendee/display share link includes a high-entropy accessToken in the invite query. Knowing only the short room code cannot join or read the event. Anyone holding the invite link may see that event's names and join until locked, so treat it as an event invitation.
- Phones receive independent player tokens. Those can only pull for that specific player, not control the host or read a different room. Existing player tokens resume the same identity after reconnect.
- Read-only public display requires the invite token. No host controls are accepted on it.
- New joins are capped at16 and stop when the host prepares a match. Rate/payload/socket limits and same-origin checks apply. This is small trusted-event capability access, not enterprise IAM, bot prevention or a high-traffic service.
- /healthz reports {ok:true} only. No credentials, roster or data files are served there. HTTP assets cannot access data or server source.

## Build and run

Dockerfile uses the official Node24 image, locked npm dependencies, non-root runtime and a health check. Build locally or in the deployment environment with docker build -t beyblade-party .

Run exactly one container with a persistent volume mounted at /app/data (owned by UID1000), publish its private8080 only to the HTTPS reverse proxy, and supply the environment above. Never bake ADMIN_KEY into the Docker build args/image.

The repository includes start-game.cmd and npm start for local rehearsal. PUBLIC_MODE defaults off only for trusted-LAN local operation.

## Acceptance checklist before publishing a link

1. npm ci --ignore-scripts, npm test, npm audit --omit=dev.
2. Host create rejected without admin in PUBLIC_MODE. Wrong invite rejected for new join and display. Public states contain no bearer tokens.
3. GET /healthz through HTTPS returns200. HTTP-to-HTTPS redirect works. WebSocket connects through the actual proxy.
4. User opens private admin link, creates event; QR points to verified PUBLIC_URL and contains only room+invite, never host/admin token.
5. Two different phone browsers join and swipe. Repeat at10, complete brawl and a tournament. Confirm closed tab reconnect and no duplicate player.
6. Restart process during a test round with persistent data: original host browser sees paused recovery and explicitly resumes. Completed winners remain completed.
7. No travel of inn files/services, no shared data directory, no credentials in source/archive, and recurring GCP costs/region/ownership approved as required.

## Validation status and limits

Automated local core tests cover deterministic physics, 2–16 player brackets, collision symmetry, pull bounds/deadlines, permissions, rate-sized payloads, reconnect and recovery. Browser tests use installed Chrome,10 independent phone contexts, actual pointer drag, projector/host UI, winner consistency and delayed swipe lockout. Runtime dependency audit is recorded separately. Docker build, actual GCP HTTP/WS, public TLS, VM firewall and external device tests must be performed by the deployment worker; do not infer them from local tests.
Reverse-proxy access logs should omit query strings: invitation links and WebSocket URLs carry capability tokens. Keep all access logs private. The admin fragment is removed client-side and is not sent in HTTP requests. New hardened deployments should start a fresh event instead of importing pre-hardening host browser state.
