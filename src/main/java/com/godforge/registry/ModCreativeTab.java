package com.godforge.registry;

import com.godforge.Godforge;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

public final class ModCreativeTab {
	public static final CreativeModeTab TAB = Registry.register(
		BuiltInRegistries.CREATIVE_MODE_TAB,
		Godforge.id("arsenal"),
		FabricItemGroup.builder()
			.title(Component.translatable("itemGroup.godforge.arsenal"))
			.icon(() -> new ItemStack(ModItems.WORLDCUTTER))
			.displayItems((parameters, output) -> {
				for (Item weapon : ModItems.WEAPONS) {
					output.accept(weapon);
				}
				output.accept(ModItems.DIVINE_CORE);
			})
			.build()
	);

	private ModCreativeTab() {
	}

	public static void init() {
	}
}
