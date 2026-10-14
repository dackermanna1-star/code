package net.abyssaldescent.gametest;

import net.abyssaldescent.dungeon.layout.Doorway;
import net.abyssaldescent.dungeon.layout.Fixture;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.FloorLayouts;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.dungeon.layout.RoomType;
import net.abyssaldescent.dungeon.run.DungeonRun;
import net.abyssaldescent.dungeon.run.RunManager;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
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
		context.getInput().resizeWindow(1280, 720);
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			TestServerContext server = world.getServer();
			world.getClientWorld().waitForChunksRender();
			server.runCommand("gamemode survival @a");
			server.runCommand("effect give @a minecraft:resistance infinite 4 true");
			server.runCommand("effect give @a minecraft:saturation infinite 0 true");
			context.runOnClient(client -> client.options.hideGui = false);

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
			if (boss.arenaEntry != null) {
				tp(server, boss.arenaEntry, boss.arenaYaw, 6);
				context.waitTicks(10);
				world.getClientWorld().waitForChunksRender();
				context.waitTicks(20);
				context.takeScreenshot("abyssal_07_throne_room");
				tp(server, boss.arenaInside, boss.arenaYaw, 4);
				context.waitTicks(50);
				context.takeScreenshot("abyssal_08_warden_awakens");
				context.waitTicks(120);
				context.takeScreenshot("abyssal_09_warden_fight");
				context.waitTicks(40);
				context.takeScreenshot("abyssal_10_warden_fight_2");
				context.waitTicks(40);
				context.takeScreenshot("abyssal_11_warden_fight_3");
			}

			// Tooltip of the boss-exclusive greatsword.
			server.runCommand("clear @p");
			server.runCommand("give @p abyssal_descent:gravebrand");
			server.runCommand("give @p abyssal_descent:hollow_crown");
			server.runCommand("give @p abyssal_descent:gravewarden_cuirass");
			context.waitTicks(5);
			context.setScreen(() -> new InventoryScreen(context.computeOnClient(client -> client.player)));
			context.waitTicks(5);
			hoverHotbarSlot(context, 0);
			context.waitTicks(5);
			context.takeScreenshot("abyssal_12_tooltip_gravebrand");
			hoverHotbarSlot(context, 1);
			context.waitTicks(5);
			context.takeScreenshot("abyssal_13_tooltip_crown");
			hoverHotbarSlot(context, 2);
			context.waitTicks(5);
			context.takeScreenshot("abyssal_14_tooltip_cuirass");
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
