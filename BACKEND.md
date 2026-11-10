# Backend and local API

Run `npm start` from the project directory. Default TCP port is 3210; set `PORT` to change it. The server binds to the local computer's interfaces for phones on the same trusted Wi-Fi. It does not change the firewall, configure a router, or deploy publicly. HTTP has no transport encryption: do not expose this party server to the Internet. Only the projected display is intended for the audience, not thousands of simultaneous client connections.

## HTTP

- `POST /api/create` JSON `{mode:"brawl"|"tournament"}` returns `{roomId,hostToken,state}`. Preserve hostToken locally and do not put it into a public display link or QR.
- `POST /api/join` JSON `{roomId,name}` returns `{playerId,token,state}`. Reconnect with `{roomId,token}`. A saved token restores the same identity even when registration is locked. Name is limited to 20 characters; capacity is 16.
- `GET /api/network` returns `{urls,port}`. Choose the LAN interface shared with the phones. VPN and disconnected interfaces may appear; the host UI must let the operator choose.
- `GET /api/qr?text=<encoded URL>` returns a locally generated SVG. It does not contact an external QR service.
- `/`, `/display`, `/play` serve the operator, projector, and phone pages. Public assets live under `public`. The only dependency files exposed are `/vendor/three.module.js` and `/vendor/three.core.js`.

## WebSocket

Connect to `/ws?room=ROOM&role=host&token=HOST_TOKEN`, `/ws?room=ROOM&role=player&token=PLAYER_TOKEN`, or `/ws?room=ROOM&role=display`.

Packets from server:

- `{type:"state",state}` on connection and changes. State includes roomId, mode, phase, locked, players, round, matches, championId, serverTime, optional recovered. No identity/host tokens or raw pulls are included.
- Players contain id, name, color (hex), connected. Demo players remain disconnected intentionally.
- Round contains id, playerIds, matchId, seed, pulledIds, deadline (Unix milliseconds), startsAt (after start), winnerId and rankings (after result, winner first).
- Phase is lobby, ready, countdown, running, result, or finished.
- `{type:"frame",frame}` at 25Hz when running and once upon reconnect to an existing battle. Frame includes roundId, t (seconds), tick, tops, events, done, winnerId, arenaRadius (5.6). Top includes id, x, z, vx, vz, energy, alive, spin. Top radius is 0.43; initial energy is 98–102. Render these exact positions and use the server result. Collision events contain type hit, x, z, power; elimination events contain type out, id, x, z.
- `{type:"error",message}` for rejected controls. WS authentication errors reject the handshake with HTTP 403.

Host sends `{type:"action",action,value?}`:

- prepare / advance: lock registration and prepare the next unplayed match. Ready pull window is 15 seconds. Starting remains a manual host action; no deadline auto-start.
- start: only from ready. Counts 3, 2, 1 for three seconds, then GO for two seconds; SHOOT starts the authoritative simulation immediately. Repeated start is rejected.
- reset / rematch: return the same roster to an unlocked lobby with new seeding; abandon any current battle explicitly.
- lock: lobby only; boolean value sets registration lock (omit to toggle).
- mode: lobby only; value is brawl or tournament.
- demo: unlocked lobby only; fill roster to 10 with demonstration players. No simulated pulls are required.
- remove: lobby only; value is a player ID. Disconnects that player's sockets and removes their token.

Player sends `{type:"pull",roundId,power,angle}`. Power must be a finite number from zero to one; angle is a finite number from 0 to 25 degrees. The match starts at `shootAt`, using neutral launches. An eligible player may supply one timely pull before `deadline` (`shootAt + 1200ms`) to adjust the launch without restarting the simulation. Adjustments are bounded to ±11.4 energy, ±10% current horizontal speed and up to 5° heading. Positions, elapsed time and contact state are preserved; resumed matches do not reopen correction. Missing pulls remain neutral. Display clients have no controls. A host socket is never also a player socket.

## Determinism, tournament and recovery

The server uses a seeded PRNG and a fixed 1/25-second step. Motion, actual impacts, collision energy loss, and spin decay determine elimination. There is no preselected winner or result independent of the visible simulation. A timely pull adjusts launch energy and motion within the server bounds; the UI should not describe it as guaranteed advantage or an official sporting result. Drag increases after eight seconds so battles end within the tested 35-second budget. Tied exhaustion is resolved in energy order, then stable player ID. Rankings are reverse elimination order.

Tournament entrants are shuffled once with the event seed. The bracket uses a power-of-two size, with randomly assigned first-round byes. Byes automatically advance; each real match contains two players, and an N-player tournament requires N−1 actual battles. Later stages are created only after the current stage is complete. Results are never automatically advanced by a disconnected client.

`data/events.json` stores local rooms, roster names, bearer tokens and current state. It is replaced atomically via a temporary file on controls/results and at one-second intervals during play. Keep that folder private. On restart, an unfinished countdown/battle is marked recovered and paused in ready with the original round ID, pulls and saved simulation. Press Start to count down and resume the saved state, potentially replaying less than one second since the last save. Completed rounds stay completed. No new bracket match is created automatically. The original host browser storage is needed to reclaim operator authority; there is no unauthenticated host-token recovery API.

Only run one server process per data folder. A corrupt saved file intentionally prevents startup rather than silently discarding the event. Back it up before repairing. At most 30 rooms are retained; this deliberately small event app has no archival admin interface. Use existing event links rather than continually creating rooms.

## Verification

`npm test` runs deterministic physics, all tournament sizes 2–16, power bounds/deadlines/duplicates, roster/reconnect/privacy, live HTTP and WebSocket authorization, QR generation, same-origin enforcement, and restart recovery. Real venue Wi-Fi, firewall access, projector audio, and physical phone swipes still need rehearsal.
