# LaptopCraft — a working laptop for Minecraft 1.21.11 (Fabric)

Place a **CubeBook laptop**, flip open the lid and boot **CubeOS**: a desktop operating system with
windows, a taskbar, a start menu, apps and games, and a **web browser** connected to an in-game
internet. On that internet you can shop on **Emerazon**, order food on **Ender Eats** and watch
videos on **BlockTube**. Whatever you buy really gets **delivered into your world**.

## Features

### The laptop
- A 3D laptop block with an animated, glowing screen. Right-click to open it; sneak + right-click to close the lid.
- **Your data stays on the laptop.** Files, settings and app data are stored in the block. When you break it, the item keeps everything, so you can carry your computer around.
- Each laptop has its own owner, wallpaper, theme and optional lock-screen password.
- Crafting recipe: 3 glass panes on top, then iron, redstone, iron, then 3 iron ingots.

### CubeOS
- Boot animation with a startup chime, then a lock screen showing your player face and the in-game clock.
- Draggable, resizable windows that you can maximize and minimize, with smooth animations.
- Taskbar with your wallet balance, unread mail, notifications and a calendar. Start menu with app search and power options (lock, sleep, restart, shut down).
- Desktop icons, right-click menus, notification toasts, and dark/light themes with 10 accent colors and 10 wallpapers.

### Apps
| App | What it does |
|---|---|
| **Settings** | Wallpaper gallery, theme and accent color, name, password, 24-hour clock, sounds, homepage, storage usage, "About this CubeBook" |
| **Notepad** | Text editor with File/Edit/Insert menus, keyboard shortcuts, undo/redo, word count and save prompts |
| **Calculator** | Standard and scientific modes, keyboard input, memory keys |
| **Files** | File manager: sort, search, rename, duplicate, delete. Also shows every order as a printable receipt |
| **CubeMail** | Inbox for order confirmations, delivery notices, bank alerts and spam from the "Prince of the Nether" |
| **Terminal** | `cubesh` with `ls`, `cat`, `echo > file`, `neofetch`, `balance`, `orders`, `calc`, `pos`, `weather`, `creepersay`, `matrix`… |
| **Clock** | Analog clock synced to the sun with moon phases, plus a stopwatch with laps and a countdown timer |
| **Browser** | Tabs, address bar, back/forward, bookmarks and a loading bar |
| **Creeper Sweeper** | Minesweeper with creepers, three difficulties and best times |
| **Snake** | Classic snake eating apples (golden apples are worth 5) |
| **2048** | 2048 with Minecraft materials, from dirt all the way up to a Nether Star |
| **CubePaint** | Pixel-art editor with pencil, eraser, fill, line, rectangle and picker. Saves pictures to the laptop |
| **Note Player** | Public-domain melodies played on note-block instruments, with a visualizer |

### The internet
| Site | Address | Highlights |
|---|---|---|
| **Bloogle** | `bloogle.mc` | Home page and search engine across sites, products, restaurants and videos; instant answers for math, weather, time and coordinates |
| **Emerazon** | `emerazon.mc` | Hero carousel, category rows, search with filters and sorting, product pages with customer reviews, cart, checkout (laptop address or "follow me", Standard or Prime Express), live order tracking |
| **Ender Eats** | `endereats.mc` | 7 restaurants with full menus, tips, Priority Teleport, and a live map of your Enderman courier |
| **BlockTube** | `blocktube.mc` | 12 procedurally animated "videos", a seekable player with fullscreen and keyboard shortcuts, likes, subscriptions, comments and watch history |
| **Emerald Bank** | `emeraldbank.mc` | Deposit and withdraw real emeralds (emerald blocks count as 9), activity chart, transaction history |
| **MineWeather** | `mineweather.mc` | Live weather, temperature and moon phase for your biome, plus hourly and 7-day forecasts |

### Shopping and deliveries
- Prices are in emeralds held in your **EmeraldPay wallet**. Every player starts with 50. Deposit real emeralds at Emerald Bank to add more.
- Purchases are validated by the server. Players in creative mode shop for free.
- After the delivery timer runs out, an **Emerazon package** (brought by a hovering Allay) or an **Ender Eats bag** (teleported in by an Enderman courier) appears next to your laptop, or next to you if you chose "follow me". Right-click it to unbox, with confetti.
- You also get a chat message, a CubeOS notification and a receipt in CubeMail.

### Things you can buy
- **Clothes you can wear:** hoodie, tees, denim and tuxedo jackets, Hawaiian shirt, jeans, shorts, sweatpants, sneakers, boots and bunny slippers.
- **3D hats and accessories:** top hat, cowboy hat, caps, beanies, crown, wizard, pirate and viking hats, sunglasses, headphones and more.
- **Food and drink with effects:** pizza (sneak-use to slice it), burgers, sushi, tacos, ramen, donuts, iced coffee (speed), Redstone Rush (haste), chorus cookies (random teleport!) and more.
- **Toys:** rubber duck (it floats), plushies, Magic 8-Ball, confetti popper, yo-yo, fidget spinner, a bouncy ball and a puzzle cube.
- **Home decor:** lava lamps, disco ball, neon sign, desk lamp, globe, bean bags, gaming chair, mini fridge, retro TV and an arcade cabinet.
- **15 custom paintings,** such as "Mona Llama", "Creeper Scream" and "The Starry Night Sky".
- About 60 everyday items from the marketplace: tools, garden, books and music, pets, groceries and electronics.

## Commands
| Command | Permission | Description |
|---|---|---|
| `/laptopcraft balance [player]` | everyone (op for others) | Show a wallet balance |
| `/laptopcraft balance set\|add <player> <amount>` | op | Change a wallet |
| `/laptopcraft orders [player]` | everyone | List orders |
| `/laptopcraft deliver [player]` | op | Deliver all pending orders right now |
| `/laptopcraft gift <player> <product> [qty]` | op | Send a free delivery |
| `/laptopcraft mail <player> "<subject>" <message>` | op | Send a CubeMail |

## Installing
1. Install [Fabric Loader](https://fabricmc.net/use/) 0.19.5 or newer for Minecraft **1.21.11**.
2. Put [Fabric API](https://modrinth.com/mod/fabric-api) and `laptopcraft-1.0.0.jar` (from `build/libs/`) into your `mods` folder.
3. Launch the game, find the laptop in the **LaptopCraft** creative tab or craft it, place it and right-click.

The mod is needed on **both client and server** for multiplayer.

## Building from source
Requirements: JDK 21.
```
./gradlew build          # → build/libs/laptopcraft-1.0.0.jar
./gradlew runClient      # launch a dev client
```
Mappings: official Mojang names with Parchment parameter names.

Developer extras:
- `scripts/screenshot.sh` drives the real client headlessly (Xvfb) through the client game-test API and takes screenshots. `src/gametest` explains the script format.
- `tools/art/` holds the Python generators for every texture, model and sound.

## Project layout
```
src/main/java/com/laptopcraft/        common + server: blocks, accounts, orders, deliveries, catalog, packets, commands
src/client/java/com/laptopcraft/client/
  os/                                 CubeOS: window manager, desktop, taskbar, start menu, UI toolkit
  os/apps/                            the apps
  web/                                browser + web framework, sites/ = Bloogle, Emerazon, Ender Eats, BlockTube, bank, weather
src/main/resources/assets/laptopcraft generated textures, models, sounds, translations
tools/art/                            asset generators (Python)
```

All site names are parodies. Music in the Note Player is public domain.
