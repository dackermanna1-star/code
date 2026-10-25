package com.modernapartments.block;

import com.modernapartments.block.entity.LockBlockEntity;
import com.modernapartments.item.KeyItem;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.phys.BlockHitResult;
import org.jspecify.annotations.Nullable;

/**
 * Access-control reader for entrances and amenity doors within 3 blocks. Inactive (green, doors
 * unlocked) until a keycard is paired with sneak-use; afterwards tapping the card releases the doors.
 */
public class KeycardReaderBlock extends FurnitureBlock implements EntityBlock {
	public static final MapCodec<KeycardReaderBlock> CODEC = simpleCodec(KeycardReaderBlock::new);
	private static final int RADIUS = 3;

	public KeycardReaderBlock(Properties properties) {
		super(properties, true);
		this.registerDefaultState(this.defaultBlockState().setValue(ModProperties.ON, true));
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
	protected String shapeKey(BlockState state) {
		return state.getValue(ModProperties.ON) ? "on" : "off";
	}

	@Override
	protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
			InteractionHand hand, BlockHitResult hit) {
		if (!(stack.getItem() instanceof KeyItem) || !(level.getBlockEntity(pos) instanceof LockBlockEntity reader)) {
			return InteractionResult.TRY_WITH_EMPTY_HAND;
		}
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		String label = reader.label().isEmpty() ? Component.translatable("message.modernapartments.secure_entry").getString() : reader.label();
		if (player.isSecondaryUseActive()) {
			if (!reader.isLocked()) {
				long id = KeyItem.getOrAssignLockId(stack, level.random, label);
				reader.setLockId(id);
				int doors = DoorAccess.forEachDoor(level, pos, RADIUS, (door, s, p) -> {
					if (level.getBlockEntity(p) instanceof LockBlockEntity lock) {
						lock.setLockId(id);
						if (lock.label().isEmpty()) {
							lock.setLabel(label);
						}
					}
				});
				level.setBlock(pos, state.setValue(ModProperties.ON, false), Block.UPDATE_ALL);
				beep(level, pos, 0.8F);
				player.displayClientMessage(Component.translatable("message.modernapartments.reader_paired", doors), true);
			} else if (KeyItem.opens(stack, reader.lockId())) {
				long id = reader.lockId();
				reader.setLockId(0L);
				DoorAccess.forEachDoor(level, pos, RADIUS, (door, s, p) -> {
					if (level.getBlockEntity(p) instanceof LockBlockEntity lock && lock.lockId() == id) {
						lock.setLockId(0L);
					}
				});
				level.setBlock(pos, state.setValue(ModProperties.ON, true), Block.UPDATE_ALL);
				beep(level, pos, 1.6F);
				player.displayClientMessage(Component.translatable("message.modernapartments.reader_cleared"), true);
			} else {
				level.playSound(null, pos, SoundEvents.CHEST_LOCKED, SoundSource.BLOCKS, 0.6F, 1.4F);
			}
			return InteractionResult.SUCCESS;
		}
		if (!reader.isLocked() || KeyItem.opens(stack, reader.lockId())) {
			DoorAccess.release(level, pos, RADIUS, 100);
			if (reader.isLocked()) {
				level.setBlock(pos, state.setValue(ModProperties.ON, true), Block.UPDATE_ALL);
				level.scheduleTick(pos, this, 100);
			}
			beep(level, pos, 1.8F);
			player.displayClientMessage(Component.translatable("message.modernapartments.access_granted"), true);
		} else {
			level.playSound(null, pos, SoundEvents.CHEST_LOCKED, SoundSource.BLOCKS, 0.6F, 1.4F);
			player.displayClientMessage(Component.translatable("message.modernapartments.access_denied"), true);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide() && level.getBlockEntity(pos) instanceof LockBlockEntity reader) {
			player.displayClientMessage(Component.translatable(reader.isLocked() ? "message.modernapartments.reader_needs_card"
				: "message.modernapartments.reader_inactive"), true);
			level.playSound(null, pos, SoundEvents.STONE_BUTTON_CLICK_ON, SoundSource.BLOCKS, 0.3F, 2.0F);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		if (level.getBlockEntity(pos) instanceof LockBlockEntity reader && reader.isLocked() && state.getValue(ModProperties.ON)) {
			level.setBlock(pos, state.setValue(ModProperties.ON, false), Block.UPDATE_ALL);
		}
	}

	private static void beep(Level level, BlockPos pos, float pitch) {
		level.playSound(null, pos, SoundEvents.NOTE_BLOCK_PLING.value(), SoundSource.BLOCKS, 0.5F, pitch);
	}

	@Override
	public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return new LockBlockEntity(pos, state);
	}
}
