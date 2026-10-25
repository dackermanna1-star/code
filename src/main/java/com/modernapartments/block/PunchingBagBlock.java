package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/** Hanging heavy bag: punching it makes a satisfying thud. */
public class PunchingBagBlock extends DecorBlock {
	public static final MapCodec<PunchingBagBlock> CODEC = simpleCodec(PunchingBagBlock::new);

	public PunchingBagBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected void attack(BlockState state, Level level, BlockPos pos, Player player) {
		level.playSound(null, pos, SoundEvents.PLAYER_ATTACK_KNOCKBACK, SoundSource.BLOCKS, 0.8F, 0.6F);
	}
}
