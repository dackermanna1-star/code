package com.modernapartments.item;

import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.item.component.TooltipDisplay;

/**
 * Apartment key / access keycard. A blank key pairs with the first door or reader it is used on
 * (sneak + use); the master keycard opens every lock in the building.
 */
public class KeyItem extends Item {
	private static final String LOCK_ID = "LockId";
	private static final String LABEL = "LockLabel";
	private final boolean master;

	public KeyItem(Properties properties, boolean master) {
		super(properties);
		this.master = master;
	}

	public boolean isMaster() {
		return master;
	}

	public static long lockId(ItemStack stack) {
		return stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag().getLongOr(LOCK_ID, 0L);
	}

	/** Returns the key's lock id, assigning a new random one to blank keys. */
	public static long getOrAssignLockId(ItemStack stack, RandomSource random, String label) {
		long id = lockId(stack);
		if (id == 0L) {
			long fresh;
			do {
				fresh = random.nextLong();
			} while (fresh == 0L);
			final long assigned = fresh;
			CustomData.update(DataComponents.CUSTOM_DATA, stack, tag -> {
				tag.putLong(LOCK_ID, assigned);
				tag.putString(LABEL, label);
			});
			id = assigned;
		}
		return id;
	}

	public static boolean opens(ItemStack stack, long lockId) {
		if (!(stack.getItem() instanceof KeyItem key)) {
			return false;
		}
		return key.master || (lockId != 0L && lockId(stack) == lockId);
	}

	@Override
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip,
			TooltipFlag flag) {
		if (master) {
			tooltip.accept(Component.translatable("tooltip.modernapartments.master_key").withStyle(ChatFormatting.GOLD));
			return;
		}
		CompoundTag tag = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
		if (tag.getLongOr(LOCK_ID, 0L) == 0L) {
			tooltip.accept(Component.translatable("tooltip.modernapartments.blank_key").withStyle(ChatFormatting.GRAY));
		} else {
			tooltip.accept(Component.translatable("tooltip.modernapartments.paired_key", tag.getStringOr(LABEL, "?"))
				.withStyle(ChatFormatting.AQUA));
		}
	}

	@Override
	public boolean isFoil(ItemStack stack) {
		return master || lockId(stack) != 0L;
	}
}
