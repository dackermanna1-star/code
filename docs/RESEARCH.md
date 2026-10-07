# About this recreation

This is an unofficial, non-commercial recreation of ROBLOX as it was in 2008: the website, the catalog and avatar, and the game client with a few classic places. It was built from archived 2007–2009 pages, the 2008 client files, and other period sources (listed at the end).

The goal is to look and play like 2008 without inventing history. Every part of the recreation is one of three kinds:

- **Verified:** taken from an archived 2008 page, a 2008 client file, or a source that documents it. Examples are page layout, CSS, item names and prices, and engine constants.
- **Reconstructed:** the original was not archived or could not be found, so it was rebuilt in the period style. The game maps, The Mummy, and the front-page trailer are reconstructed.
- **Fictional filler:** the ordinary members, forum threads, messages, comments and user-made clothing. These are invented in the style of the era and are not presented as real.

## What is and isn't original material

- **Images:** no original ROBLOX image files are included. Every site image (logo, banner, icons, badges and Builders Club cards) is a new drawing made by `public/dev/imagegen.js`, using the archived images only as visual reference. Thumbnails are rendered live by this recreation's own 3D engine.
- **Sounds:** no 2008 sound files are included. The 2008 sound files were measured (pitch, length and spectrum) and every sound is synthesized in the browser to match (`public/js/engine/Sound.js`).
- **Fonts:** Comic Neue (SIL OFL) stands in for Comic Sans MS when that font is not installed.
- **Stylesheet:** `public/css/AllCSS.css` is the site's July 2008 stylesheet, recovered from archived copies with the Wayback Machine prefixes removed. It is the one piece of original site code used, because the layout depends on it.
- **Hats, clothing and T-shirts:** these are modelled or drawn from scratch. They follow the archived catalog thumbnails and descriptions, not the original meshes and textures.

## The site's date

The site lives in 2008. Its clock starts at **Monday, September 1, 2008, 9:00 AM Pacific** when the database is first created, and then runs at normal speed (`src/clock.js`). Every "Updated 4 hours ago", join date, message time and daily allowance uses that clock. Delete `data/` to start over.

September 2008 was chosen because it is late enough to include everything that 2008 added (comments on places, Shirts and Pants, the new character page) and it matches the date of the archived Games page used for the game list.

## Website

### Verified
- **Page structure and styling:** the header (banner, logo, "Logged in as… | Logout", age and chat-mode line, alerts and the Play Now button), the navigation bar and the footer legalese, from the July and September 2008 archived home pages and AllCSS.
- **Front page:** "ROBLOX Virtual Playworld / ROBLOX is Free!", the three points ("Build your personal Place", "Meet new friends online", "Battle in the Brick Arenas") and their text, Member Login with Login and Register, the builderman figure, "Works with your Windows PC!", Download and Play, and Cool Places.
- **Sign-up and login:** "Sign Up and Play / Step 1 of 2" with the age-group choice, name and password rules, and chat mode, following 2007–2008 copies of the sign-up pages.
- **Profile page (User.aspx):** the owner's "Hi, Name!" box, Badges, Statistics, Showcase with Visit Online and Visit Solo, Friends, Favorites and Stuff, from archived 2007–2008 profiles.
- **Games page:** the Most Popular, Top Favorites and Recently Updated modes and time filters. The listed game titles, creators and counts come from a September 2008 capture and the 2008 Games-page screenshot supplied with the brief.
- **Place pages:** Visit Online and Visit Solo, the Games and Commentary tabs, and the server list with Join. Comments on places arrived on April 2, 2008.
- **Join dialog** wording: "Requesting a server", "Waiting for a server", "A server is loading the game", "The server is ready. Joining the game...", and the error messages (from a revival template built on a July 2008 page).
- **Catalog and Item pages:** the categories, browse modes, the five-wide grid, the item page with Buy with Tx or R$, the purchase pop-up, Favorite and comments.
- **Character page:** "My Wardrobe", the colour-chooser body diagram with the 32-colour classic palette, and "Currently Wearing".
- **Inbox, private messages and friend requests;** Edit Friends; Account Balance with earnings by period.
- **Economy:** ROBUX and Tickets; 10 Tickets per day for logging in; Builders Club pays 15 ROBUX per day; Builders Club costs $5.95 a month, $29.95 for 6 months or $57.95 for 12 months; the Builders Club Hard Hat; no ads for members.
- **Forum:** the ASP.NET Forums skin and the 2008 forum group and forum names.
- **Parents pages, Help, and the news blog** (the "ROBLOX Developers' Journal" post titles, dates and authors).
- **Badges** and their 2008 descriptions.
- **The leave-your-place dialog** in the client: "You are about to leave your Place. Do you wish to save changes…", with Save, Don't Save and Cancel and their explanations (the 2008 client's Upload page).

### Reconstructed or simplified
- News posts show only their real titles, dates and authors. The short summaries are this recreation's own wording and are marked as such.
- Terms, Privacy and Contact pages are abridged. Payment is simulated: "Activate Builders Club" turns membership on with no real payment.
- House ads use the 2008 ad sizes but advertise the recreation's own pages.
- The front-page trailer was a Flash movie (PlayTrailer.swf) that was not archived. Its box shows a short in-engine scene instead, captioned with the three front-page points.
- Games listed on the Games page that are not playable here reply with the real 2008 message "There are no game servers available at this time. Please try again later". Their thumbnails are simple brick scenes suggested by each title.

### Deliberately left out (not 2008)
Ratings and voting: 2008 pages show only how many times a place was Visited and Favorited (the profile "Voting Accuracy" stat belongs to later profiles). Groups, statuses, the feed and best friends (July 2009); user-made badges (2009); faces in the catalog (January 2009); gear (May 2009); hair (June 2009); trading and the currency exchange (late November 2008, after the site's start date); /My/Home.aspx (2009 or later).

## Catalog and avatar

### Verified
- **Hats:** ROBLOX-made hats sold in 2007–2008, with their real names, asset IDs and release dates. Prices come from the archived December 29, 2007 catalog or the ROBLOX wiki. Prices that could not be confirmed are marked "unverified" in the data and came from Super Nostalgia Zone's 2008 item table. Item descriptions are shown only where the original text was found; the others are left blank instead of invented.
- **T-shirts:** the 20 ROBLOX-made T-shirts on sale in December 2007, with their prices and the archived look of each design.
- **Shirts and Pants:** the clothing update of April 24, 2008, the 585x559 template, and staff items such as Battle Shirt and Pants of Awesomeness and Grey and Red Wizard Robes.
- **T-shirt rules:** a T-shirt is a single decal on the front of the torso, drawn over a Shirt.
- **Avatar:** the R6 body only (head, torso, two arms, two legs), the 2008 default face (the only face in 2008), and the 32 classic BrickColors. New accounts get a yellow head and arms, a random torso and blue legs.
- **Catalog thumbnails:** T-shirts appear as a flat white shirt with the design on it; hats appear on their own with no head.

### Reconstructed
- The hat models are rebuilt from primitive shapes. They follow the archived thumbnails where those were seen (Lampshade, Mouse Ears, Ribbons, Firefighter Helmet, Screw, Sapling, Headstack, Headrow, Hammerhead, the textbooks, Satellite Dish, T-Bone Visor, Game Input Device and others), and the descriptions otherwise. The Mushroom Hat's archived thumbnail was blank, so its colours are a guess. The 2008 ROBLOX Visor uses the 2007 visor's look.
- All T-shirt, Shirt and Pants pictures are new drawings that follow the archived thumbnails.
- Builderman's colours are sampled from the 2008 front-page figure.

## Game client

### Verified (2008 client files, Super Nostalgia Zone, period scripts)
- **HUD layout:** the top menu (Tools, Insert, Fullscreen, Help…, Exit), the Player List (grouped by team), the vertical health bar, the numbered backpack, the camera buttons, the Report button, Safe Chat (the original phrase tree from the 2008 safechat.xml), and the chat log in the "Name; message" style. In 2008 these were drawn by the engine; there were no scripted GUIs.
- **Message and Hint:** a Message is a full-screen grey box with text; a Hint is a black bar at the **bottom** of the screen.
- **Joining:** "Connecting to server...", a live "Bricks: N   Connectors: M" counter, then "Requesting character..." and "Waiting for character...".
- **Controls:** WASD and the Up and Down arrows walk; the Left and Right arrows turn the camera; right-drag rotates the camera; I and O or the mouse wheel zoom, with first person when zoomed all the way in; "," and "." snap the camera 45°; Page Up and Page Down tilt it 15°. The camera does not follow behind you.
- **Physics:** gravity 196.2 studs/s², walk speed 16, jump 50, no turning in mid-air, climbing ladders made of rungs. Trusses did not exist until 2009.
- **Character:** the 2008 Animate script's arm and leg swings (walk, idle, jump, fall, tool hold, slash and lunge), name colours, ForceFields drawn as pulsing blue-to-red outlines, falling apart on death, respawn after 5 seconds, and team colours (torso in the team colour, black arms and legs).
- **Classic tools,** using the numbers from the original scripts: Sword (5, 10 and 30 damage, lunge), Rocket Launcher, Superball, Slingshot, Paintball Gun (20 damage, recolours light bricks), Trowel and Timebomb. Build HopperBins: Grab, Clone and Delete.
- **Explosions:** blast radius 4, joints break and parts fly; an orange fireball burst.
- **World look:** studs on top and inlets on the bottom, Medium stone grey default parts, the 2008 sky (peach clouds over a sea of clouds), strong ambient light, no fog and no materials. SpawnLocations are 6x1.2x6 plates with the spawn decal.
- **Sounds:** each sound is synthesized to match the measured 2008 file (death "uuhhh", jump, footsteps, sword, rocket whoosh, explosion, superball boing, slingshot, paintball, trowel bass, and the camera click).

### Reconstructed or simplified
- Other players are simulated (bots). This recreation runs in a single browser, so there is no real server.
- The ForceField look, the name tags and the explosion particles follow Super Nostalgia Zone's recreation of the 2008 client.
- Shadows (2008 had stencil shadows) and part bevels are not drawn.

## The games

### Dodge The Teapots of Doom! (clockwork, place 44814)
- **Verified:** a large gray platform with splits, and walls and bricks to hide behind. Giant teapots (a Utah teapot mesh) spawn, bounce around and kill on touch. "Do not stand where there is no visible ground"; that also kills you. Reaching the end sends you to the yellow platform above everything and makes the teapots harder; if nobody makes it, they get easier. The place's real description is used.
- **Reconstructed:** the exact layout, the teapot sizes, colours and spawn rate, the level numbers, and the wording of the "made it" message.

### Ultimate Paintball CTF (miked, place 47828)
- **Verified:** two castles on opposite sides; a white piece of ground in the middle that is unanchored, so explosions knock it loose; brown barriers ringing the map; a river with a bridge; a rocket launcher floating down the river; Red against Blue; 10-minute rounds; "join reds" and "join blues" in chat; team chat starting with % or /t. Points: a kill is +10, dying is −4, standing on the white ground is +2 every few seconds, and a flag capture is 10 × the enemy players + 6 × your own team's players. Grenade kills score nothing. miked's gun: Q cycles Standard, Sniper (one-hit) and Blast (3 pellets, slower reload), 50 damage per pellet, R throws a paint grenade, and there is no on-screen mode display.
- **Reconstructed:** the geometry, the castle colours, the spawn positions, the "Points" stat name, the message wording and the exact gun numbers.

### The New Robloxian Obstical Course (Grand Opening) (legobuild)
- **Verified:** the title is a real listing on the 2008 Games page. The obstacles use only things a 2008 obby could contain: "lava" kill bricks (from the actual Rocket Arena script), fading platforms (Shedletsky's 2008 "Sweeper" cycle), a conveyor (an anchored part with Velocity), a spinning bar, ladders of rungs, team-coloured SpawnLocations, and tool givers.
- **Reconstructed:** the whole course, because its contents were never archived.

### The Mummy
- No 2007–2009 ROBLOX place called "The Mummy" could be identified. Everything here is reconstructed: a desert with a pyramid, a tomb, obelisks and palm trees, and an infection-tag round ("Choosing the Mummy...", a 120-second clock, explorers turned into mummies). It uses only 2008 features (teams, Messages and Hints). The creator account PharaohKing77 is fictional.

### Crossroads (ROBLOX, place 1818)
- **Verified:** ROBLOX's first multiplayer game; four sections (Thieves' Den, Lost Temple, Blackrock Castle and the Playground) joined by bridges; a red bar rotating in the Lost Temple; the starting tools.
- **Reconstructed:** the buildings inside each section.

### Desert Strike (not a 2008 recreation)
- Added on request as a user-made place. It deliberately uses modern effects that 2008 ROBLOX did not have: its own GUI and buy menu, physically based lighting, rag-doll deaths, blood effects, and detailed weapon models.
- The map, guns, factions and rules are original to this project. The weapons are modelled after real firearms (Glock 17, Desert Eagle, MP5, Remington 870, AK-47, M4A1, M249, M24), but their game statistics are invented for balance.

### Bank Heist (not a 2008 recreation)
- Added on request as a user-made place in the style of a modern heist game (a planning board with crew cuts, masks, hostages, a hacking minigame, a drilled vault, a police response in waves, a getaway chase and a results screen). Like Desert Strike, it uses modern effects on purpose, and it reuses Desert Strike's guns, viewmodel, ballistics and blood.
- The bank, city, crew, police and rules are original to this project. Names of businesses, crew members and products are made up (Robloxia-themed). The voices use the browser's speech synthesis, and all sounds and music are synthesized.

### Natural Disaster Survival (not a 2008 recreation)
- Added on request. The real game was made by Stickmasterluke in 2011, so it is outside the 2008 period. This version is a user-made place in its style:
  - an intermission in a sky lobby
  - a random map and a random disaster with a warning
  - a point for each survivor
- The five maps are original. Some take their names from classic NDS maps (Happy Home of Robloxia, Glass Office, Furious Fire Station, Lighthouse Point, Rakish Refinery), but every layout here is invented. Each fills the whole island with streets, buildings and props.
- The disasters' behaviour, timings and damage are invented for this project:
  - tornado, tsunami, flash flood, earthquake, meteor shower, volcanic eruption, thunderstorm, fire, acid rain and blizzard
- **Gojo vs Sukuna** is a fan-made extra disaster added on request. It uses the two Jujutsu Kaisen characters and the names of their techniques: Blue, Red, Hollow Purple, Infinity, Unlimited Void, Cleave, Dismantle, Fuga, Malevolent Shrine and the World Cutting Slash.
  - The fighters are classic R6 rigs with added hair and clothing parts.
  - Everything else is made for this project: the shrine and the effects, the synthesized sounds, the fight script and the damage numbers.
  - Their lines are short quotes and paraphrases, spoken with the browser's speech synthesis.
- **Total Chaos** is another extra disaster added on request: a poop storm, then killer clowns, then a black hole. It is entirely original.
  - The killer clowns are ordinary R6 characters with painted faces and knives, driven by a simple chase brain.
  - The poops, the black hole and the circus music are all generated in code.
- Buildings are anchored classic bricks merged into a few meshes per area. A disaster breaks bricks loose one at a time, and loose debris is capped.
- With thousands of anchored parts, cannon-es's SAP broadphase and dense collision matrix grew with the square of the part count. The place therefore uses a grid broadphase for static bodies (`public/js/engine/broadphase.js`). Every place now uses a sparse collision matrix.

### MEGA OBBY (not a 2008 recreation)
- Added on request: a big, difficult obby with 32 stages, in the style of the long obbies made after 2008. The course, stage names, zones and rules are all original to this project. Trusses (2009) are used, and the place uses its own GUI, skies, fog and particles.
- Every jump on the course is checked when it is built against what a character can do (walk speed 16, jump power 50, gravity 196.2), so all of it is passable. Moving obstacles run from the clock, so they are the same every time and can be timed.
- The simulated players follow a route that each stage writes as it is built (walk, jump, climb, ride, wait for the moment). Each bot has a skill level that sets its reaction time, how often it hesitates, and how often it mistimes or misjudges something. Bots remember which glass panels broke and get more careful where they died before.
- Players pass through each other on this course, as in most modern obbies.

### Escape the Haunted Hotel (not a 2008 recreation)
- Added on request: a single-player, first-person horror game in the style of the horror games made long after 2008. The Ravenhurst Hotel, its 1952 fire, the Night Manager (Edmund Hale), the notes and every line of dialogue are original to this project.
- The game draws its own picture rather than using the 2008 look:
  - Textured physically based materials, lit only by the hotel's own lamps and a shadow-casting flashlight.
  - A small pool of real lights is handed to the lamps nearest the player each frame.
  - Tone mapping, film grain and a vignette.
  - Its own interface (the 2008 game HUD is hidden).
- Every texture is drawn in code on canvases: the wallpapers, carpets, marble, tiles, paintings, signs, notes and the porcelain mask.
- Every sound is synthesized with WebAudio and placed in 3D: the storm, footsteps for each floor surface, doors, the lift, the telephone, the music box, the piano and gramophone, the chase music, and his footsteps, breathing and scream. The voices on the telephone and the tannoy use the browser's speech synthesis, with subtitles.
- The Night Manager:
  - His body is built from separate parts and posed procedurally every frame.
  - He moves around a graph of points through the corridors and rooms and finds his routes with A*.
  - What he sees depends on line of sight, your light and your flashlight. What he hears depends on your footsteps (by surface and gait), doors and your breathing.

### The Elevator (not a 2008 recreation)
- Added on request: an elevator game in the style of the "elevator" games that came after 2008 (the idea goes back to Elevator: Source, a 2010 Garry's Mod map, and the ROBLOX elevator games that followed). The building, the thirty floors, the passengers and every line of dialogue are original to this project.
- One elevator car stays put. Each floor is built in front of its doors while they are shut and taken down again after they close, so only one floor exists at a time. The car's indicator counts through the floor numbers while it "travels".
- Each floor is a small script with its own sky, light, fog, sounds, music, hazards, a bonus, and something that happens as the doors close. The kit they share merges their bricks into a few meshes and tracks every part, model, light, sound and timer so a floor can be removed cleanly.
- All sound is synthesized with WebAudio, including the elevator music (a small step sequencer plays the bossa nova muzak and each floor's tune).
- The other players are bots with a bravery, a chance of dawdling and a chance of jumping a lot. They walk out through the doorway, visit a few places on the floor, say something about it, and usually come back in time. Some floors steer them (going for the idol, running from the dinosaur).

### Personal places
- **Verified:** the three starting templates (Happy Home in Robloxia, Starting BrickBattle Map, Empty Baseplate), the Tools and Insert menus in your own place, and the save-on-exit dialog.

## Sources

### Archived pages and site files (read directly)
- ROBLOX-2008: logged-out home (Wayback, 2008-07-08) and AllCSS (2008-07-24): https://github.com/cooldude12345678907/ROBLOX-2008
- Venom (Wayback mirror, about 2008-09-09: home, Games, Catalog, images): https://github.com/VenomDevelop/Venom
- early08 (saved roblox.com pages, November 2007 to December 2008: catalog, item, profile, character, inbox, account balance, Builders Club): https://github.com/Legacy95-ctrl/early08
- arceuss archive copies (2008 home page, 2007 profile, March 2008 blog): https://github.com/arceuss/arceusisafish.github.io
- Revival templates built on 2007–2008 Wayback pages (used for structure and wording only): https://github.com/gragrastudios/Rust-Roblox-Revival , https://github.com/stupiperso/rblx07STUPIDS , https://github.com/guio13233/2006-Roblox-Website

### 2008 client files and scripts
- June 2008 client and content: https://github.com/nooblox601/YetiBlox2008
- March 2009 client content, including the original safechat.xml: https://github.com/Hyena-LC/RBXLC-1.19.b16
- The original classic weapon scripts: https://github.com/pizzaboxer/rbxlinkedscripts
- Novetus (2008 join script, settings and classic colours): https://github.com/Novetus/Novetus_src
- ROBLOX's own open-sourced classic places (Rocket Arena, Glass Houses, Haunted Mansion, Rocket Fight Advanced and others): https://github.com/Roblox/Old-Open-Source-Levels
- Old place files: https://github.com/MisoNotSoupx/Old-Roblox-Place-Archive

### Recreations used for comparison
- Super Nostalgia Zone, a 2008 recreation by MaximumADHD (HUD, messages, camera, force fields, explosions and 2008 item tables): https://github.com/MaximumADHD/Super-Nostalgia-Zone
- ROBLOX creator documentation (Message, Hint, Humanoid and SpawnLocation defaults): https://github.com/Roblox/creator-docs

### Wiki, review and social pages (search-engine excerpts)
- ROBLOX wiki timelines for 2007, 2008 and 2009, and pages on Tickets, Builders Club, classic clothing, faces, badges and the death sound: https://roblox.fandom.com/wiki/Timeline_of_Roblox_history/2008
- Catalog item pages for each hat, for example: https://roblox.fandom.com/wiki/Catalog:Teapot_Hat
- Dodge The Teapots of Doom: https://www.roblox.com/games/44814 , https://roblox-classics.fandom.com/wiki/Dodge_The_Teapots_of_Doom! , https://roblox.fandom.com/wiki/Player:Clockwork/Dodge_the_Teapots_of_Doom
- Ultimate Paintball: https://roblox.fandom.com/wiki/Player:Miked/Ultimate_Paintball , https://swordsmenike.wordpress.com/2008/05/02/roblox-review-mikeds-ultimate-paintball-ctf/ , https://thebrickbulletin.wordpress.com/2009/02/18/mikeds-ultimate-paintball-a-review-by-terrorking/ , https://newsonroblox.wordpress.com/2009/03/28/ultimate-paintball-review/
- Obbies: https://roblox.fandom.com/wiki/Class:TrussPart (trusses arrived April 24, 2009) , https://rbxlegacy.wiki/index.php/How_to_Make_Conveyor_Belts
- Crossroads: https://roblox.fandom.com/wiki/Player:Roblox/Classic:_Crossroads
- Stencil shadows in 2008: https://x.com/MaximumADHD/status/1126657060630822917

ROBLOX is a trademark of Roblox Corporation. This project is not affiliated with or endorsed by Roblox Corporation.
