package net.abyssaldescent.dungeon.layout;

import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.AABB;

/** Immutable integer box with inclusive bounds. */
public record Box(int minX, int minY, int minZ, int maxX, int maxY, int maxZ) {
	public static Box of(int x0, int y0, int z0, int x1, int y1, int z1) {
		return new Box(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1));
	}

	public int sizeX() {
		return maxX - minX + 1;
	}

	public int sizeY() {
		return maxY - minY + 1;
	}

	public int sizeZ() {
		return maxZ - minZ + 1;
	}

	public int centerX() {
		return (minX + maxX) >> 1;
	}

	public int centerZ() {
		return (minZ + maxZ) >> 1;
	}

	public Box inflate(int n) {
		return new Box(minX - n, minY - n, minZ - n, maxX + n, maxY + n, maxZ + n);
	}

	public Box inflateXZ(int n) {
		return new Box(minX - n, minY, minZ - n, maxX + n, maxY, maxZ + n);
	}

	public Box withY(int y0, int y1) {
		return new Box(minX, y0, minZ, maxX, y1, maxZ);
	}

	public boolean contains(int x, int y, int z) {
		return x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ;
	}

	public boolean containsXZ(int x, int z) {
		return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
	}

	public boolean contains(BlockPos pos) {
		return contains(pos.getX(), pos.getY(), pos.getZ());
	}

	public boolean intersects(Box o) {
		return minX <= o.maxX && maxX >= o.minX && minY <= o.maxY && maxY >= o.minY && minZ <= o.maxZ && maxZ >= o.minZ;
	}

	public boolean intersectsXZ(Box o) {
		return minX <= o.maxX && maxX >= o.minX && minZ <= o.maxZ && maxZ >= o.minZ;
	}

	public Box encapsulate(Box o) {
		return new Box(Math.min(minX, o.minX), Math.min(minY, o.minY), Math.min(minZ, o.minZ), Math.max(maxX, o.maxX), Math.max(maxY, o.maxY),
			Math.max(maxZ, o.maxZ));
	}

	/** Entity-space AABB covering the whole block range. */
	public AABB toAabb() {
		return new AABB(minX, minY, minZ, maxX + 1, maxY + 1, maxZ + 1);
	}
}
