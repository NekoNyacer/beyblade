# Duel slope and gear-rail adjustment · 2026-11-12

Base: `NekoNyacer/beyblade` main at `bc7345ef7239bd9bc0023905118797545bcb1d3e`.
This change set is intended for laptop testing on `improve-duel-rail`. It does not deploy the production site.

## Changes

- Keep the duel arena radius (3.35), flat-center radius (2.01), central groove and rail-contact band unchanged.
- Lower the duel rim from 1.30 to 1.05. At the inner edge of the contact band, the ordinary radial slope changes from 48.111° to 42.004°; at the rail center it changes from 58.792° to 53.129°. The molded exit shelf remains at 0.74.
- Reduce small-bowl tangential scrub from 0.95 to 0.65, its cap from 5.7 to 4.2, and radial drag from 0.35 to 0.24. Height and friction blend back to the original values at 10 players and above.
- Both directions use the same tooth-phase condition. A positive-direction contact no longer requires tangential speed above 5.5 and an almost perfectly tangent approach. Minimum tangential speed remains 1.9; maximum outward/tangential ratio changes from 1.15 to 1.25 (about 49° to 51°).
- Direction and tooth-phase changes apply to all arena sizes. Large-arena slope/friction remain unchanged, but their battle trajectories can still change because of the new contact conditions.
- Keep actual grounded contact, tooth phase, spin-energy and tilt checks; one attempt per contact; rebound on a head-on strike; cooldown; finite guide force; energy cost; duration and speed caps. No position snap, remote attraction or opponent targeting was added.
- Update the rendered shoulder, pocket floor, top support and spark surfaces together. Regenerate the diagnostic recordings using the changed production physics.

## Reproducible comparison

`node scripts/rail-tuning-measure.mjs [checkout-directory]` emits JSON. It uses seeds 1–80, a 0.04-second outer step and the same production integration substeps. Practice cases reproduce `practice.js`: one measured player pull and a standard-launch opponent. Each case has 80 rounds.

| Practice input | Player used exit, before | Player used exit, after | Any top used exit, before → after |
| --- | ---: | ---: | ---: |
| Slow, power 0 | 42/80 | 51/80 | 62 → 70 |
| Medium, power 0.5 | 35/80 | 52/80 | 55 → 63 |
| Fast, power 1 | 38/80 | 62/80 | 59 → 71 |
| Medium, −20° | 28/80 | 51/80 | 56 → 60 |
| Medium, +20° | 44/80 | 61/80 | 65 → 73 |

For the medium straight-pull case:

- Total entries: 89 → 243; entries after 5 seconds: 10 → 50.
- Entries by direction: positive 0 → 131, negative 89 → 112.
- Tooth rebounds: 756 → 839. Rebounds remain more frequent than meshing.
- Mean duration: 27.158 → 24.279 simulation seconds; adjusted maximum 33.43 seconds.

All 480 adjusted rounds across the five practice cases plus the standard-fallback case finished within 60 simulation seconds. The results describe a fixed-seed arcade simulation, not real hardware calibration or a guaranteed success probability.

## Verification

- Baseline full suite: 173 passed, one environment-blocked failure.
- Adjusted full suite: 179 passed, the same one environment-blocked failure, 180 total.
- The blocked test is `HTTP/WS authority, pull validation, snapshots and persisted recovery`. Its `/api/network` assertion receives 400 because `os.networkInterfaces()` fails with `uv_interface_addresses ... Unknown system error 1` in this cloud execution environment. An isolated rerun with expanded execution permission had the same result. No server or network-settings code was changed.
- All 117 JavaScript/module syntax checks passed; `git diff --check` passed.
- Six added tests cover gentler geometry, consistent shoulder/catch/support heights, moderate bidirectional entry, all-bit head-on/phase rejection, no pre-contact attraction, and raycasts against the actual production stadium meshes for 2/6/10/16 players.
- Existing 2/10/16-player bounds, deterministic replay, 27 part combinations, rail collision release, speed/energy limits, pocket recovery, launch, support and spark tests pass. Old trajectory fixtures were recalibrated for the intentionally changed physics while preserving their behavioral assertions. The practice-frequency test now follows the actual measured-pull path rather than two fallback launches.
- An additional focused regression check passed all 28 tests.

## Remaining checks

Chromium could not launch for `npm run test:integration`: the environment rejects its local socket creation (`socket() failed: Operation not permitted`). An expanded-permission retry produced the same failure. Therefore browser rendering, screenshots, interaction, real phone and subjective play feel were not validated in this pass. Production mesh raycasts validate geometry, not rendered pixels or touch interaction.

Before deployment, run `npm test`, `npm run test:integration` and `npm run test:phone` on a browser-capable environment and play-test the small bowl. Use `CHROME_PATH` where needed. Keep any active event data and other work intact. Publishing and deployment require separate approval.

## Applying the delivered patch

Start from a clean checkout of the stated base, or first review later changes. Run `git apply --check beyblade-rail-adjustment.patch`, then `git apply beyblade-rail-adjustment.patch`. If the check fails, reconcile the changes rather than forcing or overwriting files. The patch includes regenerated diagnostic data; it does not include dependencies, event data or secrets.
