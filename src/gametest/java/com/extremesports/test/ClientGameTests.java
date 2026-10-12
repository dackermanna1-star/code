package com.extremesports.test;

import com.extremesports.client.ClientSportsState;
import com.extremesports.client.input.Keybinds;
import com.extremesports.client.screen.SportsMenuScreen;
import com.extremesports.client.screen.WorkshopScreen;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.RideController;
import com.extremesports.registry.ModEntities;
import com.extremesports.registry.ModItems;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.trick.ComboEntry;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;

/**
 * Drives the real client: rides each piece of equipment with real key presses, builds the demo park, rides a
 * ramp and a rail, opens the menus, and takes screenshots for visual review. Trick input is asserted too (a tap
 * on the flip/whip keys must produce the trick).
 */
public class ClientGameTests implements FabricClientGameTest {
	private final List<String> failures = new ArrayList<>();

	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			world.getClientWorld().waitForChunksRender();
			for (String command : List.of("gamemode creative @a", "time set 6000", "weather clear", "gamerule advance_time false",
				"gamerule advance_weather false", "fill -40 -61 -40 60 -61 60 minecraft:smooth_stone",
				"attribute @a minecraft:camera_distance base set 2.6", "tp @a 0 -60 0 0 0")) {
				world.getServer().runCommand(command);
			}
			context.waitTicks(10);
			world.getClientWorld().waitForChunksRender();

			skateboard(context, world);
			bmx(context, world);
			scooterAndSkates(context, world);
			park(context, world);
			screens(context);
			challenge(context, world);
		}
		if (!failures.isEmpty()) {
			throw new AssertionError("Client gametest checks failed: " + failures);
		}
	}

	// ------------------------------------------------------------------ riding

	private void skateboard(ClientGameTestContext context, TestSingleplayerContext world) {
		mount(context, world, EquipmentKind.STREET_BOARD, 0, 0, 0.0F);
		view(context, CameraType.THIRD_PERSON_FRONT, 90.0F, 10.0F);
		context.waitTicks(15);
		shot(context, "skateboard_idle_front", false);
		view(context, CameraType.THIRD_PERSON_BACK, 90.0F, 10.0F);
		shot(context, "skateboard_idle_back", false);
		view(context, CameraType.THIRD_PERSON_FRONT, 45.0F, 15.0F);
		shot(context, "skateboard_idle_three_quarter", false);
		view(context, CameraType.THIRD_PERSON_FRONT, 90.0F, 10.0F);

		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(3);
		shot(context, "skateboard_push_1", false);
		context.waitTicks(3);
		shot(context, "skateboard_push_2", false);
		context.waitTicks(3);
		shot(context, "skateboard_push_3", false);
		context.waitTicks(25);
		context.getInput().releaseKey(options -> options.keyUp);
		context.waitTicks(5);
		shot(context, "skateboard_rolling", false);

		// Ollie: crouch then pop
		context.getInput().holdKey(options -> options.keyJump);
		context.waitTicks(6);
		shot(context, "skateboard_crouch", false);
		context.getInput().releaseKey(options -> options.keyJump);
		context.waitTicks(4);
		shot(context, "skateboard_ollie", false);
		context.waitTicks(30);

		// Kickflip from a single tap of the flip key
		popAndTap(context, Keybinds.FLIP);
		context.waitTicks(3);
		shot(context, "skateboard_kickflip_a", false);
		context.waitTicks(3);
		shot(context, "skateboard_kickflip_b", false);
		context.waitTicks(25);
		expectTrick("kickflip");
		shot(context, "skateboard_hud_kickflip", true);

		// Grab
		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(15);
		context.getInput().releaseKey(options -> options.keyUp);
		context.getInput().holdKey(options -> options.keyJump);
		context.waitTicks(5);
		context.getInput().releaseKey(options -> options.keyJump);
		context.waitTicks(1);
		context.getInput().holdKeyFor(Keybinds.GRAB, 8);
		context.waitTicks(3);
		shot(context, "skateboard_grab", false);
		context.waitTicks(25);
		expectTrick("indy");
		shot(context, "skateboard_hud_grab", true);

		// Powerslide: brake while steering at speed
		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(25);
		context.getInput().releaseKey(options -> options.keyUp);
		context.getInput().holdKey(options -> options.keyDown);
		context.getInput().holdKey(options -> options.keyLeft);
		context.waitTicks(4);
		shot(context, "skateboard_powerslide", false);
		context.getInput().releaseKey(options -> options.keyLeft);
		context.waitTicks(20);
		context.getInput().releaseKey(options -> options.keyDown);
		dismount(context, world);
	}

	private void bmx(ClientGameTestContext context, TestSingleplayerContext world) {
		mount(context, world, EquipmentKind.BMX, 0, 20, 0.0F);
		view(context, CameraType.THIRD_PERSON_BACK, 90.0F, 10.0F);
		context.waitTicks(15);
		shot(context, "bmx_idle_side", false);
		view(context, CameraType.THIRD_PERSON_FRONT, 30.0F, 12.0F);
		shot(context, "bmx_idle_front", false);
		view(context, CameraType.THIRD_PERSON_BACK, 90.0F, 10.0F);
		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(12);
		shot(context, "bmx_pedal_a", false);
		context.waitTicks(4);
		shot(context, "bmx_pedal_b", false);
		context.waitTicks(10);
		context.getInput().releaseKey(options -> options.keyUp);
		popAndTap(context, Keybinds.WHIP);
		context.waitTicks(3);
		shot(context, "bmx_tailwhip_a", false);
		context.waitTicks(3);
		shot(context, "bmx_tailwhip_b", false);
		context.waitTicks(30);
		expectTrick("tailwhip");
		shot(context, "bmx_hud_tailwhip", true);

		// A backflip from a flat bunny hop can't rotate in time: the rider must bail and fall
		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(15);
		context.getInput().releaseKey(options -> options.keyUp);
		popAndTap(context, Keybinds.FLIP);
		context.waitTicks(14);
		shot(context, "bmx_bail_a", false);
		context.waitTicks(6);
		shot(context, "bmx_bail_b", false);
		context.waitTicks(10);
		shot(context, "bmx_bail_hud", true);
		boolean bailed = context.computeOnClient(client -> ClientSportsState.bail != null && riding(client) == null);
		if (!bailed) {
			failures.add("flat-ground BMX backflip should bail");
		}
		context.waitTicks(30);
		dismount(context, world);
	}

	private void scooterAndSkates(ClientGameTestContext context, TestSingleplayerContext world) {
		mount(context, world, EquipmentKind.SCOOTER, 0, 40, 0.0F);
		view(context, CameraType.THIRD_PERSON_BACK, 90.0F, 10.0F);
		context.waitTicks(15);
		shot(context, "scooter_idle_side", false);
		view(context, CameraType.THIRD_PERSON_FRONT, 30.0F, 12.0F);
		shot(context, "scooter_idle_front", false);
		view(context, CameraType.THIRD_PERSON_BACK, 90.0F, 10.0F);
		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(3);
		shot(context, "scooter_kick_a", false);
		context.waitTicks(4);
		shot(context, "scooter_kick_b", false);
		context.waitTicks(10);
		context.getInput().releaseKey(options -> options.keyUp);
		dismount(context, world);

		mount(context, world, EquipmentKind.SKATES, 20, 0, 0.0F);
		view(context, CameraType.THIRD_PERSON_BACK, 90.0F, 10.0F);
		context.waitTicks(15);
		shot(context, "skates_idle_side", false);
		view(context, CameraType.THIRD_PERSON_FRONT, 30.0F, 12.0F);
		shot(context, "skates_idle_front", false);
		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(4);
		shot(context, "skates_stride_a", false);
		context.waitTicks(5);
		shot(context, "skates_stride_b", false);
		context.waitTicks(10);
		context.getInput().releaseKey(options -> options.keyUp);
		dismount(context, world);
	}

	// ------------------------------------------------------------------ park

	private void park(ClientGameTestContext context, TestSingleplayerContext world) {
		// Built facing south from (30, -60, 30): local x maps to world -x, local z to world +z
		world.getServer().runCommand("tp @a 30 -60 30 0 0");
		context.waitTicks(5);
		world.getServer().runCommand("execute as @p at @p run extremesports park full_park");
		context.waitTicks(20);
		context.runOnClient(client -> client.options.setCameraType(CameraType.FIRST_PERSON));
		place(context, world, "30 -36 6 0 38", "park_overview");
		place(context, world, "42.5 -55.5 29.5 0 28", "park_halfpipe");
		place(context, world, "18.5 -55 30 0 35", "park_bowl");
		place(context, world, "30.5 -57.5 28 0 15", "park_street");
		place(context, world, "52.5 -57 28 0 12", "park_dirt_jumps");
		place(context, world, "6.5 -51 29 0 25", "park_downhill");

		// Ride the vert half-pipe (world x 39..45, flat z 35..42): push into the far wall and catch the transition
		mount(context, world, EquipmentKind.STREET_BOARD, 42.5, 36.5, 0.0F);
		view(context, CameraType.THIRD_PERSON_FRONT, 90.0F, 5.0F);
		context.waitTicks(10);
		log(context, "halfpipe start");
		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(22);
		log(context, "halfpipe pushed");
		context.getInput().releaseKey(options -> options.keyUp);
		boolean onRamp = waitForContact(context, RideController.Contact.RAMP, 60);
		log(context, "halfpipe ramp");
		shot(context, "halfpipe_on_ramp", false);
		if (!onRamp) {
			failures.add("never reached the half-pipe transition");
		}
		context.waitTicks(6);
		shot(context, "halfpipe_on_ramp_b", false);
		dismount(context, world);

		// Grind the flat rail (world x 30, z 34..40): hold the grind key, ollie just before the rail
		mount(context, world, EquipmentKind.STREET_BOARD, 30.5, 27.0, 0.0F);
		view(context, CameraType.THIRD_PERSON_FRONT, 90.0F, 8.0F);
		context.waitTicks(10);
		context.getInput().holdKey(Keybinds.GRIND);
		context.getInput().holdKey(options -> options.keyUp);
		context.waitFor(client -> riding(client) != null && riding(client).getZ() > 30.0, 100);
		context.getInput().releaseKey(options -> options.keyUp);
		context.getInput().holdKey(options -> options.keyJump);
		context.waitFor(client -> riding(client) != null && riding(client).getZ() > 33.9, 100);
		log(context, "rail pop");
		context.getInput().releaseKey(options -> options.keyJump);
		boolean grinding = waitForContact(context, RideController.Contact.GRIND, 30);
		log(context, "rail after wait");
		context.waitTicks(2);
		shot(context, "rail_grind", false);
		context.waitTicks(4);
		shot(context, "rail_grind_b", true);
		context.getInput().releaseKey(Keybinds.GRIND);
		if (!grinding) {
			failures.add("did not lock onto the flat rail");
		}
		context.waitTicks(30);
		dismount(context, world);
	}

	// ------------------------------------------------------------------ screens

	private void screens(ClientGameTestContext context) {
		context.runOnClient(client -> client.options.hideGui = false);
		context.setScreen(() -> new WorkshopScreen(null, null));
		context.waitTicks(10);
		context.takeScreenshot("workshop_parts");
		context.clickScreenButton("screen.extremesports.colors");
		context.waitTicks(5);
		context.takeScreenshot("workshop_colors");
		context.clickScreenButton("screen.extremesports.randomize");
		context.waitTicks(5);
		context.takeScreenshot("workshop_colors_randomized");
		context.clickScreenButton("screen.extremesports.presets");
		context.waitTicks(5);
		context.takeScreenshot("workshop_presets");
		context.clickScreenButton("screen.extremesports.save_preset");
		context.waitTicks(3);
		context.takeScreenshot("workshop_preset_saved");
		context.clickScreenButton("screen.extremesports.apply");
		context.waitTicks(10);
		context.takeScreenshot("workshop_applied");
		context.setScreen(() -> null);

		context.setScreen(() -> new SportsMenuScreen(null));
		context.waitTicks(5);
		context.clickScreenButton("screen.extremesports.tab.challenges");
		context.waitTicks(3);
		context.takeScreenshot("menu_challenges");
		for (String tab : List.of("stats", "unlocks", "settings", "controls")) {
			context.clickScreenButton("screen.extremesports.tab." + tab);
			context.waitTicks(3);
			context.takeScreenshot("menu_" + tab);
		}
		context.setScreen(() -> null);
	}

	// ------------------------------------------------------------------ challenge

	private void challenge(ClientGameTestContext context, TestSingleplayerContext world) {
		mount(context, world, EquipmentKind.STREET_BOARD, -20.5, 0.5, 0.0F);
		view(context, CameraType.THIRD_PERSON_BACK, 0.0F, 15.0F);
		context.setScreen(() -> new SportsMenuScreen(null));
		context.waitTicks(5);
		context.clickScreenButton("screen.extremesports.tab.challenges");
		context.waitTicks(3);
		// The first Start button is Score Attack
		context.clickScreenButton("screen.extremesports.start");
		context.waitTicks(20);
		shot(context, "challenge_countdown", true);
		int phase = context.computeOnClient(client -> ClientSportsState.challenge.phase());
		if (phase != com.extremesports.server.ChallengeManager.PHASE_COUNTDOWN) {
			failures.add("score attack should be counting down, phase=" + phase);
		}
		context.waitTicks(45);
		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(20);
		context.getInput().releaseKey(options -> options.keyUp);
		popAndTap(context, Keybinds.FLIP);
		context.waitTicks(30);
		shot(context, "challenge_running", true);
		String state = context.computeOnClient(client -> ClientSportsState.challenge.challenge() + " phase="
			+ ClientSportsState.challenge.phase() + " progress=" + ClientSportsState.challenge.progress());
		System.out.println("[ES-TEST] challenge: " + state);
		if (!state.startsWith("score_attack phase=" + com.extremesports.server.ChallengeManager.PHASE_RUNNING) || state.endsWith("progress=0")) {
			failures.add("score attack should be running and have counted the kickflip: " + state);
		}
		world.getServer().runCommand("execute as @p run extremesports challenge stop");
		context.waitTicks(5);
		dismount(context, world);
	}

	// ------------------------------------------------------------------ helpers

	private static SportEquipmentEntity riding(Minecraft client) {
		return client.player != null && client.player.getVehicle() instanceof SportEquipmentEntity entity ? entity : null;
	}

	private static boolean waitForContact(ClientGameTestContext context, RideController.Contact contact, int ticks) {
		for (int i = 0; i < ticks; i++) {
			boolean reached = context.computeOnClient(client -> riding(client) != null && riding(client).ride.contact == contact);
			if (reached) {
				return true;
			}
			context.waitTick();
		}
		return false;
	}

	private static void log(ClientGameTestContext context, String label) {
		String state = context.computeOnClient(client -> {
			SportEquipmentEntity e = riding(client);
			if (e == null) {
				return "not riding";
			}
			return String.format("pos=%.2f,%.2f,%.2f v=%s contact=%s air=%d trick=%s auth=%s fwd=%s flipDown=%s",
				e.getX(), e.getY(), e.getZ(), e.getDeltaMovement(), e.ride.contact, e.ride.airTicks,
				e.ride.activeTrick == null ? "-" : e.ride.activeTrick.def.id(), e.isLocalInstanceAuthoritative(),
				client.options.keyUp.isDown(), Keybinds.FLIP.isDown());
		});
		System.out.println("[ES-TEST] " + label + ": " + state);
	}

	/** Crouch, pop, then tap a trick key once (press and release within the same tick). */
	private static void popAndTap(ClientGameTestContext context, net.minecraft.client.KeyMapping key) {
		context.getInput().holdKey(options -> options.keyJump);
		context.waitTicks(5);
		context.getInput().releaseKey(options -> options.keyJump);
		context.waitTicks(1);
		log(context, "before tap");
		context.getInput().pressKey(key);
		log(context, "after tap");
		context.waitTicks(1);
		log(context, "tap+1");
	}

	private void expectTrick(String fragment) {
		for (ComboEntry entry : ClientSportsState.finishedCombo) {
			for (String trick : entry.tricks()) {
				if (trick.contains(fragment)) {
					return;
				}
			}
		}
		List<String> seen = new ArrayList<>();
		ClientSportsState.finishedCombo.forEach(entry -> seen.addAll(entry.tricks()));
		failures.add("expected a trick containing '" + fragment + "' but the last combo was " + seen);
	}

	private static void shot(ClientGameTestContext context, String name, boolean hud) {
		context.runOnClient(client -> {
			client.options.hideGui = !hud;
			client.gui.getChat().clearMessages(false);
		});
		// The HUD is laid out for the window size, so HUD shots use it; world-only shots render at 720p
		context.takeScreenshot(hud ? TestScreenshotOptions.of(name) : TestScreenshotOptions.of(name).withSize(1280, 720));
		context.runOnClient(client -> client.options.hideGui = false);
	}

	private static void place(ClientGameTestContext context, TestSingleplayerContext world, String tp, String name) {
		// Hover in creative flight so the camera stays where it was put
		world.getServer().runOnServer(server -> {
			ServerPlayer player = server.getPlayerList().getPlayers().getFirst();
			player.getAbilities().flying = true;
			player.onUpdateAbilities();
		});
		world.getServer().runCommand("tp @a " + tp);
		context.waitTicks(10);
		world.getClientWorld().waitForChunksRender();
		shot(context, name, false);
	}

	private static void mount(ClientGameTestContext context, TestSingleplayerContext world, EquipmentKind kind, double x, double z, float yaw) {
		world.getServer().runOnServer(server -> {
			ServerPlayer player = server.getPlayerList().getPlayers().getFirst();
			player.teleportTo(player.level(), x, -60.0, z, java.util.Set.of(), yaw, 10.0F, false);
			SportEquipmentEntity entity = ModEntities.forSport(kind.sport()).create(player.level(), EntitySpawnReason.COMMAND);
			entity.setItem(new ItemStack(ModItems.forKind(kind)));
			entity.snapTo(x, -60.0, z, yaw, 0.0F);
			player.level().addFreshEntity(entity);
			player.startRiding(entity);
		});
		context.waitTicks(5);
	}

	private static void dismount(ClientGameTestContext context, TestSingleplayerContext world) {
		world.getServer().runOnServer(server -> {
			ServerPlayer player = server.getPlayerList().getPlayers().getFirst();
			if (player.getVehicle() instanceof SportEquipmentEntity entity) {
				player.stopRiding();
				entity.discard();
			}
		});
		context.runOnClient(client -> {
			if (client.player != null) {
				client.player.getInventory().setSelectedSlot(8);
			}
		});
		context.waitTicks(5);
	}

	/** Points the camera relative to the equipment's heading. */
	private static void view(ClientGameTestContext context, CameraType camera, float yawOffset, float pitch) {
		context.runOnClient(client -> {
			client.options.setCameraType(camera);
			if (client.player != null) {
				float base = client.player.getVehicle() != null ? client.player.getVehicle().getYRot() : 0.0F;
				client.player.setYRot(base + yawOffset);
				client.player.setYHeadRot(base + yawOffset);
				client.player.setXRot(pitch);
			}
		});
	}
}
