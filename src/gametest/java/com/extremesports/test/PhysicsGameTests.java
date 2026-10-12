package com.extremesports.test;

import com.extremesports.block.RampBlock;
import com.extremesports.block.RailBlock;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.GrindSegment;
import com.extremesports.physics.RideController;
import com.extremesports.physics.RideEvents;
import com.extremesports.physics.RideInput;
import com.extremesports.registry.ModBlocks;
import com.extremesports.registry.ModEntities;
import com.extremesports.registry.ModItems;
import com.extremesports.server.ParkBuilder;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.sport.PhysicsPreset;
import com.extremesports.trick.BailReason;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.ComboScorer;
import com.extremesports.trick.LandingQuality;
import com.extremesports.trick.TrickDef;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntFunction;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.StairsShape;
import net.minecraft.world.phys.Vec3;

/**
 * Server-side tests of the ride simulation. Each test drives a board with scripted input (as if a rider were on it)
 * on a 9x60 flat track and checks the physical outcome and the trick/score events.
 */
public class PhysicsGameTests {
	private static final String TRACK = "extremesports-test:track";

	/** Records simulation events. */
	static final class Recorder implements RideEvents {
		final List<String> log = new ArrayList<>();
		final List<List<ComboEntry>> combos = new ArrayList<>();
		final List<Boolean> comboLanded = new ArrayList<>();
		LandingQuality lastLanding;
		BailReason bail;
		int pops;
		int grindStarts;
		int manualStarts;
		final List<TrickDef> tricks = new ArrayList<>();

		@Override
		public void onPop(RideController ride, boolean nollie) {
			pops++;
			log.add("pop");
		}

		@Override
		public void onTrickStart(RideController ride, TrickDef trick, int multiple) {
			tricks.add(trick);
			log.add("trick:" + trick.id());
		}

		@Override
		public void onLand(RideController ride, LandingQuality quality, float impact, ComboEntry entry, boolean scored) {
			lastLanding = quality;
			log.add("land:" + quality + (scored ? "" : "(unscored)") + String.format(" impact=%.2f", impact));
		}

		@Override
		public void onBail(RideController ride, BailReason reason) {
			bail = reason;
			log.add("bail:" + reason);
		}

		@Override
		public void onGrindStart(RideController ride, TrickDef grind, GrindSegment segment) {
			grindStarts++;
			log.add("grind:" + grind.id());
		}

		@Override
		public void onManualStart(RideController ride, TrickDef manual) {
			manualStarts++;
			log.add("manual:" + manual.id());
		}

		@Override
		public void onComboEnd(RideController ride, List<ComboEntry> entries, boolean landed) {
			combos.add(entries);
			comboLanded.add(landed);
			log.add("combo:" + entries.size() + (landed ? " landed" : " lost"));
		}

		boolean comboHas(String trickId) {
			for (List<ComboEntry> combo : combos) {
				for (ComboEntry entry : combo) {
					if (entry.tricks().contains(trickId)) {
						return true;
					}
				}
			}
			return false;
		}
	}

	static RideInput input(boolean forward, boolean jump, boolean flip, boolean grind) {
		return new RideInput(forward, false, false, false, jump, flip, false, grind, false, 0.0F, false);
	}

	static SportEquipmentEntity board(GameTestHelper helper, EquipmentKind kind, double x, double y, double z, float yaw, Recorder recorder) {
		Vec3 pos = helper.absoluteVec(new Vec3(x, y, z));
		SportEquipmentEntity entity = ModEntities.forSport(kind.sport()).create(helper.getLevel(), net.minecraft.world.entity.EntitySpawnReason.COMMAND);
		entity.setItem(new ItemStack(ModItems.forKind(kind)));
		entity.snapTo(pos.x, pos.y, pos.z, yaw, 0.0F);
		entity.testRiderPresent = true;
		entity.testInput = RideInput.NONE;
		entity.setPreset(PhysicsPreset.BALANCED);
		entity.ride.events = recorder;
		helper.getLevel().addFreshEntity(entity);
		return entity;
	}

	/** Runs the given input script (by tick) every tick. */
	static void script(GameTestHelper helper, SportEquipmentEntity entity, IntFunction<RideInput> script) {
		long start = helper.getTick();
		helper.onEachTick(() -> entity.testInput = script.apply((int) (helper.getTick() - start)));
	}

	static double relZ(GameTestHelper helper, SportEquipmentEntity entity) {
		return entity.getZ() - helper.absoluteVec(Vec3.ZERO).z;
	}

	static double relY(GameTestHelper helper, SportEquipmentEntity entity) {
		return entity.getY() - helper.absoluteVec(Vec3.ZERO).y;
	}

	// ------------------------------------------------------------------ rolling

	@GameTest(structure = TRACK, maxTicks = 160)
	public void pushingAcceleratesThenCoasts(GameTestHelper helper) {
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 2.5, 0.0F, recorder);
		script(helper, entity, tick -> input(tick < 40, false, false, false));
		double[] speedAt40 = new double[1];
		helper.runAtTickTime(40, () -> {
			speedAt40[0] = entity.ride.speed;
			helper.assertTrue(entity.ride.speed > 0.22F, "speed after 2s of pushing was " + entity.ride.speed);
			helper.assertTrue(relZ(helper, entity) > 6.0, "only travelled " + relZ(helper, entity));
		});
		helper.runAtTickTime(100, () -> {
			helper.assertTrue(entity.ride.speed < speedAt40[0], "board should slow while coasting");
			helper.assertTrue(entity.ride.speed > 0.05F, "coasting stopped far too quickly: " + entity.ride.speed);
			helper.assertTrue(entity.ride.contact == RideController.Contact.GROUND, "should still be rolling on the ground");
			helper.assertTrue(recorder.bail == null, "unexpected bail " + recorder.log);
			helper.succeed();
		});
	}

	@GameTest(structure = TRACK, maxTicks = 80)
	public void grassSlowsBoardsMoreThanConcrete(GameTestHelper helper) {
		for (int z = 0; z < 60; z++) {
			helper.setBlock(new BlockPos(7, 0, z), Blocks.GRASS_BLOCK);
		}
		Recorder a = new Recorder();
		Recorder b = new Recorder();
		SportEquipmentEntity smooth = board(helper, EquipmentKind.STREET_BOARD, 2.5, 1.0, 2.5, 0.0F, a);
		SportEquipmentEntity grass = board(helper, EquipmentKind.STREET_BOARD, 7.5, 1.0, 2.5, 0.0F, b);
		smooth.setDeltaMovement(0.0, 0.0, 0.35);
		grass.setDeltaMovement(0.0, 0.0, 0.35);
		helper.runAtTickTime(40, () -> {
			double dSmooth = relZ(helper, smooth);
			double dGrass = relZ(helper, grass);
			helper.assertTrue(dGrass < dSmooth - 2.0, String.format("grass %.2f vs concrete %.2f", dGrass, dSmooth));
			helper.succeed();
		});
	}

	@GameTest(structure = TRACK, maxTicks = 120)
	public void bmxOutrollsSkateboardOnDirt(GameTestHelper helper) {
		for (int x = 0; x < 9; x++) {
			for (int z = 0; z < 60; z++) {
				helper.setBlock(new BlockPos(x, 0, z), Blocks.COARSE_DIRT);
			}
		}
		Recorder a = new Recorder();
		Recorder b = new Recorder();
		SportEquipmentEntity skate = board(helper, EquipmentKind.STREET_BOARD, 2.5, 1.0, 2.5, 0.0F, a);
		SportEquipmentEntity bmx = board(helper, EquipmentKind.BMX, 6.5, 1.0, 2.5, 0.0F, b);
		skate.setDeltaMovement(0.0, 0.0, 0.35);
		bmx.setDeltaMovement(0.0, 0.0, 0.35);
		helper.runAtTickTime(40, () -> {
			helper.assertTrue(relZ(helper, bmx) > relZ(helper, skate) + 1.0,
				String.format("bmx %.2f vs skateboard %.2f on dirt", relZ(helper, bmx), relZ(helper, skate)));
			helper.succeed();
		});
	}

	// ------------------------------------------------------------------ tricks

	@GameTest(structure = TRACK, maxTicks = 100)
	public void ollieLandsAndScores(GameTestHelper helper) {
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 2.5, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.25);
		double[] maxY = new double[1];
		script(helper, entity, tick -> {
			maxY[0] = Math.max(maxY[0], relY(helper, entity));
			return input(false, tick >= 5 && tick < 9, false, false);
		});
		helper.runAtTickTime(70, () -> {
			helper.assertTrue(recorder.pops == 1, "expected one pop: " + recorder.log);
			helper.assertTrue(maxY[0] > 1.6, "ollie height only " + (maxY[0] - 1.0));
			helper.assertTrue(recorder.lastLanding != null && recorder.lastLanding != LandingQuality.BAIL, "landing: " + recorder.log);
			helper.assertTrue(recorder.comboHas("skateboard.ollie"), "combo should contain the ollie: " + recorder.log);
			helper.succeed();
		});
	}

	@GameTest(structure = TRACK, maxTicks = 100)
	public void kickflipCompletesInOllieAirtime(GameTestHelper helper) {
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 2.5, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.25);
		script(helper, entity, tick -> input(false, tick >= 5 && tick < 9, tick == 11, false));
		helper.runAtTickTime(70, () -> {
			helper.assertTrue(recorder.bail == null, "kickflip should not bail: " + recorder.log);
			helper.assertTrue(recorder.comboHas("skateboard.kickflip"), "combo should contain kickflip: " + recorder.log);
			helper.succeed();
		});
	}

	@GameTest(structure = TRACK, maxTicks = 80)
	public void bmxBackflipFromFlatBails(GameTestHelper helper) {
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.BMX, 4.5, 1.0, 2.5, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.25);
		script(helper, entity, tick -> input(false, tick >= 5 && tick < 7, tick == 9, false));
		helper.runAtTickTime(60, () -> {
			helper.assertTrue(recorder.bail == BailReason.MID_TRICK, "a backflip off flat ground can't finish and must bail: " + recorder.log);
			helper.succeed();
		});
	}

	@GameTest(structure = TRACK, maxTicks = 80)
	public void slammingIntoAWallBails(GameTestHelper helper) {
		for (int x = 0; x < 9; x++) {
			for (int y = 1; y < 4; y++) {
				helper.setBlock(new BlockPos(x, y, 12), Blocks.STONE);
			}
		}
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 2.5, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.62);
		helper.runAtTickTime(40, () -> {
			helper.assertTrue(recorder.bail == BailReason.WALL, "expected a wall bail: " + recorder.log);
			helper.succeed();
		});
	}

	@GameTest(structure = TRACK, maxTicks = 80)
	public void gentleWallBumpDoesNotBail(GameTestHelper helper) {
		for (int x = 0; x < 9; x++) {
			for (int y = 1; y < 4; y++) {
				helper.setBlock(new BlockPos(x, y, 8), Blocks.STONE);
			}
		}
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 2.5, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.15);
		helper.runAtTickTime(60, () -> {
			helper.assertTrue(recorder.bail == null, "slow bump should not bail: " + recorder.log);
			helper.assertTrue(relZ(helper, entity) < 7.9, "board passed through the wall");
			helper.succeed();
		});
	}

	// ------------------------------------------------------------------ grinding and manuals

	@GameTest(structure = TRACK, maxTicks = 120)
	public void grindsAlongARailAndRidesAway(GameTestHelper helper) {
		for (int z = 8; z <= 15; z++) {
			helper.setBlock(new BlockPos(4, 1, z), ModBlocks.GRIND_RAIL.defaultBlockState().setValue(RailBlock.AXIS, Direction.Axis.Z));
		}
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 3.5, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.32);
		boolean[] grinding = new boolean[1];
		script(helper, entity, tick -> {
			if (entity.ride.contact == RideController.Contact.GRIND) {
				grinding[0] = true;
			}
			return input(false, tick >= 6 && tick < 9, false, tick > 9 && tick < 60);
		});
		helper.runAtTickTime(90, () -> {
			helper.assertTrue(grinding[0] && recorder.grindStarts >= 1, "never snapped onto the rail: " + recorder.log);
			float distance = 0.0F;
			for (List<ComboEntry> combo : recorder.combos) {
				for (ComboEntry entry : combo) {
					if (entry.kind() == ComboEntry.Kind.GRIND) {
						distance = Math.max(distance, entry.distance());
					}
				}
			}
			helper.assertTrue(distance > 4.0F, "grind distance only " + distance + " " + recorder.log);
			helper.assertTrue(relZ(helper, entity) > 16.0, "should ride past the end of the rail, at z=" + relZ(helper, entity));
			helper.succeed();
		});
	}

	@GameTest(structure = TRACK, maxTicks = 100)
	public void manualStartsAndScores(GameTestHelper helper) {
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 2.5, 0.0F, recorder);
		entity.setPreset(PhysicsPreset.ARCADE);
		entity.setDeltaMovement(0.0, 0.0, 0.3);
		script(helper, entity, tick -> input(false, false, false, tick == 4 || tick == 22));
		helper.runAtTickTime(70, () -> {
			helper.assertTrue(recorder.manualStarts == 1, "manual didn't start: " + recorder.log);
			helper.assertTrue(recorder.comboHas("skateboard.manual"), "manual should be scored: " + recorder.log);
			helper.succeed();
		});
	}

	// ------------------------------------------------------------------ ramps

	@GameTest(structure = TRACK, maxTicks = 160)
	public void quarterPipeLaunchesAndReturns(GameTestHelper helper) {
		for (int x = 0; x < 9; x++) {
			helper.setBlock(new BlockPos(x, 1, 20), ModBlocks.QUARTER_PIPE.defaultBlockState().setValue(RampBlock.FACING, Direction.SOUTH));
			helper.setBlock(new BlockPos(x, 1, 21), Blocks.STONE);
		}
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 13.5, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.5);
		double[] maxY = new double[1];
		double[] maxZ = new double[1];
		StringBuilder trace = new StringBuilder();
		boolean[] returned = new boolean[1];
		script(helper, entity, tick -> {
			maxY[0] = Math.max(maxY[0], relY(helper, entity));
			maxZ[0] = Math.max(maxZ[0], relZ(helper, entity));
			// Back on the flat, rolling toward the start after the air
			if (maxY[0] > 2.0 && relZ(helper, entity) < 18.0 && entity.getDeltaMovement().z < -0.1 && entity.ride.grounded()) {
				returned[0] = true;
			}
			if (tick > 8 && tick < 50) {
				Vec3 v = entity.getDeltaMovement();
				trace.append(String.format("[%d z=%.2f y=%.2f v=(%.2f,%.2f) %s] ", tick, relZ(helper, entity), relY(helper, entity), v.z, v.y, entity.ride.contact));
			}
			return RideInput.NONE;
		});
		helper.runAtTickTime(110, () -> {
			helper.assertTrue(maxY[0] > 2.4, String.format("should launch above the coping (max y %.2f) trace %s", maxY[0], trace));
			helper.assertTrue(maxZ[0] < 21.05, String.format("vert assist should keep the rider over the ramp (max z %.2f)", maxZ[0]));
			helper.assertTrue(returned[0], String.format("should roll back down the ramp and across the flat, trace %s", trace));
			helper.succeed();
		});
	}

	/** Builds a full-width vert ramp: toe at z=19, back piece at z=20 with the top piece above it, deck behind. */
	private static void buildVert(GameTestHelper helper) {
		BlockState vert = ModBlocks.VERT_RAMP.defaultBlockState().setValue(RampBlock.FACING, Direction.SOUTH);
		for (int x = 0; x < 9; x++) {
			helper.setBlock(new BlockPos(x, 1, 19), vert.setValue(RampBlock.PART_3, 0));
			helper.setBlock(new BlockPos(x, 1, 20), vert.setValue(RampBlock.PART_3, 1));
			helper.setBlock(new BlockPos(x, 2, 20), vert.setValue(RampBlock.PART_3, 2));
			helper.setBlock(new BlockPos(x, 1, 21), Blocks.STONE);
			helper.setBlock(new BlockPos(x, 2, 21), Blocks.STONE);
		}
	}

	@GameTest(structure = TRACK, maxTicks = 20)
	public void vertRampSurfaceIsContinuous(GameTestHelper helper) {
		buildVert(helper);
		Vec3 origin = helper.absoluteVec(Vec3.ZERO);
		double previous = Double.NaN;
		double floor = origin.y + 1.0;
		for (double z = 19.0; z <= 20.999; z += 0.02) {
			// Probe from just above the surface so the sampler finds whichever piece holds it
			var hit = com.extremesports.physics.SurfaceSampler.sample(helper.getLevel(), origin.x + 4.5, floor + 2.5, origin.z + z, 0.0, 3.0);
			helper.assertTrue(hit != null, String.format("no surface at z=%.2f", z));
			double h = hit.height() - floor;
			if (!Double.isNaN(previous)) {
				helper.assertTrue(h >= previous - 1.0E-6, String.format("surface goes down at z=%.2f (%.3f -> %.3f)", z, previous, h));
				helper.assertTrue(h - previous < 0.25, String.format("surface jumps at z=%.2f (%.3f -> %.3f)", z, previous, h));
			}
			previous = h;
		}
		helper.assertTrue(previous > 1.85, String.format("vert should reach the coping at 2 blocks, got %.2f", previous));
		helper.succeed();
	}

	@GameTest(structure = TRACK, maxTicks = 140)
	public void vertRampLaunchesAboveCopingAndReturns(GameTestHelper helper) {
		buildVert(helper);
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 11.5, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.62);
		double[] maxY = new double[1];
		double[] maxZ = new double[1];
		StringBuilder trace = new StringBuilder();
		boolean[] returned = new boolean[1];
		script(helper, entity, tick -> {
			maxY[0] = Math.max(maxY[0], relY(helper, entity));
			maxZ[0] = Math.max(maxZ[0], relZ(helper, entity));
			// Back on the flat, rolling toward the start after the air
			if (maxY[0] > 2.0 && relZ(helper, entity) < 18.0 && entity.getDeltaMovement().z < -0.1 && entity.ride.grounded()) {
				returned[0] = true;
			}
			if (tick > 8 && tick < 60) {
				Vec3 v = entity.getDeltaMovement();
				trace.append(String.format("[%d z=%.2f y=%.2f v=(%.2f,%.2f) %s] ", tick, relZ(helper, entity), relY(helper, entity), v.z, v.y, entity.ride.contact));
			}
			return RideInput.NONE;
		});
		helper.runAtTickTime(130, () -> {
			helper.assertTrue(maxY[0] > 3.3, String.format("should launch above the 2-block coping (max y %.2f) trace %s", maxY[0], trace));
			helper.assertTrue(maxZ[0] < 21.05, String.format("vert assist should keep the rider over the ramp (max z %.2f) trace %s", maxZ[0], trace));
			helper.assertTrue(recorder.bail == null, "should not bail on a straight vert air: " + recorder.bail);
			helper.assertTrue(returned[0], String.format("should come back in and roll across the flat, trace %s", trace));
			helper.succeed();
		});
	}

	@GameTest(structure = TRACK, maxTicks = 100)
	public void kickerLaunchesIntoTheAir(GameTestHelper helper) {
		for (int x = 0; x < 9; x++) {
			helper.setBlock(new BlockPos(x, 1, 12), ModBlocks.LAUNCH_RAMP.defaultBlockState().setValue(RampBlock.FACING, Direction.SOUTH));
		}
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0, 3.5, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.48);
		double[] maxY = new double[1];
		int[] airTicks = new int[1];
		script(helper, entity, tick -> {
			maxY[0] = Math.max(maxY[0], relY(helper, entity));
			if (entity.ride.contact == RideController.Contact.AIR) {
				airTicks[0]++;
			}
			return RideInput.NONE;
		});
		helper.runAtTickTime(70, () -> {
			helper.assertTrue(maxY[0] > 2.0, String.format("kicker launch height %.2f", maxY[0] - 1.0));
			helper.assertTrue(airTicks[0] >= 8, "air time only " + airTicks[0]);
			helper.assertTrue(relZ(helper, entity) > 16.0, "should land and keep rolling");
			helper.succeed();
		});
	}

	@GameTest(structure = TRACK, maxTicks = 160)
	public void slopesAccelerateDownhill(GameTestHelper helper) {
		// Four-part slope pieces descending toward +z from height 3 down to the floor
		BlockState stone = Blocks.STONE.defaultBlockState();
		int startZ = 4;
		int height = 3;
		for (int level = 0; level < height; level++) {
			int y = 1 + height - 1 - level;
			for (int part = 0; part < 4; part++) {
				int z = startZ + level * 4 + (3 - part);
				for (int x = 2; x <= 6; x++) {
					for (int fy = 1; fy < y; fy++) {
						helper.setBlock(new BlockPos(x, fy, z), stone);
					}
					helper.setBlock(new BlockPos(x, y, z), ModBlocks.SLOPE.defaultBlockState()
						.setValue(RampBlock.FACING, Direction.NORTH).setValue(RampBlock.PART_4, part));
				}
			}
		}
		for (int x = 2; x <= 6; x++) {
			for (int y = 1; y <= height; y++) {
				helper.setBlock(new BlockPos(x, y, startZ - 1), stone);
			}
		}
		Recorder recorder = new Recorder();
		SportEquipmentEntity entity = board(helper, EquipmentKind.STREET_BOARD, 4.5, 1.0 + height, startZ - 0.6, 0.0F, recorder);
		entity.setDeltaMovement(0.0, 0.0, 0.12);
		helper.runAtTickTime(90, () -> {
			helper.assertTrue(relZ(helper, entity) > startZ + height * 4, "should have rolled down the slope, at z=" + relZ(helper, entity));
			helper.assertTrue(entity.ride.speed > 0.25F, "speed at the bottom only " + entity.ride.speed);
			helper.assertTrue(recorder.bail == null, "unexpected bail: " + recorder.log);
			helper.succeed();
		});
	}

	// ------------------------------------------------------------------ scoring and validation

	@GameTest(structure = TRACK, maxTicks = 5)
	public void scoringRewardsVarietyOverRepetition(GameTestHelper helper) {
		ComboEntry kickflip = new ComboEntry(ComboEntry.Kind.AIR, List.of("skateboard.kickflip"), List.of(1), 0, 0, 14, 0, 0.0F, LandingQuality.CLEAN, false, false);
		ComboEntry heelflip = new ComboEntry(ComboEntry.Kind.AIR, List.of("skateboard.heelflip"), List.of(1), 0, 0, 14, 0, 0.0F, LandingQuality.CLEAN, false, false);
		ComboEntry grind = new ComboEntry(ComboEntry.Kind.GRIND, List.of("skateboard.fifty_fifty"), List.of(1), 0, 0, 30, 0, 6.0F, LandingQuality.CLEAN, false, false);
		ComboScorer.Result repeated = ComboScorer.score(List.of(kickflip, kickflip, kickflip, kickflip), new ComboScorer.History(), 1.0F, false);
		ComboScorer.Result varied = ComboScorer.score(List.of(kickflip, grind, heelflip, kickflip), new ComboScorer.History(), 1.0F, false);
		helper.assertTrue(varied.total() > repeated.total() * 2, "variety " + varied.total() + " vs repetition " + repeated.total());
		helper.assertTrue(repeated.multiplier() == 1, "repeats must not raise the multiplier");
		ComboScorer.History history = new ComboScorer.History();
		int first = ComboScorer.score(List.of(kickflip), history, 1.0F, true).total();
		int last = first;
		for (int i = 0; i < 10; i++) {
			last = ComboScorer.score(List.of(kickflip), history, 1.0F, true).total();
		}
		helper.assertTrue(last < first, "farming the same trick should pay less over time");
		helper.succeed();
	}

	@GameTest(structure = TRACK, maxTicks = 5)
	public void serverRejectsImpossibleCombos(GameTestHelper helper) {
		com.extremesports.server.ServerRideTracker tracker = new com.extremesports.server.ServerRideTracker();
		tracker.airTicks = 14;
		tracker.ridingTicks = 200;
		ComboEntry fakeSpin = new ComboEntry(ComboEntry.Kind.AIR, List.of("skateboard.ollie"), List.of(1), 1440, 1, 10, 0, 0.0F, LandingQuality.PERFECT, false, false);
		ComboEntry wrongSport = new ComboEntry(ComboEntry.Kind.AIR, List.of("bmx.backflip"), List.of(1), 0, 0, 14, 0, 0.0F, LandingQuality.CLEAN, false, false);
		ComboEntry fakeAir = new ComboEntry(ComboEntry.Kind.AIR, List.of("skateboard.kickflip"), List.of(1), 0, 0, 200, 0, 0.0F, LandingQuality.CLEAN, false, false);
		ComboEntry honest = new ComboEntry(ComboEntry.Kind.AIR, List.of("skateboard.kickflip"), List.of(1), 0, 0, 13, 0, 0.0F, LandingQuality.CLEAN, false, false);
		helper.assertTrue(com.extremesports.server.ScoreService.validateForTest(List.of(fakeSpin), com.extremesports.sport.SportType.SKATEBOARD, tracker) != null, "1440 spin in 10 ticks accepted");
		helper.assertTrue(com.extremesports.server.ScoreService.validateForTest(List.of(wrongSport), com.extremesports.sport.SportType.SKATEBOARD, tracker) != null, "bmx trick on a skateboard accepted");
		helper.assertTrue(com.extremesports.server.ScoreService.validateForTest(List.of(fakeAir), com.extremesports.sport.SportType.SKATEBOARD, tracker) != null, "unobserved air accepted");
		helper.assertTrue(com.extremesports.server.ScoreService.validateForTest(List.of(honest), com.extremesports.sport.SportType.SKATEBOARD, tracker) == null, "honest kickflip rejected");
		helper.succeed();
	}

	// ------------------------------------------------------------------ park building

	@GameTest(structure = TRACK, maxTicks = 20)
	public void bowlCornersJoinAutomatically(GameTestHelper helper) {
		ParkBuilder.build(helper.getLevel(), helper.absolutePos(new BlockPos(4, 1, 20)), Direction.SOUTH, ParkBuilder.Prefab.BOWL);
		int inner = 0;
		int ramps = 0;
		for (BlockPos pos : BlockPos.betweenClosed(helper.absolutePos(new BlockPos(-2, 1, 18)), helper.absolutePos(new BlockPos(10, 1, 32)))) {
			BlockState state = helper.getLevel().getBlockState(pos);
			if (state.is(ModBlocks.BOWL_WALL)) {
				ramps++;
				StairsShape shape = state.getValue(RampBlock.SHAPE);
				if (shape == StairsShape.INNER_LEFT || shape == StairsShape.INNER_RIGHT) {
					inner++;
				}
			}
		}
		helper.assertTrue(ramps >= 20, "bowl walls placed: " + ramps);
		helper.assertTrue(inner == 4, "bowl should have 4 inner corners, found " + inner);
		helper.succeed();
	}
}
