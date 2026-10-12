package com.extremesports.server;

import com.extremesports.block.GateBlock;
import com.extremesports.block.InclinedRailBlock;
import com.extremesports.block.ObstacleBlock;
import com.extremesports.block.RailBlock;
import com.extremesports.block.RampBlock;
import com.extremesports.registry.ModBlocks;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.IntegerProperty;

/**
 * Generates ready-to-ride skatepark sections in front of the player, so the whole mod can be tried in seconds.
 * Local coordinates: +z is forward (away from the player), +x is to the player's right, y is up from the ground.
 */
public final class ParkBuilder {
	public enum Prefab {
		HALF_PIPE("half_pipe"),
		BOWL("bowl"),
		STREET("street"),
		DIRT_JUMPS("dirt_jumps"),
		DOWNHILL("downhill"),
		FULL_PARK("full_park");

		public final String id;

		Prefab(String id) {
			this.id = id;
		}

		public static Prefab byIndex(int index) {
			Prefab[] values = values();
			return values[Math.floorMod(index, values.length)];
		}

		public static Prefab byId(String id) {
			for (Prefab prefab : values()) {
				if (prefab.id.equals(id)) {
					return prefab;
				}
			}
			return FULL_PARK;
		}
	}

	private final ServerLevel level;
	private final BlockPos origin;
	private final Direction forward;
	private final Direction right;
	private final List<BlockPos> ramps = new ArrayList<>();

	private ParkBuilder(ServerLevel level, BlockPos origin, Direction forward) {
		this.level = level;
		this.origin = origin;
		this.forward = forward;
		this.right = forward.getClockWise();
	}

	/** Builds a prefab; origin is the first ground-level air block in front of the player. */
	public static void build(ServerLevel level, BlockPos origin, Direction forward, Prefab prefab) {
		ParkBuilder builder = new ParkBuilder(level, origin, forward);
		switch (prefab) {
			case HALF_PIPE -> builder.halfPipe(0, 0);
			case BOWL -> builder.bowl(0, 0);
			case STREET -> builder.street(0, 0);
			case DIRT_JUMPS -> builder.dirtJumps(0, 0);
			case DOWNHILL -> builder.downhill(0, 0);
			case FULL_PARK -> {
				builder.street(0, 0);
				builder.halfPipe(-12, 0);
				builder.bowl(12, 2);
				builder.dirtJumps(-22, 0);
				builder.downhill(24, 0);
			}
		}
		builder.finish();
	}

	// ------------------------------------------------------------------ helpers

	private BlockPos at(int x, int y, int z) {
		return origin.relative(right, x).relative(forward, z).above(y);
	}

	/** Maps local directions: NORTH = forward, SOUTH = back, EAST = right, WEST = left. */
	private Direction world(Direction local) {
		return switch (local) {
			case NORTH -> forward;
			case SOUTH -> forward.getOpposite();
			case EAST -> right;
			case WEST -> right.getOpposite();
			default -> local;
		};
	}

	private void set(int x, int y, int z, BlockState state) {
		level.setBlock(at(x, y, z), state, Block.UPDATE_CLIENTS);
	}

	private void fill(int x0, int y0, int z0, int x1, int y1, int z1, BlockState state) {
		for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
			for (int y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
				for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
					set(x, y, z, state);
				}
			}
		}
	}

	/** Clears space and lays a floor for an area. */
	private void site(int x0, int z0, int x1, int z1, int height, BlockState floor) {
		fill(x0, 0, z0, x1, height, z1, Blocks.AIR.defaultBlockState());
		fill(x0, -1, z0, x1, -1, z1, floor);
	}

	private void ramp(int x, int y, int z, RampBlock block, Direction localUphill, int part) {
		BlockState state = block.defaultBlockState().setValue(RampBlock.FACING, world(localUphill));
		IntegerProperty partProperty = block.partProperty();
		if (partProperty != null) {
			state = state.setValue(partProperty, part);
		}
		set(x, y, z, state);
		ramps.add(at(x, y, z));
	}

	private void axisBlock(int x, int y, int z, BlockState state, boolean alongForward) {
		Direction.Axis axis = alongForward ? forward.getAxis() : right.getAxis();
		if (state.hasProperty(RailBlock.AXIS)) {
			state = state.setValue(RailBlock.AXIS, axis);
		}
		set(x, y, z, state);
	}

	private void finish() {
		for (BlockPos pos : ramps) {
			BlockState state = level.getBlockState(pos);
			BlockState updated = Block.updateFromNeighbourShapes(state, level, pos);
			if (updated != state) {
				level.setBlock(pos, updated, Block.UPDATE_CLIENTS);
			}
		}
	}

	// ------------------------------------------------------------------ prefabs

	private void halfPipe(int ox, int oz) {
		BlockState concrete = ModBlocks.PARK_CONCRETE.defaultBlockState();
		BlockState deck = ModBlocks.RAMP_DECK.defaultBlockState();
		site(ox - 3, oz, ox + 3, oz + 12, 5, concrete);
		for (int x = ox - 3; x <= ox + 3; x++) {
			set(x, 0, oz, deck);
			set(x, 0, oz + 12, deck);
			ramp(x, 0, oz + 1, ModBlocks.QUARTER_PIPE, Direction.SOUTH, 0);
			ramp(x, 0, oz + 11, ModBlocks.QUARTER_PIPE, Direction.NORTH, 0);
		}
	}

	private void bowl(int ox, int oz) {
		BlockState concrete = ModBlocks.PARK_CONCRETE.defaultBlockState();
		site(ox - 5, oz, ox + 5, oz + 10, 5, concrete);
		int x0 = ox - 3;
		int x1 = ox + 3;
		int z0 = oz + 2;
		int z1 = oz + 8;
		// Deck ring around the bowl at coping height
		for (int x = x0 - 1; x <= x1 + 1; x++) {
			set(x, 0, z0 - 1, concrete);
			set(x, 0, z1 + 1, concrete);
		}
		for (int z = z0 - 1; z <= z1 + 1; z++) {
			set(x0 - 1, 0, z, concrete);
			set(x1 + 1, 0, z, concrete);
		}
		for (int x = x0; x <= x1; x++) {
			ramp(x, 0, z0, ModBlocks.BOWL_WALL, Direction.SOUTH, 0);
			ramp(x, 0, z1, ModBlocks.BOWL_WALL, Direction.NORTH, 0);
		}
		for (int z = z0 + 1; z <= z1 - 1; z++) {
			ramp(x0, 0, z, ModBlocks.BOWL_WALL, Direction.WEST, 0);
			ramp(x1, 0, z, ModBlocks.BOWL_WALL, Direction.EAST, 0);
		}
	}

	private void street(int ox, int oz) {
		BlockState concrete = ModBlocks.PARK_CONCRETE.defaultBlockState();
		site(ox - 7, oz, ox + 7, oz + 24, 5, concrete);
		// Grind box, ledge and a flat rail running forward
		for (int z = oz + 3; z <= oz + 8; z++) {
			set(ox - 4, 0, z, ModBlocks.GRIND_BOX.defaultBlockState().setValue(ObstacleBlock.AXIS, forward.getAxis()));
			set(ox + 4, 0, z, ModBlocks.LEDGE.defaultBlockState().setValue(ObstacleBlock.AXIS, forward.getAxis()));
		}
		for (int z = oz + 3; z <= oz + 9; z++) {
			axisBlock(ox, 0, z, ModBlocks.GRIND_RAIL.defaultBlockState(), true);
		}
		// Manual pad
		fill(ox - 3, 0, oz + 11, ox - 1, 0, oz + 12, ModBlocks.MANUAL_PAD.defaultBlockState());
		// Fun box with a rail across the top
		for (int x = ox - 6; x <= ox - 3; x++) {
			ramp(x, 0, oz + 14, ModBlocks.RAMP, Direction.NORTH, 0);
			ramp(x, 0, oz + 15, ModBlocks.RAMP, Direction.NORTH, 1);
			set(x, 0, oz + 16, concrete);
			ramp(x, 0, oz + 17, ModBlocks.RAMP, Direction.SOUTH, 1);
			ramp(x, 0, oz + 18, ModBlocks.RAMP, Direction.SOUTH, 0);
			axisBlock(x, 1, oz + 16, ModBlocks.GRIND_RAIL.defaultBlockState(), false);
		}
		// Two-level platform reached by stacked ramps, with a stair set and handrail back down
		BlockState stairs = Blocks.SMOOTH_QUARTZ_STAIRS.defaultBlockState().setValue(StairBlock.FACING, world(Direction.SOUTH));
		for (int x = ox + 1; x <= ox + 5; x++) {
			ramp(x, 0, oz + 11, ModBlocks.RAMP, Direction.NORTH, 0);
			ramp(x, 0, oz + 12, ModBlocks.RAMP, Direction.NORTH, 1);
			set(x, 0, oz + 13, concrete);
			set(x, 0, oz + 14, concrete);
			ramp(x, 1, oz + 13, ModBlocks.RAMP, Direction.NORTH, 0);
			ramp(x, 1, oz + 14, ModBlocks.RAMP, Direction.NORTH, 1);
			fill(x, 0, oz + 15, x, 1, oz + 16, concrete);
			set(x, 0, oz + 17, concrete);
			set(x, 1, oz + 17, stairs);
			set(x, 0, oz + 18, stairs);
		}
		fill(ox + 6, 0, oz + 15, ox + 6, 1, oz + 16, concrete);
		axisBlock(ox + 6, 2, oz + 15, ModBlocks.GRIND_RAIL.defaultBlockState(), true);
		axisBlock(ox + 6, 2, oz + 16, ModBlocks.GRIND_RAIL.defaultBlockState(), true);
		BlockState incline = ModBlocks.GRIND_RAIL_INCLINE.defaultBlockState().setValue(InclinedRailBlock.FACING, world(Direction.SOUTH));
		set(ox + 6, 1, oz + 17, incline);
		set(ox + 6, 0, oz + 18, incline);
		axisBlock(ox + 6, 0, oz + 19, ModBlocks.GRIND_RAIL.defaultBlockState(), true);
		axisBlock(ox + 6, 0, oz + 20, ModBlocks.GRIND_RAIL.defaultBlockState(), true);
		// Kicker at the end for airs
		for (int x = ox - 1; x <= ox + 1; x++) {
			ramp(x, 0, oz + 22, ModBlocks.LAUNCH_RAMP, Direction.NORTH, 0);
		}
	}

	private void dirtJumps(int ox, int oz) {
		BlockState dirt = ModBlocks.PACKED_DIRT.defaultBlockState();
		site(ox - 2, oz, ox + 2, oz + 28, 5, dirt);
		for (int jump = 0; jump < 3; jump++) {
			int z = oz + 5 + jump * 8;
			for (int x = ox - 1; x <= ox + 1; x++) {
				ramp(x, 0, z, ModBlocks.DIRT_LIP, Direction.NORTH, 0);
				ramp(x, 0, z + 3, ModBlocks.DIRT_RAMP, Direction.SOUTH, 1);
				ramp(x, 0, z + 4, ModBlocks.DIRT_RAMP, Direction.SOUTH, 0);
			}
		}
	}

	private void downhill(int ox, int oz) {
		BlockState concrete = ModBlocks.PARK_CONCRETE.defaultBlockState();
		int height = 6;
		int length = height * 4;
		site(ox - 3, oz - height - 1, ox + 3, oz + length + 12, height + 4, concrete);
		// Start platform with a staircase up the back
		fill(ox - 2, 0, oz, ox + 2, height - 1, oz + 3, concrete);
		BlockState steps = Blocks.STONE_STAIRS.defaultBlockState().setValue(StairBlock.FACING, world(Direction.NORTH));
		for (int i = 0; i < height; i++) {
			int z = oz - 1 - i;
			int y = height - 1 - i;
			if (y > 0) {
				fill(ox, 0, z, ox, y - 1, z, concrete);
			}
			set(ox, y, z, steps);
		}
		// Slopes descending forward: uphill points back toward the start
		for (int step = 0; step < height; step++) {
			int y = height - 1 - step;
			for (int part = 0; part < 4; part++) {
				int z = oz + 4 + step * 4 + (3 - part);
				for (int x = ox - 2; x <= ox + 2; x++) {
					if (y > 0) {
						fill(x, 0, z, x, y - 1, z, concrete);
					}
					ramp(x, y, z, ModBlocks.SLOPE, Direction.SOUTH, part);
				}
			}
		}
		set(ox - 3, height, oz + 2, ModBlocks.START_GATE.defaultBlockState().setValue(GateBlock.DOWNHILL, true));
		set(ox + 3, height, oz + 2, ModBlocks.START_GATE.defaultBlockState().setValue(GateBlock.DOWNHILL, true));
		for (int i = 0; i < 3; i++) {
			int z = oz + 8 + i * 7;
			int y = Math.max(1, height - 1 - (z - oz - 4) / 4);
			set(ox - 3, y, z, ModBlocks.CHECKPOINT_GATE.defaultBlockState().setValue(GateBlock.ORDER, i));
			set(ox + 3, y, z, ModBlocks.CHECKPOINT_GATE.defaultBlockState().setValue(GateBlock.ORDER, i));
		}
		set(ox - 3, 0, oz + length + 8, ModBlocks.FINISH_GATE.defaultBlockState());
		set(ox + 3, 0, oz + length + 8, ModBlocks.FINISH_GATE.defaultBlockState());
	}
}
