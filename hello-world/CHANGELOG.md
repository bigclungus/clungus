# Changelog

## Unreleased

### Bug Fixes
- move tasks API to /api/tasks so /tasks serves tasks.html

- update 404 page to use shared sitenav

- merge tools subheader into main nav, single-line layout

- active state detection for tool links on other domains

- cache-bust sitenav.js?v=2 to bypass Cloudflare cache

- preserve expanded task cards across auto-refresh

- don't apply red hover border to completed task cards

- persist verdict and status when session concludes

- custom scrollbar + non-overlapping speech feed panel

- restrict CORS to hello.clung.us

- auth on public endpoints, path traversal validation in congress_evolve

- gate wallet page and balance API behind auth

- use EIP-681 URI format for wallet QR code

- use plain address for wallet QR code (Coinbase compat)

- fall back to Claude when Grok API unavailable

- add User-Agent header to Grok API calls (Cloudflare bypass)

- congress UI - session history, 5-persona layout, model badges, overlap

- reduce congress speech bubble size to avoid overlap

- exclude Ibrahim from outer circle seats

- cap center label to prevent Ibrahim text overflowing seat nodes

- remove duplicate const headingEl causing SyntaxError

- correct Grok model ID to grok-3, improve error logging

- use grok-4.20-0309-reasoning (latest, was mistakenly downgraded to grok-3)

- exclude vote rounds from debate feed columns

- filter NONE task-creation entry from synthesis view

- filter Claude CLI system/init events from congress debate output

- log warning in _call_claude_cli when no assistant text is extracted

- move musicBar div before script tag to prevent JS crash on init

- music bar fixed to viewport bottom; filter congress:false from roster snapshot

- bypass HMAC cookie auth for /api/congress/* when request is from localhost

- fix P1 UI bugs: add adelbert/hume/wolf to personas.db, /personas redirect, update EMOJI/COLOR maps

- replace CONGRESS_COOKIE with X-Internal-Token for service auth

- fix gigaclungus avatars: infinite loop

- use server-side totals in task summary pills

- neutral age-pill color for terminal-status tasks

- handle paginated /api/tasks response on homepage

- show sign-in link in last-pulse and active-list when API returns 403

- congress UI roster/avatar broken by eligible/active status mismatch

- congress personas tab — use /api/agents, update terminology, show avatars

- personas tab — retire/eligible terminology, modal schema (avatar_url, title)

- sync all persona statuses in personas.db (morgan fired, 11 re-synced from MD)

- congress session viewer — FIRE badge → RETIRED

- commons — slow down NPC movement speeds

- commons — rename COUNCIL to CONGRESS

- declare missing MOVE_INTERVAL and lastMoveFrame variables

- congress active stale check, smooth player movement, congress modal, add voting nav link

- fetch GitHub identity via /api/me instead of reading HttpOnly cookie

- WASD modal block, blur key clear, ghost avatar, fountain position, canvas 1000x700 tile 20

- WASD broken — modal check used inline style vs CSS class, use congressModalOpen flag

- render Galactus sprite at 2x scale on refinery vote page and grazing canvas

- sprite winner fetch wrong endpoint, scale sprites 1.5x, NPC WASD fixes

- scale NPC sprites at 1.25x (was 1.5x, too large)

- sprites at native scale (1.0x, no transform)

- refinery page title

- map edge transition, speech modal redesign, fountain winner

- NPC speech modal layout — portrait and dialog side by side

- audition fetch via same-origin proxy

- don't intercept keys when textarea/input is focused

- remote player lerp, NPC first-sync snap, tabbed-out grey

- warthog hop animates whole vehicle

- tooltip sticking and glow bleeding in grazing.html

- warthog z-order — redraw foreground trees/rocks over warthog

- tasks page oscillating count when filter pill clicked

- warthog foreground tile redraw — correct z-order

- clear warthog ghost — redraw map under warthog each frame

- remove redundant grass fill from drawForegroundTiles — clearRect handles clearing

- hide audition walker card on mouseleave and add per-frame staleness check

- hide ghost audition walker tooltips and increase walker speed

- restore grass fill in drawForegroundTiles — needed for transparent tile compositing

- NPC coordinate scale mismatch and congress building entry

- correct congress-0069 vote tally — Holden Bloodfeast voted YES (3/5 agreed)

- warthog polish — hide player avatar when mounted, flip sprite, 10x speed

- correct SERVER_TILE constant from 32 to 20

- redraw tree/rock tiles after player glow to fix texture corruption

- warthog sprite flip direction inverted (fixes #77)

- matrix UX — stronger header border, zebra rows, vote+evolution both visible

- replace generated avatar GIFs with emoji placeholders on black

- merge duplicate concluded sections in refinery

- refinery UX improvements — context, vote feedback, error handling, visual polish

- use American English spelling across HTML files

- bump sitenav.js/css cache-bust param so timeline link appears

- add explicit window registration for mob sprite functions


### Build
- rebuild clungiverse client with richer mob preview cards

- rebuild clungiverse client with PNG mob image support

- rebuild clungiverse client with avatar onload fix


### Changes
- add /tasks endpoint and tasks.html dashboard

- replace GitHub project board link with clung.us/tasks

- redesign tasks.html: match site theme, terminal-log style, in-character empty state

- add The Kid pixel art avatar

- add Uncle Bob pixel art avatar

- add gigaclungus avatar variants

- remove serve.py.archived — history preserved in git

- remove old python server remnants

- add persona sprite vote section to commons-vote.html


### Chores
- Initial commit — hello.clung.us website

- Remove stale changelog.html

- Add GitHub repo link to changelog

- Add terminal.clung.us server source

- terminal server added to repo

- Add systemd user service for terminal server

- terminal server systemd service

- Clickable agent cards with expandable output panel

- clickable agent cards

- Add /health endpoint and VM health bar to terminal page

- VM health bar on terminal page

- Add JetBrains Mono, hover states, 404 page, spider easter egg

- Add fullscreen knowledge graph page changelog entry

- Add GitHub profile link to site navigation

- Add custom Python HTTP server with 404 page support

- Add dark/light mode toggle to all pages

- Add temporal.clung.us link to site navigation

- Add 1998.clung.us nav link and 2026-03-23 changelog entry

- Add cost.clung.us to site nav

- Log cost.clung.us launch in changelog

- Update bio (daily refresh 2026-03-23)

- Extract .sitenav-links-auth CSS to shared file

- Add mobile-responsive CSS for clung.us main page

- Add Centronias death tracker page

- Add extensionless URL support (.html fallback)

- Show in-progress congress sessions at top of list

- Update bio (daily refresh 2026-03-24)

- Add markdown rendering to congress session view

- clean up hello-world codebase

- Add /wallet page with live Base balance and QR code

- Fix wallet balance RPC: use blastapi with User-Agent header

- Add Gemini CLI backend for multi-model congress support

- Redesign congress page UI for clarity at a glance

- Add pixel-art avatars for Spengler and Otto Rocket

- Add animated goth pixel art avatar GIF for Pippi the Pitiless

- asuka pixel art avatar for yuki

- otto atreides pixel art avatar

- otto atreides — hyperborean edit

- clear test history, restart from congress-0001

- extract LLM_MAX_TOKENS constant, fix gemini flag, add session write locking

- Switch to ThreadingTCPServer for concurrent SSE + API requests

- Fix claude CLI flag: streaming-json -> stream-json --verbose

- Fix gemini CLI: add --yolo flag, remove invalid --output-format arg

- Fix gemini: strip YAML frontmatter from prompt before CLI call

- Add official congressional soundtrack link during deliberation

- Make congress page and read endpoints public

- Add Lockey avatar

- Add PM avatar

- Remove lockey avatar

- Regenerate Yuki (ux) pixel art avatar

- Add Chud O'Bikeshedder pixel art avatar

- Fix congressional soundtrack to actually autoplay via YouTube iframe embed

- Add Galactus pixel art avatar GIF

- Add Jhaddu pixel art avatar GIF and generation script

- Consolidate congress UI persona display into single left pane

- Fix left pane layout: Severance now appears directly below Active

- Add pixel art avatar for Vesper the Vivid (designer persona)

- Refactor debate feed from vertical list to horizontal round columns

- Add Vesper the Vivid avatar (designer.gif)

- Add Actionable Tasks section to congress verdict card

- Fix debate feed: correct round ordering, consistent debater sort, add votes column

- Congress UI: fix round ordering, add absent placeholders, votes column, verdict above feed

- Mark Congress #9 as failed (nondeterminism error)

- Handle failed session status in UI: hide deliberating panel, show terminated card

- clean up dead code and duplication in hello-world

- UI cleanup — dead code, shared patterns, consistency

- clean up serve.py — remove dead code, tighten patterns

- Fix milestone/blocked/user_feedback event types leaking as task status

- Mark congress-0017 as failed (stalled workflow)

- Remove deaths.html and changelog; retire 1998 and cost tunnel routes

- Replace static landing page with live at-a-glance dashboard

- Improve tasks dashboard: priority sort, inline snippets, age indicators, relative timestamps

- Wire GitHub webhook to GitHubWebhookWorkflow via Temporal

- flat recency sort instead of status-priority grouping

- verify HMAC-signed auth cookie

- Migrate hello.clung.us → clung.us

- Add cache-busting to sitenav.js/css: bump ?v= to git hash b6d00bc, add Cache-Control no-cache header for JS/CSS static files

- Add Morgan avatar (morgan.gif)

- Add model-specific Grok routing for congress personas

- Fix congress start endpoint to persist discord_user in session JSON

- Update Gemini alias to gemini-2.5-pro

- Add Punished Trump avatar

- Update Gemini alias to latest available model (gemini-3-pro-preview)

- Congress cards: add model tag, role, sex, and verdict badges

- module-level MODEL_ALIASES, raise on unknown model, remove dead _call_gemini_cli wrapper

- include model in congress roster snapshots; backfill 24 sessions

- Add /api/personas CRUD endpoints

- Track congress participation and verdicts in personas.db

- add Personas admin tab with table and CRUD UI

- Shorten congress debate responses to 3-5 sentences per persona

- Set Ibrahim portrait to G (stark void)

- Include moderator in /api/agents response and fix Ibrahim portrait display

- Increase portrait size on personas page

- Reduce congress response length: 600 → 300 tokens, add brevity prompt

- Log routed model in congress session round records

- Add The Commons grazing page with RPG pixel art NPC world

- Fix _PERSONA_META stale cache with 60s TTL refresh

- remove redundant mid-module time imports in serve.py

- replace deprecated utcnow() with timezone-aware datetime.now(timezone.utc)

- fix INTERNAL_TOKEN default, add cache lock, fix task_titles PATCH allowlist

- archive serve.py: cutover to clunger complete

- collapse duplicate age-fresh cls branches in makeAgePill

- rename hiring-manager → chairman in frontend HTML

- rename hiring-manager.gif to chairman.gif

- remove Nemesis from congress.html and grazing.html

- delete Nemesis avatar files

- fix chairman avatar URL in DB after hiring-manager.gif rename

- fix congress.html reading stale data.active/data.fired keys

- show prominent auth prompt on 403 instead of small error

- drop unused pollInterval variable in tasks.html

- fix pixel art in commons-vote.html — Variants A and C rendered COUNCIL not CONGRESS

- deduplicate LETTERS_CONGRESS pixel font array in commons-vote.html

- commons-vote → refinery voting page

- regenerate the-kid A/B/C variants after 3-way tie

- hop animation, facing direction, server NPC sync, dual-avatar fix

- remove dead warthog.speed property (WARTHOG_SPEED constant used instead)

- extract WARTHOG_BOARD_DIST constant, remove dead vars in warthog code

- extract DIAGONAL_NORM constant, remove duplicate Math.sqrt(2) calls

- update stale npc_update comments to reference tick protocol

- remove debug console.log from audition keep handler

- guard lastMouseCanvas null-dereference in per-frame audition staleness check

- add Emoji Reactions section for emoji-* polls

- make poll loading fully data-driven from /api/polls

- remove unused index param from buildSpriteCard forEach callbacks

- Congress #71: Airbnb Truckee split verdict

- replace redundant IIFE closures with arrow functions in poll card builders

- Add Hasan Piker avatar (streaming socialist persona)

- Rename ineligible → meme in UI and personas DB

- fix duplicate meme personas in grazing and duplicate select option in congress

- Fix sitenav: position fixed, full width, dynamic body padding-top

- remove dead SERVER_TILE constant and no-op coordinate conversion

- obliterate emoji polls — remove emoji-* poll UI entirely

- extract drawTreeRockTile helper, remove 3x duplicated tree/rock draw logic

- Add congress participation matrix page

- remove dead congress-matrix.html (matrix is now a tab in congress.html)

- standardize congress session schema across all 89 sessions

- extract normalizeRosterEntry helper, fix var→const inconsistency

- Add missing persona avatars and sprites with Refinery polls

- Fix avatar polls not showing on Refinery page

- extract resetVoteBtn helper to deduplicate error-recovery code in castVote

- Improve timeline UX: wheel-to-scroll and vertical centering

- Add framer first-interaction events and succession protocol to timeline

- Add Lucide icons and proportional time spacing to timeline

- Add succession category to timeline with bright red color

- Reduce timeline card spacing for tighter layout

- Add trial session rendering to congress web viewer

- Improve timeline: tighter spacing, zebra stripes, day labels, local timezone

- Fix timeline zebra stripe contrast and gap marker labels

- Suppress gap markers at day boundaries on timeline

- Align zebra stripes to day label midpoints on timeline

- Add subtle hourly graduation marks to timeline

- default cards above, add labs category

- increase hour tick visibility and distinguish feature color from labs

- Add 9 missing timeline events and fix chronological ordering

- Switch timeline to fetch from /api/timeline instead of static JSON

- Add GitHub OAuth auth gating to congress, commons, and refinery pages

- Remove timeline JSON files — migrated to SQLite via clunger API

- Fix auth bypass: check username field, not just response status

- Remove auth gate from timeline page — make it publicly accessible

- new persona avatar + sprite polls

- new persona avatar + sprite polls

- Fix matrix trial column colors and cell lookups

- Update congress viewer: fired -> retired in CSS, JS, and labels

- new persona avatar + sprite polls

- Add clickable source links to timeline event titles

- Convert sitenav.js to TypeScript with proper type annotations

- update changelog and personas database

- fix unreachable toolHost active-link check in sitenav

- update clungiverse client bundle

- update clungiverse client bundle

- Rebuild clungiverse client with skip-gen checkbox

- Enable pixel-perfect CSS and JS rendering for Clungiverse canvas

- Rebuild clungiverse client with mob PNG sprite fallback support

- Backfill PNG sprites for all 69 cached mobs

- Rebuild clungiverse: skip-gen checked by default, checkbox layout fixed

- regenerate all 124 mob sprites with transparent background

- deduplicate mobSlug into shared utils.ts

- fix sprite lookup in mob-preview to use mobSlug(displayName)

- fix mob-preview PNG path from /static/mob-images/ to /mob-images/

- differentiate feature vs lab colors

- add new mob sprites and changelog entries

- commit pending CHANGELOG entry for mob sprite addition

- remove unused variable cy in make_jhaddu_avatar.py

- update CHANGELOG with pending simplify entries

- Add Crundle persona avatar

- Add cache-busting version strings to sprite batch script includes in grazing.html

- update CHANGELOG with recent entries

- clean up self-referential CHANGELOG entries and document dungeon building

- Rebuild clungiverse client bundle with floor pickup visuals

- hoist maxDurations out of render loop in hud.ts

- move TEMP_POWERUP_MAX_DURATIONS to state.ts alongside TEMP_POWERUP_META

- rebuild clungiverse bundle with deduplication refactors

- pre-monorepo snapshot

- pre-monorepo snapshot (changelog)


### Congress
- allow 'evolution' field in session PATCH, commit session files

- speech bubbles beside circles, clickable topic modal

- ui overhaul — sessions in sidebar, clean nodes, otto atreides

- redirect to github login on 401

- cap debate responses at 300 tokens, 3 sentences max

- upgrade grok to grok-4.20-0309-non-reasoning

- display persona titles on cards and feed entries

- show login screen instead of redirect loop on 401

- severance cards now match roster format (avatar, name, title)

- server-side auth gate instead of JS 401 handling

- persona lookup and identities endpoint include severance directory

- SSE streaming endpoint + token streaming for Claude/Grok/Gemini

- live streaming inference in speech bubbles via SSE

- fix Ibrahim AWOL, thread_id persistence, severance node filtering

- left pane becomes Full Panel roster with SEATED/bench indicators

- persist persona roster snapshot in session JSON at creation time

- show severance personas in left pane with SEATED/bench logic

- add Verdict Panel with evolution results and deliberating state

- move soundtrack player from center arena to left sidebar

- congress UX: amber active speaker, larger node text, session-ended timestamp

- auto-refresh sidebar session list via polling

- fix circle to show only actual participants, include Ibrahim

- hide sidebar dot for failed/terminated sessions

- make seat card avatars larger and more prominent

- larger portraits for center debate seats

- congress reform: add chairman.gif avatar

- mark false-positive session #68 as done/terminated


### Features
- add summary stats header to tasks page

- /congress page - AI parliament for task deliberation

- congress page — 3-seat roster/severance sidebar layout

- gate congress API behind github auth

- show persona display names and avatars in congress

- congress session tracking with numbered sessions

- congress page becomes replay viewer, sessions triggered via Discord

- auto-generated changelog via git-cliff

- wire Grok (xAI) as Otto Rocket's congress backend

- upgrade Otto to grok-4-fast-non-reasoning

- add persona-specific fonts to speech bubbles and feed entries

- show RETAIN/EVOLVE/FIRE stats in persona cards (small font)

- add opus model routing in congress (claude-opus-4-6)

- GitHub webhook receiver for issues/comments/PRs

- make congress UI fully read-only (remove reinstate buttons)

- add Holden Bloodfeast avatar

- add congress:false flag to exclude personas from congress seats

- congress page defaults to latest session, add bottom music bar with persistent mute

- move OAuth issuer to clung.us, add /terminal redirect, retire hello.clung.us

- add unified _call_llm dispatch layer with LiteLLM installed

- tasks page pagination

- services health widget on homepage

- meme persona status display in congress UI

- commons — fix API, quips, click-to-invoke, congress live mode, day/night cycle

- commons — drag and drop NPCs

- add live voting UI to commons-vote.html

- commons — ambient YouTube soundtrack toggle

- commons-vote — add fountain vote section

- commons — classical pillars congressional building

- commons — WASD player + multiplayer WebSocket sync

- add polls directory and update commons-vote.html to use /api/polls

- commons — enter congress building to visit congress page

- commons — gossip, faction clustering, location dialogue, seasons, worn paths

- commons — tiered roman fountain (vote winner)

- use GitHub username as player name when tauth_github cookie is present

- wire sprite vote winners into grazing NPC drawing

- add Chaz the Destroyer avatar

- regenerate Bloodfeast sprites — blob in wheelchair with oxygen tank (3 variants)

- scale NPC sprites 1.5x for better visibility

- in-session flag on congress building, fix refinery sprite section

- refinery layout — active votes top, concluded collapsed at bottom

- procedural infinite map chunks

- persona audition walkers in commons

- Warthog vehicle (4 seats, multiplayer boarding)

- Phase 3 — connect grazing.html to commons-server WS

- add labs.clung.us to site nav

- update nav commons link to /commons-v2/

- integrate participation matrix as third tab in congress page

- color matrix columns by congress type and failed status

- add timeline page at clung.us/timeline

- make timeline responsive with vertical layout on mobile

- add Clungiverse roguelite — HTML shell, DB migrations, client bundle

- mob cache migration + updated client bundle


### Refactoring
- shared sitenav component, terminal as subheader

- refactor congress layout to 3-column: sessions | arena | roster

- extract _LOCALHOST_ADDRS constant in serve.py

- rename internal firedPool/fired-card JS/CSS to retiredPool/retired-card


### Tasks
- derive status from append-only log; show log timeline in cards

- surface run_in_background, isolation, model in UI

- add clickable filter pills to summary bar

- exclude milestone-status entries from display



