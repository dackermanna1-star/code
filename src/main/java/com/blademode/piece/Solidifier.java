package com.blademode.piece;

import com.blademode.BladeConfig;
import com.blademode.block.CutBlock;
import com.blademode.block.CutBlockEntity;
import com.blademode.geom.Plane;
import com.blademode.registry.ModBlocks;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix3d;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/** Turns a resting, nearly grid-aligned piece back into ordinary blocks. */
public final class Solidifier {
	private static final int SILENT = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS;
	/** A resting piece only turns back into blocks if no block would visibly jump further than this. */
	private static final double MAX_SNAP_DISTANCE = 0.2;
	/** Properties that are safe to keep when a block is tipped over onto its side. */
	private static final Set<Property<?>> TILT_SAFE = Set.of(
		BlockStateProperties.AXIS, BlockStateProperties.FACING, BlockStateProperties.WATERLOGGED,
		BlockStateProperties.DISTANCE, BlockStateProperties.PERSISTENT, BlockStateProperties.SNOWY,
		BlockStateProperties.LIT, BlockStateProperties.POWERED);

	private Solidifier() {
	}

	public static boolean trySolidify(ServerLevel level, PieceEntity piece) {
		Matrix3d r = new Matrix3d().set(piece.rot);
		Matrix3d q = nearestAxisRotation(r);
		if (q == null) {
			return false;
		}
		// Angle between the actual and the snapped orientation.
		Matrix3d diff = new Matrix3d(q).transpose().mul(r);
		double cos = Math.max(-1, Math.min(1, (diff.m00 + diff.m11 + diff.m22 - 1) * 0.5));
		if (Math.toDegrees(Math.acos(cos)) > BladeConfig.get().solidifyMaxAngle) {
			return false;
		}

		PieceBody body = piece.body();
		Vec3 off = piece.getPieceData().gridOffset();
		Vector3d pos = new Vector3d(piece.getX(), piece.getY(), piece.getZ());
		boolean yawOnly = Math.abs(q.m11 - 1) < 1.0E-9;
		Rotation yaw = yawOnly ? yawRotation(q) : Rotation.NONE;

		List<BlockPos> targets = new ArrayList<>(body.blocks.size());
		List<BlockState> states = new ArrayList<>(body.blocks.size());
		List<List<Plane>> planes = new ArrayList<>(body.blocks.size());
		// Cell-local planes rotate about the cell centre: p' = Q p + (0.5 - Q 0.5).
		Vector3d half = q.transform(new Vector3d(0.5, 0.5, 0.5));
		for (PieceBlock b : body.blocks) {
			Vector3d local = new Vector3d(b.pos().getX() + 0.5 + off.x, b.pos().getY() + 0.5 + off.y, b.pos().getZ() + 0.5 + off.z);
			Vector3d c = q.transform(new Vector3d(local)).add(pos);
			BlockPos target = BlockPos.containing(c.x, c.y, c.z);
			// Only settle if every block is already (almost) where it would be placed: no visible jump.
			Vector3d actual = r.transform(new Vector3d(local)).add(pos);
			if (actual.distance(target.getX() + 0.5, target.getY() + 0.5, target.getZ() + 0.5) > MAX_SNAP_DISTANCE) {
				return false;
			}
			targets.add(target);
			BlockState rotated = yawOnly ? b.state().rotate(yaw) : tilt(b.state(), q);
			if (rotated == null) {
				return false;
			}
			states.add(rotated);
			List<Plane> ps = new ArrayList<>(b.planes().size());
			for (Plane p : b.planes()) {
				ps.add(p.transformed(q, 0.5 - half.x, 0.5 - half.y, 0.5 - half.z));
			}
			planes.add(ps);
		}

		List<BlockPos> placed = new ArrayList<>();
		Set<BlockPos> used = new HashSet<>();
		for (int i = 0; i < targets.size(); i++) {
			BlockPos target = targets.get(i);
			PieceBlock b = body.blocks.get(i);
			BlockState existing = level.getBlockState(target);
			if (b.isCut() && existing.is(ModBlocks.CUT_BLOCK) && level.getBlockEntity(target) instanceof CutBlockEntity other
				&& other.getOriginal() == states.get(i) && used.add(target)) {
				// The other half of this block is still in place: put the two halves back together.
				List<Plane> merged = mergeComplementary(other.getPlanes(), planes.get(i));
				if (merged != null) {
					if (merged.isEmpty()) {
						level.removeBlockEntity(target);
						level.setBlock(target, states.get(i), SILENT);
					} else {
						other.setContents(states.get(i), merged, false);
						level.sendBlockUpdated(target, existing, existing, Block.UPDATE_CLIENTS);
					}
					placed.add(target);
					continue;
				}
				used.remove(target);
			}
			boolean free = level.isInWorldBounds(target) && used.add(target) && (existing.isAir() || existing.canBeReplaced() || existing.getBlock() instanceof LiquidBlock);
			if (!free) {
				// No room: the block breaks into its drops.
				double fraction = b.isCut() ? body.shapes[i].fraction() : 1.0;
				if (level.getRandom().nextDouble() < fraction) {
					for (ItemStack stack : Block.getDrops(b.state(), level, target, null)) {
						Block.popResource(level, target, stack);
					}
				}
				continue;
			}
			BlockState state = states.get(i);
			if (b.isCut()) {
				level.setBlock(target, CutBlock.stateFor(ModBlocks.CUT_BLOCK, state), SILENT);
				if (level.getBlockEntity(target) instanceof CutBlockEntity cut) {
					cut.setContents(state, planes.get(i), false);
				}
			} else {
				if (state.hasProperty(BlockStateProperties.WATERLOGGED)) {
					state = state.setValue(BlockStateProperties.WATERLOGGED, existing.getFluidState().isSourceOfType(Fluids.WATER));
				}
				level.setBlock(target, state, SILENT);
				if (b.blockEntity().isPresent()) {
					loadBlockEntity(level, target, b.blockEntity().get());
				}
			}
			placed.add(target);
		}

		for (BlockPos p : placed) {
			BlockState now = level.getBlockState(p);
			now.updateNeighbourShapes(level, p, Block.UPDATE_ALL);
			level.updateNeighborsAt(p, now.getBlock());
			BlockState updated = Block.updateFromNeighbourShapes(now, level, p);
			if (updated != now) {
				level.setBlock(p, updated, Block.UPDATE_ALL);
			}
		}
		com.blademode.BladeMode.LOGGER.debug("Piece {} settled into {} blocks (snap angle {} deg, at {})", piece.getId(), placed.size(),
			String.format("%.1f", Math.toDegrees(Math.acos(cos))), pos);
		piece.discard();
		return true;
	}

	/**
	 * If two cut parts of the same block are exact complements (they share all planes except one
	 * that appears flipped), returns the planes of their union; otherwise null.
	 */
	static @Nullable List<Plane> mergeComplementary(List<Plane> a, List<Plane> b) {
		for (int i = 0; i < a.size(); i++) {
			for (int j = 0; j < b.size(); j++) {
				if (!same(a.get(i), b.get(j).flip())) {
					continue;
				}
				List<Plane> restA = new ArrayList<>(a);
				restA.remove(i);
				List<Plane> restB = new ArrayList<>(b);
				restB.remove(j);
				if (restA.size() != restB.size()) {
					continue;
				}
				boolean all = true;
				for (Plane p : restA) {
					boolean found = false;
					for (Plane o : restB) {
						if (same(p, o)) {
							found = true;
							break;
						}
					}
					if (!found) {
						all = false;
						break;
					}
				}
				if (all) {
					return restA;
				}
			}
		}
		return null;
	}

	private static boolean same(Plane a, Plane b) {
		final double e = 1.0E-5;
		return Math.abs(a.nx() - b.nx()) < e && Math.abs(a.ny() - b.ny()) < e && Math.abs(a.nz() - b.nz()) < e && Math.abs(a.d() - b.d()) < e;
	}

	private static void loadBlockEntity(ServerLevel level, BlockPos pos, CompoundTag tag) {
		BlockEntity be = level.getBlockEntity(pos);
		if (be == null) {
			return;
		}
		try (ProblemReporter.ScopedCollector reporter = new ProblemReporter.ScopedCollector(be.problemPath(), com.blademode.BladeMode.LOGGER)) {
			be.loadWithComponents(TagValueInput.create(reporter, level.registryAccess(), tag));
			be.setChanged();
		}
	}

	/** The closest rotation that maps axes onto axes, or null if r is too far from any. */
	static @Nullable Matrix3d nearestAxisRotation(Matrix3d r) {
		double[][] m = {{r.m00, r.m10, r.m20}, {r.m01, r.m11, r.m21}, {r.m02, r.m12, r.m22}};
		// m[row][col]: JOML stores mColRow, so r.m10 is row 0, column 1.
		double[][] out = new double[3][3];
		boolean[] rowUsed = new boolean[3];
		for (int col = 0; col < 3; col++) {
			int best = -1;
			double bestAbs = -1;
			for (int row = 0; row < 3; row++) {
				double a = Math.abs(m[row][col]);
				if (!rowUsed[row] && a > bestAbs) {
					bestAbs = a;
					best = row;
				}
			}
			if (best < 0) {
				return null;
			}
			rowUsed[best] = true;
			out[best][col] = Math.signum(m[best][col]);
		}
		Matrix3d q = new Matrix3d(
			out[0][0], out[1][0], out[2][0],
			out[0][1], out[1][1], out[2][1],
			out[0][2], out[1][2], out[2][2]);
		if (q.determinant() < 0.5) {
			return null;
		}
		return q;
	}

	private static Rotation yawRotation(Matrix3d q) {
		// Image of +X: column 0 = (m00, m01, m02).
		if (q.m00 > 0.5) {
			return Rotation.NONE;
		}
		if (q.m02 > 0.5) {
			return Rotation.CLOCKWISE_90;
		}
		if (q.m00 < -0.5) {
			return Rotation.CLOCKWISE_180;
		}
		return Rotation.COUNTERCLOCKWISE_90;
	}

	/** Re-orients a block whose "up" no longer points up, if its state can express that. */
	private static @Nullable BlockState tilt(BlockState state, Matrix3d q) {
		for (Property<?> p : state.getProperties()) {
			if (!TILT_SAFE.contains(p)) {
				return null;
			}
		}
		BlockState out = state;
		if (state.hasProperty(BlockStateProperties.AXIS)) {
			Direction.Axis axis = state.getValue(BlockStateProperties.AXIS);
			Direction d = Direction.fromAxisAndDirection(axis, Direction.AxisDirection.POSITIVE);
			out = out.setValue(BlockStateProperties.AXIS, rotate(d, q).getAxis());
		}
		if (state.hasProperty(BlockStateProperties.FACING)) {
			out = out.setValue(BlockStateProperties.FACING, rotate(state.getValue(BlockStateProperties.FACING), q));
		}
		return out;
	}

	private static Direction rotate(Direction d, Matrix3d q) {
		Vector3d v = q.transform(new Vector3d(d.getStepX(), d.getStepY(), d.getStepZ()));
		return Direction.getApproximateNearest(v.x, v.y, v.z);
	}
}
