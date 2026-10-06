package com.laptopcraft.registry;

import com.laptopcraft.content.PaintingContent;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

/** The "LaptopCraft" creative tab: every item registered through {@link Reg}, then the mod's paintings. */
public final class ModCreativeTab {
	public static final ResourceKey<CreativeModeTab> KEY = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Reg.id("main"));

	private ModCreativeTab() {
	}

	public static void init() {
		Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, KEY, FabricItemGroup.builder()
				.title(Component.translatable("itemGroup.laptopcraft"))
				.icon(() -> new ItemStack(ModBlocks.LAPTOP))
				.displayItems((parameters, output) -> {
					for (Item item : Reg.creativeItems()) {
						output.accept(item);
					}
					PaintingContent.fillCreativeTab(parameters, output);
				})
				.build());
	}
}
