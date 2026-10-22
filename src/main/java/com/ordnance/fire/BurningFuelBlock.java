package com.ordnance.fire;

import com.mojang.serialization.MapCodec;
import com.ordnance.config.ConfigManager;
import com.ordnance.explosion.TerrainEffects;
import com.ordnance.registry.ModBlocks;
import net.minecraft.block.AbstractFireBlock;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.state.StateManager;
import net.minecraft.state.property.IntProperty;
import net.minecraft.state.property.Properties;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;
import net.minecraft.world.WorldView;
import net.minecraft.world.tick.ScheduledTickView;

/**
 * A puddle of burning fuel (napalm). Unlike vanilla fire it burns on any solid floor, including stone, for a fixed
 * time, igniting flammable neighbours and burning entities that walk through it. Burns out into ash and scorch.
 */
public class BurningFuelBlock extends AbstractFireBlock {
	public static final MapCodec<BurningFuelBlock> CODEC = createCodec(BurningFuelBlock::new);
	public static final IntProperty AGE = Properties.AGE_7;

	public BurningFuelBlock(Settings settings) {
		super(settings, 2.0F);
		this.setDefaultState(this.getStateManager().getDefaultState().with(AGE, 0));
	}

	@Override
	protected MapCodec<? extends AbstractFireBlock> getCodec() {
		return CODEC;
	}

	@Override
	protected void appendProperties(StateManager.Builder<Block, BlockState> builder) {
		builder.add(AGE);
	}

	@Override
	protected boolean isFlammable(BlockState state) {
		return FireHelper.isFlammable(state);
	}

	public static boolean canBurnAt(WorldView world, BlockPos pos) {
		BlockPos below = pos.down();
		return world.getBlockState(below).isSideSolidFullSquare(world, below, Direction.UP);
	}

	@Override
	protected boolean canPlaceAt(BlockState state, WorldView world, BlockPos pos) {
		return canBurnAt(world, pos);
	}

	@Override
	protected BlockState getStateForNeighborUpdate(
		BlockState state,
		WorldView world,
		ScheduledTickView tickView,
		BlockPos pos,
		Direction direction,
		BlockPos neighborPos,
		BlockState neighborState,
		Random random
	) {
		return this.canPlaceAt(state, world, pos) ? state : Blocks.AIR.getDefaultState();
	}

	@Override
	protected void onBlockAdded(BlockState state, World world, BlockPos pos, BlockState oldState, boolean notify) {
		super.onBlockAdded(state, world, pos, oldState, notify);
		world.scheduleBlockTick(pos, this, tickInterval(world.getRandom()));
	}

	private static int tickInterval(Random random) {
		int lifetime = ConfigManager.get().fire.burningFuelTicks;
		return Math.max(4, lifetime / 8) + random.nextInt(6);
	}

	@Override
	protected void scheduledTick(BlockState state, ServerWorld world, BlockPos pos, Random random) {
		if (!state.canPlaceAt(world, pos)) {
			world.removeBlock(pos, false);
			return;
		}

		if (world.hasRain(pos) && random.nextFloat() < 0.35F) {
			world.removeBlock(pos, false);
			return;
		}

		int age = state.get(AGE);
		if (age >= 7) {
			this.burnOut(world, pos, random);
			return;
		}

		world.setBlockState(pos, state.with(AGE, age + 1), Block.NOTIFY_LISTENERS);
		if (world.canFireSpread(pos)) {
			this.spreadToNeighbours(world, pos, random);
		}

		world.scheduleBlockTick(pos, this, tickInterval(random));
	}

	private void spreadToNeighbours(ServerWorld world, BlockPos pos, Random random) {
		for (Direction direction : Direction.values()) {
			BlockPos neighbour = pos.offset(direction);
			BlockState neighbourState = world.getBlockState(neighbour);
			if (!FireHelper.isFlammable(neighbourState) || random.nextInt(3) != 0) {
				continue;
			}

			for (Direction side : Direction.values()) {
				BlockPos firePos = neighbour.offset(side);
				if (world.isAir(firePos)) {
					BlockState fire = AbstractFireBlock.getState(world, firePos);
					if (fire.canPlaceAt(world, firePos)) {
						world.setBlockState(firePos, fire, Block.NOTIFY_ALL);
						break;
					}
				}
			}
		}
	}

	private void burnOut(ServerWorld world, BlockPos pos, Random random) {
		BlockPos below = pos.down();
		BlockState floor = world.getBlockState(below);
		BlockState scorched = TerrainEffects.scorchedVariant(floor, 1.0, random);
		if (scorched != null && ConfigManager.get().fire.charredRemains) {
			world.setBlockState(below, scorched, Block.NOTIFY_ALL);
		}

		if (ConfigManager.get().fire.charredRemains && random.nextFloat() < ConfigManager.get().fire.ashChance) {
			world.setBlockState(pos, ModBlocks.ASH_LAYER.getDefaultState(), Block.NOTIFY_ALL);
		} else {
			world.removeBlock(pos, false);
		}
	}
}
