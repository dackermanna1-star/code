package com.blademode.gore;

import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.joml.Vector3d;

/**
 * Snapshot of the block collision boxes around a ragdoll, refreshed every tick. Points that end up
 * inside a block leave through the face they came in by. (Adapted from Visceral.)
 */
public final class BlockCollider implements WorldShape {
	private static final double[] EMPTY = new double[0];
	private final BlockGetter level;
	private final Long2ObjectMap<double[]> cells = new Long2ObjectOpenHashMap<>();
	private int minX;
	private int minY;
	private int minZ;
	private int maxX = -1;
	private int maxY = -1;
	private int maxZ = -1;
	private long signature;

	public BlockCollider(BlockGetter level) {
		this.level = level;
	}

	@Override
	public void prepare(AABB region) {
		this.cells.clear();
		long hash = 1125899906842597L;
		this.minX = Mth.floor(region.minX);
		this.minY = Mth.floor(region.minY) - 1;
		this.minZ = Mth.floor(region.minZ);
		this.maxX = Mth.floor(region.maxX);
		this.maxY = Mth.floor(region.maxY);
		this.maxZ = Mth.floor(region.maxZ);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int x = this.minX; x <= this.maxX; x++) {
			for (int z = this.minZ; z <= this.maxZ; z++) {
				for (int y = this.minY; y <= this.maxY; y++) {
					pos.set(x, y, z);
					BlockState state = this.level.getBlockState(pos);
					if (state.isAir()) {
						continue;
					}
					VoxelShape shape = state.getCollisionShape(this.level, pos);
					if (shape.isEmpty()) {
						continue;
					}
					List<AABB> boxes = shape.toAabbs();
					double[] data = new double[boxes.size() * 6];
					for (int i = 0; i < boxes.size(); i++) {
						AABB box = boxes.get(i);
						data[i * 6] = box.minX + x;
						data[i * 6 + 1] = box.minY + y;
						data[i * 6 + 2] = box.minZ + z;
						data[i * 6 + 3] = box.maxX + x;
						data[i * 6 + 4] = box.maxY + y;
						data[i * 6 + 5] = box.maxZ + z;
					}
					this.cells.put(BlockPos.asLong(x, y, z), data);
					for (double value : data) {
						hash = 31 * hash + Double.hashCode(value);
					}
				}
			}
		}
		this.signature = hash;
	}

	@Override
	public long signature() {
		return this.signature;
	}

	@Override
	public boolean isEmpty() {
		return this.cells.isEmpty();
	}

	private double[] boxes(int x, int y, int z) {
		if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY || z < this.minZ || z > this.maxZ) {
			return EMPTY;
		}
		double[] data = this.cells.get(BlockPos.asLong(x, y, z));
		return data == null ? EMPTY : data;
	}

	@Override
	public boolean isSolid(double px, double py, double pz) {
		int bx = Mth.floor(px);
		int by = Mth.floor(py);
		int bz = Mth.floor(pz);
		return inside(this.boxes(bx, by, bz), px, py, pz) >= 0 || inside(this.boxes(bx, by - 1, bz), px, py, pz) >= 0;
	}

	private static int inside(double[] boxes, double px, double py, double pz) {
		for (int i = 0; i < boxes.length; i += 6) {
			if (px > boxes[i] && px < boxes[i + 3] && py > boxes[i + 1] && py < boxes[i + 4] && pz > boxes[i + 2] && pz < boxes[i + 5]) {
				return i;
			}
		}
		return -1;
	}

	@Override
	public boolean collide(Vector3d point, Vector3d previous, Contact out) {
		int bx = Mth.floor(point.x);
		int by = Mth.floor(point.y);
		int bz = Mth.floor(point.z);
		double[] boxes = this.boxes(bx, by, bz);
		int index = inside(boxes, point.x, point.y, point.z);
		if (index < 0) {
			// Tall collision shapes (fences, walls) reach into the block above.
			boxes = this.boxes(bx, by - 1, bz);
			index = inside(boxes, point.x, point.y, point.z);
			if (index < 0) {
				return false;
			}
		}
		return resolve(boxes, index, point, previous, out);
	}

	/** Push-out through the face the point entered by (or the shallowest free face). */
	private boolean resolve(double[] boxes, int index, Vector3d point, Vector3d previous, Contact out) {
		double minX = boxes[index];
		double minY = boxes[index + 1];
		double minZ = boxes[index + 2];
		double maxX = boxes[index + 3];
		double maxY = boxes[index + 4];
		double maxZ = boxes[index + 5];

		int bestAxis = -1;
		int bestSign = 0;
		double bestT = -1.0;
		for (int axis = 0; axis < 3; axis++) {
			double p = axis == 0 ? point.x : axis == 1 ? point.y : point.z;
			double q = axis == 0 ? previous.x : axis == 1 ? previous.y : previous.z;
			double min = axis == 0 ? minX : axis == 1 ? minY : minZ;
			double max = axis == 0 ? maxX : axis == 1 ? maxY : maxZ;
			if (q <= min && p > min) {
				double t = (min - q) / (p - q);
				if (t > bestT) {
					bestT = t;
					bestAxis = axis;
					bestSign = -1;
				}
			} else if (q >= max && p < max) {
				double t = (q - max) / (q - p);
				if (t > bestT) {
					bestT = t;
					bestAxis = axis;
					bestSign = 1;
				}
			}
		}

		if (bestAxis < 0) {
			// Started inside: leave through the shallowest face that is not buried in another block.
			double bestDepth = Double.MAX_VALUE;
			for (int axis = 0; axis < 3; axis++) {
				for (int sign = -1; sign <= 1; sign += 2) {
					double p = axis == 0 ? point.x : axis == 1 ? point.y : point.z;
					double depth = sign > 0 ? (axis == 0 ? maxX : axis == 1 ? maxY : maxZ) - p : p - (axis == 0 ? minX : axis == 1 ? minY : minZ);
					// Prefer pushing upwards: bodies are far more likely to be lying on something.
					double score = depth + (axis == 1 && sign > 0 ? -0.05 : 0.0);
					double ox = point.x + (axis == 0 ? sign * (depth + 0.02) : 0.0);
					double oy = point.y + (axis == 1 ? sign * (depth + 0.02) : 0.0);
					double oz = point.z + (axis == 2 ? sign * (depth + 0.02) : 0.0);
					if (this.isSolid(ox, oy, oz)) {
						score += 10.0;
					}
					if (score < bestDepth) {
						bestDepth = score;
						bestAxis = axis;
						bestSign = sign;
					}
				}
			}
		}

		double p = bestAxis == 0 ? point.x : bestAxis == 1 ? point.y : point.z;
		double depth = bestSign > 0 ? (bestAxis == 0 ? maxX : bestAxis == 1 ? maxY : maxZ) - p : p - (bestAxis == 0 ? minX : bestAxis == 1 ? minY : minZ);
		out.normal.set(bestAxis == 0 ? bestSign : 0, bestAxis == 1 ? bestSign : 0, bestAxis == 2 ? bestSign : 0);
		out.depth = Math.max(0.0, depth);
		return out.depth > 0.0;
	}
}
