# 戰鬥陀螺：尾牙競技場

Standalone local-only party game for approximately ten participants and a thousand spectators watching one projected host screen. User selected Three.js. Phone participants scan QR, enter their display name once, then perform only a ripcord swipe. A minimal horizontal ripcord measures rightward swipe speed and gesture-derived 0–25 degree tilt. SHOOT starts the match immediately with neutral defaults; timely input makes one bounded launch correction, never delaying the match. Excess speed can cause rail overload, shield impacts and spin loss; the fastest launch is not guaranteed to win. The server simulation owns combat and results; visuals cannot invent a different winner.

Two modes: all-player battle royale and one-versus-one single elimination. A host controls joining, preparation, starting, advancing and restarting. Mobile reconnection and a neutral launch fallback prevent a stage show from stalling. Separate operator, public display and phone pages. No accounts, database service or public deployment. Save local event recovery.

This repository is self-contained; keep its dependencies and private event data separate from other projects.

Assumptions for this implementation: Traditional Chinese UI, 2–16 players, energetic arena style, dedicated local Wi-Fi and a wired host, approximately 20–40 second battles. The audience watches the projection instead of connecting a thousand phones. No user logos, photographs or licensed franchise characters were supplied. Use original geometric tops, procedural audio and authored arena geometry.