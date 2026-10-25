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
		if (mode.equals("world")) {
			RealWorldTest.run(context);
			return;
		}
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
			if (mode.startsWith("plans")) {
				String which = System.getenv().getOrDefault("MA_COMPLEX", "metropolitan");
				for (String id : which.split(",")) {
					plans(context, world, com.modernapartments.build.ComplexType.byId(id));
				}
			}
			if (mode.startsWith("complex")) {
				String which = System.getenv().getOrDefault("MA_COMPLEX", "metropolitan");
				for (String id : which.split(",")) {
					complex(context, world, com.modernapartments.build.ComplexType.byId(id));
				}
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

	/** Generates, validates and pastes a complex, then photographs it inside and out. */
	private void complex(ClientGameTestContext context, TestSingleplayerContext world, com.modernapartments.build.ComplexType type) {
		long seed = Long.parseLong(System.getenv().getOrDefault("MA_SEED", "1234"));
		long t0 = System.currentTimeMillis();
		com.modernapartments.build.BlockBuffer buf = com.modernapartments.build.BuildCache.generate(type, seed);
		long t1 = System.currentTimeMillis();
		com.modernapartments.build.validation.ReachabilityValidator.Report report =
			com.modernapartments.build.validation.ReachabilityValidator.validate(buf);
		System.out.println("[complex] " + type.id() + " generated in " + (t1 - t0) + " ms, validated in "
			+ (System.currentTimeMillis() - t1) + " ms: units=" + buf.markers("unit").size() + " markers=" + report.markersChecked()
			+ " unreachable=" + report.unreachable().size() + " warnings=" + report.warnings().size() + " nodes=" + report.nodesVisited());
		report.unreachable().stream().limit(40).forEach(u -> System.out.println("[complex] unreachable " + u));
		report.warnings().stream().limit(40).forEach(w -> System.out.println("[complex] warning " + w));
		context.runOnClient(client -> client.options.renderDistance().set(12));
		world.getServer().runOnServer(server -> server.getPlayerList().setViewDistance(12));
		int ox = pasteOnNewLot(world, buf);
		context.waitTicks(20);
		int cx = ox + buf.sizeX / 2;
		int cz = buf.sizeZ / 2;
		int gy = buf.groundY;
		String id = type.id();
		// exterior: three-quarter views aimed at the middle of the building, an aerial and a street view
		double tx = cx;
		double ty = gy + Math.min(buf.sizeY - gy, 60) * 0.45;
		double tz = cz;
		double dist = Math.max(buf.sizeX, buf.sizeZ) * 0.95 + 12;
		double[][] cams = {
			{cx - dist * 0.7, gy + dist * 0.45, -dist * 0.55},
			{cx + dist * 0.7, gy + dist * 0.45, -dist * 0.55},
			{cx + dist * 0.8, gy + dist * 0.5, buf.sizeZ + dist * 0.4},
			{cx, gy + dist * 1.2, cz - dist * 0.25},
			{cx - 9, gy + 2.6, -7},
		};
		String[] names = {"front_left", "front_right", "back_right", "aerial", "street"};
		for (int i = 0; i < cams.length; i++) {
			double[] p = cams[i];
			double aimY = i == 4 ? gy + 8 : (i == 3 ? gy : ty);
			double dx = tx - p[0];
			double dy = aimY - p[1];
			double dz = tz - p[2];
			float yaw = (float) Math.toDegrees(Math.atan2(-dx, dz));
			float pitch = (float) -Math.toDegrees(Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)));
			world.getServer().runCommand(String.format(java.util.Locale.ROOT, "tp @a %.1f %.1f %.1f %.1f %.1f", p[0], p[1], p[2], yaw, pitch));
			context.waitTicks(10);
			settle(world);
			context.takeScreenshot(TestScreenshotOptions.of(id + "_ext_" + names[i]).withSize(1600, 900));
		}
		// interiors at amenity markers and a sample of units (near chunks only)
		context.runOnClient(client -> client.options.renderDistance().set(3));
		List<com.modernapartments.build.BlockBuffer.Marker> shots = new java.util.ArrayList<>(buf.markers("amenity"));
		List<com.modernapartments.build.BlockBuffer.Marker> units = buf.markers("unit");
		for (int i = 0; i < units.size(); i += Math.max(1, units.size() / 6)) {
			shots.add(units.get(i));
		}
		int n = 0;
		for (com.modernapartments.build.BlockBuffer.Marker m : shots) {
			BlockPos p = m.pos();
			for (float yaw : m.type().equals("unit") ? new float[] {30f, 210f} : new float[] {30f}) {
				world.getServer().runCommand(String.format(java.util.Locale.ROOT, "tp @a %.1f %.1f %.1f %.1f 10",
					ox + p.getX() + 0.5, p.getY() + 0.1, p.getZ() + 0.5, yaw));
				context.waitTicks(4);
				settleNear(world);
				context.takeScreenshot(TestScreenshotOptions.of(String.format("%s_int_%02d_%s_%d", id, n, m.label().replace(' ', '_')
					.replace('\'', '_').replace('&', 'n'), (int) yaw)).withSize(1280, 720));
			}
			n++;
		}
	}

	/** West edge of the next free patch of ground for a complex (each gets its own; nothing is pasted twice). */
	private static int nextLot;

	/** Sets x x0..x0+sizeX-1, y y0..y1-1, z 0..sizeZ-1 to air, top down. */
	private static void clear(TestSingleplayerContext world, int x0, int sizeX, int y0, int y1, int sizeZ) {
		world.getServer().runOnServer(server -> {
			ServerLevel level = server.overworld();
			BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
			for (int y = y1 - 1; y >= y0; y--) {
				for (int z = 0; z < sizeZ; z++) {
					for (int x = x0; x < x0 + sizeX; x++) {
						p.set(x, y, z);
						if (!level.getBlockState(p).isAir()) {
							level.setBlock(p, Blocks.AIR.defaultBlockState(), net.minecraft.world.level.block.Block.UPDATE_CLIENTS
								| net.minecraft.world.level.block.Block.UPDATE_SKIP_ALL_SIDEEFFECTS);
						}
					}
				}
			}
		});
	}

	/**
	 * Pastes a complex on a fresh lot east of the previous one and returns the lot's x. Clearing a complex and
	 * pasting the next over it in the same few ticks left some sections empty on the client.
	 */
	private static int pasteOnNewLot(TestSingleplayerContext world, com.modernapartments.build.BlockBuffer buf) {
		int x0 = nextLot;
		nextLot += buf.sizeX + 64;
		world.getServer().runOnServer(server -> TestPaste.paste(server.overworld(), buf, new BlockPos(x0, 0, 0), buf.sizeY));
		return x0;
	}

	/**
	 * Floor plans: pastes a complex, then cuts it away floor by floor from the top and photographs each level
	 * straight down, so every room's furniture can be checked at a glance.
	 */
	private void plans(ClientGameTestContext context, TestSingleplayerContext world, com.modernapartments.build.ComplexType type) {
		long seed = Long.parseLong(System.getenv().getOrDefault("MA_SEED", "1234"));
		com.modernapartments.build.BlockBuffer buf = com.modernapartments.build.BuildCache.generate(type, seed);
		int ox = pasteOnNewLot(world, buf);
		java.util.TreeSet<Integer> unitFloors = new java.util.TreeSet<>();
		java.util.TreeSet<Integer> floors = new java.util.TreeSet<>();
		buf.markers("unit").forEach(m -> unitFloors.add(m.pos().getY()));
		buf.markers("amenity").forEach(m -> floors.add(m.pos().getY()));
		floors.addAll(List.of(unitFloors.first(), unitFloors.last()));
		List<Integer> typical = new java.util.ArrayList<>(unitFloors);
		floors.add(typical.get(typical.size() / 2));
		// MA_PLAN_FLOORS=7,17 limits the pictures to those levels (marker y, i.e. slab + 1)
		String only = System.getenv().getOrDefault("MA_PLAN_FLOORS", "");
		if (!only.isBlank()) {
			java.util.Set<Integer> keep = new java.util.HashSet<>();
			for (String part : only.split(",")) {
				keep.add(Integer.parseInt(part.trim()));
			}
			floors.retainAll(keep);
		}
		// a short render distance lets the building's own chunks finish meshing before each picture
		context.runOnClient(client -> client.options.renderDistance().set(5));
		world.getServer().runOnServer(server -> server.getPlayerList().setViewDistance(5));
		int cut = buf.sizeY;
		for (int y : floors.descendingSet()) {
			int top = y + 2;
			if (top >= cut) {
				continue;
			}
			clear(world, ox, buf.sizeX, top, cut, buf.sizeZ);
			cut = top;
			double h = Math.max(buf.sizeX, buf.sizeZ) * 0.72 + 4;
			world.getServer().runCommand(String.format(java.util.Locale.ROOT, "tp @a %.1f %.1f %.1f 180 90", ox + buf.sizeX / 2.0, y + h,
				buf.sizeZ / 2.0));
			context.waitTicks(10);
			settle(world);
			context.takeScreenshot(TestScreenshotOptions.of(String.format("%s_plan_y%03d", type.id(), y)).withSize(1600, 1600));
		}
	}

	static void settleNear(TestSingleplayerContext world) {
		try {
			world.getClientWorld().waitForChunksRender(200);
		} catch (AssertionError e) {
			System.out.println("[complex] near chunks still rendering");
		}
	}

	/** Waits (up to a minute) for chunk meshes; slow software rendering is tolerated. */
	static void settle(TestSingleplayerContext world) {
		try {
			world.getClientWorld().waitForChunksRender(1200);
		} catch (AssertionError e) {
			System.out.println("[complex] chunks still rendering, taking the shot anyway");
		}
	}

	static void dump(com.modernapartments.build.BlockBuffer buf, int x0, int z0, int x1, int z1, int y) {
		TestDump.dump(buf, x0, z0, x1, z1, y);
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
