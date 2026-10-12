package com.extremesports.registry;

import com.extremesports.ExtremeSports;
import com.extremesports.item.EquipmentItem;
import com.extremesports.item.ParkBuilderItem;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.EquipmentKind;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.block.Block;

public final class ModItems {
	private static final Map<EquipmentKind, EquipmentItem> EQUIPMENT = new EnumMap<>(EquipmentKind.class);
	public static final List<Item> BLOCK_ITEMS = new ArrayList<>();

	public static final EquipmentItem SKATEBOARD = equipment(EquipmentKind.STREET_BOARD);
	public static final EquipmentItem CRUISER = equipment(EquipmentKind.CRUISER);
	public static final EquipmentItem LONGBOARD = equipment(EquipmentKind.LONGBOARD);
	public static final EquipmentItem BMX_BIKE = equipment(EquipmentKind.BMX);
	public static final EquipmentItem KICK_SCOOTER = equipment(EquipmentKind.SCOOTER);
	public static final EquipmentItem INLINE_SKATES = equipment(EquipmentKind.SKATES);
	public static final ParkBuilderItem PARK_BUILDER = register("park_builder", ParkBuilderItem::new,
		new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).component(ModDataComponents.BUILDER_MODE, 0));

	private static EquipmentItem equipment(EquipmentKind kind) {
		EquipmentItem item = register(kind.itemId(), p -> new EquipmentItem(kind, p),
			new Item.Properties().stacksTo(1).component(ModDataComponents.EQUIPMENT_CONFIG, EquipmentConfig.EMPTY));
		EQUIPMENT.put(kind, item);
		return item;
	}

	private static <T extends Item> T register(String name, Function<Item.Properties, T> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, ExtremeSports.id(name));
		T item = factory.apply(properties.setId(key));
		return Registry.register(BuiltInRegistries.ITEM, key, item);
	}

	public static EquipmentItem forKind(EquipmentKind kind) {
		return EQUIPMENT.get(kind);
	}

	private static void registerBlockItems() {
		for (Block block : ModBlocks.ALL) {
			ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, BuiltInRegistries.BLOCK.getKey(block));
			BlockItem item = new BlockItem(block, new Item.Properties().setId(key).useBlockDescriptionPrefix());
			item.registerBlocks(Item.BY_BLOCK, item);
			Registry.register(BuiltInRegistries.ITEM, key, item);
			BLOCK_ITEMS.add(item);
		}
	}

	private ModItems() {
	}

	public static void init() {
		registerBlockItems();
	}
}
