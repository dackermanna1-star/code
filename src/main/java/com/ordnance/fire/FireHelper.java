package com.ordnance.fire;

import com.ordnance.explosion.TerrainEffects;
import com.ordnance.registry.ModBlocks;
import net.fabricmc.fabric.api.registry.FlammableBlockRegistry;
import net.minecraft.block.AbstractFireBlock;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.TntBlock;
import net.minecraft.entity.Entity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.state.property.Properties;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.world.attribute.EnvironmentAttributes;
import org.jspecify.annotations.Nullable;

/** Shared rules for starting fires from weapons. */
public final class FireHelper {
	private FireHelper() {
	}

	public static boolean isFlammable(BlockState state) {
		FlammableBlockRegistry.Entry entry = FlammableBlockRegistry.getDefaultInstance().get(state.getBlock());
		return entry != null && entry.getBurnChance() > 0;
	}

	/**
	 * Starts a fire in the air block at {@code pos}. Incendiary fire (burning fuel) sticks to any solid floor;
	 * ordinary fire needs a flammable neighbour or a solid floor, like flint and steel.
	 */
	public static boolean tryIgnite(ServerWorld world, BlockPos pos, boolean incendiary, @Nullable Entity owner) {
		if (!world.isInBuildLimit(pos) || !TerrainEffects.canModify(world, pos, owner)) {
			return false;
		}

		BlockState current = world.getBlockState(pos);
		if (!current.isAir() && !current.isOf(Blocks.SHORT_GRASS) && !current.isOf(Blocks.FERN) && !current.isOf(Blocks.SNOW)) {
			return false;
		}

		if (world.hasRain(pos)) {
			return false;
		}

		if (incendiary && BurningFuelBlock.canBurnAt(world, pos)) {
			world.setBlockState(pos, ModBlocks.BURNING_FUEL.getDefaultState(), Block.NOTIFY_ALL);
			return true;
		}

		BlockState fire = AbstractFireBlock.getState(world, pos);
		if (fire.canPlaceAt(world, pos)) {
			world.setBlockState(pos, fire, Block.NOTIFY_ALL);
			return true;
		}

		return false;
	}

	/** Heat effects on the block a flame or burning glob touched (TNT, candles, campfires, snow, ice). */
	public static void heatBlock(ServerWorld world, BlockPos pos, @Nullable Entity owner) {
		BlockState state = world.getBlockState(pos);
		if (!TerrainEffects.canModify(world, pos, owner)) {
			return;
		}

		if (state.getBlock() instanceof TntBlock) {
			TntBlock.primeTnt(world, pos);
			world.removeBlock(pos, false);
		} else if (state.contains(Properties.LIT) && !state.get(Properties.LIT)
			&& !(state.contains(Properties.WATERLOGGED) && state.get(Properties.WATERLOGGED))) {
			world.setBlockState(pos, state.with(Properties.LIT, true), Block.NOTIFY_ALL);
		} else if (state.isOf(Blocks.SNOW)) {
			world.removeBlock(pos, false);
		} else if (state.isOf(Blocks.ICE) && !world.getEnvironmentAttributes().getAttributeValue(EnvironmentAttributes.WATER_EVAPORATES_GAMEPLAY, pos)) {
			world.setBlockState(pos, Blocks.WATER.getDefaultState(), Block.NOTIFY_ALL);
		}
	}

	/** Spot next to {@code pos} on the given face, if it can hold a fire. */
	public static BlockPos firePosFor(BlockPos hit, Direction side) {
		return hit.offset(side);
	}
}
