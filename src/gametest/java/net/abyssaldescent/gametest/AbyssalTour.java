package net.abyssaldescent.gametest;

import net.abyssaldescent.dungeon.layout.Doorway;
import net.abyssaldescent.dungeon.layout.Fixture;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.FloorLayouts;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.dungeon.layout.RoomType;
import net.abyssaldescent.dungeon.run.DungeonRun;
import net.abyssaldescent.dungeon.run.RunManager;
import net.abyssaldescent.dungeon.run.Unsecured;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.core.BlockPos;
import net.abyssaldescent.entity.boss.HollowWardenEntity;
import net.abyssaldescent.world.DungeonDimension;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Plays through the first zone on a real client and saves screenshots along the way (run/clientGameTest/screenshots).
 * It is a visual check, not an assertion suite: every step still fails loudly if the mod throws.
 */
public final class AbyssalTour implements FabricClientGameTest {
	private static final String DIM = "abyssal_descent:the_depths";

	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			TestServerContext server = world.getServer();
			// Enlarge only once the world is up: software renderers struggle with a large loading screen.
			context.getInput().resizeWindow(1280, 720);
			world.getClientWorld().waitForChunksRender();
			server.runCommand("gamemode survival @a");
			server.runCommand("effect give @a minecraft:resistance infinite 4 true");
			server.runCommand("effect give @a minecraft:saturation infinite 0 true");
			context.runOnClient(client -> client.options.hideGui = false);

			// Gear brought from the surface: must survive both extraction and defeat.
			server.runCommand("give @p minecraft:diamond_sword");

			// ---------------------------------------------------------------- floor 1
			server.runCommand("execute as @p run abyssal start 1");
			context.waitTicks(60);
			world.getClientWorld().waitForChunksRender();
			context.waitTicks(20);
			context.takeScreenshot("abyssal_01_floor1_arrival");

			Spots spots = server.computeOnServer(AbyssalTour::findSpots);

			// Bestiary: every Forgotten Halls enemy, frozen in a row in the entry hall.
			Vec3 eye = spots.lineupEye;
			tp(server, eye, spots.lineupYaw, 8);
			String[] mobs = {"risen", "bone_archer", "bone_shieldbearer", "crypt_ghoul", "wailing_skull", "barrow_knight"};
			for (int i = 0; i < mobs.length; i++) {
				Vec3 at = spots.lineupStart.add(spots.lineupStep.scale(i));
				server.runCommand(String.format("execute in %s run summon abyssal_descent:%s %.2f %.2f %.2f {NoAI:1b,PersistenceRequired:1b,Rotation:[%.1ff,0f]}",
					DIM, mobs[i], at.x, at.y + (mobs[i].equals("wailing_skull") ? 1.2 : 0), at.z, spots.lineupYaw + 180));
			}
			context.waitTicks(30);
			context.takeScreenshot("abyssal_02_bestiary");
			server.runCommand("execute in " + DIM + " run kill @e[type=!minecraft:player]");

			if (spots.treasure != null) {
				tp(server, spots.treasure, spots.treasureYaw, 25);
				context.waitTicks(30);
				world.getClientWorld().waitForChunksRender();
				context.takeScreenshot("abyssal_03_treasure_room");
			}

			// Walk into a combat chamber: the seals close and the first wave rises.
			tp(server, spots.combat, spots.combatYaw, 12);
			context.waitTicks(5);
			world.getClientWorld().waitForChunksRender();
			context.waitTicks(70);
			context.takeScreenshot("abyssal_04_encounter_summon");
			context.waitTicks(60);
			context.takeScreenshot("abyssal_05_encounter_fight");

			// Loot fountain of a boss-tier roll, with rarity sparkles.
			server.runCommand("execute in " + DIM + " run kill @e[type=!minecraft:player]");
			server.runCommand("execute as @p at @s run abyssal loot boss");
			context.waitTicks(40);
			context.takeScreenshot("abyssal_06_loot");

			// ---------------------------------------------------------------- floor 5: the Hollow Warden
			server.runCommand("execute as @p run abyssal floor 5");
			context.waitTicks(60);
			world.getClientWorld().waitForChunksRender();
			Spots boss = server.computeOnServer(AbyssalTour::findSpots);
			if (boss.arenaEntry == null) {
				throw new AssertionError("floor 5 has no boss arena");
			}
			tp(server, boss.arenaEntry, boss.arenaYaw, 6);
			context.waitTicks(10);
			world.getClientWorld().waitForChunksRender();
			context.waitTicks(20);
			context.takeScreenshot("abyssal_07_throne_room");
			log("before waking", bossState(server));

			// Crossing the threshold wakes the Warden: title card, boss bar and intro roar.
			tp(server, boss.arenaInside, boss.arenaYaw, 4);
			context.waitTicks(30);
			faceBoss(server);
			context.waitTicks(2);
			context.takeScreenshot("abyssal_08_warden_awakens");
			log("awake", bossState(server));
			context.waitTicks(90);
			faceBoss(server);
			context.waitTicks(2);
			context.takeScreenshot("abyssal_09_warden_phase1");

			// Phase 2 below 60% health, phase 3 below 25%: drive it there with real player damage.
			server.runCommand("damage @e[type=abyssal_descent:hollow_warden,limit=1] 150 minecraft:player_attack by @p");
			context.waitTicks(20);
			log("after 150 damage", bossState(server));
			faceBoss(server);
			context.waitTicks(2);
			context.takeScreenshot("abyssal_10_warden_phase2_roar");
			context.waitTicks(80);
			faceBoss(server);
			context.waitTicks(2);
			context.takeScreenshot("abyssal_11_warden_phase2");
			server.runCommand("damage @e[type=abyssal_descent:hollow_warden,limit=1] 130 minecraft:player_attack by @p");
			context.waitTicks(20);
			log("after 130 more damage", bossState(server));
			context.waitTicks(60);
			faceBoss(server);
			context.waitTicks(2);
			context.takeScreenshot("abyssal_12_warden_phase3");

			// The killing blow starts the death sequence; the arena rewards appear when it ends.
			server.runCommand("damage @e[type=abyssal_descent:hollow_warden,limit=1] 400 minecraft:player_attack by @p");
			context.waitTicks(30);
			faceBoss(server);
			context.waitTicks(2);
			context.takeScreenshot("abyssal_13_warden_death");
			log("dying", bossState(server));
			context.waitTicks(100);
			log("after death sequence", bossState(server));
			tp(server, boss.arenaInside, boss.arenaYaw, 10);
			context.waitTicks(40);
			context.takeScreenshot("abyssal_14_arena_rewards");

			// ---------------------------------------------------------------- extraction: unsecured loot is kept
			Inventory beforeExtract = server.computeOnServer(AbyssalTour::inventory);
			log("before extraction", beforeExtract.toString());
			check(beforeExtract.unsecured > 0, "expected unsecured loot before extracting, got " + beforeExtract);
			server.runOnServer(s -> {
				ServerPlayer player = s.getPlayerList().getPlayers().get(0);
				RunManager.get(s).useWaystone(player); // first use asks for confirmation
				RunManager.get(s).useWaystone(player);
			});
			context.waitTicks(40);
			world.getClientWorld().waitForChunksRender();
			Inventory afterExtract = server.computeOnServer(AbyssalTour::inventory);
			log("after extraction", afterExtract.toString());
			check(!afterExtract.inDungeon && !afterExtract.inRun, "extraction should return the player to the surface: " + afterExtract);
			check(afterExtract.unsecured == 0 && afterExtract.stacks >= beforeExtract.stacks, "extraction should secure every stack: " + afterExtract);
			check(afterExtract.hasSword, "brought gear must be kept on extraction");
			context.takeScreenshot("abyssal_15_extracted");

			// ---------------------------------------------------------------- defeat: unsecured loot is lost, gear kept
			server.runCommand("execute as @p run abyssal start 1");
			context.waitTicks(60);
			server.runCommand("execute as @p at @s run abyssal loot treasure");
			context.waitTicks(60);
			Inventory beforeDefeat = server.computeOnServer(AbyssalTour::inventory);
			log("before defeat", beforeDefeat.toString());
			check(beforeDefeat.inRun && beforeDefeat.unsecured > 0, "expected an expedition with unsecured loot: " + beforeDefeat);
			server.runCommand("effect clear @p");
			// A lethal spike-trap hit: the realistic way to fall in the depths.
			server.runCommand("damage @p 1000 abyssal_descent:spikes");
			context.waitTicks(40);
			world.getClientWorld().waitForChunksRender();
			Inventory afterDefeat = server.computeOnServer(AbyssalTour::inventory);
			log("after defeat", afterDefeat.toString());
			check(afterDefeat.alive && !afterDefeat.inDungeon && !afterDefeat.inRun, "defeat should expel the player alive: " + afterDefeat);
			check(afterDefeat.unsecured == 0 && afterDefeat.stacks == afterExtract.stacks, "defeat should destroy only unsecured loot: " + afterDefeat);
			check(afterDefeat.hasSword, "brought gear must be kept on defeat");
			context.takeScreenshot("abyssal_16_defeated");
			server.runCommand("effect give @a minecraft:resistance infinite 4 true");

			// ---------------------------------------------------------------- armour sets on the player
			context.runOnClient(client -> client.options.setCameraType(CameraType.THIRD_PERSON_FRONT));
			String[][] sets = {
				{"wraithbound", "wraithbound_visage", "wraithbound_mantle", "wraithbound_legguards", "wraithbound_stride", "16"},
				{"gravewarden", "gravewarden_helm", "gravewarden_cuirass", "gravewarden_greaves", "gravewarden_sabatons", "24"},
				{"mourner", "mourner_hood", "mourner_shroud", "mourner_wraps", "mourner_treads", "20"}};
			for (String[] set : sets) {
				server.runCommand("item replace entity @p armor.head with abyssal_descent:" + set[1]);
				server.runCommand("item replace entity @p armor.chest with abyssal_descent:" + set[2]);
				server.runCommand("item replace entity @p armor.legs with abyssal_descent:" + set[3]);
				server.runCommand("item replace entity @p armor.feet with abyssal_descent:" + set[4]);
				context.waitTicks(25);
				float maxHealth = server.computeOnServer(s -> s.getPlayerList().getPlayers().get(0).getMaxHealth());
				log(set[0] + " set max health", String.valueOf(maxHealth));
				check(maxHealth == Float.parseFloat(set[5]), set[0] + " set should give " + set[5] + " max health, got " + maxHealth);
				context.takeScreenshot("abyssal_armor_" + set[0]);
			}
			context.runOnClient(client -> client.options.setCameraType(CameraType.FIRST_PERSON));

			// Tooltip of the boss-exclusive greatsword.
			server.runCommand("clear @p");
			server.runCommand("give @p abyssal_descent:gravebrand");
			server.runCommand("give @p abyssal_descent:hollow_crown");
			server.runCommand("give @p abyssal_descent:gravewarden_cuirass");
			context.waitTicks(5);
			context.setScreen(() -> new InventoryScreen(Minecraft.getInstance().player));
			context.waitTicks(5);
			hoverHotbarSlot(context, 0);
			context.waitTicks(5);
			context.takeScreenshot("abyssal_17_tooltip_gravebrand");
			hoverHotbarSlot(context, 1);
			context.waitTicks(5);
			context.takeScreenshot("abyssal_18_tooltip_crown");
			hoverHotbarSlot(context, 2);
			context.waitTicks(5);
			context.takeScreenshot("abyssal_19_tooltip_cuirass");
			context.setScreen(() -> null);
		}
	}

	private static void hoverHotbarSlot(ClientGameTestContext context, int slot) {
		double[] pos = context.computeOnClient(client -> {
			var window = client.getWindow();
			double scale = window.getGuiScale();
			int left = (window.getGuiScaledWidth() - 176) / 2;
			int top = (window.getGuiScaledHeight() - 166) / 2;
			return new double[] {(left + 8 + slot * 18 + 8) * scale, (top + 142 + 8) * scale};
		});
		context.getInput().setCursorPos(pos[0], pos[1]);
	}

	record Inventory(int stacks, int unsecured, boolean hasSword, int swordDamage, boolean inDungeon, boolean inRun, boolean alive) {
	}

	private static Inventory inventory(MinecraftServer server) {
		ServerPlayer player = server.getPlayerList().getPlayers().get(0);
		int stacks = 0;
		boolean sword = false;
		int swordDamage = 0;
		var inv = player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) {
			ItemStack stack = inv.getItem(i);
			if (stack.isEmpty()) {
				continue;
			}
			stacks++;
			if (stack.is(Items.DIAMOND_SWORD)) {
				sword = true;
				swordDamage = stack.getDamageValue();
			}
		}
		return new Inventory(stacks, Unsecured.countUnsecured(player), sword, swordDamage, DungeonDimension.isDungeon(player.level()),
			RunManager.get(server).runOf(player) != null, player.isAlive());
	}

	private static void check(boolean condition, String message) {
		if (!condition) {
			throw new AssertionError(message);
		}
	}

	private static void faceBoss(TestServerContext server) {
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ facing entity @e[type=abyssal_descent:hollow_warden,limit=1,sort=nearest] eyes");
	}

	private static void log(String step, String state) {
		System.out.println("[AbyssalTour] " + step + ": " + state);
	}

	/** Health, phase and dormancy of the Warden, read on the server thread. */
	private static String bossState(TestServerContext server) {
		return server.computeOnServer(s -> {
			ServerLevel level = s.getLevel(DungeonDimension.LEVEL);
			if (level == null) {
				return "no dungeon level";
			}
			StringBuilder out = new StringBuilder();
			for (Entity e : level.getAllEntities()) {
				if (e instanceof HollowWardenEntity warden) {
					out.append(String.format("hp=%.1f/%.1f phase=%d dormant=%s alive=%s removed=%s ", warden.getHealth(), warden.getMaxHealth(),
						warden.phase(), warden.dormant(), warden.isAlive(), warden.isRemoved()));
				}
			}
			ServerPlayer player = s.getPlayerList().getPlayers().get(0);
			DungeonRun run = RunManager.get(s).runOf(player);
			if (run != null) {
				out.append("bossStarted=").append(run.floorState.bossStarted).append(" bossDefeated=").append(run.floorState.bossDefeated);
			}
			return out.length() == 0 ? "no warden" : out.toString();
		});
	}

	private static void tp(TestServerContext server, Vec3 pos, float yaw, float pitch) {
		server.runCommand(String.format("execute in %s run tp @p %.2f %.2f %.2f %.1f %.1f", DIM, pos.x, pos.y, pos.z, yaw, pitch));
	}

	static float yawToward(Vec3 from, Vec3 to) {
		return (float) Math.toDegrees(-Math.atan2(to.x - from.x, to.z - from.z));
	}

	record Spots(Vec3 lineupEye, float lineupYaw, Vec3 lineupStart, Vec3 lineupStep, @Nullable Vec3 treasure, float treasureYaw, Vec3 combat,
		float combatYaw, @Nullable Vec3 arenaEntry, @Nullable Vec3 arenaInside, float arenaYaw) {
	}

	private static Spots findSpots(MinecraftServer server) {
		ServerPlayer player = server.getPlayerList().getPlayers().get(0);
		DungeonRun run = RunManager.get(server).runOf(player);
		if (run == null) {
			throw new IllegalStateException("tour player is not on an expedition");
		}
		FloorLayout layout = FloorLayouts.get(server.getWorldData().worldGenOptions().seed(), run.slot, run.floor());

		// Line-up along the start room's long axis, viewed from one end.
		Room start = layout.startRoom();
		var in = start.interior();
		boolean alongX = in.sizeX() >= in.sizeZ();
		double y = start.floorY();
		Vec3 a = alongX ? new Vec3(in.minX() + 2.5, y, (in.minZ() + in.maxZ()) / 2.0 + 0.5) : new Vec3((in.minX() + in.maxX()) / 2.0 + 0.5, y, in.minZ() + 2.5);
		Vec3 farEnd = alongX ? new Vec3(in.maxX() - 1.5, y, a.z) : new Vec3(a.x, y, in.maxZ() - 1.5);
		Vec3 axis = farEnd.subtract(a).normalize();
		Vec3 side = new Vec3(-axis.z, 0, axis.x);
		Vec3 eye = a;
		Vec3 lineCenter = a.add(axis.scale(6.5));
		Vec3 lineStart = lineCenter.add(side.scale(-5.0));
		Vec3 step = side.scale(2.0);
		float lineYaw = yawToward(eye, lineCenter);

		Vec3 treasure = null;
		float treasureYaw = 0;
		Room combat = null;
		for (Room room : layout.rooms()) {
			if (room.type() == RoomType.TREASURE && treasure == null) {
				Doorway door = room.doorways().get(0);
				treasure = inside(door, 2.5, room.floorY());
				treasureYaw = yawToward(treasure, Vec3.atBottomCenterOf(room.center()));
			}
			if (room.type() == RoomType.COMBAT && (combat == null || area(room) > area(combat))) {
				combat = room;
			}
		}
		if (combat == null) {
			combat = layout.rooms().stream().filter(r -> r.type().isEncounter()).findFirst().orElse(start);
		}
		Doorway combatDoor = combat.doorways().get(0);
		Vec3 combatPos = inside(combatDoor, 3.5, combat.floorY());
		float combatYaw = yawToward(combatPos, Vec3.atBottomCenterOf(combat.center()));

		Vec3 arenaEntry = null;
		Vec3 arenaInside = null;
		float arenaYaw = 0;
		for (Room room : layout.rooms()) {
			if (room.type() != RoomType.BOSS_ARENA) {
				continue;
			}
			Fixture throne = room.firstFixture(Fixture.Type.BOSS_SPAWN);
			Vec3 target = throne != null ? Vec3.atBottomCenterOf(throne.pos()) : Vec3.atBottomCenterOf(room.center());
			Doorway door = entrance(layout, room);
			arenaEntry = inside(door, 1.0, room.floorY());
			arenaInside = inside(door, 6.0, room.floorY());
			arenaYaw = yawToward(arenaEntry, target);
		}
		return new Spots(eye, lineYaw, lineStart, step, treasure, treasureYaw, combatPos, combatYaw, arenaEntry, arenaInside, arenaYaw);
	}

	private static int area(Room room) {
		return room.interior().sizeX() * room.interior().sizeZ();
	}

	/** The arena door that leads back to the antechamber. */
	private static Doorway entrance(FloorLayout layout, Room arena) {
		for (Doorway d : arena.doorways()) {
			if (!d.secret() && d.targetRoom() >= 0 && layout.room(d.targetRoom()).type() == RoomType.ANTECHAMBER) {
				return d;
			}
		}
		return arena.doorways().get(0);
	}

	/** A point {@code depth} blocks into the room from a doorway, at floor level. */
	private static Vec3 inside(Doorway door, double depth, int floorY) {
		BlockPos p = new BlockPos(door.x(), floorY, door.z());
		return Vec3.atBottomCenterOf(p).add(-door.facing().getStepX() * depth, 0, -door.facing().getStepZ() * depth);
	}
}
