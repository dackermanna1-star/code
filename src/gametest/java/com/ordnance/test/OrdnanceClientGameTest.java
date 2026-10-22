package com.ordnance.test;

import com.ordnance.registry.ModItemGroups;
import java.util.Locale;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestClientWorldContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screen.ingame.CreativeInventoryScreen;
import net.minecraft.client.option.Perspective;
import net.minecraft.network.message.ChatVisibility;
import net.minecraft.registry.Registries;
import net.minecraft.server.network.ChunkFilter;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.world.chunk.ChunkStatus;
import org.lwjgl.glfw.GLFW;

/**
 * Scripted visual walkthrough, run with {@code ./gradlew runClientGameTest}: builds a firing range in a superflat
 * world, then exercises every weapon and warhead and saves timed screenshots to
 * {@code build/run/clientGameTest/screenshots}. It fails only on crashes and errors; the screenshots are for review.
 */
public class OrdnanceClientGameTest implements FabricClientGameTest {
	/** First air layer above the default superflat ground. */
	private static final int G = -60;
	private static final String[] WARHEADS = {
		"frag_grenade", "incendiary_grenade", "smoke_grenade", "he_40mm", "rpg_heat", "rpg_thermobaric",
	};
	private static final int[] BLAST_FRAMES = {1, 2, 4, 7, 12, 20, 35, 60, 110};
	/** Software rendering builds chunks slowly; allow plenty of ticks. */
	private static final int CHUNK_TIMEOUT = 6000;

	private ClientGameTestContext context;
	/** The server and client world of the scene being filmed (singleplayer first, then a dedicated server). */
	private TestServerContext server;
	private TestClientWorldContext clientWorld;

	@Override
	public void runTest(ClientGameTestContext context) {
		this.context = context;
		// ORDNANCE_TEST_SCENES=items,explosions,weapons,fire,missile,multiplayer picks scenes; all run by default.
		String scenes = System.getenv().getOrDefault("ORDNANCE_TEST_SCENES", "items,explosions,weapons,fire,missile,multiplayer");
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			this.server = world.getServer();
			this.clientWorld = world.getClientWorld();
			this.prepare();
			if (scenes.contains("items")) {
				this.itemShowcase();
			}

			if (scenes.contains("explosions")) {
				this.explosionGallery();
			}

			if (scenes.contains("weapons")) {
				this.weapons();
			}

			if (scenes.contains("fire")) {
				this.fire();
			}

			if (scenes.contains("missile")) {
				this.missileStrike();
			}
		}

		if (scenes.contains("multiplayer")) {
			this.multiplayer();
		}
	}

	private void prepare() {
		this.context.getInput().resizeWindow(1280, 720);
		this.waitForTerrain();
		this.run("gamemode creative @a");
		this.run("time set noon");
		this.run("gamerule max_block_modifications 1000000");
		this.run("gamerule send_command_feedback false");
		this.context.runOnClient(client -> {
			client.options.getChatVisibility().setValue(ChatVisibility.HIDDEN);
			client.options.getViewDistance().setValue(6);
			client.options.getGuiScale().setValue(2);
			client.onResolutionChanged();
		});
		this.resetRange();
		this.context.waitTicks(20);
		this.waitForTerrain();
	}

	// ---------------------------------------------------------------- items

	private void itemShowcase() {
		String[] hotbar = {
			"ordnance:frag_grenade", "ordnance:incendiary_grenade", "ordnance:smoke_grenade",
			"ordnance:rpg7[ordnance:magazine=[\"ordnance:pg7v_rocket\"]]",
			"ordnance:grenade_launcher[ordnance:magazine=[\"ordnance:grenade_40mm_he\",\"ordnance:grenade_40mm_he\",\"ordnance:grenade_40mm_incendiary\"]]",
			"ordnance:flamethrower[ordnance:fuel=400]", "ordnance:strike_designator", "ordnance:pg7v_rocket", "ordnance:hypersonic_missile",
		};
		String[] second = {
			"ordnance:rpg7", "ordnance:tbg7v_rocket", "ordnance:grenade_40mm_he", "ordnance:grenade_40mm_incendiary",
			"ordnance:grenade_40mm_smoke", "ordnance:fuel_canister", "ordnance:explosive_charge", "ordnance:charred_log", "ordnance:scorched_earth",
		};
		this.camera(0.5, G, -8.5, 0.0F, 0.0F, false);
		for (String[] set : new String[][] {hotbar, second}) {
			for (int i = 0; i < set.length; i++) {
				this.run("item replace entity @p hotbar." + i + " with " + set[i]);
			}

			for (int i = 0; i < set.length; i++) {
				int slot = i;
				this.context.getInput().pressKey(options -> options.hotbarKeys[slot]);
				this.context.waitTicks(12);
				this.shot("item_fp_" + name(set[i]));
				this.perspective(Perspective.THIRD_PERSON_FRONT);
				this.context.waitTicks(2);
				this.shot("item_tp_" + name(set[i]));
				this.perspective(Perspective.FIRST_PERSON);
			}
		}

		// Items lying on the ground.
		String[] ground = {
			"frag_grenade", "rpg7", "pg7v_rocket", "grenade_launcher", "grenade_40mm_he", "flamethrower", "fuel_canister",
			"strike_designator", "hypersonic_missile",
		};
		for (int i = 0; i < ground.length; i++) {
			this.run(String.format(Locale.ROOT, "summon item %.1f %d -4.5 {Item:{id:\"ordnance:%s\",count:1},PickupDelay:32767,Age:-32768}", -3.5 + i, G, ground[i]));
		}

		this.camera(0.5, G + 1.2, -7.5, 0.0F, 30.0F, true);
		this.selectEmptySlot();
		this.context.waitTicks(10);
		this.shot("item_ground");
		this.run("kill @e[type=item]");

		// The creative tab.
		this.context.runOnClient(client -> {
			CreativeInventoryScreen screen = new CreativeInventoryScreen(client.player, client.player.networkHandler.getEnabledFeatures(), true);
			client.setScreen(screen);
			screen.setSelectedItemGroup(Registries.ITEM_GROUP.getValueOrThrow(ModItemGroups.ARSENAL));
		});
		this.context.waitTicks(5);
		this.shot("item_creative_tab");
		this.context.getInput().setCursorPos(640 - 195 + 9 * 2 + 3 * 36 + 16, 360 - 136 + 18 * 2 + 16);
		this.context.waitTicks(2);
		this.shot("item_creative_tooltip");
		this.context.setScreen(() -> null);
	}

	// ---------------------------------------------------------------- explosions

	private void explosionGallery() {
		for (String warhead : WARHEADS) {
			this.resetRange();
			this.camera(0.5, G + 3.0, -8.5, 0.0F, 9.0F, true);
			this.selectEmptySlot();
			this.context.waitTicks(10);
			this.run("ordnance explode " + warhead + " 0.5 " + G + " 10.5");
			this.frames("blast_" + warhead, BLAST_FRAMES);
		}

		this.resetRange();
		this.camera(0.5, G + 3.0, -8.5, 0.0F, 9.0F, true);
		this.context.waitTicks(10);
		this.run("summon tnt 0.5 " + G + " 10.5 {fuse:1}");
		this.frames("blast_vanilla_tnt", new int[] {2, 3, 5, 8, 13, 21, 36, 61, 111});

		// Close up and at night, where the flash and fire light matter most.
		this.resetRange();
		this.run("time set midnight");
		this.camera(0.5, G + 2.0, 2.5, 0.0F, 8.0F, true);
		this.context.waitTicks(10);
		this.run("ordnance explode rpg_thermobaric 0.5 " + G + " 12.5");
		this.frames("blast_night_thermobaric", new int[] {1, 3, 6, 12, 25, 60, 140});
		this.run("time set noon");

		// Underwater charge.
		this.resetRange();
		this.run("fill -6 " + (G - 3) + " 6 6 " + (G - 1) + " 16 water");
		this.camera(0.5, G + 2.5, -4.5, 0.0F, 18.0F, true);
		this.context.waitTicks(10);
		this.run("ordnance explode he_40mm 0.5 " + (G - 2) + " 11.5");
		this.frames("blast_underwater", new int[] {1, 4, 10, 25});
	}

	// ---------------------------------------------------------------- weapons

	private void weapons() {
		// RPG-7, first and third person.
		for (Perspective perspective : new Perspective[] {Perspective.FIRST_PERSON, Perspective.THIRD_PERSON_BACK}) {
			String view = perspective == Perspective.FIRST_PERSON ? "fp" : "tp";
			this.resetRange();
			this.camera(0.5, G, -8.5, 0.0F, -1.0F, false);
			this.hold(0, "ordnance:rpg7[ordnance:magazine=[\"ordnance:pg7v_rocket\"]]");
			this.perspective(perspective);
			this.context.waitTicks(10);
			this.shot("rpg_" + view + "_aim");
			this.context.getInput().pressKey(options -> options.useKey);
			this.frames("rpg_" + view, new int[] {1, 2, 4, 6, 8, 10, 13, 18, 30});
			this.perspective(Perspective.FIRST_PERSON);
		}

		// Reloading the RPG (hold use with rockets in the inventory).
		this.hold(0, "ordnance:rpg7");
		this.run("give @p ordnance:pg7v_rocket 4");
		this.context.getInput().holdKey(options -> options.useKey);
		this.frames("rpg_reload", new int[] {10, 25, 45});
		this.context.getInput().releaseKey(options -> options.useKey);
		this.run("clear @p ordnance:pg7v_rocket");

		// Grenade launcher: a volley of mixed rounds.
		this.resetRange();
		this.camera(0.5, G, -8.5, 0.0F, -8.0F, false);
		this.hold(0, "ordnance:grenade_launcher[ordnance:magazine=[\"ordnance:grenade_40mm_he\",\"ordnance:grenade_40mm_incendiary\",\"ordnance:grenade_40mm_smoke\"]]");
		this.context.waitTicks(10);
		this.shot("launcher_aim");
		for (int i = 0; i < 3; i++) {
			this.context.getInput().pressKey(options -> options.useKey);
			this.frames("launcher_round" + i, new int[] {1, 5, 12});
		}

		this.frames("launcher_after", new int[] {20, 60});

		// Frag grenade: wind up, throw, bounce, detonate.
		this.resetRange();
		this.camera(0.5, G, -8.5, 0.0F, -10.0F, false);
		this.hold(0, "ordnance:frag_grenade");
		this.context.waitTicks(10);
		this.context.getInput().holdKey(options -> options.useKey);
		this.frames("grenade_windup", new int[] {8});
		this.context.getInput().releaseKey(options -> options.useKey);
		this.frames("grenade_throw", new int[] {2, 8, 20, 40, 64, 67, 70, 80});

		// Smoke grenade screen.
		this.hold(1, "ordnance:smoke_grenade");
		this.context.getInput().pressKey(options -> options.hotbarKeys[1]);
		this.context.getInput().holdKeyFor(options -> options.useKey, 10);
		this.frames("smoke_grenade", new int[] {40, 100, 160, 260, 420});

		// Flamethrower on the wooden hut.
		this.resetRange();
		this.camera(8.5, G, 5.5, 0.0F, 6.0F, false);
		this.hold(0, "ordnance:flamethrower[ordnance:fuel=400]");
		this.context.waitTicks(10);
		this.context.getInput().holdKey(options -> options.useKey);
		this.frames("flamethrower", new int[] {3, 10, 20, 40, 60});
		this.context.getInput().releaseKey(options -> options.useKey);
		this.perspective(Perspective.THIRD_PERSON_BACK);
		this.context.getInput().holdKey(options -> options.useKey);
		this.frames("flamethrower_tp", new int[] {10, 30});
		this.context.getInput().releaseKey(options -> options.useKey);
		this.perspective(Perspective.FIRST_PERSON);
		this.selectEmptySlot();
		this.frames("flamethrower_after", new int[] {40, 160, 400});
	}

	// ---------------------------------------------------------------- fire

	private void fire() {
		this.resetRange();
		for (int i = 0; i < 5; i++) {
			this.run(String.format(Locale.ROOT, "place feature minecraft:oak %d %d %d", -12 + i * 6, G, 26 + (i % 2) * 4));
		}

		this.camera(0.5, G + 4.0, 4.5, 0.0F, 12.0F, true);
		this.selectEmptySlot();
		this.context.waitTicks(10);
		this.run("fill 4 " + G + " 13 12 " + G + " 13 fire");
		this.run("fill -14 " + G + " 24 14 " + G + " 24 fire");
		this.frames("fire", new int[] {20, 80, 200, 400, 700, 1000});
		this.run("time set midnight");
		this.frames("fire_night", new int[] {5});
		this.run("time set noon");
	}

	// ---------------------------------------------------------------- missile

	private void missileStrike() {
		this.resetRange();
		this.camera(0.5, G + 8.0, -52.5, 0.0F, -2.0F, true);
		this.selectEmptySlot();
		this.context.waitTicks(10);
		this.waitForTerrain();
		this.run("ordnance strike 0.5 " + G + " 10.5");
		this.frames("missile", new int[] {20, 60, 82, 90, 96, 100, 103, 105, 107, 109, 111, 114, 120, 130, 150, 190, 260, 400, 600});
		// The aftermath from above and from the crater rim.
		this.camera(0.5, G + 34.0, 10.5, 0.0F, 90.0F, true);
		this.waitForTerrain();
		this.shot("missile_crater_top");
		this.camera(0.5, G + 10.0, -12.5, 0.0F, 30.0F, true);
		this.context.waitTicks(5);
		this.shot("missile_crater_rim");

		// Designating a strike with the item: hold use on a spot until locked.
		this.resetRange();
		this.camera(0.5, G, -30.5, 0.0F, 6.0F, false);
		this.hold(0, "ordnance:strike_designator");
		this.context.waitTicks(5);
		this.context.getInput().holdKey(options -> options.useKey);
		this.frames("designator", new int[] {10, 30, 45});
		this.context.getInput().releaseKey(options -> options.useKey);
		this.frames("designator_strike", new int[] {40, 100, 120, 160});
	}

	// ---------------------------------------------------------------- multiplayer

	/**
	 * The same mod on a dedicated server over a real connection, where every payload and item component is encoded
	 * and decoded: synced magazines, rockets, explosion effects, knockback, the fire-mode key and strike warnings.
	 */
	private void multiplayer() {
		try (TestDedicatedServerContext dedicated = this.context.worldBuilder().createServer();
			TestServerConnection connection = dedicated.connect()) {
			this.server = dedicated;
			this.clientWorld = connection.getClientWorld();
			this.run("gamemode creative @a");
			this.run("time set noon");
			this.run("gamerule max_block_modifications 1000000");
			this.run("gamerule send_command_feedback false");
			this.resetRange();
			this.camera(0.5, G, -8.5, 0.0F, -1.0F, false);
			this.waitForTerrain();

			this.hold(0, "ordnance:rpg7[ordnance:magazine=[\"ordnance:pg7v_rocket\"]]");
			this.context.waitTicks(10);
			this.shot("mp_rpg_aim");
			this.context.getInput().pressKey(options -> options.useKey);
			this.frames("mp_rpg", new int[] {3, 8, 14, 30});

			this.hold(1, "ordnance:grenade_launcher[ordnance:magazine=[\"ordnance:grenade_40mm_he\",\"ordnance:grenade_40mm_he\"]]");
			this.context.getInput().pressKey(GLFW.GLFW_KEY_V);
			this.context.waitTicks(5);
			this.shot("mp_launcher_timed_mode");
			this.context.getInput().pressKey(options -> options.useKey);
			this.frames("mp_launcher", new int[] {10, 40, 70});

			// Close enough for the blast front to push the player (a knockback payload).
			this.selectEmptySlot();
			this.run("ordnance explode frag_grenade 0.5 " + G + " -4.5");
			this.frames("mp_frag_close", new int[] {2, 6, 20});
			this.run("ordnance explode smoke_grenade 4.5 " + G + " 4.5");
			this.run("ordnance strike 0.5 " + G + " 24.5");
			this.frames("mp_strike", new int[] {30, 100, 112, 160});
		}
	}

	// ---------------------------------------------------------------- helpers

	/** Clears the range and rebuilds the targets: grass field, wooden hut, brick wall, glass and a concrete backstop. */
	private void resetRange() {
		this.run("kill @e[type=!player]");
		// Each scene starts clean: no smoke drifting in from the previous one.
		this.context.runOnClient(client -> client.particleManager.clearParticles());
		this.run("fill -40 " + G + " -40 40 " + (G + 30) + " 60 air");
		this.run("fill -40 " + (G - 3) + " -40 40 " + (G - 2) + " 60 dirt");
		this.run("fill -40 " + (G - 1) + " -40 40 " + (G - 1) + " 60 grass_block");
		this.run("fill 5 " + G + " 14 11 " + (G + 3) + " 20 oak_planks hollow");
		this.run("fill 5 " + G + " 14 5 " + (G + 3) + " 14 oak_log");
		this.run("fill 11 " + G + " 14 11 " + (G + 3) + " 14 oak_log");
		this.run("fill 4 " + (G + 4) + " 13 12 " + (G + 4) + " 21 oak_slab");
		this.run("fill 8 " + G + " 14 8 " + (G + 1) + " 14 air");
		this.run("fill -11 " + G + " 14 -5 " + (G + 3) + " 15 stone_bricks");
		this.run("fill -3 " + G + " 22 3 " + (G + 2) + " 22 glass");
		this.run("fill -6 " + G + " 32 6 " + (G + 6) + " 33 gray_concrete");
		this.run("place feature minecraft:oak -16 " + G + " 22");
		this.run("place feature minecraft:birch 16 " + G + " 26");
		this.context.waitTicks(2);
	}

	/**
	 * Waits for the terrain around the player to arrive and be built. The server sends a disc of chunks, while
	 * {@code waitForChunksRender(true, ...)} expects the full square around the player, so check the disc here.
	 */
	private void waitForTerrain() {
		this.context.waitFor(client -> {
			int radius = client.options.getClampedViewDistance();
			ChunkPos center = client.player.getChunkPos();
			for (int x = center.x - radius; x <= center.x + radius; x++) {
				for (int z = center.z - radius; z <= center.z + radius; z++) {
					if (ChunkFilter.isWithinDistanceExcludingEdge(center.x, center.z, radius, x, z) && client.world.getChunk(x, z, ChunkStatus.FULL, false) == null) {
						return false;
					}
				}
			}

			return true;
		}, CHUNK_TIMEOUT);
		this.clientWorld.waitForChunksRender(false, CHUNK_TIMEOUT);
	}

	private void run(String command) {
		this.server.runCommand(command);
	}

	/** Moves the player; {@code fly} keeps them hovering so the camera holds still. */
	private void camera(double x, double y, double z, float yaw, float pitch, boolean fly) {
		this.run(String.format(Locale.ROOT, "tp @p %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
		this.context.runOnClient(client -> {
			client.player.getAbilities().flying = fly;
			client.player.sendAbilitiesUpdate();
			client.player.setVelocity(0.0, 0.0, 0.0);
		});
		this.context.waitTicks(4);
	}

	private void hold(int slot, String item) {
		this.run("item replace entity @p hotbar." + slot + " with " + item);
		this.context.getInput().pressKey(options -> options.hotbarKeys[slot]);
		this.context.waitTicks(2);
	}

	private void selectEmptySlot() {
		this.run("item replace entity @p hotbar.8 with air");
		this.context.getInput().pressKey(options -> options.hotbarKeys[8]);
	}

	private void perspective(Perspective perspective) {
		this.context.runOnClient(client -> client.options.setPerspective(perspective));
	}

	/** Takes screenshots at the given ticks, counted from now. */
	private void frames(String name, int[] ticks) {
		int elapsed = 0;
		for (int at : ticks) {
			this.context.waitTicks(at - elapsed);
			elapsed = at;
			this.shot(String.format(Locale.ROOT, "%s_t%03d", name, at));
		}
	}

	private void shot(String name) {
		this.context.runOnClient(client -> client.getToastManager().clear());
		this.context.takeScreenshot(name);
	}

	private static String name(String item) {
		String id = item.substring(item.indexOf(':') + 1);
		int components = id.indexOf('[');
		return components < 0 ? id : id.substring(0, components) + "_loaded";
	}
}
