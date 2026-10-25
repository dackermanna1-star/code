package com.modernapartments.gametest;

import com.modernapartments.block.ApartmentDoorBlock;
import com.modernapartments.block.CeilingLampBlock;
import com.modernapartments.block.DecorBlock;
import com.modernapartments.block.ElevatorDoorBlock;
import com.modernapartments.block.FurnitureBlock;
import com.modernapartments.block.TallFurnitureBlock;
import com.modernapartments.block.TwoPartFurnitureBlock;
import com.modernapartments.registry.ModBlocks;
import java.util.List;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

public class ApartmentsClientGameTest implements FabricClientGameTest {
	private static final int COLUMNS = 10;
	private static final int SPACING = 2;
	private static final int ROW_SPACING = 8;
	private static final int FLOOR_Y = -61;

	@Override
	public void runTest(ClientGameTestContext context) {
		String mode = System.getProperty("modernapartments.test", System.getenv().getOrDefault("MA_TEST", "showroom"));
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			world.getClientWorld().waitForChunksRender();
			world.getServer().runCommand("time set noon");
			world.getServer().runCommand("weather clear");
			world.getServer().runCommand("gamemode spectator @a");
			world.getServer().runCommand("gamerule doDaylightCycle false");
			context.runOnClient(client -> client.options.hideGui = true);
			if (mode.contains("showroom")) {
				showroom(context, world);
			}
			if (mode.contains("units")) {
				units(context, world, false);
			}
			if (mode.contains("lofts")) {
				units(context, world, true);
			}
		}
	}

	private void showroom(ClientGameTestContext context, TestSingleplayerContext world) {
		List<Block> blocks = ModBlocks.ALL.stream().filter(b -> b.getClass() != Block.class
			&& !(b instanceof net.minecraft.world.level.block.TransparentBlock)
			&& !(b instanceof net.minecraft.world.level.block.RotatedPillarBlock)
			&& !(b instanceof com.modernapartments.block.FacingCubeBlock)
			&& !(b instanceof com.modernapartments.block.LightPanelBlock)).toList();
		int rows = (blocks.size() + COLUMNS - 1) / COLUMNS;
		world.getServer().runOnServer(server -> {
			ServerLevel level = server.overworld();
			for (int x = -6; x < COLUMNS * SPACING + 6; x++) {
				for (int z = -6; z < rows * ROW_SPACING + 12; z++) {
					level.setBlock(new BlockPos(x, FLOOR_Y, z), Blocks.SMOOTH_QUARTZ.defaultBlockState(), 2);
				}
			}
			for (int i = 0; i < blocks.size(); i++) {
				BlockPos pos = new BlockPos((i % COLUMNS) * SPACING, FLOOR_Y + 1, (i / COLUMNS) * ROW_SPACING);
				place(level, pos, blocks.get(i));
			}
		});
		for (int r = 0; r < rows; r++) {
			int z = r * ROW_SPACING + 8;
			world.getServer().runCommand(String.format("tp @a %d %d %d 180 22", (COLUMNS - 1) * SPACING / 2, FLOOR_Y + 5, z));
			context.waitTicks(5);
			world.getClientWorld().waitForChunksRender();
			context.takeScreenshot(TestScreenshotOptions.of("showroom_" + r).withSize(1600, 900));
		}
	}

	private void units(ClientGameTestContext context, TestSingleplayerContext world, boolean lofts) {
		long seed = Long.parseLong(System.getProperty("modernapartments.seed", System.getenv().getOrDefault("MA_SEED", "1234")));
		List<UnitShowcase.Placed> placed = new java.util.ArrayList<>();
		com.modernapartments.build.BlockBuffer buf = UnitShowcase.build(seed, placed, lofts);
		buf.addMarker("entrance", 1, 1, UnitShowcase.CORRIDOR_Z + 1, "corridor");
		com.modernapartments.build.validation.ReachabilityValidator.Report report =
			com.modernapartments.build.validation.ReachabilityValidator.validate(buf);
		System.out.println("[units] markers=" + report.markersChecked() + " unreachable=" + report.unreachable().size()
			+ " warnings=" + report.warnings().size());
		report.unreachable().forEach(u -> System.out.println("[units] unreachable " + u));
		report.warnings().forEach(w -> System.out.println("[units] warning " + w));
		if (!report.unreachable().isEmpty() && lofts) {
			for (int y = 1; y <= 6; y++) {
				System.out.println("[map] y=" + y);
				dump(buf, 0, 29, 17, 47, y);
			}
		}
		int cut = lofts ? 4 : 4;
		BlockPos origin = new BlockPos(0, FLOOR_Y, 0);
		world.getServer().runOnServer(server -> {
			ServerLevel level = server.overworld();
			TestPaste.paste(level, buf, origin, cut);
		});
		context.waitTicks(10);
		for (UnitShowcase.Placed u : placed) {
			double cx = u.x0() + u.w() / 2.0;
			double cz = u.z0() + u.d() / 2.0;
			int height = Math.max(u.w(), u.d()) + 6;
			world.getServer().runCommand(String.format(java.util.Locale.ROOT, "tp @a %.1f %d %.1f 180 90", cx, FLOOR_Y + height, cz));
			context.waitTicks(5);
			world.getClientWorld().waitForChunksRender();
			context.takeScreenshot(TestScreenshotOptions.of((lofts ? "loft_top_" : "unit_top_") + u.label().replace(' ', '_'))
				.withSize(1280, 1280));
		}
		if (lofts) {
			world.getServer().runOnServer(server -> TestPaste.paste(server.overworld(), buf, origin, 8));
			context.waitTicks(10);
			for (UnitShowcase.Placed u : placed) {
				double cx = u.x0() + u.w() / 2.0;
				double cz = u.z0() + u.d() / 2.0;
				world.getServer().runCommand(String.format(java.util.Locale.ROOT, "tp @a %.1f %d %.1f 180 90", cx, FLOOR_Y + 30, cz));
				context.waitTicks(5);
				world.getClientWorld().waitForChunksRender();
				context.takeScreenshot(TestScreenshotOptions.of("loft_upper_" + u.label()).withSize(1280, 1280));
			}
		}
		// eye-level views: full height with ceilings
		world.getServer().runOnServer(server -> TestPaste.paste(server.overworld(), buf, origin, buf.sizeY));
		context.waitTicks(10);
		for (UnitShowcase.Placed u : placed) {
			// stand near the front of the living area looking towards the windows
			boolean north = u.front() == net.minecraft.core.Direction.NORTH;
			double cx = u.x0() + u.w() / 2.0;
			double z = north ? u.z0() + 2.5 : u.z0() + u.d() - 2.5;
			float yaw = north ? 0 : 180;
			world.getServer().runCommand(String.format(java.util.Locale.ROOT, "tp @a %.1f %d %.1f %.0f 15", cx, FLOOR_Y + 1, z, yaw));
			context.waitTicks(5);
			world.getClientWorld().waitForChunksRender();
			context.takeScreenshot(TestScreenshotOptions.of((lofts ? "loft_eye_" : "unit_eye_") + u.label().replace(' ', '_'))
				.withSize(1280, 720));
		}
	}

	/** Prints a character map of one buffer layer (for debugging layouts in the log). */
	static void dump(com.modernapartments.build.BlockBuffer buf, int x0, int z0, int x1, int z1, int y) {
		for (int z = z0; z <= z1; z++) {
			StringBuilder line = new StringBuilder("[map] ");
			for (int x = x0; x <= x1; x++) {
				BlockState s = buf.get(x, y, z);
				BlockState below = buf.get(x, y - 1, z);
				char ch;
				if (s == null) {
					ch = below == null ? ' ' : '_';
				} else if (s.isAir()) {
					ch = below == null || below.isAir() ? 'v' : '.';
				} else if (s.getBlock() instanceof DoorBlock) {
					ch = 'D';
				} else if (s.getBlock() instanceof net.minecraft.world.level.block.BedBlock) {
					ch = 'b';
				} else if (s.getBlock() instanceof net.minecraft.world.level.block.CarpetBlock) {
					ch = 'r';
				} else if (s.isCollisionShapeFullBlock(net.minecraft.world.level.EmptyBlockGetter.INSTANCE, BlockPos.ZERO)) {
					ch = '#';
				} else if (s.getCollisionShape(net.minecraft.world.level.EmptyBlockGetter.INSTANCE, BlockPos.ZERO).isEmpty()) {
					ch = ',';
				} else {
					ch = 'f';
				}
				line.append(ch);
			}
			System.out.println(line);
		}
	}

	private static void place(ServerLevel level, BlockPos pos, Block block) {
		BlockState s = block.defaultBlockState();
		Direction facing = Direction.SOUTH;
		if (s.hasProperty(FurnitureBlock.FACING)) {
			s = s.setValue(FurnitureBlock.FACING, facing);
		}
		String id = BuiltInRegistries.BLOCK.getKey(block).getPath();
		if (block instanceof FurnitureBlock f && f.isWallMounted()) {
			level.setBlock(pos.north(), Blocks.WHITE_CONCRETE.defaultBlockState(), 2);
			level.setBlock(pos.north().above(), Blocks.WHITE_CONCRETE.defaultBlockState(), 2);
			pos = pos.above();
		}
		if (block instanceof CeilingLampBlock || (block instanceof DecorBlock && (id.startsWith("ceiling") || id.equals("smoke_detector")
			|| id.equals("sprinkler") || id.equals("security_camera_dome") || id.equals("punching_bag")))) {
			pos = pos.above(2);
			level.setBlock(pos.above(), Blocks.WHITE_CONCRETE.defaultBlockState(), 2);
		}
		if (block instanceof TallFurnitureBlock || block instanceof ElevatorDoorBlock) {
			level.setBlock(pos, s.setValue(TallFurnitureBlock.HALF, DoubleBlockHalf.LOWER), 2 | 16);
			level.setBlock(pos.above(), s.setValue(TallFurnitureBlock.HALF, DoubleBlockHalf.UPPER), 2 | 16);
		} else if (block instanceof ApartmentDoorBlock) {
			s = s.setValue(DoorBlock.FACING, facing);
			level.setBlock(pos, s.setValue(DoorBlock.HALF, DoubleBlockHalf.LOWER), 2 | 16);
			level.setBlock(pos.above(), s.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER), 2 | 16);
		} else if (block instanceof TwoPartFurnitureBlock) {
			level.setBlock(pos, s.setValue(TwoPartFurnitureBlock.PART, BedPart.FOOT), 2 | 16);
			level.setBlock(pos.relative(facing), s.setValue(TwoPartFurnitureBlock.PART, BedPart.HEAD), 2 | 16);
		} else {
			level.setBlock(pos, s, 2 | 16);
		}
	}
}
