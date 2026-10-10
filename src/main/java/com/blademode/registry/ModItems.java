package com.blademode.registry;

import com.blademode.BladeMode;
import com.blademode.item.HighFrequencyBladeItem;
import java.util.List;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.ToolMaterial;
import net.minecraft.world.item.component.ItemLore;

public final class ModItems {
	public static final ResourceKey<Item> HF_BLADE_KEY = ResourceKey.create(Registries.ITEM, BladeMode.id("hf_blade"));

	public static final Item HF_BLADE = Items.registerItem(HF_BLADE_KEY, HighFrequencyBladeItem::new, new Item.Properties()
		.sword(ToolMaterial.NETHERITE, 4.0F, -2.2F)
		.fireResistant()
		.rarity(Rarity.EPIC)
		.component(DataComponents.LORE, new ItemLore(List.of(hint("item.blademode.hf_blade.tooltip.1"), hint("item.blademode.hf_blade.tooltip.2")))));

	private ModItems() {
	}

	private static Component hint(String key) {
		return Component.translatable(key).withStyle(Style.EMPTY.withColor(ChatFormatting.GRAY).withItalic(false));
	}

	public static void init() {
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.COMBAT).register(entries -> entries.accept(HF_BLADE));
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.TOOLS_AND_UTILITIES).register(entries -> entries.accept(HF_BLADE));
	}
}
