package com.ordnance.explosion;

import com.ordnance.config.ConfigManager;
import com.ordnance.fire.CharredLogBlock;
import com.ordnance.registry.ModBlocks;
import com.ordnance.registry.ModTags;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.PillarBlock;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import org.jspecify.annotations.Nullable;

/** Scorch marks, charring and other heat damage to terrain. */
public final class TerrainEffects {
	private TerrainEffects() {
	}

	/**
	 * Scorches the ground around an explosion: vegetation burns away, soil turns to scorched earth, logs char,
	 * snow melts and fractured stone appears near the centre. Probability falls off with distance for ragged edges.
	 */
	public static void scorch(ServerWorld world, Vec3d center, float radius, Random random, @Nullable Entity owner, float intensity) {
		if (radius <= 0.0F) {
			return;
		}

		int r = MathHelper.ceil(radius);
		int cx = MathHelper.floor(center.x);
		int cy = MathHelper.floor(center.y);
		int cz = MathHelper.floor(center.z);
		int top = cy + MathHelper.ceil(radius * 0.5F) + 1;
		int bottom = cy - MathHelper.ceil(radius * 0.8F) - 1;
		BlockPos.Mutable mutable = new BlockPos.Mutable();
		for (int dx = -r; dx <= r; dx++) {
			for (int dz = -r; dz <= r; dz++) {
				double d = Math.sqrt(dx * dx + dz * dz) / radius;
				if (d > 1.0 || random.nextFloat() > (1.05 - d * d) * intensity) {
					continue;
				}

				for (int y = top; y >= bottom; y--) {
					mutable.set(cx + dx, y, cz + dz);
					BlockState state = world.getBlockState(mutable);
					if (state.isAir()) {
						continue;
					}

					if (state.isIn(ModTags.BURNS_AWAY) || state.isIn(BlockTags.LEAVES) || state.isOf(Blocks.SNOW)) {
						if (canModify(world, mutable, owner)) {
							world.setBlockState(mutable, Blocks.AIR.getDefaultState(), Block.NOTIFY_ALL);
						}

						continue;
					}

					if (!state.getFluidState().isEmpty()) {
						break;
					}

					BlockPos above = mutable.up();
					if (!world.getBlockState(above).isAir() && !world.getBlockState(above).isReplaceable()) {
						break;
					}

					scorchBlock(world, mutable.toImmutable(), state, d, random, owner);
					break;
				}
			}
		}
	}

	private static void scorchBlock(ServerWorld world, BlockPos pos, BlockState state, double distance, Random random, @Nullable Entity owner) {
		if (!canModify(world, pos, owner)) {
			return;
		}

		BlockState result = scorchedVariant(state, distance, random);
		if (result != null && result != state) {
			world.setBlockState(pos, result, Block.NOTIFY_ALL);
			state = result;
		}

		float ashChance = ConfigManager.get().fire.ashChance;
		BlockPos above = pos.up();
		if (distance < 0.85 && random.nextFloat() < ashChance && world.getBlockState(above).isAir()
			&& state.isSideSolidFullSquare(world, pos, Direction.UP)) {
			world.setBlockState(above, ModBlocks.ASH_LAYER.getDefaultState(), Block.NOTIFY_ALL);
		}
	}

	/** The heat-damaged version of a block, or null to leave it alone. */
	@Nullable
	public static BlockState scorchedVariant(BlockState state, double distance, Random random) {
		if (state.isIn(ModTags.SCORCHABLE)) {
			return ModBlocks.SCORCHED_EARTH.getDefaultState();
		} else if (state.isIn(BlockTags.LOGS_THAT_BURN) && state.contains(PillarBlock.AXIS)) {
			return CharredLogBlock.charredFrom(state);
		} else if (state.isOf(Blocks.ICE)) {
			return Blocks.WATER.getDefaultState();
		} else if (state.isOf(Blocks.SNOW_BLOCK) || state.isOf(Blocks.POWDER_SNOW)) {
			return Blocks.AIR.getDefaultState();
		} else if (distance < 0.35 && random.nextFloat() < 0.45F) {
			if (state.isOf(Blocks.STONE)) {
				return Blocks.COBBLESTONE.getDefaultState();
			} else if (state.isOf(Blocks.DEEPSLATE)) {
				return Blocks.COBBLED_DEEPSLATE.getDefaultState();
			} else if (state.isOf(Blocks.SAND) && distance < 0.15) {
				return Blocks.GLASS.getDefaultState();
			}
		}

		return null;
	}

	public static boolean canModify(ServerWorld world, BlockPos pos, @Nullable Entity owner) {
		return !ConfigManager.get().explosions.respectBlockProtection || !(owner instanceof PlayerEntity player) || player.canModifyAt(world, pos);
	}
}
