# Production status (maintained by the lead)

Maps — "done" = its level designer finished; narrative agents may make small, surgical edits (add a trigger, adjust a
prop's script id/examine) to DONE maps for their chapters and must list them in their report. Never edit IN PROGRESS maps.

| Map | Owner | Status |
|---|---|---|
| west1, library | maps-B | DONE |
| exterior, lobby, aud | maps-A | DONE |
| east1, gym, basement | maps-C | DONE |
| east2, longhall, west2 | maps-D | DONE |
| vault, breaker | maps-E | DONE |

Systems: DONE (see docs/API_NOTES.md "Game systems" sections). Lore/docs: DONE.

Scripts: ALL DONE — pro, ch1, items (narrative-1) · ch2–ch4 (narrative-2) · ch5 (n3) · ch6–ch7 (n4) · ch8 + end (n5).
Story suites: story_n1 142 · story_n2 170 · story_n3 243 · story_n4 233 · story_n5 315 (all passing).

FINAL QA: done. Reviews (playthrough, tech, level design, horror, narrative, art) → 110 findings → fixed in two waves (engine/AI/UI/render/art, then scripts/maps). All suites green: npm test, systems 127, meta 124, story_n1 142 · n2 170 · n3 243 · n4 233 · n5 315, playthrough 208 (dev and built).
