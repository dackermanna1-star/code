package com.modernapartments.block;

import com.modernapartments.block.entity.LockBlockEntity;
import com.modernapartments.item.KeyItem;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
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
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.phys.BlockHitResult;
import org.jspecify.annotations.Nullable;

/**
 * Apartment/amenity door with an optional smart lock. Doors are always unlocked when a building is
 * generated; sneak-use a blank key to pair and lock it, sneak-use the paired key again to unlock.
 */
public class ApartmentDoorBlock extends DoorBlock implements EntityBlock {
	public static final MapCodec<ApartmentDoorBlock> CODEC = RecordCodecBuilder.mapCodec(instance -> instance
		.group(BlockSetType.CODEC.fieldOf("block_set_type").forGetter(DoorBlock::type), propertiesCodec())
		.apply(instance, ApartmentDoorBlock::new));

	public ApartmentDoorBlock(BlockSetType type, Properties properties) {
		super(type, properties);
	}

	@Override
	public MapCodec<? extends DoorBlock> codec() {
		return CODEC;
	}

	public static BlockPos lowerPos(BlockState state, BlockPos pos) {
		return state.getValue(HALF) == DoubleBlockHalf.UPPER ? pos.below() : pos;
	}

	public static @Nullable LockBlockEntity lock(Level level, BlockState state, BlockPos pos) {
		return level.getBlockEntity(lowerPos(state, pos)) instanceof LockBlockEntity lock ? lock : null;
	}

	@Override
	protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
			InteractionHand hand, BlockHitResult hit) {
		if (!(stack.getItem() instanceof KeyItem)) {
			return InteractionResult.TRY_WITH_EMPTY_HAND;
		}
		LockBlockEntity lock = lock(level, state, pos);
		if (lock == null) {
			return InteractionResult.TRY_WITH_EMPTY_HAND;
		}
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		String unit = lock.label().isEmpty() ? Component.translatable("message.modernapartments.this_door").getString() : lock.label();
		if (player.isSecondaryUseActive()) {
			if (!lock.isLocked()) {
				long id = KeyItem.getOrAssignLockId(stack, level.random, unit);
				lock.setLockId(id);
				if (isOpen(state)) {
					setOpen(player, level, state, pos, false);
				}
				level.playSound(null, pos, SoundEvents.IRON_TRAPDOOR_CLOSE, SoundSource.BLOCKS, 0.6F, 1.6F);
				player.displayClientMessage(Component.translatable("message.modernapartments.door_locked", unit), true);
			} else if (KeyItem.opens(stack, lock.lockId())) {
				lock.setLockId(0L);
				level.playSound(null, pos, SoundEvents.IRON_TRAPDOOR_OPEN, SoundSource.BLOCKS, 0.6F, 1.8F);
				player.displayClientMessage(Component.translatable("message.modernapartments.door_unlocked", unit), true);
			} else {
				denied(level, pos, player, unit);
			}
			return InteractionResult.SUCCESS;
		}
		if (lock.isLocked() && !KeyItem.opens(stack, lock.lockId())) {
			denied(level, pos, player, unit);
			return InteractionResult.SUCCESS;
		}
		setOpen(player, level, state, pos, !isOpen(state));
		return InteractionResult.SUCCESS;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		LockBlockEntity lock = lock(level, state, pos);
		if (lock != null && lock.blocks(level)) {
			if (!level.isClientSide()) {
				denied(level, pos, player, lock.label().isEmpty() ? Component.translatable("message.modernapartments.this_door").getString() : lock.label());
			}
			return InteractionResult.SUCCESS;
		}
		return super.useWithoutItem(state, level, pos, player, hit);
	}

	private static void denied(Level level, BlockPos pos, Player player, String unit) {
		level.playSound(null, pos, SoundEvents.CHEST_LOCKED, SoundSource.BLOCKS, 0.7F, 1.0F);
		player.displayClientMessage(Component.translatable("message.modernapartments.door_is_locked", unit), true);
	}

	/** Opens the door for a few seconds even if locked (buzz-in); a locked door closes itself afterwards. */
	public void release(Level level, BlockState state, BlockPos pos, int ticks) {
		LockBlockEntity lock = lock(level, state, pos);
		if (lock != null) {
			lock.release(level, ticks);
		}
		if (!isOpen(state)) {
			setOpen(null, level, state, pos, true);
		}
		level.scheduleTick(lowerPos(state, pos), this, ticks);
	}

	@Override
	protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		LockBlockEntity lock = lock(level, state, pos);
		if (lock != null && lock.isLocked() && !lock.isReleased(level) && isOpen(state)) {
			setOpen(null, level, state, pos, false);
		}
	}

	@Override
	public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return state.getValue(HALF) == DoubleBlockHalf.LOWER ? new LockBlockEntity(pos, state) : null;
	}
}
