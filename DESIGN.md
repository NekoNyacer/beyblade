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


## 2026-11-11 本機整合
保留 C 的紅藍版面與零件 ID／數值語義（刀盤三刃、六瓣重盾、圓環；棘輪3／6／9凸；平／球／尖軸），移入 F 的鑄造金屬、鏤空、徽章與透明結構。所有72張零件／組合圖由同一份 makePart 和 assemblyOffsets 再生，避免主持台與實際模型不一致。正式遊戲、自由試玩與配對手機練習共用新版橫向發射器外觀；固定情境僅用於診斷。


## 2026-11-11 — Cream and green host tabs

The host control surface follows the referenced marble run palette: cream #F6F8F3, ink #163C32, muted #5E7167, green #00894F (button fill #00854C for white-text contrast), and white working panels. This supersedes the charcoal/red host shell only; opponent red/blue remain as soft identification tints and the arena, stage introduction and phone interfaces retain their existing visuals.

The topbar and main content share a centered 1440px maximum container and responsive horizontal gutters. Horizontal Match, Players, Bracket and Settings tabs replace the scrolling sidebar; each tab shows only its associated panel. Arrow Left/Right and Home/End activate and focus tabs. Existing ResizeObservers restore arena and bracket geometry when panels become visible. Settings contains event/mode controls and a new-tab link to /scenarios for repeatable free-battle testing.


## 2026-11-11 — Restore battle palette
The user requested the previous charcoal, red and blue host palette back. Preserve the centered header, horizontal tabs and test-page entry.

## CathayBlade 賽事轉播介面（核准版）

全站品牌是競技場原有的大樹圖示與 CathayBlade 字標；瀏覽器分頁也使用同一棵樹。主持、投影、選手、指南及所有測試頁共用 broadcast-kit.css 的深色金屬外框、紅藍對決色與綠色確認鍵。名單與技術數值維持清晰對比。

主持台維持置中頁首及四個水平分頁。設定內連到自由對戰測試，測試區可回到 /#settings。對戰中 P1、P2 後方為該席選手姓名，兩側大字顯示實際播放幀換算的 RPM，未取得資料時顯示 —。準備與倒數不捏造轉速。多人混戰保留可容納完整名單的版面。

## 2026-11-11 - Arena housing and dark stage refinement

Extend the existing silver/green arena and dark broadcast world rather than introduce a new identity. Enclose the exposed bowl underside in chamfered silver-gray armor (#9EABB8), with a graphite lower reveal (#101820), an inset front fascia, restrained cooling slots and panel joints. Ground it on a dark stage (#04070B) with sparse perspective panel seams (#4F6577 at 0.25 opacity) and deterministic fine material bump. Retain CathayBlade branding; do not use the Beyblade logo.

Reduced arena lighting restores depth; a gentle home-camera adjustment (12.2y/13z, scaled by fit zoom) and distant fog (#070B11, 60/150) preserve readable portrait framing. These are presentation changes only: preserve moldedBowlGeometry, buildDashRail, rail-config, authoritative physics and all six catch pockets. Existing desktop, mobile and broadcast layouts remain in force.

## Components

### Champion result extension (2026-11-11)

Keep the existing charcoal and metallic broadcast world. The award screen centers one original gold trophy, one champion label and a prominent white winner name, resolved only from the authoritative server result. Suppress the arena, duplicate roster, phase labels, clock and commentary on this screen. Battle-royale results may add second and third place from authoritative rankings; practice uses 本場勝者 without the trophy, and an unresolved winner stays neutral.

The existing display tools can reveal the completed tournament bracket; Escape returns to the award screen. Intermediate tournament rounds retain their bracket. The host and public bracket share a compact trophy endpoint, with a muted pending state. Long names wrap and reduce in size; portrait podiums stack, and short landscape screens reduce trophy height. Essential text is visible immediately. The small trophy entrance respects reduced-motion preferences and the existing motion setting. This component extends the current system without replacing its tokens or sidecars.

## 2026-11-11 - Audience RPM readouts

Keep the CathayBlade broadcast identity. Use bold, tabular Barlow Condensed RPM digits rather than the former thin serif numbers. Two-player plates occupy the upper side space with approximately 136px digits at 1920x1080; ten-player matches use separate approximately 67px RPM rows, while sixteen-player matches use compact single-line readouts. Preserve the bowl, player identification and result surfaces. The host uses the same readout logic and enlarged numerals.

Ready, countdown and the shared pull window show 0 RPM. A witnessed new launch counts up for the first 0.48 seconds of authoritative playback time, then displays the exact angular-speed-derived RPM from the rendered frame. Do not invent a value before the server starts the match. The existing unpulled-player fallback is labeled as standard launch. Late entry, restored rounds, replay and reduced motion show authoritative values directly. Refresh and network reconnect must not restart the animation.
### Projection lobby clarification
The annotated lobby keeps the QR and game format, removes the extra player-entry heading and QR caption details, and shows names with large 0 RPM readouts instead of the standard-launch status. Apply the RPM hierarchy before the match as well as during it: about 125px for small rosters, 72px for ten players and 49px for sixteen at 1920x1080. The compact roster reflows without cutting numbers; host connection warnings and QR entry remain functional. Waiting-room labels must not affect authoritative battle readouts or the Count Up behavior.
## 2026-11-11 - Transparent CathayBlade identity

Keep the original tree artwork, letter shapes and underline. The shared dark-interface wordmark uses off-white #F4F6FA for Cathay and green #56D889 for Blade, on a fully transparent canvas with no white plate, padding or rounded frame. All existing host, projection, phone, guide and test-page callers share this treatment. The silver bowl keeps the original deep-green palette through cathayblade-on-light.svg; do not apply the white UI lettering to a pale floor. No third-party marks are introduced.

Validate with node scripts/logo-brand-check.mjs: identical alpha and tree pixels across variants, intended surface contrast, and desktop/phone placements. Real projector output remains a venue check.
