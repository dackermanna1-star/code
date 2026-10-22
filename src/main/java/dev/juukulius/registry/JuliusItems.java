package dev.juukulius.registry;

import dev.juukulius.JuliusMod;
import dev.juukulius.item.JuukuliusSwordItem;
import java.util.List;
import java.util.function.Function;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.ChatFormatting;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.ToolMaterial;
import net.minecraft.world.item.component.ItemLore;

public final class JuliusItems {
	/** A knight's blade forged to carry spirit light: netherite-grade edge, generous durability, highly enchantable. */
	public static final ToolMaterial JUUKULIUS_STEEL = new ToolMaterial(
		BlockTags.INCORRECT_FOR_NETHERITE_TOOL, 2400, 9.0F, 4.0F, 18, ItemTags.DIAMOND_TOOL_MATERIALS
	);

	public static final Item HOUSE_JUUKULIUS_SWORD = register("house_juukulius_sword", JuukuliusSwordItem::new,
		new Item.Properties()
			.sword(JUUKULIUS_STEEL, 3.0F, -2.2F)
			.rarity(Rarity.EPIC)
			.fireResistant()
			.component(DataComponents.LORE, new ItemLore(List.of(
				Component.translatable("item.julius_juukulius.house_juukulius_sword.lore_1").withStyle(ChatFormatting.GRAY),
				Component.translatable("item.julius_juukulius.house_juukulius_sword.lore_2").withStyle(ChatFormatting.LIGHT_PURPLE)
			)))
	);

	private JuliusItems() {
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, JuliusMod.id(name));
		Item item = factory.apply(properties.setId(key));
		return Registry.register(BuiltInRegistries.ITEM, key, item);
	}

	public static void init() {
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.COMBAT).register(entries -> entries.addAfter(Items.NETHERITE_SWORD, HOUSE_JUUKULIUS_SWORD));
	}
}
