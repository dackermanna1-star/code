package com.modernapartments.registry;

import com.modernapartments.ModernApartments;
import com.modernapartments.build.ComplexType;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;

public final class ModItemGroups {
	private ModItemGroups() {
	}

	private static void tab(String id, ItemStack icon, CreativeModeTab.DisplayItemsGenerator items) {
		Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, ModernApartments.id(id), FabricItemGroup.builder()
			.title(Component.translatable("itemGroup.modernapartments." + id))
			.icon(() -> icon)
			.displayItems(items)
			.build());
	}

	private static void blocksOf(ModBlocks.Tab tab, CreativeModeTab.Output output) {
		for (Block block : ModBlocks.ALL) {
			if (ModBlocks.TABS.get(block) == tab) {
				output.accept(block);
			}
		}
	}

	public static void init() {
		tab("blueprints", new ItemStack(ModItems.BLUEPRINTS.get(ComplexType.SKYLINE)), (params, output) -> {
			ModItems.TOOLS.forEach(output::accept);
		});
		tab("materials", new ItemStack(ModBlocks.get("brick_red")), (p, o) -> blocksOf(ModBlocks.Tab.MATERIALS, o));
		tab("furniture", new ItemStack(ModBlocks.SOFAS.get(ModBlocks.SofaColor.NAVY)), (p, o) -> blocksOf(ModBlocks.Tab.FURNITURE, o));
		tab("kitchen_bath", new ItemStack(ModBlocks.REFRIGERATOR), (p, o) -> blocksOf(ModBlocks.Tab.KITCHEN_BATH, o));
		tab("amenities", new ItemStack(ModBlocks.TREADMILL), (p, o) -> blocksOf(ModBlocks.Tab.AMENITIES, o));
		tab("systems", new ItemStack(ModBlocks.ELEVATOR_PANEL), (p, o) -> blocksOf(ModBlocks.Tab.SYSTEMS, o));
	}
}
