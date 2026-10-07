package com.laptopcraft.block.decor;

import com.laptopcraft.content.DecorContent;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.NonNullList;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.Container;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.entity.ContainerUser;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.DispenserMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.ContainerOpenersCounter;
import net.minecraft.world.level.block.entity.RandomizableContainerBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * 9-slot snack storage. Opening it swings the door open (blockstate {@code open=true}, lit interior model) — exactly
 * like a barrel, but colder.
 */
public class MiniFridgeBlockEntity extends RandomizableContainerBlockEntity {
	public static final int SIZE = 9;
	private static final Component DEFAULT_NAME = Component.translatable("container.laptopcraft.mini_fridge");
	private NonNullList<ItemStack> items = NonNullList.withSize(SIZE, ItemStack.EMPTY);
	private final ContainerOpenersCounter openersCounter = new ContainerOpenersCounter() {
		@Override
		protected void onOpen(Level level, BlockPos pos, BlockState state) {
			playSound(state, SoundEvents.IRON_TRAPDOOR_OPEN, 1.3F);
			setOpen(state, true);
		}

		@Override
		protected void onClose(Level level, BlockPos pos, BlockState state) {
			playSound(state, SoundEvents.IRON_TRAPDOOR_CLOSE, 1.2F);
			setOpen(state, false);
		}

		@Override
		protected void openerCountChanged(Level level, BlockPos pos, BlockState state, int count, int openCount) {
		}

		@Override
		public boolean isOwnContainer(Player player) {
			return player.containerMenu instanceof FridgeMenu menu && menu.fridge() == MiniFridgeBlockEntity.this;
		}
	};

	public MiniFridgeBlockEntity(BlockPos pos, BlockState state) {
		super(DecorContent.MINI_FRIDGE_BLOCK_ENTITY, pos, state);
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		if (!this.trySaveLootTable(output)) {
			ContainerHelper.saveAllItems(output, this.items);
		}
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		this.items = NonNullList.withSize(this.getContainerSize(), ItemStack.EMPTY);
		if (!this.tryLoadLootTable(input)) {
			ContainerHelper.loadAllItems(input, this.items);
		}
	}

	@Override
	public int getContainerSize() {
		return SIZE;
	}

	@Override
	protected NonNullList<ItemStack> getItems() {
		return this.items;
	}

	@Override
	protected void setItems(NonNullList<ItemStack> items) {
		this.items = items;
	}

	@Override
	protected Component getDefaultName() {
		return DEFAULT_NAME;
	}

	@Override
	protected AbstractContainerMenu createMenu(int containerId, Inventory inventory) {
		return new FridgeMenu(containerId, inventory, this);
	}

	@Override
	public void startOpen(ContainerUser user) {
		if (!this.remove && !user.getLivingEntity().isSpectator() && this.level != null) {
			this.openersCounter.incrementOpeners(user.getLivingEntity(), this.level, this.getBlockPos(), this.getBlockState(), user.getContainerInteractionRange());
		}
	}

	@Override
	public void stopOpen(ContainerUser user) {
		if (!this.remove && !user.getLivingEntity().isSpectator() && this.level != null) {
			this.openersCounter.decrementOpeners(user.getLivingEntity(), this.level, this.getBlockPos(), this.getBlockState());
		}
	}

	@Override
	public List<ContainerUser> getEntitiesWithContainerOpen() {
		return this.level == null ? List.of() : this.openersCounter.getEntitiesWithContainerOpen(this.level, this.getBlockPos());
	}

	/** Called from the block's scheduled tick (the openers counter schedules them while the fridge is open). */
	public void recheckOpen() {
		if (!this.remove && this.level != null) {
			this.openersCounter.recheckOpeners(this.level, this.getBlockPos(), this.getBlockState());
		}
	}

	private void setOpen(BlockState state, boolean open) {
		if (this.level != null && state.hasProperty(MiniFridgeBlock.OPEN)) {
			this.level.setBlock(this.getBlockPos(), state.setValue(MiniFridgeBlock.OPEN, open), 3);
		}
	}

	private void playSound(BlockState state, SoundEvent sound, float pitch) {
		if (this.level != null) {
			this.level.playSound(null, this.worldPosition, sound, SoundSource.BLOCKS, 0.5F, pitch + this.level.getRandom().nextFloat() * 0.1F);
		}
	}

	/** A dispenser-style 3x3 menu that remembers which fridge it belongs to. */
	public static class FridgeMenu extends DispenserMenu {
		private final Container fridge;

		public FridgeMenu(int containerId, Inventory playerInventory, Container fridge) {
			super(containerId, playerInventory, fridge);
			this.fridge = fridge;
		}

		public Container fridge() {
			return fridge;
		}
	}
}
