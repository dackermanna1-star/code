package com.modernapartments.block;

import com.modernapartments.block.entity.FixtureBlockEntity;
import com.modernapartments.registry.ModBlockEntities;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTicker;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.phys.BlockHitResult;
import org.jspecify.annotations.Nullable;

/** Tall switchable furniture (arcade cabinet, patio heater, outdoor shower); both halves switch together. */
public class TallToggleBlock extends TallFurnitureBlock implements EntityBlock {
	public static final MapCodec<TallToggleBlock> CODEC = simpleCodec(p -> new TallToggleBlock(p, ToggleSettings.screen(0)));

	private final ToggleSettings settings;

	public TallToggleBlock(Properties properties, ToggleSettings settings) {
		super(properties);
		this.settings = settings;
		this.registerDefaultState(this.defaultBlockState().setValue(ModProperties.ON, false));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(ModProperties.ON);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide()) {
			boolean on = !state.getValue(ModProperties.ON);
			BlockPos lower = lowerPos(state, pos);
			for (BlockPos p : new BlockPos[] {lower, lower.above()}) {
				BlockState s = level.getBlockState(p);
				if (s.is(this)) {
					level.setBlock(p, s.setValue(ModProperties.ON, on), Block.UPDATE_ALL);
				}
			}
			level.playSound(null, pos, settings.toggleSound(), SoundSource.BLOCKS, 0.5F, on ? 1.2F : 0.9F);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return settings.hasEffects() && state.getValue(HALF) == DoubleBlockHalf.UPPER ? new FixtureBlockEntity(pos, state) : null;
	}

	@Override
	public <T extends BlockEntity> @Nullable BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
		if (!level.isClientSide() || !settings.hasEffects() || type != ModBlockEntities.FIXTURE) {
			return null;
		}
		return (l, p, s, be) -> FixtureBlockEntity.clientTick(l, p, s, settings.effect());
	}
}
