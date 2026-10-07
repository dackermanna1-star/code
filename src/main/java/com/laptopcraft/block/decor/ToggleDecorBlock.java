package com.laptopcraft.block.decor;

import com.mojang.serialization.MapCodec;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * Furniture with an on/off switch (desk lamp, retro TV). Light emission is configured by the block properties
 * ({@code lightLevel(state -> state.getValue(LIT) ? n : 0)}). Optionally announces a random message
 * ({@code <messagePrefix>.<n>}) in the action bar when switched on — the TV uses it for its programme guide.
 */
public class ToggleDecorBlock extends FacingDecorBlock {
	public static final MapCodec<ToggleDecorBlock> CODEC = simpleCodec(p -> new ToggleDecorBlock(p, Shapes.block(), SoundEvents.LEVER_CLICK,
			SoundEvents.LEVER_CLICK, null, 0));
	public static final BooleanProperty LIT = BlockStateProperties.LIT;

	private final SoundEvent onSound;
	private final SoundEvent offSound;
	private final @Nullable String messagePrefix;
	private final int messages;

	public ToggleDecorBlock(BlockBehaviour.Properties properties, VoxelShape northShape, SoundEvent onSound, SoundEvent offSound,
			@Nullable String messagePrefix, int messages) {
		super(properties, northShape);
		this.onSound = onSound;
		this.offSound = offSound;
		this.messagePrefix = messagePrefix;
		this.messages = messages;
		this.registerDefaultState(this.defaultBlockState().setValue(LIT, false));
	}

	@Override
	protected MapCodec<? extends ToggleDecorBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(LIT);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		boolean lit = !state.getValue(LIT);
		level.setBlock(pos, state.setValue(LIT, lit), Block.UPDATE_ALL);
		level.playSound(null, pos, lit ? onSound : offSound, SoundSource.BLOCKS, 0.7F, lit ? 1.1F : 0.9F);
		if (lit && messagePrefix != null) {
			int n = level.getRandom().nextInt(messages);
			player.displayClientMessage(Component.translatable(messagePrefix + "." + n).withStyle(ChatFormatting.YELLOW), true);
		}
		return InteractionResult.SUCCESS;
	}
}
