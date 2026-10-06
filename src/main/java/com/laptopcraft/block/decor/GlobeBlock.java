package com.laptopcraft.block.decor;

import com.mojang.serialization.MapCodec;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Util;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.VoxelShape;

/** A desk globe (its map texture spins on its own). Click it: "You are here: Cherry Grove (x 120, z -56)". */
public class GlobeBlock extends FacingDecorBlock {
	public static final MapCodec<GlobeBlock> CODEC = simpleCodec(GlobeBlock::new);
	private static final VoxelShape SHAPE = Block.box(3, 0, 3, 13, 13.5, 13);

	public GlobeBlock(BlockBehaviour.Properties properties) {
		super(properties, SHAPE);
	}

	@Override
	protected MapCodec<? extends GlobeBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		level.playSound(null, pos, SoundEvents.ITEM_FRAME_ROTATE_ITEM, SoundSource.BLOCKS, 0.8F, 0.8F + level.getRandom().nextFloat() * 0.2F);
		if (!level.isClientSide()) {
			Component biome = level.getBiome(pos).unwrapKey()
					.<Component>map(key -> Component.translatable(Util.makeDescriptionId("biome", key.identifier())))
					.orElse(Component.translatable("block.laptopcraft.globe.unknown"));
			player.displayClientMessage(Component.translatable("block.laptopcraft.globe.here",
					biome.copy().withStyle(ChatFormatting.GREEN), pos.getX(), pos.getZ()).withStyle(ChatFormatting.AQUA), true);
		}
		return InteractionResult.SUCCESS;
	}
}
