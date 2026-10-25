package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.phys.BlockHitResult;

/** Directional lamp (floor/table lamps, sconces, string lights): right-click toggles the light. */
public class LampBlock extends FurnitureBlock implements LightFixture {
	public static final MapCodec<LampBlock> CODEC = simpleCodec(p -> new LampBlock(p, false));

	public LampBlock(Properties properties, boolean wallMounted) {
		super(properties, wallMounted);
		this.registerDefaultState(this.defaultBlockState().setValue(BlockStateProperties.LIT, true));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(BlockStateProperties.LIT);
	}

	@Override
	protected String shapeKey(BlockState state) {
		return state.getValue(BlockStateProperties.LIT) ? "on" : "off";
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		return toggleLight(state, level, pos);
	}

	static InteractionResult toggleLight(BlockState state, Level level, BlockPos pos) {
		if (!level.isClientSide()) {
			boolean lit = !state.getValue(BlockStateProperties.LIT);
			level.setBlock(pos, state.setValue(BlockStateProperties.LIT, lit), Block.UPDATE_ALL);
			level.playSound(null, pos, lit ? SoundEvents.STONE_BUTTON_CLICK_ON : SoundEvents.STONE_BUTTON_CLICK_OFF,
				SoundSource.BLOCKS, 0.4F, lit ? 1.2F : 1.0F);
		}
		return InteractionResult.SUCCESS;
	}
}
