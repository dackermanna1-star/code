package com.extremesports.physics;

import com.extremesports.registry.ModTags;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.SlabType;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * Collects grindable lines around a position: skatepark rails/boxes/ledges/coping, vanilla rail-like blocks
 * (fences, walls, bars, panes) and the exposed top edges of ordinary blocks (curbs and ledges).
 */
public final class GrindFinder {
	/** Global toggle for grinding the edges of ordinary blocks. */
	public static boolean vanillaLedges = true;

	private GrindFinder() {
	}

	public static List<GrindSegment> collect(BlockGetter level, AABB area) {
		List<GrindSegment> out = new ArrayList<>();
		BlockPos.MutableBlockPos mutable = new BlockPos.MutableBlockPos();
		int minX = (int) Math.floor(area.minX);
		int minY = (int) Math.floor(area.minY);
		int minZ = (int) Math.floor(area.minZ);
		int maxX = (int) Math.floor(area.maxX);
		int maxY = (int) Math.floor(area.maxY);
		int maxZ = (int) Math.floor(area.maxZ);
		for (int x = minX; x <= maxX; x++) {
			for (int y = minY; y <= maxY; y++) {
				for (int z = minZ; z <= maxZ; z++) {
					mutable.set(x, y, z);
					addSegments(level, mutable.immutable(), out);
				}
			}
		}
		return out;
	}

	private static void addSegments(BlockGetter level, BlockPos pos, List<GrindSegment> out) {
		BlockState state = level.getBlockState(pos);
		if (state.isAir()) {
			return;
		}
		if (state.getBlock() instanceof SurfaceProvider provider) {
			provider.addGrindSegments(level, state, pos, out);
			return;
		}
		if (state.is(ModTags.GRIND_RAILS)) {
			VoxelShape shape = state.getShape(level, pos);
			if (shape.isEmpty()) {
				return;
			}
			double top = pos.getY() + shape.max(Direction.Axis.Y);
			double cx = pos.getX() + 0.5;
			double cz = pos.getZ() + 0.5;
			out.add(new GrindSegment(new Vec3(pos.getX(), top, cz), new Vec3(pos.getX() + 1, top, cz), GrindSegment.Type.RAIL, true));
			out.add(new GrindSegment(new Vec3(cx, top, pos.getZ()), new Vec3(cx, top, pos.getZ() + 1), GrindSegment.Type.RAIL, true));
			return;
		}
		if (!vanillaLedges) {
			return;
		}
		double top = ledgeTop(level, pos, state);
		if (Double.isNaN(top)) {
			return;
		}
		BlockPos above = pos.above();
		if (!level.getBlockState(above).getCollisionShape(level, above).isEmpty() && top >= pos.getY() + 0.99) {
			return;
		}
		boolean metal = state.is(ModTags.METAL_LEDGES);
		for (Direction side : Direction.Plane.HORIZONTAL) {
			BlockPos neighbor = pos.relative(side);
			BlockState neighborState = level.getBlockState(neighbor);
			VoxelShape neighborShape = neighborState.getCollisionShape(level, neighbor);
			if (!neighborShape.isEmpty() && pos.getY() + neighborShape.max(Direction.Axis.Y) >= top - 0.01) {
				continue;
			}
			out.add(edgeSegment(pos, side, top, metal));
		}
	}

	/** Top height of a block usable as a ledge, or NaN if its top isn't a flat full face. */
	private static double ledgeTop(BlockGetter level, BlockPos pos, BlockState state) {
		if (state.getBlock() instanceof SlabBlock && state.hasProperty(SlabBlock.TYPE) && state.getValue(SlabBlock.TYPE) == SlabType.BOTTOM) {
			return pos.getY() + 0.5;
		}
		if (state.getBlock() instanceof StairBlock) {
			return Double.NaN;
		}
		if (state.isCollisionShapeFullBlock(level, pos)) {
			return pos.getY() + 1.0;
		}
		return Double.NaN;
	}

	/** Edge along {@code side} of the block's top face, running perpendicular to that side. */
	public static GrindSegment edgeSegment(BlockPos pos, Direction side, double top, boolean metal) {
		double x0 = pos.getX();
		double z0 = pos.getZ();
		return switch (side) {
			case NORTH -> new GrindSegment(new Vec3(x0, top, z0), new Vec3(x0 + 1, top, z0), GrindSegment.Type.LEDGE, metal);
			case SOUTH -> new GrindSegment(new Vec3(x0, top, z0 + 1), new Vec3(x0 + 1, top, z0 + 1), GrindSegment.Type.LEDGE, metal);
			case WEST -> new GrindSegment(new Vec3(x0, top, z0), new Vec3(x0, top, z0 + 1), GrindSegment.Type.LEDGE, metal);
			default -> new GrindSegment(new Vec3(x0 + 1, top, z0), new Vec3(x0 + 1, top, z0 + 1), GrindSegment.Type.LEDGE, metal);
		};
	}

	/**
	 * Finds the segment continuing a grind from {@code end} heading along {@code dir}.
	 * Returns the segment oriented so that {@code start} is at the joint.
	 */
	public static @Nullable GrindSegment findContinuation(BlockGetter level, Vec3 end, Vec3 dir, GrindSegment current) {
		AABB area = new AABB(end, end).inflate(1.1, 1.1, 1.1);
		GrindSegment best = null;
		double bestScore = Double.MAX_VALUE;
		for (GrindSegment candidate : collect(level, area)) {
			for (GrindSegment oriented : new GrindSegment[]{candidate, candidate.reversed()}) {
				if (oriented.start().distanceToSqr(end) > 0.12 * 0.12) {
					continue;
				}
				if (oriented.end().distanceToSqr(current.start()) < 1.0E-4 && oriented.start().distanceToSqr(current.end()) < 1.0E-4) {
					continue;
				}
				double alignment = oriented.direction().dot(dir);
				if (alignment < 0.82) {
					continue;
				}
				double score = oriented.start().distanceTo(end) + (1.0 - alignment);
				if (score < bestScore) {
					bestScore = score;
					best = oriented;
				}
			}
		}
		return best;
	}
}
