package com.modernapartments.build;

import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A horizontal orientation: an optional mirror across the X axis followed by a rotation. Used to
 * map coordinates, directions and block states from a local frame (a unit, a room) to its parent.
 */
public record Orientation(boolean mirror, Rotation rotation) {
	public static final Orientation IDENTITY = new Orientation(false, Rotation.NONE);

	public static Orientation of(Rotation rotation) {
		return new Orientation(false, rotation);
	}

	/** Rotation that turns local {@link Direction#NORTH} into {@code front}. */
	public static Rotation rotationFor(Direction front) {
		return switch (front) {
			case EAST -> Rotation.CLOCKWISE_90;
			case SOUTH -> Rotation.CLOCKWISE_180;
			case WEST -> Rotation.COUNTERCLOCKWISE_90;
			default -> Rotation.NONE;
		};
	}

	public static Rotation inverse(Rotation r) {
		return switch (r) {
			case CLOCKWISE_90 -> Rotation.COUNTERCLOCKWISE_90;
			case COUNTERCLOCKWISE_90 -> Rotation.CLOCKWISE_90;
			default -> r;
		};
	}

	/** this(inner(x)). */
	public Orientation compose(Orientation inner) {
		if (mirror) {
			return new Orientation(!inner.mirror, rotation.getRotated(inverse(inner.rotation)));
		}
		return new Orientation(inner.mirror, rotation.getRotated(inner.rotation));
	}

	public int mapX(int x, int z) {
		int mx = mirror ? -x : x;
		return switch (rotation) {
			case CLOCKWISE_90 -> -z;
			case CLOCKWISE_180 -> -mx;
			case COUNTERCLOCKWISE_90 -> z;
			default -> mx;
		};
	}

	public int mapZ(int x, int z) {
		int mx = mirror ? -x : x;
		return switch (rotation) {
			case CLOCKWISE_90 -> mx;
			case CLOCKWISE_180 -> -z;
			case COUNTERCLOCKWISE_90 -> -mx;
			default -> z;
		};
	}

	public Direction apply(Direction d) {
		if (d.getAxis() == Direction.Axis.Y) {
			return d;
		}
		Direction m = mirror ? Mirror.FRONT_BACK.mirror(d) : d;
		return rotation.rotate(m);
	}

	public BlockState apply(BlockState state) {
		BlockState s = mirror ? state.mirror(Mirror.FRONT_BACK) : state;
		return rotation == Rotation.NONE ? s : s.rotate(rotation);
	}
}
