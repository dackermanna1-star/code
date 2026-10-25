package com.modernapartments.gametest;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.BuildCache;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.placement.PlacementManager;
import com.modernapartments.build.placement.PlacementTransform;
import com.modernapartments.world.ApartmentPiece;
import com.mojang.datafixers.util.Pair;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.minecraft.client.gui.screens.worldselection.WorldCreationUiState;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * MA_TEST=world: a default-preset world (as from the create-world screen). Builds a complex on natural terrain
 * through the same pipeline as blueprints, checks and photographs it, undoes it, then finds and photographs a
 * complex that generated with the world.
 */
final class RealWorldTest {
	private RealWorldTest() {
	}

	static void run(ClientGameTestContext context) {
		String seed = System.getenv().getOrDefault("MA_WORLD_SEED", "20261025");
		ComplexType type = ComplexType.byId(System.getenv().getOrDefault("MA_COMPLEX", "parkside"));
		try (TestSingleplayerContext world = context.worldBuilder().setUseConsistentSettings(false).adjustSettings(creator -> {
			creator.setSeed(seed);
			creator.setGameMode(WorldCreationUiState.SelectedGameMode.CREATIVE);
			creator.setAllowCommands(true);
			creator.getGameRules().set(GameRules.ADVANCE_TIME, false, null);
			creator.getGameRules().set(GameRules.ADVANCE_WEATHER, false, null);
			creator.getGameRules().set(GameRules.SPAWN_MOBS, false, null);
		}).create()) {
			world.getClientWorld().waitForChunksRender();
			world.getServer().runCommand("time set noon");
			world.getServer().runCommand("weather clear");
			world.getServer().runCommand("gamemode spectator @a");
			context.runOnClient(client -> {
				client.options.hideGui = true;
				client.options.renderDistance().set(12);
			});
			placed(context, world, type);
			natural(context, world);
		}
	}

	// ------------------------------------------------------------------ placement on natural terrain
	private static void placed(ClientGameTestContext context, TestSingleplayerContext world, ComplexType type) {
		long buildSeed = 1234L;
		PlacementTransform t = world.getServer().computeOnServer(server -> {
			ServerLevel level = server.overworld();
			BlockPos player = server.getPlayerList().getPlayers().get(0).blockPosition();
			int size = Math.max(type.sizeX(), type.sizeZ());
			BlockPos best = null;
			Direction bestDir = Direction.SOUTH;
			int bestScore = Integer.MAX_VALUE;
			int bestGround = 0;
			for (int ring = 0; ring < 3 && bestScore > 6; ring++) {
				for (Direction d : Direction.Plane.HORIZONTAL) {
					BlockPos centre = player.relative(d, size / 2 + 24 + ring * 64);
					int[] heights = new int[9];
					int water = 0;
					int i = 0;
					for (int sx = -1; sx <= 1; sx++) {
						for (int sz = -1; sz <= 1; sz++) {
							int x = centre.getX() + sx * size / 2;
							int z = centre.getZ() + sz * size / 2;
							level.getChunk(x >> 4, z >> 4);
							int surface = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
							if (surface - level.getHeight(Heightmap.Types.OCEAN_FLOOR, x, z) > 1) {
								water++;
							}
							heights[i++] = surface - 1;
						}
					}
					Arrays.sort(heights);
					int score = heights[8] - heights[0] + water * 50;
					System.out.println("[world] candidate " + centre.toShortString() + " relief " + (heights[8] - heights[0]) + " water " + water);
					if (score < bestScore) {
						bestScore = score;
						best = centre;
						bestDir = d;
						bestGround = heights[4];
					}
				}
			}
			// the front faces back towards the spawn point, the building extends away from it
			Direction front = bestDir.getOpposite();
			BlockPos frontCentre = new BlockPos(best.getX(), bestGround, best.getZ()).relative(front, type.sizeZ() / 2);
			PlacementTransform transform = PlacementManager.transformFor(type, frontCentre, front);
			if (PlacementManager.checkFits(level, transform) != null) {
				throw new AssertionError("does not fit at " + frontCentre);
			}
			PlacementManager.start(level, type, buildSeed, transform, null);
			return transform;
		});
		long start = System.currentTimeMillis();
		context.waitTicks(20);
		while (world.getServer().computeOnServer(server -> PlacementManager.isBusy())) {
			if (System.currentTimeMillis() - start > 30 * 60_000L) {
				throw new AssertionError("placement did not finish");
			}
			context.waitTicks(20);
		}
		System.out.println("[world] placed " + type.id() + " at " + t.min().toShortString() + " facing rotation " + t.rotation() + " in "
			+ (System.currentTimeMillis() - start) + " ms");
		BlockBuffer buf = BuildCache.get(type, buildSeed);
		world.getServer().runOnServer(server -> {
			ServerLevel level = server.overworld();
			if (PlacementManager.placed(level).size() != 1) {
				throw new AssertionError("placement was not recorded");
			}
			checkHomes(level, buf, t, "placed");
		});
		BoundingBox box = t.footprintBox();
		int ground = t.worldY(type.groundY());
		exterior(context, world, "placed_" + type.id(), box, ground);
		List<BlockBuffer.Marker> inside = new ArrayList<>(buf.markers("amenity").subList(0, Math.min(3, buf.markers("amenity").size())));
		List<BlockBuffer.Marker> units = buf.markers("unit");
		inside.add(units.get(0));
		inside.add(units.get(units.size() / 2));
		context.runOnClient(client -> client.options.renderDistance().set(4));
		int n = 0;
		for (BlockBuffer.Marker m : inside) {
			BlockPos p = t.toWorld(m.pos().getX(), m.pos().getY(), m.pos().getZ());
			world.getServer().runCommand(String.format(Locale.ROOT, "tp @a %.1f %.1f %.1f 30 10", p.getX() + 0.5, p.getY() + 0.1, p.getZ() + 0.5));
			context.waitTicks(4);
			ApartmentsClientGameTest.settleNear(world);
			context.takeScreenshot(TestScreenshotOptions.of(String.format(Locale.ROOT, "placed_%s_int_%d_%s", type.id(), n++,
				m.label().replace(' ', '_').replace('\'', '_').replace('&', 'n'))).withSize(1280, 720));
		}
		context.runOnClient(client -> client.options.renderDistance().set(12));
		// demolish and show the land put back
		world.getServer().runCommand("apartments undo");
		context.waitTicks(20);
		long undoStart = System.currentTimeMillis();
		while (world.getServer().computeOnServer(server -> PlacementManager.isBusy())) {
			if (System.currentTimeMillis() - undoStart > 20 * 60_000L) {
				throw new AssertionError("undo did not finish");
			}
			context.waitTicks(20);
		}
		System.out.println("[world] undo finished in " + (System.currentTimeMillis() - undoStart) + " ms");
		camera(context, world, "placed_" + type.id() + "_after_undo", box, ground, 3);
	}

	/** Every home's marker must be standing room with a floor under it in the real world. */
	private static void checkHomes(ServerLevel level, BlockBuffer buf, PlacementTransform t, String what) {
		int bad = 0;
		for (BlockBuffer.Marker m : buf.markers("unit")) {
			BlockPos p = t.toWorld(m.pos().getX(), m.pos().getY(), m.pos().getZ());
			// rugs (a sixteenth of a block) count as floor, as they do for the validator
			VoxelShape at = level.getBlockState(p).getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
			boolean clear = (at.isEmpty() || at.max(Direction.Axis.Y) <= 0.1)
				&& level.getBlockState(p.above()).getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO).isEmpty();
			boolean floor = !level.getBlockState(p.below()).getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO).isEmpty()
				|| !at.isEmpty();
			if (!clear || !floor) {
				bad++;
				System.out.println("[world] " + what + " unit " + m.label() + " at " + p.toShortString() + " clear=" + clear + " floor=" + floor
					+ " blocks " + level.getBlockState(p.below()) + " / " + level.getBlockState(p) + " / " + level.getBlockState(p.above())
					+ " buffer " + buf.get(m.pos().getX(), m.pos().getY(), m.pos().getZ()));
			}
		}
		System.out.println("[world] " + what + ": checked " + buf.markers("unit").size() + " homes in the world, " + bad + " problems");
		if (bad > 0) {
			throw new AssertionError(bad + " homes are blocked in the " + what + " building");
		}
	}

	// ------------------------------------------------------------------ natural generation
	private static void natural(ClientGameTestContext context, TestSingleplayerContext world) {
		BoundingBox box = world.getServer().computeOnServer(server -> {
			ServerLevel level = server.overworld();
			var registry = level.registryAccess().lookupOrThrow(Registries.STRUCTURE);
			List<Holder<Structure>> holders = new ArrayList<>();
			for (ComplexType ct : ComplexType.values()) {
				holders.add(registry.getOrThrow(ResourceKey.create(Registries.STRUCTURE, Identifier.fromNamespaceAndPath("modernapartments", ct.id()))));
			}
			BlockPos from = server.getPlayerList().getPlayers().get(0).blockPosition();
			Pair<BlockPos, Holder<Structure>> found = level.getChunkSource().getGenerator()
				.findNearestMapStructure(level, HolderSet.direct(holders), from, 160, false);
			if (found == null) {
				System.out.println("[world] no complex generated within 160 chunks");
				return null;
			}
			ChunkAccess chunk = level.getChunk(found.getFirst().getX() >> 4, found.getFirst().getZ() >> 4, ChunkStatus.STRUCTURE_STARTS);
			StructureStart start = chunk.getStartForStructure(found.getSecond().value());
			System.out.println("[world] natural " + found.getSecond().getRegisteredName() + " at " + found.getFirst().toShortString()
				+ " box " + (start == null ? "none" : start.getBoundingBox()));
			return start == null || !start.isValid() ? null : start.getBoundingBox();
		});
		if (box == null) {
			return;
		}
		// generate every chunk the complex touches (the pieces are placed as each chunk generates)
		world.getServer().runOnServer(server -> {
			ServerLevel level = server.overworld();
			for (int cx = (box.minX() >> 4) - 1; cx <= (box.maxX() >> 4) + 1; cx++) {
				for (int cz = (box.minZ() >> 4) - 1; cz <= (box.maxZ() >> 4) + 1; cz++) {
					level.getChunk(cx, cz);
				}
			}
			ChunkAccess origin = level.getChunk(box.getCenter().getX() >> 4, box.getCenter().getZ() >> 4);
			for (StructureStart start : origin.getAllStarts().values()) {
				if (start.isValid() && start.getPieces().get(0) instanceof ApartmentPiece piece) {
					checkHomes(level, BuildCache.get(piece.complex(), piece.seed()), piece.transform(), "natural " + piece.complex().id());
				}
			}
		});
		world.getServer().runCommand(String.format(Locale.ROOT, "tp @a %d %d %d", box.getCenter().getX(), box.maxY() + 20, box.getCenter().getZ()));
		context.waitTicks(200);
		int ground = world.getServer().computeOnServer(server -> {
			ServerLevel level = server.overworld();
			int[] edge = new int[4];
			edge[0] = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, box.minX() - 3, box.getCenter().getZ());
			edge[1] = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, box.maxX() + 3, box.getCenter().getZ());
			edge[2] = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, box.getCenter().getX(), box.minZ() - 3);
			edge[3] = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, box.getCenter().getX(), box.maxZ() + 3);
			Arrays.sort(edge);
			return (edge[1] + edge[2]) / 2;
		});
		exterior(context, world, "natural", box, ground);
	}

	// ------------------------------------------------------------------ cameras
	private static void exterior(ClientGameTestContext context, TestSingleplayerContext world, String name, BoundingBox box, int ground) {
		for (int i = 0; i < 4; i++) {
			camera(context, world, name, box, ground, i);
		}
	}

	/** 0..2: three-quarter views from three sides, 3: aerial. */
	private static void camera(ClientGameTestContext context, TestSingleplayerContext world, String name, BoundingBox box, int ground, int view) {
		double cx = (box.minX() + box.maxX() + 1) / 2.0;
		double cz = (box.minZ() + box.maxZ() + 1) / 2.0;
		double size = Math.max(box.getXSpan(), box.getZSpan());
		double height = Math.min(box.maxY() - ground, 60);
		double dist = size * 0.95 + 12;
		double[][] offsets = {{-0.7, 0.45, -0.55}, {0.7, 0.45, -0.55}, {0.8, 0.5, 0.6}, {0, 1.2, -0.25}};
		String[] names = {"a", "b", "c", "aerial"};
		double[] o = offsets[view];
		double px = cx + o[0] * dist;
		double py = ground + o[1] * dist;
		double pz = cz + o[2] * dist;
		double aimY = view == 3 ? ground : ground + height * 0.45;
		double dx = cx - px;
		double dy = aimY - py;
		double dz = cz - pz;
		float yaw = (float) Math.toDegrees(Math.atan2(-dx, dz));
		float pitch = (float) -Math.toDegrees(Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)));
		world.getServer().runCommand(String.format(Locale.ROOT, "tp @a %.1f %.1f %.1f %.1f %.1f", px, py, pz, yaw, pitch));
		context.waitTicks(10);
		ApartmentsClientGameTest.settle(world);
		context.takeScreenshot(TestScreenshotOptions.of(name + "_ext_" + names[view]).withSize(1600, 900));
	}
}
