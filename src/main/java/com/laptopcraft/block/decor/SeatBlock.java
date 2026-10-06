package com.laptopcraft.block.decor;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Furniture you can sit on (right-click with an empty-ish hand; sneak to get up). Soft seats also cushion falls.
 */
public class SeatBlock extends FacingDecorBlock {
	public static final MapCodec<SeatBlock> CODEC = simpleCodec(p -> new SeatBlock(p, Shapes.block(), 0.5, 1.0F));

	private final double seatHeight;
	private final float fallDamageMultiplier;

	/**
	 * @param seatHeight           where the sitter's hips go, in blocks above the block's bottom
	 * @param fallDamageMultiplier 1 = normal fall damage, 0.1 = bean bag
	 */
	public SeatBlock(BlockBehaviour.Properties properties, VoxelShape northShape, double seatHeight, float fallDamageMultiplier) {
		super(properties, northShape);
		this.seatHeight = seatHeight;
		this.fallDamageMultiplier = fallDamageMultiplier;
	}

	@Override
	protected MapCodec<? extends SeatBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		if (player.isShiftKeyDown() || player.isPassenger()) {
			return InteractionResult.PASS;
		}
		if (!level.isClientSide()) {
			if (SeatEntity.sit(level, pos, player, seatHeight)) {
				level.playSound(null, pos, SoundEvents.WOOL_PLACE, SoundSource.BLOCKS, 0.6F, 0.8F);
			}
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public void fallOn(Level level, BlockState state, BlockPos pos, Entity entity, double fallDistance) {
		if (fallDamageMultiplier < 1.0F) {
			if (fallDistance > 1.5) {
				level.playSound(null, pos, SoundEvents.WOOL_FALL, SoundSource.BLOCKS, 1.0F, 0.6F);
			}
			entity.causeFallDamage(fallDistance, fallDamageMultiplier, level.damageSources().fall());
		} else {
			super.fallOn(level, state, pos, entity, fallDistance);
		}
	}
}
