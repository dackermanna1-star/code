package com.blademode.test;

import com.blademode.block.CutBlockEntity;
import com.blademode.piece.PieceEntity;
import com.blademode.registry.ModBlocks;
import com.blademode.registry.ModEntities;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.TestInput;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * End-to-end test in a real client: builds a tree and a house, cuts them by simulating
 * "hold attack, move the mouse, release", and records screenshots of every stage.
 */
public class BladeModeClientTest implements FabricClientGameTest {
	private static final Logger LOG = LoggerFactory.getLogger("blademode-test");

	@Override
	public void runTest(ClientGameTestContext context) {
		context.getInput().resizeWindow(1280, 720);
		// Software rendering in CI is slow: keep the world small.
		context.runOnClient(client -> {
			client.options.renderDistance().set(5);
			client.options.simulationDistance().set(5);
			client.options.framerateLimit().set(30);
			client.options.menuBackgroundBlurriness().set(0);
		});
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			TestServerContext server = world.getServer();
			server.runCommand("gamerule doDaylightCycle false");
			server.runCommand("time set 6000");
			server.runCommand("gamemode creative @a");
			world.getClientWorld().waitForChunksRender();

			treeScene(context, world, server);
			houseScene(context, world, server);
		}
	}

	private void treeScene(ClientGameTestContext context, TestSingleplayerContext world, TestServerContext server) {
		// Flat world: grass at y=-61, first air block at y=-60.
		server.runCommand("place feature minecraft:oak 0 -60 6");
		server.runCommand("tp @p 0.5 -60 0.5 -12 5");
		server.runCommand("give @p blademode:hf_blade");
		context.waitTicks(10);
		world.getClientWorld().waitForChunksRender();
		context.takeScreenshot("tree_01_before");
		logColumn(server, "tree trunk before", new BlockPos(0, -60, 6), 9);

		// Diagonal stroke through the bottom of the trunk, from upper left to lower right.
		TestInput input = context.getInput();
		input.holdMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
		context.waitTicks(2);
		for (int i = 0; i < 10; i++) {
			input.moveCursor(15, 7.5);
			context.waitTick();
		}
		context.takeScreenshot("tree_02_drawing");
		input.releaseMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
		context.waitTicks(2);
		context.takeScreenshot("tree_03_just_cut");
		logPieces(server, "tree t+2");
		logColumn(server, "tree trunk after", new BlockPos(0, -60, 6), 9);
		for (int i = 1; i <= 3; i++) {
			context.waitTicks(4);
			logPieces(server, "tree t+" + (2 + i * 4));
			context.takeScreenshot("tree_04_fall_" + i);
		}

		// Second stroke: slice the falling crown in two while it is still moving. Stand off to its
		// side, aim at its centre of mass and draw a level, centred line across the whole screen.
		Vec3 crown = largestPiece(server);
		double eyeY = -60 + 1.62;
		float pitch = (float) -Math.toDegrees(Math.atan2(crown.y - eyeY, 8.0));
		server.runCommand(String.format(Locale.ROOT, "tp @p %.2f -60 %.2f 90 %.1f", crown.x + 8.0, crown.z, pitch));
		context.waitTicks(1);
		input.pressKey(GLFW.GLFW_KEY_V);
		context.waitTick();
		input.holdMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
		context.waitTick();
		for (int i = 0; i < 12; i++) {
			input.moveCursor(30, 0);
			context.waitTick();
		}
		context.takeScreenshot("tree_05_second_stroke");
		input.releaseMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
		input.pressKey(GLFW.GLFW_KEY_V);
		context.waitTicks(2);
		int afterRecut = logPieces(server, "tree after second cut");
		context.takeScreenshot("tree_06_recut");
		if (afterRecut < 2) {
			throw new AssertionError("the second stroke should have cut the falling crown in two");
		}
		for (int i = 1; i <= 4; i++) {
			context.waitTicks(6);
			logPieces(server, "tree recut t+" + (i * 6));
			context.takeScreenshot("tree_07_pieces_" + i);
		}
		server.runCommand("tp @p 9.5 -58 4.5 75 15");
		context.waitTicks(5);
		context.takeScreenshot("tree_08_side_view");
		context.waitTicks(80);
		logPieces(server, "tree later");
		context.takeScreenshot("tree_09_later");

		// Resting pieces are solid for other entities: drop an armor stand onto the largest one.
		Vec3 rest = largestPiece(server);
		double top = server.computeOnServer(s -> s.overworld().getEntities(ModEntities.PIECE, e -> true).stream()
			.max(Comparator.comparingInt(e -> e.getPieceData().blocks().size()))
			.map(e -> e.getBoundingBox().maxY).orElse(-60.0));
		server.runCommand(String.format(Locale.ROOT, "summon minecraft:armor_stand %.2f %.2f %.2f", rest.x, top + 1.0, rest.z));
		context.waitTicks(60);
		double standY = server.computeOnServer(s -> s.overworld().getEntities(EntityType.ARMOR_STAND, e -> true).stream()
			.mapToDouble(Entity::getY).findFirst().orElse(Double.NaN));
		LOG.info("[tree] armor stand dropped at y={} onto the piece at {} came to rest at y={}", String.format("%.2f", top + 1.0), rest, String.format("%.3f", standY));
		context.takeScreenshot("tree_10_armor_stand");
		if (!(standY > -59.6)) {
			throw new AssertionError("the armor stand fell through the resting piece (y=" + standY + ")");
		}
		server.runCommand("kill @e[type=minecraft:armor_stand]");
	}

	/** Centre of mass of the largest piece in the world. */
	private static Vec3 largestPiece(TestServerContext server) {
		return server.computeOnServer(s -> s.overworld().getEntities(ModEntities.PIECE, e -> true).stream()
			.max(Comparator.comparingInt(e -> e.getPieceData().blocks().size()))
			.map(Entity::position)
			.orElseThrow(() -> new AssertionError("no pieces in the world")));
	}

	private void houseScene(ClientGameTestContext context, TestSingleplayerContext world, TestServerContext server) {
		// A 7x7 cobblestone/plank house with windows and a flat roof.
		server.runCommand("fill 20 -60 8 26 -56 14 minecraft:oak_planks hollow");
		server.runCommand("fill 20 -60 8 20 -56 8 minecraft:oak_log");
		server.runCommand("fill 26 -60 8 26 -56 8 minecraft:oak_log");
		server.runCommand("fill 20 -60 14 20 -56 14 minecraft:oak_log");
		server.runCommand("fill 26 -60 14 26 -56 14 minecraft:oak_log");
		server.runCommand("fill 19 -55 7 27 -55 15 minecraft:stone_bricks");
		server.runCommand("fill 23 -60 8 23 -59 8 minecraft:air");
		server.runCommand("fill 21 -58 8 22 -58 8 minecraft:glass_pane");
		server.runCommand("fill 24 -58 8 25 -58 8 minecraft:glass_pane");
		server.runCommand("setblock 23 -57 7 minecraft:wall_torch[facing=north]");
		server.runCommand("tp @p 23.5 -60 -1.5 0 0");
		context.waitTicks(10);
		world.getClientWorld().waitForChunksRender();
		context.takeScreenshot("house_01_before");

		// Centred line: a long diagonal stroke (about 30 degrees) through the middle of the screen.
		TestInput input = context.getInput();
		input.pressKey(GLFW.GLFW_KEY_V);
		context.waitTicks(2);
		input.holdMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
		context.waitTicks(2);
		for (int i = 0; i < 16; i++) {
			input.moveCursor(13.3, 9.0);
			context.waitTick();
		}
		context.takeScreenshot("house_02_drawing");
		input.releaseMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
		input.pressKey(GLFW.GLFW_KEY_V);
		context.waitTicks(2);
		context.takeScreenshot("house_03_just_cut");
		logPieces(server, "house t+2");
		for (int i = 1; i <= 8; i++) {
			context.waitTicks(5);
			logPieces(server, "house t+" + (2 + i * 5));
			if (i % 2 == 0) {
				context.takeScreenshot("house_04_slide_" + i);
			}
		}
		context.waitTicks(60);
		context.takeScreenshot("house_05_after");
		logPieces(server, "house settled");
		server.runCommand("tp @p 33.5 -57 2.5 50 20");
		context.waitTicks(5);
		context.takeScreenshot("house_06_side_view");
		server.runCommand("tp @p 12.5 -57 2.5 -45 20");
		context.waitTicks(5);
		context.takeScreenshot("house_07_other_side");

		// Leave the world quiet before it closes, so no entity traffic is in flight at disconnect.
		server.runCommand("kill @e[type=blademode:piece]");
		context.waitTicks(20);
	}

	private static int logPieces(TestServerContext server, String label) {
		return server.computeOnServer((MinecraftServer s) -> {
			ServerLevel level = s.overworld();
			List<? extends PieceEntity> pieces = level.getEntities(ModEntities.PIECE, e -> true);
			LOG.info("[{}] {} piece(s)", label, pieces.size());
			for (PieceEntity p : pieces) {
				LOG.info("  piece #{} blocks={} mass={} pos=({}, {}, {}) vel=({}, {}, {}) ang={} sleeping={} rest={} rot={}",
					p.getId(), p.getPieceData().blocks().size(), String.format("%.2f", p.body().mass),
					String.format("%.3f", p.getX()), String.format("%.3f", p.getY()), String.format("%.3f", p.getZ()),
					String.format("%.3f", p.vel.x), String.format("%.3f", p.vel.y), String.format("%.3f", p.vel.z),
					String.format("%.3f", p.angVel.length()), p.sleeping, p.restTicks, p.rot);
				if (label.endsWith("t+2") && p.getPieceData().blocks().size() <= 12) {
					StringBuilder sb = new StringBuilder();
					for (var b : p.getPieceData().blocks()) {
						sb.append("\n      ").append(b.pos().toShortString()).append(' ').append(b.state()).append(" planes=").append(b.planes().size());
					}
					LOG.info("    blocks:{}", sb);
				}
			}
			return pieces.size();
		});
	}

	private static void logColumn(TestServerContext server, String label, BlockPos base, int height) {
		server.runOnServer((MinecraftServer s) -> {
			ServerLevel level = s.overworld();
			StringBuilder sb = new StringBuilder();
			for (int i = 0; i < height; i++) {
				BlockPos p = base.above(i);
				BlockState st = level.getBlockState(p);
				sb.append("\n    y=").append(p.getY()).append(' ').append(st);
				if (st.is(ModBlocks.CUT_BLOCK) && level.getBlockEntity(p) instanceof CutBlockEntity be) {
					sb.append(" original=").append(be.getOriginal()).append(" planes=").append(be.getPlanes());
				}
			}
			LOG.info("[{}]{}", label, sb);
		});
	}
}
