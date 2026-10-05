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
