package com.mineception.test;

import com.mineception.block.LaptopBlockEntity;
import com.mineception.client.render.DreamSession;
import com.mineception.client.screen.LaptopScreen;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Drives the real client through the laptop: the live picture on the placed laptop, opening it by using it, playing
 * Level 1 with real key and mouse input (mouse look, hotbar keys and wheel, placing and breaking a block, walking and
 * jumping), diving through the screens down to Limbo, the Limbo dead end, Esc and the kick back up, and closing when
 * the laptop is removed. Block edits are checked on the client's level copy and on the server's block entity.
 * Screenshots of every stage are taken for review. Failed checks are collected and reported together at the end.
 */
public class ClientGameTests implements FabricClientGameTest {
	/** The laptop stands on a block so its screen is at eye height. */
	private static final BlockPos DESK = new BlockPos(0, -60, 3);
	private static final BlockPos LAPTOP = DESK.above();

	private final List<String> failures = new ArrayList<>();

	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			setUp(context, world);
			inWorldScreen(context, world);
			openByUsing(context, world);
			if (screenValue(context, LaptopScreen::hasSignal, false)) {
				levelOne(context, world);
				diveToLimbo(context);
				backUp(context);
			} else {
				failures.add("the laptop screen has no signal (no DreamSession for the laptop)");
				context.setScreen(() -> null);
			}
			worldAfterwards(context, world);
			laptopRemoved(context, world);
		}
		if (!failures.isEmpty()) {
			throw new AssertionError("Mineception client gametest checks failed: " + failures);
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// Stages

	private void setUp(ClientGameTestContext context, TestSingleplayerContext world) {
		world.getClientWorld().waitForChunksRender();
		for (String command : List.of("gamemode creative @a", "time set 6000", "weather clear", "gamerule advance_time false",
			"gamerule advance_weather false", "fill -6 -61 -6 6 -61 10 minecraft:smooth_stone",
			"setblock 0 -60 3 minecraft:polished_andesite", "setblock 0 -59 3 mineception:laptop[facing=north]")) {
			world.getServer().runCommand(command);
		}
		context.waitTicks(10);
		boolean placed = world.getServer().computeOnServer(server -> server.overworld().getBlockEntity(LAPTOP) instanceof LaptopBlockEntity);
		if (!placed) {
			failures.add("setblock did not create a laptop block entity");
		}
	}

	/** The placed laptop shows Level 1 live on its screen. */
	private void inWorldScreen(ClientGameTestContext context, TestSingleplayerContext world) {
		world.getServer().runCommand("tp @a 0.5 -60 0.2 0 4");
		context.waitTicks(30);
		world.getClientWorld().waitForChunksRender();
		worldShot(context, "world_laptop");
		// Up close: the screen fills a good part of the view
		world.getServer().runCommand("tp @a 0.5 -60 2.55 0 13");
		context.waitTicks(30);
		worldShot(context, "world_laptop_closeup");
	}

	/** Using the laptop (right click on it with an empty hand) opens the laptop screen. */
	private void openByUsing(ClientGameTestContext context, TestSingleplayerContext world) {
		world.getServer().runCommand("tp @a 0.5 -60 1.0 0 5");
		context.waitTicks(5);
		context.getInput().pressKey(options -> options.keyUse);
		boolean opened = waitUntil(context, client -> client.screen instanceof LaptopScreen, 20);
		if (!opened) {
			failures.add("using the laptop did not open the laptop screen");
			context.setScreen(() -> new LaptopScreen(LAPTOP));
		}
		context.waitTicks(10);
		BlockPos pos = screenValue(context, LaptopScreen::pos, BlockPos.ZERO);
		if (!LAPTOP.equals(pos)) {
			failures.add("the laptop screen is for " + pos + " instead of " + LAPTOP);
		}
		guiShot(context, "gui_level1_controls");
		check(screenValue(context, s -> s.depth() == 1 && !s.isMouseCaptured() && !s.isTransitioning(), false),
			"the laptop should open on Level 1 without the mouse captured");
	}

	/** Mouse capture and look, hotbar, placing and breaking (checked on the server), walking and jumping. */
	private void levelOne(ClientGameTestContext context, TestSingleplayerContext world) {
		float realYaw = context.computeOnClient(client -> client.player.getYRot());
		float realPitch = context.computeOnClient(client -> client.player.getXRot());

		capture(context);
		check(screenValue(context, LaptopScreen::isMouseCaptured, false), "clicking the monitor should capture the mouse");

		// Mouse look turns the avatar by the player's own sensitivity, never the real player
		float yawBefore = avatarValue(context, 1, a -> a.yaw);
		double expected = context.computeOnClient(client -> {
			double s = client.options.sensitivity().get() * 0.6 + 0.2;
			return 120.0 * s * s * s * 8.0 * 0.15 * (client.options.invertMouseX().get() ? -1 : 1);
		});
		context.getInput().moveCursor(120.0, 0.0);
		context.waitTicks(2);
		float yawAfter = avatarValue(context, 1, a -> a.yaw);
		if (Math.abs(MiniPlayer.wrapDegrees(yawAfter - yawBefore) - expected) > 0.5) {
			failures.add("mouse look turned the avatar by " + (yawAfter - yawBefore) + " degrees, expected " + expected);
		}
		context.getInput().moveCursor(-120.0, 0.0);
		context.waitTicks(2);
		guiShot(context, "gui_level1_playing");

		// Tab frees the mouse, clicking the monitor captures it again
		context.getInput().pressKey(GLFW.GLFW_KEY_TAB);
		check(!screenValue(context, LaptopScreen::isMouseCaptured, true), "Tab should release the mouse");
		capture(context);
		check(screenValue(context, LaptopScreen::isMouseCaptured, false), "clicking the monitor again should capture the mouse");

		// Hotbar: number keys and the scroll wheel
		context.getInput().pressKey(options -> options.keyHotbarSlots[4]);
		check(screenValue(context, LaptopScreen::selectedSlot, -1) == 4, "key 5 should select hotbar slot 5");
		context.getInput().scroll(-1.0);
		context.waitTick();
		check(screenValue(context, LaptopScreen::selectedSlot, -1) == 5, "scrolling down should select the next slot");
		context.getInput().pressKey(options -> options.keyHotbarSlots[2]);
		check(screenValue(context, LaptopScreen::selectedSlot, -1) == 2, "key 3 should select hotbar slot 3 (stone)");
		MiniBlock selected = MiniBlock.HOTBAR.get(2);

		placeAndBreak(context, world, selected);

		// Walk forward with the player's own forward key
		double[] start = avatarValue(context, 1, a -> new double[]{a.x, a.y, a.z});
		context.getInput().holdKey(options -> options.keyUp);
		context.waitTicks(5);
		guiShot(context, "gui_level1_walking");
		context.waitTicks(5);
		context.getInput().releaseKey(options -> options.keyUp);
		context.waitTicks(5);
		double[] walked = avatarValue(context, 1, a -> new double[]{a.x, a.y, a.z});
		double distance = Math.hypot(walked[0] - start[0], walked[2] - start[2]);
		if (distance < 0.8) {
			failures.add("holding forward for 10 ticks moved the avatar only " + distance + " blocks");
		}

		// Jump
		boolean onGround = avatarValue(context, 1, a -> a.onGround);
		if (onGround) {
			double groundY = avatarValue(context, 1, a -> a.y);
			context.getInput().holdKey(options -> options.keyJump);
			double top = groundY;
			for (int i = 0; i < 8; i++) {
				context.waitTick();
				top = Math.max(top, avatarValue(context, 1, a -> a.y));
			}
			context.getInput().releaseKey(options -> options.keyJump);
			context.waitTicks(15);
			if (top - groundY < 0.6) {
				failures.add("jumping lifted the avatar only " + (top - groundY) + " blocks");
			}
		} else {
			failures.add("the avatar should be standing on the ground after walking");
		}

		float realYawNow = context.computeOnClient(client -> client.player.getYRot());
		float realPitchNow = context.computeOnClient(client -> client.player.getXRot());
		if (realYawNow != realYaw || realPitchNow != realPitch) {
			failures.add("playing on the laptop turned the real player (" + realYaw + "/" + realPitch + " -> " + realYawNow + "/"
				+ realPitchNow + ")");
		}
	}

	/** Places the selected block on the ground in front of the avatar, then breaks it again, with real clicks. */
	private void placeAndBreak(ClientGameTestContext context, TestSingleplayerContext world, MiniBlock block) {
		float yaw = avatarValue(context, 1, a -> a.yaw);
		context.runOnClient(client -> ((LaptopScreen) client.screen).look(yaw, 55.0F));
		context.waitTick();
		MiniHit hit = screenValue(context, LaptopScreen::lookingAt, null);
		if (hit == null || hit.isLaptop()) {
			failures.add("looking down in front of the spawn should hit the ground, got " + hit);
			return;
		}
		int x = hit.placeX();
		int y = hit.placeY();
		int z = hit.placeZ();
		int index = MiniWorld.index(x, y, z);
		context.getInput().pressMouse(GLFW.GLFW_MOUSE_BUTTON_RIGHT);
		context.waitTicks(3);
		MiniBlock placedClient = context.computeOnClient(client -> session(client).world(1).get(x, y, z));
		check(placedClient == block, "right click should place " + block + " at " + x + "," + y + "," + z + " (client has " + placedClient + ")");
		int placedServer = serverEdit(world, 1, index);
		check(placedServer == block.id, "the server's laptop should record the placed " + block + " (edit = " + placedServer + ")");
		guiShot(context, "gui_level1_placed_block");

		MiniHit again = screenValue(context, LaptopScreen::lookingAt, null);
		if (again == null || again.x() != x || again.y() != y || again.z() != z) {
			failures.add("after placing, the avatar should look at the new block, got " + again);
			return;
		}
		context.getInput().pressMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
		context.waitTicks(3);
		MiniBlock brokenClient = context.computeOnClient(client -> session(client).world(1).get(x, y, z));
		check(brokenClient == MiniBlock.AIR, "left click should break the block (client has " + brokenClient + ")");
		int brokenServer = serverEdit(world, 1, index);
		check(brokenServer == MiniBlock.AIR.id, "the server's laptop should record the broken block (edit = " + brokenServer + ")");
		guiShot(context, "gui_level1_broke_block");
	}

	/** Level 1 -> 2 (programmatic, the avatar walked away), 2 -> 3 with a real right click on the laptop, 3 -> 4. */
	private void diveToLimbo(ClientGameTestContext context) {
		check(screenValue(context, LaptopScreen::diveIn, false), "diving from Level 1 should start");
		check(screenValue(context, LaptopScreen::isTransitioning, false), "a dive should be a transition");
		context.waitTicks(LaptopScreen.DIVE_TICKS / 2);
		guiShot(context, "dive_1_to_2_mid");
		context.waitTicks(LaptopScreen.DIVE_TICKS / 2 - 4);
		guiShot(context, "dive_1_to_2_end");
		finishTransition(context, 2, "dive to Level 2");
		guiShot(context, "level2_arrival");
		context.waitTicks(25);
		guiShot(context, "level2_hotel");

		// From the spawn the avatar looks at its laptop: a real right click dives
		MiniHit hit = screenValue(context, LaptopScreen::lookingAt, null);
		if (hit != null && hit.isLaptop()) {
			context.getInput().pressMouse(GLFW.GLFW_MOUSE_BUTTON_RIGHT);
			check(screenValue(context, LaptopScreen::isTransitioning, false), "right click on the Level 2 laptop should dive");
		} else {
			failures.add("at the Level 2 spawn the avatar should look at the laptop, got " + hit);
			screenValue(context, LaptopScreen::diveIn, false);
		}
		context.waitTicks(LaptopScreen.DIVE_TICKS * 2 / 3);
		guiShot(context, "dive_2_to_3_mid");
		finishTransition(context, 3, "dive to Level 3");
		context.waitTicks(25);
		guiShot(context, "level3_fortress");

		check(screenValue(context, LaptopScreen::diveIn, false), "diving from Level 3 should start");
		context.waitTicks(LaptopScreen.DIVE_TICKS * 3 / 4);
		guiShot(context, "dive_3_to_4_late");
		finishTransition(context, 4, "dive to Limbo");
		context.waitTicks(25);
		guiShot(context, "level4_limbo");

		// Limbo is the bottom: its laptop shows only static and cannot be entered
		check(!screenValue(context, LaptopScreen::diveIn, true), "diving from Limbo must be refused");
		MiniHit limboHit = screenValue(context, LaptopScreen::lookingAt, null);
		if (limboHit != null && limboHit.isLaptop()) {
			context.getInput().pressMouse(GLFW.GLFW_MOUSE_BUTTON_RIGHT);
			context.waitTick();
			String message = screenValue(context, LaptopScreen::messageKey, null);
			check("screen.mineception.cant_go_deeper".equals(message), "right click on Limbo's laptop should say it can't go deeper, got " + message);
			check(screenValue(context, s -> s.depth() == 4 && !s.isTransitioning(), false), "Limbo's laptop must not dive");
			guiShot(context, "limbo_cant_go_deeper");
		} else {
			failures.add("at the Limbo spawn the avatar should look at the laptop, got " + limboHit);
		}
	}

	/** Esc pulls back out one level; falling out of a level kicks back up; Esc at Level 1 closes the laptop. */
	private void backUp(ClientGameTestContext context) {
		context.getInput().pressKey(GLFW.GLFW_KEY_ESCAPE);
		check(screenValue(context, s -> s.isTransitioning() && s.depth() == 3, false), "Esc in Limbo should pull back out to Level 3");
		context.waitTicks(LaptopScreen.EXIT_TICKS / 3);
		guiShot(context, "exit_4_to_3_early");
		context.waitTicks(LaptopScreen.EXIT_TICKS / 3);
		guiShot(context, "exit_4_to_3_mid");
		finishTransition(context, 3, "pull out to Level 3");

		// The kick: drop the Level 3 avatar out of the world
		context.runOnClient(client -> {
			MiniPlayer avatar = session(client).avatar(3);
			avatar.y = avatar.yo = MiniPlayer.KICK_Y - 1.0;
		});
		context.waitTicks(2);
		check(screenValue(context, s -> s.isTransitioning() && s.depth() == 2, false), "falling out of Level 3 should kick back up to Level 2");
		context.waitTicks(3);
		guiShot(context, "kick_3_to_2");
		finishTransition(context, 2, "kick to Level 2");
		double kickedY = avatarValue(context, 3, a -> a.y);
		check(kickedY > MiniPlayer.KICK_Y, "the kicked avatar should be back at its spawn, y = " + kickedY);

		context.getInput().pressKey(GLFW.GLFW_KEY_ESCAPE);
		finishTransition(context, 1, "pull out to Level 1");
		context.waitTicks(15);
		guiShot(context, "back_in_level1");

		context.getInput().pressKey(GLFW.GLFW_KEY_ESCAPE);
		boolean closed = waitUntil(context, client -> client.screen == null, 20);
		check(closed, "Esc at Level 1 should close the laptop");
		context.setScreen(() -> null);
	}

	/** The real-world screen after all that, from the front. */
	private void worldAfterwards(ClientGameTestContext context, TestSingleplayerContext world) {
		world.getServer().runCommand("tp @a 0.5 -60 2.55 0 13");
		context.waitTicks(30);
		worldShot(context, "world_laptop_afterwards");
	}

	/** Breaking the laptop while its screen is open shows "signal lost" and closes the screen. */
	private void laptopRemoved(ClientGameTestContext context, TestSingleplayerContext world) {
		context.setScreen(() -> new LaptopScreen(LAPTOP));
		context.waitTicks(5);
		world.getServer().runCommand("setblock 0 -59 3 minecraft:air");
		context.waitTicks(4);
		check(context.computeOnClient(client -> client.screen instanceof LaptopScreen), "the screen should show the lost signal for a moment");
		guiShot(context, "laptop_removed_signal_lost");
		boolean closed = waitUntil(context, client -> client.screen == null, 60);
		check(closed, "the laptop screen should close when the laptop is removed");

		// A screen for a position without a laptop closes by itself too
		context.setScreen(() -> new LaptopScreen(new BlockPos(5, -60, 5)));
		boolean closedEmpty = waitUntil(context, client -> client.screen == null, 60);
		check(closedEmpty, "a laptop screen without a laptop should close");
		context.setScreen(() -> null);
	}

	// ------------------------------------------------------------------------------------------------------------
	// Helpers

	/** Clicks the middle of the monitor with the left button. */
	private static void capture(ClientGameTestContext context) {
		double[] center = context.computeOnClient(client -> ((LaptopScreen) client.screen).monitorCenterInWindow());
		context.getInput().setCursorPos(center[0], center[1]);
		context.getInput().pressMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
	}

	private void finishTransition(ClientGameTestContext context, int depth, String what) {
		boolean done = waitUntil(context, client -> client.screen instanceof LaptopScreen screen && !screen.isTransitioning(),
			LaptopScreen.DIVE_TICKS + 20);
		int actual = screenValue(context, LaptopScreen::depth, -1);
		if (!done || actual != depth) {
			failures.add(what + ": expected Level " + depth + " after the transition, got " + actual + (done ? "" : " (still moving)"));
		}
	}

	private void check(boolean condition, String failure) {
		if (!condition) {
			failures.add(failure);
		}
	}

	private static boolean waitUntil(ClientGameTestContext context, Predicate<Minecraft> predicate, int ticks) {
		for (int i = 0; i <= ticks; i++) {
			if (context.computeOnClient(predicate::test)) {
				return true;
			}
			context.waitTick();
		}
		return false;
	}

	/** Reads something from the open laptop screen on the client thread, or the fallback if it is not open. */
	private static <T> T screenValue(ClientGameTestContext context, Function<LaptopScreen, @Nullable T> getter, @Nullable T fallback) {
		return context.computeOnClient(client -> client.screen instanceof LaptopScreen screen ? getter.apply(screen) : fallback);
	}

	private static <T> T avatarValue(ClientGameTestContext context, int depth, Function<MiniPlayer, T> getter) {
		return context.computeOnClient(client -> getter.apply(session(client).avatar(depth)));
	}

	private static DreamSession session(Minecraft client) {
		DreamSession session = DreamSession.get(LAPTOP);
		if (session == null) {
			throw new AssertionError("no dream session for the laptop at " + LAPTOP);
		}
		return session;
	}

	/** The block id the server's laptop records for a cell (-1 = no edit, -2 = no laptop). */
	private static int serverEdit(TestSingleplayerContext world, int depth, int index) {
		return world.getServer().computeOnServer(server -> {
			if (!(server.overworld().getBlockEntity(LAPTOP) instanceof LaptopBlockEntity laptop)) {
				return -2;
			}
			Byte id = laptop.data().edits(depth).get(index);
			return id == null ? -1 : id & 0xFF;
		});
	}

	private static void worldShot(ClientGameTestContext context, String name) {
		context.runOnClient(client -> client.options.hideGui = true);
		context.takeScreenshot(TestScreenshotOptions.of("mineception_" + name).withSize(1280, 720));
		context.runOnClient(client -> client.options.hideGui = false);
	}

	private static void guiShot(ClientGameTestContext context, String name) {
		context.runOnClient(client -> client.options.hideGui = false);
		context.takeScreenshot(TestScreenshotOptions.of("mineception_" + name));
	}
}
