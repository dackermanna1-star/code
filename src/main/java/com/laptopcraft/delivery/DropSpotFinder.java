package com.laptopcraft.delivery;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.jspecify.annotations.Nullable;

/**
 * Finds where a courier may set a package down: an air block (never replacing anything) with a sturdy floor,
 * not occupied by an entity, 1..{@link #RADIUS} blocks around a center (never the center column itself).
 * Closer spots on the same level win; spots on the preferred side (in front of the laptop screen or the
 * player) are favored.
 */
public final class DropSpotFinder {
	public static final int RADIUS = 3;
	private static final int[] DY_ORDER = {0, -1, 1, -2, 2};

	private DropSpotFinder() {
	}

	private record Candidate(int dx, int dy, int dz, int score) {
	}

	public static Optional<BlockPos> find(ServerLevel level, BlockPos center, @Nullable Direction preferred, BlockState packageState) {
		List<Candidate> candidates = new ArrayList<>();
		for (int dyIndex = 0; dyIndex < DY_ORDER.length; dyIndex++) {
			int dy = DY_ORDER[dyIndex];
			for (int dx = -RADIUS; dx <= RADIUS; dx++) {
				for (int dz = -RADIUS; dz <= RADIUS; dz++) {
					if (dx == 0 && dz == 0) {
						continue;
					}
					int score = (dx * dx + dz * dz) * 10 + dyIndex * 18;
					if (preferred != null) {
						int facing = dx * preferred.getStepX() + dz * preferred.getStepZ();
						if (facing > 0) {
							score -= 9;
						} else if (facing < 0) {
							score += 6;
						}
					}
					candidates.add(new Candidate(dx, dy, dz, score));
				}
			}
		}
		candidates.sort(Comparator.comparingInt(Candidate::score));

		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (Candidate c : candidates) {
			pos.setWithOffset(center, c.dx(), c.dy(), c.dz());
			if (isValidSpot(level, pos, packageState)) {
				return Optional.of(pos.immutable());
			}
		}
		return Optional.empty();
	}

	/** Air, sturdy floor, loaded, inside the world and not blocked by an entity. */
	public static boolean isValidSpot(ServerLevel level, BlockPos pos, BlockState packageState) {
		if (!level.isInWorldBounds(pos) || !level.isLoaded(pos) || !level.getWorldBorder().isWithinBounds(pos)) {
			return false;
		}
		if (!level.getBlockState(pos).isAir()) {
			return false;
		}
		BlockPos below = pos.below();
		if (!level.getBlockState(below).isFaceSturdy(level, below, Direction.UP)) {
			return false;
		}
		return level.isUnobstructed(packageState, pos, CollisionContext.empty());
	}
}
