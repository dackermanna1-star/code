package com.modernapartments.build.placement;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.structure.BoundingBox;

/**
 * Maps buffer coordinates to world coordinates: a rotation around the plot followed by a translation
 * so the rotated footprint's minimum corner sits at {@code min}. The building's front (local -z)
 * faces {@code rotation.rotate(NORTH)} in the world.
 */
public record PlacementTransform(BlockPos min, Rotation rotation, int sizeX, int sizeY, int sizeZ) {
	public static final Codec<PlacementTransform> CODEC = RecordCodecBuilder.create(i -> i.group(
		BlockPos.CODEC.fieldOf("min").forGetter(PlacementTransform::min),
		Rotation.CODEC.fieldOf("rotation").forGetter(PlacementTransform::rotation),
		Codec.INT.fieldOf("size_x").forGetter(PlacementTransform::sizeX),
		Codec.INT.fieldOf("size_y").forGetter(PlacementTransform::sizeY),
		Codec.INT.fieldOf("size_z").forGetter(PlacementTransform::sizeZ)
	).apply(i, PlacementTransform::new));

	public boolean swapsAxes() {
		return rotation == Rotation.CLOCKWISE_90 || rotation == Rotation.COUNTERCLOCKWISE_90;
	}

	public int footprintX() {
		return swapsAxes() ? sizeZ : sizeX;
	}

	public int footprintZ() {
		return swapsAxes() ? sizeX : sizeZ;
	}

	public int worldX(int x, int z) {
		return min.getX() + switch (rotation) {
			case CLOCKWISE_90 -> sizeZ - 1 - z;
			case CLOCKWISE_180 -> sizeX - 1 - x;
			case COUNTERCLOCKWISE_90 -> z;
			default -> x;
		};
	}

	public int worldZ(int x, int z) {
		return min.getZ() + switch (rotation) {
			case CLOCKWISE_90 -> x;
			case CLOCKWISE_180 -> sizeZ - 1 - z;
			case COUNTERCLOCKWISE_90 -> sizeX - 1 - x;
			default -> z;
		};
	}

	public int worldY(int y) {
		return min.getY() + y;
	}

	public BlockPos toWorld(int x, int y, int z) {
		return new BlockPos(worldX(x, z), worldY(y), worldZ(x, z));
	}

	/** Local x for a world column (only meaningful inside the footprint). */
	public int localX(int wx, int wz) {
		int rx = wx - min.getX();
		int rz = wz - min.getZ();
		return switch (rotation) {
			case CLOCKWISE_90 -> rz;
			case CLOCKWISE_180 -> sizeX - 1 - rx;
			case COUNTERCLOCKWISE_90 -> sizeX - 1 - rz;
			default -> rx;
		};
	}

	public int localZ(int wx, int wz) {
		int rx = wx - min.getX();
		int rz = wz - min.getZ();
		return switch (rotation) {
			case CLOCKWISE_90 -> sizeZ - 1 - rx;
			case CLOCKWISE_180 -> sizeZ - 1 - rz;
			case COUNTERCLOCKWISE_90 -> rx;
			default -> rz;
		};
	}

	public boolean inFootprint(int wx, int wz) {
		int rx = wx - min.getX();
		int rz = wz - min.getZ();
		return rx >= 0 && rz >= 0 && rx < footprintX() && rz < footprintZ();
	}

	public BoundingBox footprintBox() {
		return new BoundingBox(min.getX(), min.getY(), min.getZ(),
			min.getX() + footprintX() - 1, min.getY() + sizeY - 1, min.getZ() + footprintZ() - 1);
	}
}
