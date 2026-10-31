package com.jjkshowdown.domain;

import com.jjkshowdown.registry.ModBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Builds the physical arenas of domain expansions as an ordered "plan" of block changes so the transformation
 * can be revealed progressively during the activation sequence.
 */
public final class DomainArena {
	public record Change(BlockPos pos, BlockState state, double order) {
	}

	private DomainArena() {
	}

	/** Whether a domain may transform this position (always restored afterwards). */
	public static boolean canTransform(ServerLevel level, BlockPos pos, BlockState current, @Nullable Entity owner) {
		if (!level.isInWorldBounds(pos) || !level.getWorldBorder().isWithinBounds(pos)) return false;
		if (current.hasBlockEntity()) return false;
		if (ModBlocks.isDomainBlock(current.getBlock())) return false;
		if (current.getDestroySpeed(level, pos) < 0) return false;
		if (current.is(BlockTags.WITHER_IMMUNE)) return false;
		return !(owner instanceof Player p) || level.mayInteract(p, pos);
	}

	/** Unlimited Void: a starry barrier dome over a glassy void floor, interior cleared. */
	public static List<Change> unlimitedVoid(ServerLevel level, BlockPos center, int radius, @Nullable Entity owner) {
		List<Change> plan = new ArrayList<>();
		BlockState barrier = ModBlocks.UNLIMITED_VOID_BARRIER.defaultBlockState();
		BlockState floor = ModBlocks.VOID_FLOOR.defaultBlockState();
		BlockState air = Blocks.AIR.defaultBlockState();
		double r2 = radius * radius;
		double inner2 = (radius - 1.0) * (radius - 1.0);
		BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
		for (int dx = -radius; dx <= radius; dx++) {
			for (int dz = -radius; dz <= radius; dz++) {
				double h2 = dx * dx + dz * dz;
				if (h2 > r2) continue;
				// floor disc (one layer below the caster's feet), plus one supporting layer under the rim
				m.set(center.getX() + dx, center.getY() - 1, center.getZ() + dz);
				addIf(level, plan, m.immutable(), floor, Math.sqrt(h2), owner);
				for (int dy = 0; dy <= radius; dy++) {
					double d2 = h2 + dy * dy;
					if (d2 > r2) break;
					m.set(center.getX() + dx, center.getY() + dy, center.getZ() + dz);
					BlockState target = d2 > inner2 ? barrier : air;
					addIf(level, plan, m.immutable(), target, Math.sqrt(d2), owner);
				}
			}
		}
		plan.sort(Comparator.comparingDouble(Change::order));
		return plan;
	}

	private static void addIf(ServerLevel level, List<Change> plan, BlockPos pos, BlockState target, double order, @Nullable Entity owner) {
		BlockState cur = level.getBlockState(pos);
		if (cur == target) return;
		if (target.isAir() && cur.isAir()) return;
		if (!canTransform(level, pos, cur, owner)) return;
		plan.add(new Change(pos, target, order));
	}

	/**
	 * Malevolent Shrine: a toothed shrine of dark wood, bone and black tile rising behind Sukuna,
	 * on a spreading pool of cursed blood.
	 */
	public static List<Change> malevolentShrine(ServerLevel level, BlockPos ownerPos, Direction facing, @Nullable Entity owner) {
		List<Change> plan = new ArrayList<>();
		Direction back = facing.getOpposite();
		Direction right = facing.getClockWise();
		BlockPos base = ownerPos.relative(back, 7);
		int groundY = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, base.getX(), base.getZ());
		groundY = Math.max(Math.min(groundY, ownerPos.getY() + 3), ownerPos.getY() - 3);
		base = new BlockPos(base.getX(), groundY, base.getZ());

		BlockState pillar = ModBlocks.SHRINE_PILLAR.defaultBlockState();
		BlockState roof = ModBlocks.SHRINE_ROOF.defaultBlockState();
		BlockState bone = ModBlocks.SHRINE_BONE.defaultBlockState();
		BlockState blood = ModBlocks.CURSED_BLOOD.defaultBlockState();

		// blood pool spreading over the ground (replaces the top surface block)
		for (int dx = -13; dx <= 13; dx++) {
			for (int dz = -13; dz <= 13; dz++) {
				double d = Math.sqrt(dx * dx + dz * dz);
				if (d > 13 || (d > 9 && level.getRandom().nextFloat() < 0.4f)) continue;
				int x = ownerPos.getX() + dx, z = ownerPos.getZ() + dz;
				int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z) - 1;
				if (Math.abs(y - ownerPos.getY() + 1) > 6) continue;
				add(level, plan, new BlockPos(x, y, z), blood, d * 0.25, owner);
			}
		}

		// platform
		for (int a = -6; a <= 6; a++) {
			for (int b = -1; b <= 9; b++) {
				add(level, plan, offset(base, right, a, back, b, 0), roof, 4 + b * 0.05, owner);
			}
		}
		// pillars
		int[][] corners = {{-5, 0}, {5, 0}, {-5, 8}, {5, 8}, {-2, 0}, {2, 0}};
		for (int[] c : corners) {
			for (int y = 1; y <= 8; y++) {
				add(level, plan, offset(base, right, c[0], back, c[1], y), pillar, 5 + y, owner);
			}
		}
		// walls of bone at the back and sides
		for (int y = 1; y <= 7; y++) {
			for (int a = -5; a <= 5; a++) add(level, plan, offset(base, right, a, back, 8, y), bone, 5 + y + 0.2, owner);
			for (int b = 1; b <= 7; b++) {
				add(level, plan, offset(base, right, -5, back, b, y), bone, 5 + y + 0.3, owner);
				add(level, plan, offset(base, right, 5, back, b, y), bone, 5 + y + 0.3, owner);
			}
		}
		// the maw: teeth hanging from the lintel and rising from the floor between the front pillars
		for (int a = -4; a <= 4; a++) {
			add(level, plan, offset(base, right, a, back, 0, 7), bone, 12, owner);
			if ((a & 1) == 0) add(level, plan, offset(base, right, a, back, 0, 6), bone, 12.1, owner);
			if (a % 3 == 0) add(level, plan, offset(base, right, a, back, 0, 5), bone, 12.2, owner);
			if ((a & 1) != 0) add(level, plan, offset(base, right, a, back, 0, 1), bone, 6.1, owner);
			if (Math.abs(a) == 3) add(level, plan, offset(base, right, a, back, 0, 2), bone, 6.2, owner);
		}
		// three roof tiers with upturned eaves
		int[][] tiers = {{8, 7, 9}, {11, 5, 7}, {13, 3, 4}};
		for (int[] t : tiers) {
			int y = t[0], halfW = t[1], depth = t[2];
			for (int a = -halfW - 1; a <= halfW + 1; a++) {
				for (int b = -1; b <= depth; b++) {
					add(level, plan, offset(base, right, a, back, b + (9 - depth) / 2, y + 1), roof, 14 + y, owner);
				}
			}
			for (int sa : new int[]{-halfW - 2, halfW + 2}) {
				for (int sb : new int[]{-2, depth + 1}) {
					add(level, plan, offset(base, right, sa, back, sb + (9 - depth) / 2, y + 2), roof, 14 + y + 0.5, owner);
				}
			}
		}
		// skulls of bone on the ridge
		for (int a = -2; a <= 2; a += 2) add(level, plan, offset(base, right, a, back, 4, 16), bone, 31, owner);
		// scattered bone piles
		for (int i = 0; i < 26; i++) {
			int dx = level.getRandom().nextInt(25) - 12, dz = level.getRandom().nextInt(25) - 12;
			if (dx * dx + dz * dz < 9) continue;
			int x = ownerPos.getX() + dx, z = ownerPos.getZ() + dz;
			int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
			if (Math.abs(y - ownerPos.getY()) > 6) continue;
			add(level, plan, new BlockPos(x, y, z), bone, 3 + level.getRandom().nextDouble(), owner);
		}
		plan.sort(Comparator.comparingDouble(Change::order));
		return plan;
	}

	private static BlockPos offset(BlockPos base, Direction right, int a, Direction back, int b, int y) {
		return base.relative(right, a).relative(back, b).above(y);
	}

	private static void add(ServerLevel level, List<Change> plan, BlockPos pos, BlockState target, double order, @Nullable Entity owner) {
		BlockState cur = level.getBlockState(pos);
		if (cur == target || !canTransform(level, pos, cur, owner)) return;
		plan.add(new Change(pos, target, order));
	}
}
