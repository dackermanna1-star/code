package com.modernapartments.build;

import com.modernapartments.ModernApartments;
import com.modernapartments.block.entity.ElevatorBlockEntity;
import com.modernapartments.block.entity.LockBlockEntity;
import java.util.List;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.Container;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.RandomizableContainer;
import net.minecraft.world.level.block.entity.SignBlockEntity;
import net.minecraft.world.level.block.entity.SignText;
import net.minecraft.world.level.storage.loot.LootTable;

/** Factory methods for the block-entity initializers used by the building generators. */
public final class Inits {
	private Inits() {
	}

	/** Waxed sign with up to four lines on the front (and optionally the back). */
	public static BlockEntityInit sign(DyeColor color, boolean glowing, boolean bothSides, String... lines) {
		return (be, random) -> {
			if (be instanceof SignBlockEntity sign) {
				SignText text = new SignText();
				for (int i = 0; i < Math.min(4, lines.length); i++) {
					text = text.setMessage(i, Component.literal(lines[i]));
				}
				text = text.setColor(color).setHasGlowingText(glowing);
				sign.setText(text, true);
				if (bothSides) {
					sign.setText(text, false);
				}
				sign.setWaxed(true);
			}
		};
	}

	public static BlockEntityInit loot(String table) {
		ResourceKey<LootTable> key = ResourceKey.create(Registries.LOOT_TABLE, ModernApartments.id("furniture/" + table));
		return (be, random) -> {
			if (be instanceof RandomizableContainer container) {
				container.setLootTable(key, random.nextLong());
			}
		};
	}

	public static BlockEntityInit items(List<ItemStack> stacks) {
		return (be, random) -> {
			if (be instanceof Container container) {
				for (int i = 0; i < Math.min(stacks.size(), container.getContainerSize()); i++) {
					container.setItem(i, stacks.get(i).copy());
				}
			}
		};
	}

	public static BlockEntityInit doorLabel(String label) {
		return (be, random) -> {
			if (be instanceof LockBlockEntity lock) {
				lock.setLabel(label);
			}
		};
	}

	public static BlockEntityInit elevatorFloor(String label) {
		return (be, random) -> {
			if (be instanceof ElevatorBlockEntity elevator) {
				elevator.setLabel(label);
			}
		};
	}
}
