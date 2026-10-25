package com.modernapartments.build;

import com.modernapartments.block.ElevatorDoorBlock;
import com.modernapartments.block.FurnitureBlock;
import com.modernapartments.block.TallFurnitureBlock;
import com.modernapartments.block.TwoPartFurnitureBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.WallSignBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.block.state.properties.Half;
import org.jspecify.annotations.Nullable;

/**
 * Drawing surface for building generators. A canvas is a local coordinate frame (origin + orientation)
 * over a {@link BlockBuffer}; child frames let a unit or room be authored once in its own coordinates
 * and placed anywhere, rotated or mirrored. Block states are written in local orientation and
 * transformed automatically.
 */
public final class Canvas {
	public static final BlockState AIR = Blocks.AIR.defaultBlockState();

	private final BlockBuffer buffer;
	private final int ox;
	private final int oy;
	private final int oz;
	private final Orientation orientation;

	public Canvas(BlockBuffer buffer) {
		this(buffer, 0, 0, 0, Orientation.IDENTITY);
	}

	private Canvas(BlockBuffer buffer, int ox, int oy, int oz, Orientation orientation) {
		this.buffer = buffer;
		this.ox = ox;
		this.oy = oy;
		this.oz = oz;
		this.orientation = orientation;
	}

	public BlockBuffer buffer() {
		return buffer;
	}

	public Orientation orientation() {
		return orientation;
	}

	// ------------------------------------------------------------------ frames
	public int bufX(int x, int z) {
		return ox + orientation.mapX(x, z);
	}

	public int bufY(int y) {
		return oy + y;
	}

	public int bufZ(int x, int z) {
		return oz + orientation.mapZ(x, z);
	}

	/** Child frame with its origin at local (x, y, z) and the given relative orientation. */
	public Canvas child(int x, int y, int z, Orientation local) {
		return new Canvas(buffer, bufX(x, z), bufY(y), bufZ(x, z), orientation.compose(local));
	}

	public Canvas translate(int x, int y, int z) {
		return child(x, y, z, Orientation.IDENTITY);
	}

	/**
	 * Child frame whose local rectangle [0,w) x [0,d) covers this canvas' rectangle starting at (x0, z0),
	 * with the child's "front" (local north, -z) facing {@code front} in this canvas. With
	 * {@code mirror} the child's x axis is flipped (left/right swapped).
	 */
	public Canvas frame(int x0, int y, int z0, int w, int d, Direction front, boolean mirror) {
		Orientation local = new Orientation(mirror, Orientation.rotationFor(front));
		int minX = Integer.MAX_VALUE;
		int minZ = Integer.MAX_VALUE;
		for (int[] c : new int[][] {{0, 0}, {w - 1, 0}, {0, d - 1}, {w - 1, d - 1}}) {
			minX = Math.min(minX, local.mapX(c[0], c[1]));
			minZ = Math.min(minZ, local.mapZ(c[0], c[1]));
		}
		return child(x0 - minX, y, z0 - minZ, local);
	}

	/** Maps a direction from this frame to buffer space. */
	public Direction dir(Direction local) {
		return orientation.apply(local);
	}

	// ------------------------------------------------------------------ primitives
	public void set(int x, int y, int z, @Nullable BlockState state) {
		buffer.set(bufX(x, z), bufY(y), bufZ(x, z), state == null ? null : orientation.apply(state));
	}

	public void set(int x, int y, int z, Block block) {
		set(x, y, z, block.defaultBlockState());
	}

	/** Buffer-oriented state at a local position (null if unset). */
	public @Nullable BlockState get(int x, int y, int z) {
		return buffer.get(bufX(x, z), bufY(y), bufZ(x, z));
	}

	public boolean is(int x, int y, int z, Block block) {
		BlockState s = get(x, y, z);
		return s != null && s.is(block);
	}

	public boolean isAirOrUnset(int x, int y, int z) {
		BlockState s = get(x, y, z);
		return s == null || s.isAir();
	}

	public void fill(int x1, int y1, int z1, int x2, int y2, int z2, BlockState state) {
		for (int y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
			for (int z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
				for (int x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
					set(x, y, z, state);
				}
			}
		}
	}

	public void fill(int x1, int y1, int z1, int x2, int y2, int z2, Block block) {
		fill(x1, y1, z1, x2, y2, z2, block.defaultBlockState());
	}

	public void clear(int x1, int y1, int z1, int x2, int y2, int z2) {
		fill(x1, y1, z1, x2, y2, z2, AIR);
	}

	/** The four vertical faces of a box. */
	public void walls(int x1, int y1, int z1, int x2, int y2, int z2, BlockState state) {
		fill(x1, y1, z1, x2, y2, z1, state);
		fill(x1, y1, z2, x2, y2, z2, state);
		fill(x1, y1, z1, x1, y2, z2, state);
		fill(x2, y1, z1, x2, y2, z2, state);
	}

	public void init(int x, int y, int z, BlockEntityInit init) {
		buffer.setInit(bufX(x, z), bufY(y), bufZ(x, z), init);
	}

	public void marker(String type, int x, int y, int z, String label) {
		buffer.addMarker(type, bufX(x, z), bufY(y), bufZ(x, z), label);
	}

	// ------------------------------------------------------------------ furniture helpers
	public static BlockState facing(Block block, Direction facing) {
		BlockState s = block.defaultBlockState();
		if (s.hasProperty(HorizontalDirectionalBlock.FACING)) {
			s = s.setValue(HorizontalDirectionalBlock.FACING, facing);
		} else if (s.hasProperty(BlockStateProperties.FACING)) {
			s = s.setValue(BlockStateProperties.FACING, facing);
		}
		return s;
	}

	/** Single-block directional furniture whose front points to {@code facing}. */
	public void put(int x, int y, int z, Block block, Direction facing) {
		set(x, y, z, facing(block, facing));
	}

	/** Two-high furniture (wardrobe, fridge, bookcase, locker...). */
	public void tall(int x, int y, int z, Block block, Direction facing) {
		BlockState s = facing(block, facing);
		set(x, y, z, s.setValue(TallFurnitureBlock.HALF, DoubleBlockHalf.LOWER));
		set(x, y + 1, z, s.setValue(TallFurnitureBlock.HALF, DoubleBlockHalf.UPPER));
	}

	/** Two-long furniture: foot at (x, y, z), head one block towards {@code facing}. */
	public void twoPart(int x, int y, int z, Block block, Direction facing) {
		BlockState s = facing(block, facing);
		set(x, y, z, s.setValue(TwoPartFurnitureBlock.PART, BedPart.FOOT));
		set(x + facing.getStepX(), y, z + facing.getStepZ(), s.setValue(TwoPartFurnitureBlock.PART, BedPart.HEAD));
	}

	/** Vanilla bed: head at (x, y, z) against a wall, foot one block away (towards {@code footDir}). */
	public void bed(int x, int y, int z, Block bed, Direction footDir) {
		Direction facing = footDir.getOpposite();
		BlockState s = bed.defaultBlockState().setValue(BedBlock.FACING, facing);
		set(x, y, z, s.setValue(BedBlock.PART, BedPart.HEAD));
		set(x + footDir.getStepX(), y, z + footDir.getStepZ(), s.setValue(BedBlock.PART, BedPart.FOOT));
	}

	/** Two-high door. {@code facing} is the vanilla door facing; hinge picks the hinge side. */
	public void door(int x, int y, int z, Block door, Direction facing, DoorHingeSide hinge, boolean open) {
		BlockState s = door.defaultBlockState().setValue(DoorBlock.FACING, facing).setValue(DoorBlock.HINGE, hinge)
			.setValue(DoorBlock.OPEN, open);
		set(x, y, z, s.setValue(DoorBlock.HALF, DoubleBlockHalf.LOWER));
		set(x, y + 1, z, s.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER));
	}

	/** Pair of sliding elevator door panels starting at (x, y, z) and continuing towards facing's clockwise side. */
	public void elevatorDoors(int x, int y, int z, Direction facing) {
		Direction right = facing.getClockWise();
		for (int i = 0; i < 2; i++) {
			DoorHingeSide hinge = i == 0 ? DoorHingeSide.LEFT : DoorHingeSide.RIGHT;
			BlockState s = com.modernapartments.registry.ModBlocks.ELEVATOR_DOOR.defaultBlockState()
				.setValue(ElevatorDoorBlock.FACING, facing).setValue(ElevatorDoorBlock.HINGE, hinge);
			int px = x + right.getStepX() * i;
			int pz = z + right.getStepZ() * i;
			set(px, y, pz, s.setValue(ElevatorDoorBlock.HALF, DoubleBlockHalf.LOWER));
			set(px, y + 1, pz, s.setValue(ElevatorDoorBlock.HALF, DoubleBlockHalf.UPPER));
		}
	}

	public void stairs(int x, int y, int z, Block stair, Direction ascending, boolean upsideDown) {
		set(x, y, z, stair.defaultBlockState().setValue(StairBlock.FACING, ascending)
			.setValue(StairBlock.HALF, upsideDown ? Half.TOP : Half.BOTTOM));
	}

	/** Wall sign whose text faces {@code facing} (mounted on the block behind it). */
	public void wallSign(int x, int y, int z, Block sign, Direction facing, BlockEntityInit text) {
		set(x, y, z, sign.defaultBlockState().setValue(WallSignBlock.FACING, facing));
		init(x, y, z, text);
	}

	public void withInit(int x, int y, int z, BlockState state, BlockEntityInit init) {
		set(x, y, z, state);
		init(x, y, z, init);
	}

	public BlockPos bufferPos(int x, int y, int z) {
		return new BlockPos(bufX(x, z), bufY(y), bufZ(x, z));
	}

	/** Convenience for furniture facing checks in validation code. */
	public static boolean isFurniture(BlockState s) {
		return s.getBlock() instanceof FurnitureBlock;
	}
}
