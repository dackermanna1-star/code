# ROBLOX, circa 2008: a recreation

An unofficial, non-commercial recreation of ROBLOX as it was in 2008. It has the website, the catalog and avatar, and the game client with playable classic places. Everything runs locally from one Node.js server with no dependencies; the game runs in the browser.

What is verified from 2008 sources and what is reconstructed is documented in [docs/RESEARCH.md](docs/RESEARCH.md). The same notes are on the site's footer link "About this recreation & sources" (`/info/Recreation.aspx`).

## Running it

You need Node.js 18 or newer.

```
npm start                # http://localhost:8080
PORT=3000 npm start      # another port
```

The first start creates `data/db.json`. The site's clock starts on September 1, 2008, and runs forward from there. Delete `data/` to start over.

**Demo account:** `Robloxian2008`, password `roblox`. You can also sign up for your own account from the front page.

**Free ROBUX and Tickets:** stop the server (Ctrl+C), run `npm run give` (1,000,000 of each for Robloxian2008) or `npm run give -- YourName 5000 2500`, then `npm start` again.

## What's there

**Website**
- Front page and Games page.
- Place pages with Visit Online and Visit Solo.
- Catalog with Buy using Tickets or ROBUX.
- Character page: wardrobe and body colours.
- Profiles, friends and friend requests, inbox and private messages.
- Builders Club (the payment is simulated), Parents pages, Forum, News and Help.
- Daily Tickets, earnings and badges.

**Games:** click Visit Online on a place page.
- **Dodge The Teapots of Doom!**: reach the red pad at the end alive.
- **Ultimate Paintball CTF**: Red against Blue. Capture the flag, and hold the white ground in the middle.
  - Q changes the paintball gun's mode; R throws a paint grenade.
  - Say "join reds" or "join blues" in chat to switch teams.
- **The New Robloxian Obstical Course (Grand Opening)**: an obby.
- **The Mummy**: survive until the clock runs out, or catch everyone if you are the Mummy.
- **Crossroads**: classic brickbattle with all the 2008 tools.
- **Desert Strike [BETA]**: a modern-style team shooter (Coalition vs Militia) in a desert town, made by Robloxian2008. It is not a 2008 recreation.
  - You start with a Glock and earn cash per kill to buy guns and attachments: press **B** for the armory. Unlocks are saved in your browser.
  - Click the game to use the mouse, click to shoot, **E** to aim down the sights, R to reload, Shift to sprint, 1/2 to switch guns.
- **Bank Heist [BETA]**: rob the First Robloxia Bank, made by Robloxian2008. Like Desert Strike, it is a modern-style game, not a 2008 recreation.
  - Plan the job first: pick a gunman, hacker and driver (better crew members take a bigger cut), your guns, mask, armor and difficulty.
  - Walk in like a customer. If nobody sees you, you can steal the manager's keycard and cut the silent alarm for a head start and a bonus.
  - **G** puts your mask on, **F** shouts at the hostages to keep them down, hold **E** to grab loot and use things (tap **E** to aim), R to reload, Shift to sprint, M to mute.
  - Get through the STAFF ONLY door, hack the vault gate, drill the vault while the police (and later SWAT) attack, bag the cash and gold, and leave by the back door. Then shoot the police cars and helicopter from the back of the van until you reach the tunnel.
  - Your cut goes into a heist account saved in your browser, and a little of it goes into your Desert Strike cash.
- **Natural Disaster Survival**: wait in the sky lobby, then get dropped onto one of five maps and survive the disaster. Survivors score a point. This is a user-made game in the style of the 2011 original, not a 2008 recreation.
  - Each map fills the whole island:
    - Happy Home of Robloxia: a suburb.
    - Glass Office: downtown, with a tower, shops, a bank, a church, flats and a parking garage.
    - Furious Fire Station: a small town with a town hall, a police station and a diner.
    - Lighthouse Point: a fishing village with a headland, a beach and a pier.
    - Rakish Refinery: tanks, cracking towers, a warehouse and a container yard.
  - There are twelve disasters: tornado, tsunami, flash flood, earthquake, meteor shower, volcanic eruption, thunderstorm, fire, acid rain, blizzard, **Gojo vs Sukuna** and **Total Chaos**. Buildings break apart brick by brick.
  - **Gojo vs Sukuna:** the two fight all over the island at full speed. You're a bystander who has to survive their fight.
    - Gojo uses Blue, Red, Hollow Purple, Infinity and Unlimited Void.
    - Sukuna uses Cleave, Dismantle, Fuga and Malevolent Shrine.
    - Either of them can win.
  - **Total Chaos** runs three disasters back to back:
    1. A poop storm: giant poops fall from the sky, and winged ones dive-bomb people.
    2. Killer clowns with knives come out of the ground and hunt everyone down. Outrun them or get up high.
    3. A summoned black hole tears around the island and swallows everything, clowns included.
  - In the lobby, the **Pick the disaster** menu chooses the disaster and the map (or Random). Your pick stays set for every round, and **Start Now** skips the wait.
  - Read the warning. Get up high for floods and tsunamis, get inside for acid rain, blizzards and meteors, and get out into the open for earthquakes and fires. You can swim, but stamina and breath run out.
- **MEGA OBBY (32 Stages!)**: a big, hard obby that spirals up round the Mega Tower, made by Robloxian2008. Like the games above, it is a modern-style user-made place, not a 2008 recreation.
  - Five zones: Sky Meadows, Volcano Isles, Neon City, Frozen Peaks and the Cosmic Void. Each has its own sky, light and weather.
  - The stages include trampolines, truss towers, conveyors, crushers, crumbling and rising lava, fire spinners, laser gates, sliding and spinning platforms, elevators, a glass bridge (one panel in each pair breaks), a disco floor, swinging axes, an avalanche, blizzard gusts, a bobsled run, low gravity, an invisible path, a speed run, the Gauntlet and the Final Ascent.
  - Touch a checkpoint to save your stage. Fall or touch something deadly and you respawn there after two seconds. Press **R** to reset.
  - Reach the top to win. The timer and your deaths are shown, and the PLAY AGAIN pad starts a new run.
  - The other players have skill levels: good ones are fast and rarely fall, new ones hesitate, mistime things and die a lot, but they all get there in the end.
- **Escape the Haunted Hotel**: a single-player, first-person horror game, made by Robloxian2008. Like the games above, it is a modern-style user-made place, not a 2008 recreation. Best played with headphones, in the dark.
  - You wake in Room 313 of the Ravenhurst Hotel at 3:33 a.m. The power is out, the front doors are chained, and the Night Manager walks the halls. Get out.
  - The hotel has five levels:
    - The third floor: a long corridor of guest rooms, the Linen Room, the lifts, and a gallery over the atrium.
    - The service stairs.
    - The ground floor: the grand lobby under a four-storey atrium, the front desk, the manager's office, the kitchen and cold store, the restaurant and bar, and the ballroom.
    - The basement: the workshop, storage, the laundry and the boiler room.
    - The grounds outside.
  - The Night Manager:
    - He rides the lifts between floors. The dial over each lift shows where he is.
    - He hears footsteps (running is loud, crouching is quiet, carpet is quieter than marble), doors, and the bell.
    - He sees you more easily when your flashlight is pointed at him or you stand in the light. His eyes shine back in the beam, so a pair of lights at the end of a dark corridor means he's there.
    - Lights flicker when he's near.
    - Hide in wardrobes and lockers, and hold your breath when he checks them. If he sees you get in, hiding won't save you.
    - He doesn't take the stairs. Until the end, when he follows you anywhere and you have to outrun him to the front doors.
  - Notes around the hotel tell the story and give the clues: the key box code, where the three fuses are, where the bolt cutters went.
  - Checkpoints are saved in your browser, so **Continue** picks up where you left off. The title screen sets brightness, mouse sensitivity, volume and invert-Y.
  - Click the game to look around with the mouse. **WASD** walk, **Shift** run, **C** crouch, **E** use and hide, **F** flashlight, **Space** hold your breath while hiding, **R** change the batteries, **Tab** objective, **Esc** pause.
- **The Elevator**: ride an elevator that stops at strange floors, made by Robloxian2008. Like the games above, it is a modern-style user-made place, not a 2008 recreation.
  - Everyone boards in the hotel lobby. The doors close and the elevator goes up, stopping at ten random floors out of thirty, then the penthouse party, then back down to the lobby for the next ride.
  - At each floor the doors open for about half a minute. Step out and look around, but get back in before they close. A warning beeps for the last five seconds, and the doors bounce back if someone is in the way. Anyone left outside is pulled back in when the doors shut.
  - The floors: a beach (with a shark), the floor is lava, a disco with musical statues, a haunted hallway, a giant kitchen, the moon (low gravity, then a meteor shower), a gas leak, a cow field with a UFO, a waiting room where nothing happens, the void (the path falls away; a door stands at the end), a jungle temple (take the idol, then run from the boulder), an aquarium tunnel that cracks and floods, a snow day (snowball kids, a sled, a yeti), a robot factory, a library (no talking, no jumping), a retro arcade (eat the dots, avoid the ghosts), a dinosaur park, a circus (be the human cannonball), an office fire drill, sky islands, candy land (catch the Gingerbread Man), a construction site 400 floors up, the Wild West (hide at high noon), the inside of a computer, a pharaoh's tomb, a bowling lane where you are the pins, a hall of mirrors, a minefield, a museum whose statues move when you're not looking, and a pizza party.
  - Every floor has a bonus to find or win, and most have something that goes wrong as the doors close.
  - **Floors** counts the floors you survived (plus bonuses), **Rides** the rides you finished, and **Wipeouts** your deaths. Dying sends you back to the elevator.
  - Other passengers get on and off: a businessman, a skeleton, a man on fire, a grandmother, the pizza guy and more. The other players decide for themselves whether to step out, and some of them dawdle.
  - Click the buttons by the doors: **Open** holds the doors, **Close** hurries them, and the alarm bell annoys everyone. The floor buttons do nothing.
- **The Outbreak**: a survival game in the style of DayZ, made by Robloxian2008. Like the games above, it is a modern-style user-made place, not a 2008 recreation. It is single-player.
  - South Karevia is about two kilometres across: the port city of Morovsk, two towns, seven villages, farms, a castle on a hill, a lighthouse, a radio station, the Object 47 military base, Dolina Airfield and four bandit camps. Roads, a river and a lake join them up, with forests, fields, hills and mountains around them.
  - About 480 buildings: houses, cottages, flats, shops, a supermarket, a pharmacy, bars, offices, a school, churches, a hospital and clinics, police and fire stations, garages, warehouses, barns, barracks, hangars, a control tower and bunkers. Their interiors are furnished room by room (kitchens, living rooms, bedrooms, bathrooms, offices, classrooms, hospital wards, dormitories, armouries) as you come near.
  - You start on the coast with a shirt, jeans, a flashlight and one bandage. When you die, the character is gone for good. Your body stays where it fell with everything you carried, so you can go back for it. The game saves while you are alive.
  - Survival: food, water, stamina, blood, bleeding wounds, broken legs, food poisoning and sickness, cold, getting wet, and the condition of everything you own.
  - Looting: about 90 kinds of item. Each kind of building has its own loot table: food in kitchens and shops, medicine in the pharmacy and hospital, guns at the police station and the base. Clothes give you pockets, vests and backpacks give you more, and the inventory is a grid you drag things around in. Looted spots fill up again after a while.
  - Guns: pistols, an MP5, a pump shotgun, the AKM, the M4, the M249 and the M24, with magazines you fill with rounds, attachments (sights, a scope, a suppressor, a grip, a laser), fire modes, bullet drop and travel time, and jams in worn-out guns. Melee weapons, from a kitchen knife to a sledgehammer, have a light swing, a heavy swing and a block.
  - The infected wander the towns. They hear your footsteps and gunshots, see you in daylight more easily than at night, and bash through doors. Soldiers, police, doctors and civilians look different.
  - Bandits travel in groups of 2 to 4. They hold their camps and walk the roads, take cover, flank you and loot your body.
  - Events: helicopters crash and burn, with military loot and dead soldiers around the wreck. Cargo planes drop supply crates under parachutes, marked with red smoke. Road flares draw the infected.
  - Day and night, and weather: clear, cloudy, overcast, rain, storms with lightning, and fog.
  - **WASD** move, **Shift** sprint, **Ctrl** walk, **C** crouch, **Z** prone, **Space** jump, **Left mouse** fire or swing, **Right mouse** aim or block, **R** reload, **B** fire mode, **F** interact, **Tab** inventory, **M** map, **V** first or third person, **L** flashlight, **1–9** hotbar, **H** put away, **Esc** pause.
- **Your own place**: on your My ROBLOX page, click Edit under your place.
  - **Tools** gives the Grab, Clone and Delete build tools.
  - **Insert** adds bricks and the models you own.
  - When you exit, you are asked whether to save.

The other players in a game are simulated, because the recreation has no real multiplayer server.

**Controls**
- Walk: WASD, or the Up and Down arrow keys.
- Jump: Space.
- Turn the camera: the Left and Right arrow keys, or hold the right mouse button and drag.
- Zoom: I and O, or the mouse wheel.
- Tilt the camera: Page Up and Page Down.
- Snap the camera 45°: `,` and `.`
- Tools: number keys 1–9 and 0, then click to use the tool.
- Chat: `/`.

## Layout

```
server.js               HTTP server (static files + page router)
src/                    pages (src/pages/*), layout, database, seed data, economy, site clock
public/css/             AllCSS.css (the July 2008 stylesheet), site.css, forum.css, client.css (in-game HUD)
public/js/engine/       game engine: parts, physics, R6 character, camera, tools, HUD, sounds, hats, clothing
public/js/places/       the playable places and the templates
public/js/client.js     game window (join sequence, bots, saving)
public/js/thumbs.js     renders avatar/item/place thumbnails in the browser and caches them on the server
public/dev/imagegen.js  draws the site images in public/images (run: node tools/build-images.js)
docs/RESEARCH.md        sources, and what is verified vs reconstructed
```

Third-party code: three.js (MIT), cannon-es (MIT) and Comic Neue (SIL OFL). Their licences are in `public/js/vendor/` and `public/fonts/`.

ROBLOX is a trademark of Roblox Corporation. This project is not affiliated with or endorsed by Roblox Corporation, and it includes no original ROBLOX images or sounds.
