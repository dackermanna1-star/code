package dev.visceral.client.physics;

import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.joml.Vector3d;

/**
 * Point-vs-voxel collision against real block collision shapes (slabs, stairs, fences...).
 * Shapes are cached per simulation step; resolution prefers the face the point entered
 * through, and never pushes into a neighbouring solid block.
 */
public final class WorldCollider {
	private static final List<AABB> EMPTY = List.of();
	private final Long2ObjectOpenHashMap<List<AABB>> cache = new Long2ObjectOpenHashMap<>();
	private final BlockPos.MutableBlockPos mpos = new BlockPos.MutableBlockPos();
	private Level level;

	public void begin(Level level) {
		this.level = level;
		cache.clear();
	}

	private List<AABB> boxes(int x, int y, int z) {
		long key = BlockPos.asLong(x, y, z);
		List<AABB> list = cache.get(key);
		if (list == null) {
			mpos.set(x, y, z);
			if (!level.isLoaded(mpos)) {
				list = EMPTY;
			} else {
				BlockState state = level.getBlockState(mpos);
				if (state.isAir()) {
					list = EMPTY;
				} else {
					VoxelShape shape = state.getCollisionShape(level, mpos, CollisionContext.empty());
					list = shape.isEmpty() ? EMPTY : shape.toAabbs();
				}
			}
			cache.put(key, list);
		}
		return list;
	}

	private boolean solidFull(int x, int y, int z) {
		List<AABB> b = boxes(x, y, z);
		if (b.size() != 1) return false;
		AABB a = b.get(0);
		return a.minX <= 1e-3 && a.minY <= 1e-3 && a.minZ <= 1e-3 && a.maxX >= 0.999 && a.maxY >= 0.999 && a.maxZ >= 0.999;
	}

	/**
	 * Resolves point {@code p} (with previous position {@code prev}) against the world. If it is
	 * inside a collision box, writes the outward normal and depth into {@code out} and returns
	 * true.
	 */
	public boolean resolve(Vector3d p, Vector3d prev, Contact out) {
		int bx = (int) Math.floor(p.x), by = (int) Math.floor(p.y), bz = (int) Math.floor(p.z);
		// Shapes can extend up to 0.5 above their block (fences, walls): check the block below too.
		return test(p, prev, bx, by, bz, out) || test(p, prev, bx, by - 1, bz, out);
	}

	private boolean test(Vector3d p, Vector3d prev, int bx, int by, int bz, Contact out) {
		List<AABB> list = boxes(bx, by, bz);
		if (list.isEmpty()) return false;
		double lx = p.x - bx, ly = p.y - by, lz = p.z - bz;
		for (AABB a : list) {
			if (lx <= a.minX || lx >= a.maxX || ly <= a.minY || ly >= a.maxY || lz <= a.minZ || lz >= a.maxZ) continue;
			double px = prev.x - bx, py = prev.y - by, pz = prev.z - bz;
			// Prefer the face the point came through, then the shallowest face; never push into solid neighbours.
			Direction best = null;
			double bestScore = Double.MAX_VALUE, bestDepth = 0;
			for (Direction d : DIRECTIONS) {
				if (faceBlocked(bx, by, bz, a, d)) continue;
				double depth = switch (d) {
					case UP -> a.maxY - ly;
					case DOWN -> ly - a.minY;
					case EAST -> a.maxX - lx;
					case WEST -> lx - a.minX;
					case SOUTH -> a.maxZ - lz;
					case NORTH -> lz - a.minZ;
				};
				boolean entered = switch (d) {
					case UP -> py >= a.maxY;
					case DOWN -> py <= a.minY;
					case EAST -> px >= a.maxX;
					case WEST -> px <= a.minX;
					case SOUTH -> pz >= a.maxZ;
					case NORTH -> pz <= a.minZ;
				};
				double score = entered ? depth * 0.25 : depth;
				if (d == Direction.UP) score *= 0.8;
				if (score < bestScore) {
					bestScore = score;
					best = d;
					bestDepth = depth;
				}
			}
			if (best == null) {
				// Buried completely (e.g. inside a wall): push straight up.
				best = Direction.UP;
				bestDepth = a.maxY - ly;
			}
			out.depth = bestDepth;
			out.nx = best.getStepX();
			out.ny = best.getStepY();
			out.nz = best.getStepZ();
			return true;
		}
		return false;
	}

	private static final Direction[] DIRECTIONS = Direction.values();

	private boolean faceBlocked(int bx, int by, int bz, AABB a, Direction d) {
		boolean onBoundary = switch (d) {
			case UP -> a.maxY >= 0.999;
			case DOWN -> a.minY <= 1e-3;
			case EAST -> a.maxX >= 0.999;
			case WEST -> a.minX <= 1e-3;
			case SOUTH -> a.maxZ >= 0.999;
			case NORTH -> a.minZ <= 1e-3;
		};
		return onBoundary && solidFull(bx + d.getStepX(), by + d.getStepY(), bz + d.getStepZ());
	}

	/** Highest collision surface below {@code (x, y, z)} within {@code range}, or NaN. */
	public double groundBelow(double x, double y, double z, double range) {
		int bx = (int) Math.floor(x), bz = (int) Math.floor(z);
		double lx = x - bx, lz = z - bz;
		int top = (int) Math.floor(y);
		int bottom = (int) Math.floor(y - range);
		for (int by = top; by >= bottom; by--) {
			double best = Double.NaN;
			for (AABB a : boxes(bx, by, bz)) {
				if (lx < a.minX || lx > a.maxX || lz < a.minZ || lz > a.maxZ) continue;
				double surface = by + a.maxY;
				if (surface <= y + 1e-3 && (Double.isNaN(best) || surface > best)) best = surface;
			}
			if (!Double.isNaN(best)) return best;
		}
		return Double.NaN;
	}

	public static final class Contact {
		public double nx, ny, nz, depth;
	}
}
