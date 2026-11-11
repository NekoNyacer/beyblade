---
colors:
  arena-center: "#E5E8EF"
  arena-slope: "#C0C9D8"
  arena-gear: "#18AD4C"
  player-label-background: "#101728"
  player-label-text: "#F7F4E8"
---

# Visual system

Original arena-broadcast world, following the selected Three.js and festive competition brief. A physical circular arena occupies the projection, with names and elimination states pinned alongside it. The screen is not a website hero. The mobile screen is one oversized tactile ripcord; the operator is a restrained control desk. No franchise artwork or fabricated user assets.

## Tokens
Deep ink #101728, pale ink #F7F4E8, matte arena #263755, golden signal #FFCF56, ice blue #79D9FF. Each participant gets a distinct saturated color plus a visible number/name. UI uses locally available Traditional Chinese sans-serif to avoid external network and font licensing dependencies. Numbers tabular. Controls 48px minimum; phone handle 90px. Flat panels, clear rules, 14px corners only on controls and settings. Focus 3px gold outline.

## Composition
Display: fullscreen 3D bowl, large phase heading upper-left, countdown centrally when preparing, readable participants on the right and latest elimination lower-left. Lobby: invitation QR at left, arena preview at center, participant roster at right. Result: giant winner name and ranked list. No form controls appear on the public display. Operator: explicit next step, large primary button, preview, participant management and full bracket.

## Motion and audio
A synchronized three-beat countdown leads into ripcord launch. Tops spin, collide, lose energy and exit according to the authoritative server frame. Impact particles are decorative only. Procedural sound starts only after an explicit sound button. Reduced motion removes shake/particles. Mobile ripcord follows the finger downward, then locks after confirmed submission. Neutral fallback is clearly explained. All failures have retry/status copy.

## Assumptions and review
Dedicated local network and HDMI display, not a public website. The thousand-person audience sees a projection; approximately ten phones connect. Use original geometry and sound. Validate 1920x1080 and 390x844, no external runtime requests.

## Approved metal arena revision
Three smooth rim openings, metallic Blade/Ratchet/Bit geometry, numbered player colors, short colored motion trails and contact sparks. No clock ticks. Roster shows simulated RPM derived from authoritative angular speed (25 × energy/100 radians/second), not an energy bar. Parts currently change appearance only. Movement is faster; recent collision permits ring-out at an opening. Ring-out triggers a 2.4-second client replay at reduced speed; the server continues determining results and the result overlay waits for the replay.
Phone: three stacked selectors with horizontal arrows/swipe, random assembly and server-confirmed assembly. Countdown holds 3,2,1 for one second each, GO for two seconds, then SHOOT opens a six-second pull window. Pulls outside this window are rejected by the server. Missing pulls remain neutral; initial energy and angular speed vary at most ±2%. All tops start together after the window.

## Metal and rail integration
Preserve the approved deep-navy, steel and gold world, authored parts, smooth bowl and exactly three outer ringout openings. Add a separate six-port functional inner gear rail, with no clock markings or decorative spokes. Contact cues are local and event-timed. The camera's focal moment remains actual collision-driven ringout replay. Buffered authoritative motion drives the HUD, impact feedback and audio; replay never changes the winner.

## Compact shield stadium revision
The supplied stadium references now govern the arena: a silver chamfered chassis, shallow metallic basin, green toothed acceleration rail, a nearly clear outer containment shell, and three recessed recovery pockets. This supersedes immediate elimination through the three outer openings. Pocket entry, spin loss, escape, and exhaustion are authoritative simulation states. Keep the existing host/phone flows and local-only preview. The preview opens on a compact two-top fight, with dedicated rail and pocket examples.

Local contact drives colored trails, rail sparks, short impact flashes, and restrained camera recoil. No full-screen flash. The shield stays transparent enough to read the tops. Reduced motion removes trails, spin animation and camera recoil. The test surface is Experience mode: stadium first, concise Traditional Chinese controls around it.

## Phone launch and vertical-impact revision
The user's new brief supersedes the old ±2% launch limit, six rail exits and gentle recovery wells. Measured screen-height-normalized swipe speed seeds power; a 0–25° slider seeds tilt. Keep one continuous green gear rail with one inward dash ramp, three sharp recessed bays, and transparent containment. Authoritative world y/vy drives flight, pocket drops, angled rebounds, landings and shield damage. At high RPM use a circular metallic rotor blur, transitioning to visible blades and strong precession as spin runs down. `/launch-test` is the local operator surface for one real phone versus one neutral test opponent; QR, a ready state and one repeat-launch action lead the flow. Same-router LAN service uses 3215 and isolated test data.

## 2026-11-11 — Minimal horizontal metal launcher

This replaces the earlier downward swipe, angle slider and six-second SHOOT wait on the phone pull screen. The user's reference establishes geometry and interaction, not literal colors. Use the host stadium's navy, steel and green visual language. Other arena decisions remain in force; input and assembly are separate from the fullscreen launcher.

Launcher tokens: navy surface `#080f1c`, text `#e4edf3`, gunmetal body `#14232f` / `#344650` with edge `#718590`, silver grip `#d9e3e9` / `#718793` / `#536979`, green trim `#55d882`, and cord `#1f8052`. Directional gradients represent the same metallic material used by the stadium. The cord enters from beyond the left edge, crosses the launcher, and ends in one large angular grip on the right. The selected Blade/Ratchet/Bit meshes and metal environment are reused beneath the body. No persistent metrics, settings, headings or unrelated controls appear; only transient 3, 2, 1, GO, SHOOT cues.

The DOM/SVG grip follows rightward movement through `--pull`. Reaching 98% of the available stroke releases during pointer movement; finger-up and server acknowledgment are not prerequisites. The strip extracts completely. Speed is normalized to available stroke, gesture angle is capped at 25 degrees, and Enter/Space/assistive click provide neutral launch. Focus is a 3px `#a5edba` outline with 7px offset. Reduced motion removes transitions. Portrait 390x844 and landscape 844x390 were independently reviewed after the user's palette correction: ship at ready-state visual scope.

Countdown is three one-second numbers, then GO for two seconds. SHOOT starts simulation immediately with neutral defaults. One valid pull within 1200ms adjusts energy by at most 11.4, horizontal speed by at most 10%, and heading by at most 5 degrees. Current position, simulation time and contact state remain authoritative; resumed battles do not reopen correction. The bowl has no tops before launch. Fresh live launches begin over the inner bowl at 55% arena radius, 1.3 units above the floor, with vertical velocity -0.5, then fall under authoritative physics.

## 2026-11-11 — Continuous bowl and final spin

This arena revision supersedes the earlier shallow basin and three open mouths. The center stays flat through 0.60 × arenaRadius, then rises quadratically to a 1.30-unit crest. Physics and rendering share surfaceHeight in rail-config.js. The green gear ring sits at the crest with one back (negative-Z) inward dash outlet. Six catch wells sit outside the full, continuous bowl; a top can enter them only after an airborne crossing above the crest. Normal rolling stays in the bowl.

High spin favors circular travel, gear acceleration and the upper outlet dash into the flat center. Medium spin makes irregular crossings. Low spin damps toward a nearby stop. Grounded tops lean toward the local surface normal by up to 0.21 radians on the bank. Wobble and impact recoil add up to 0.14 radians around that pose. Each assembly rests on its lowest point of contact as the blade spins. At zero energy, authoritative angularSpeed preserves residual rotation. Elimination waits for angular speed below 0.12 rad/s and horizontal and vertical speeds below 0.08. Settling eases toward a 0.80-radian rest pose, retained after elimination. The result waits for the authoritative stop and displayed frame.

Player identification uses a camera-facing Sprite above every top: player color, number, name and downward pointer, independent of rotor spin. Ink #101728 and text #F7F4E8 maintain contrast; labels update when names or roster order change. Reduced motion keeps identification and static resting poses while removing visual spin, trails and recoil. Arena materials: center #E5E8EF, slope #C0C9D8, gear #18AD4C. The surrounding broadcast and launcher interfaces retain their existing rules.

## 2026-11-11 — Approved red-versus-blue interface

The user-approved concept replaces the earlier broadcast and control-panel visual language while retaining the existing arena and game rules. The host, stage and player interfaces share a dark charcoal foundation, high-contrast white type, red and blue player sides, angled forms and restrained light effects. The host surface gives priority to the current competitors, their connection and assembly information, the next action, QR invitation and arena preview. The stage uses a 16:9 composition with large player names, a central VS and each player's parts combination beneath. Labels and controls use Traditional Chinese; the visual treatment is original and does not reuse franchise characters or logos.

When the host starts a normal two-player tournament round, show the VS introduction for four seconds before the synchronized 3, 2, 1 and GO sequence. The host shows「對戰介紹」during that interval. A recovered battle resumes without a new introduction; other match formats retain their existing timing. Player phones stay locked until the established SHOOT window. The launcher continues to use the existing rightward ripcord gesture and keyboard alternative; the downward gesture in the original concept image was illustrative and did not change the operation.

Part labels and effect descriptions now come from part-catalog.js. They describe the local simulation, not real-world product measurements or balancing claims.


## 2026-11-11 — Restore approved concept fidelity

Restore the approved red/blue fighting-game concept rather than the earlier flat dashboard approximation. Use charcoal #0A0E17, white #FFFFFF, red #EF243D, blue #167CFF and green #11AC10 for the host's next-match action. The compact host desk puts red/blue competitors above QR, a live stage preview and the main action. Navigation links scroll to the existing players, bracket and settings; underlying event actions stay unchanged. At narrow widths these regions stack without removing controls.

Use the locally bundled, OFL-licensed Barlow Condensed Black Italic for Latin battle display lettering; Traditional Chinese keeps the locally available CJK sans-serif stack. Hero top artwork is rendered locally from the actual makePart meshes and assemblyOffsets: nine individual parts and all 27 assembled combinations. The selected combination determines the displayed image. Both red and blue accent materials are rendered separately, retaining neutral metal. These colors identify opponents. Rebuild these transparent PNGs with node scripts/render-ui-art.mjs after geometry changes. The phone selector and combination preview render the same actual meshes interactively.

The host and public stage share one VS markup renderer. Player names, part combinations and the white VS are visible from the first frame. Only the decorative top scale/position and VS scale animate; essential text never begins at zero opacity. The host preview mirrors the same VS during the introduction and returns to its existing live arena afterward. No changes to physics, authoritative results, launch timing or rightward ripcord mechanics.


## 2026-11-11 — Landscape launch gate and flexible ripcord extension

Extend the approved charcoal, red/blue and metallic launcher system without changing its palette, typography or arena rules. The local `/pull-test` practice surface puts the existing 3D arena alongside one red launcher, with a fixed blue reference opponent and compact last-pull readings. The host QR pairs a separate /pull-phone controller. Phones keep the existing full-screen standard launcher, with no arena or last-pull dashboard; simulation playback stays on the paired host. Practice is immediately repeatable, with no room creation or countdown and a maximum 16-second simulation preview. Existing official launch timing and physics remain in force.

Both official phone launch mode and practice require landscape plus document fullscreen or installed standalone display before accepting input. Present a full-screen charcoal gate with a rotation/fullscreen symbol, concise Traditional Chinese instruction and one large red entry button with visible keyboard focus. Fullscreen entry follows a user gesture; when orientation lock is unsupported, instruct manual rotation. Portrait or fullscreen exit cancels the active gesture and blocks further input. Unsupported fullscreen browsers need a supported browser or an installed standalone web app, including iOS Add to Home Screen.

The flexible ripcord is one cubic SVG curve anchored at the launcher’s right mouth and connected to the grip. The launcher body masks the small interior overlap; the grip stays above the curve. Right-up and right-down pulls bend the same continuous cord while preserving the fixed mouth. Hide the old straight strip and fade the curve after extraction; reduced motion removes that transition. Keep the grip’s existing rightward release and keyboard alternative. This is an extension of the existing metal launcher, not a new visual identity; preserve current design tokens and sidecars.


The unlimited practice session relays measured phone speed and signed angle to the host over a token-scoped local connection. Reuse the standard launcher markup, dimensions, entry gate, loaded-assembly preview and flexible cord on the phone. Rearm after acknowledgment; do not require countdowns or completed battles. Host disconnection disables phone input, reconnection restores it, and host refresh retains the pairing. Separate browser sessions remain isolated.
