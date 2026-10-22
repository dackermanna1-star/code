package com.ordnance.fire;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.explosion.TerrainEffects;
import com.ordnance.registry.ModBlocks;
import com.ordnance.util.Wind;
import net.minecraft.block.AbstractFireBlock;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.PillarBlock;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.random.Random;

/** Server-side additions to vanilla fire, called from {@code FireBlockMixin}. */
public final class FireBehavior {
	private FireBehavior() {
	}

	private static OrdnanceConfig.Fire config() {
		return ConfigManager.get().fire;
	}

	/** A block consumed by fire may leave charred remains instead of vanishing. Returns true if handled. */
	public static boolean leaveRemains(ServerWorld world, BlockPos pos, BlockState burned) {
		OrdnanceConfig.Fire cfg = config();
		if (!cfg.enhancedFire || !cfg.charredRemains) {
			return false;
		}

		if (burned.isIn(BlockTags.LOGS_THAT_BURN) && burned.contains(PillarBlock.AXIS) && world.random.nextFloat() < cfg.charChance) {
			world.setBlockState(pos, CharredLogBlock.charredFrom(burned), Block.NOTIFY_ALL);
			return true;
		}

		return false;
	}

	/** After a fire block burns out: scorch the ground it sat on and maybe leave ash. */
	public static void afterBurnOut(ServerWorld world, BlockPos pos) {
		OrdnanceConfig.Fire cfg = config();
		if (!cfg.enhancedFire || !cfg.charredRemains || !world.getBlockState(pos).isAir()) {
			return;
		}

		BlockPos below = pos.down();
		BlockState floor = world.getBlockState(below);
		Random random = world.random;
		if (random.nextFloat() < 0.5F) {
			BlockState scorched = TerrainEffects.scorchedVariant(floor, 1.0, random);
			if (scorched != null && !scorched.isAir() && !scorched.isOf(Blocks.WATER)) {
				world.setBlockState(below, scorched, Block.NOTIFY_ALL);
				floor = scorched;
			}
		}

		if (random.nextFloat() < cfg.ashChance && floor.isSideSolidFullSquare(world, below, Direction.UP)) {
			world.setBlockState(pos, ModBlocks.ASH_LAYER.getDefaultState(), Block.NOTIFY_ALL);
		}
	}

	/** Embers lofted from a fire drift downwind and can ignite flammable blocks a few blocks away. */
	public static void emberJump(ServerWorld world, BlockPos pos, Random random) {
		OrdnanceConfig.Fire cfg = config();
		if (!cfg.enhancedFire || !cfg.emberJumps || world.isRaining() || random.nextFloat() > cfg.emberJumpChance) {
			return;
		}

		if (!world.getBlockState(pos).isOf(Blocks.FIRE) || !world.canFireSpread(pos)) {
			return;
		}

		double windAngle = Wind.angle(world);
		int range = cfg.emberJumpRange;
		for (int attempt = 0; attempt < 6; attempt++) {
			double distance = 2.0 + random.nextDouble() * Math.max(0, range - 2);
			double angle = windAngle + random.nextGaussian() * 0.6;
			BlockPos target = pos.add(MathHelper.floor(Math.cos(angle) * distance + 0.5), random.nextInt(5) - 2, MathHelper.floor(Math.sin(angle) * distance + 0.5));
			if (!world.isChunkLoaded(target) || !FireHelper.isFlammable(world.getBlockState(target))) {
				continue;
			}

			for (Direction direction : Direction.values()) {
				BlockPos firePos = target.offset(direction);
				if (world.isAir(firePos) && !world.hasRain(firePos)) {
					BlockState fire = AbstractFireBlock.getState(world, firePos);
					if (fire.canPlaceAt(world, firePos)) {
						world.setBlockState(firePos, fire, Block.NOTIFY_ALL);
						return;
					}
				}
			}
		}
	}

	public static int adjustTickDelay(int delay) {
		OrdnanceConfig.Fire cfg = config();
		if (!cfg.enhancedFire || cfg.spreadSpeedMultiplier == 1.0F) {
			return delay;
		}

		return Math.max(2, Math.round(delay / cfg.spreadSpeedMultiplier));
	}
}
