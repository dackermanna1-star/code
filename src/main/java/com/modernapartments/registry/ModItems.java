package com.modernapartments.registry;

import com.modernapartments.ModernApartments;
import com.modernapartments.build.ComplexType;
import com.modernapartments.item.BlueprintItem;
import com.modernapartments.item.DemolitionPermitItem;
import com.modernapartments.item.KeyItem;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.component.Consumables;
import net.minecraft.world.item.consume_effects.ApplyStatusEffectsConsumeEffect;

public final class ModItems {
	public static final List<Item> TOOLS = new ArrayList<>();
	public static final Map<ComplexType, Item> BLUEPRINTS = new EnumMap<>(ComplexType.class);

	public static Item APARTMENT_KEY;
	public static Item ACCESS_KEYCARD;
	public static Item MASTER_KEYCARD;
	public static Item COFFEE_CUP;
	public static Item TAKEOUT_BOX;
	public static Item DEMOLITION_PERMIT;

	private ModItems() {
	}

	private static <T extends Item> T register(String id, Function<Item.Properties, T> factory, Item.Properties props) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, ModernApartments.id(id));
		T item = factory.apply(props.setId(key));
		Registry.register(BuiltInRegistries.ITEM, key, item);
		TOOLS.add(item);
		return item;
	}

	public static void init() {
		ModBlocks.registerBlockItems();
		APARTMENT_KEY = register("apartment_key", p -> new KeyItem(p, false), new Item.Properties().stacksTo(1));
		ACCESS_KEYCARD = register("access_keycard", p -> new KeyItem(p, false), new Item.Properties().stacksTo(1));
		MASTER_KEYCARD = register("master_keycard", p -> new KeyItem(p, true), new Item.Properties().stacksTo(1).rarity(Rarity.EPIC));
		COFFEE_CUP = register("coffee_cup", Item::new, new Item.Properties().stacksTo(16).food(
			new FoodProperties.Builder().nutrition(1).saturationModifier(0.2F).alwaysEdible().build(),
			Consumables.defaultDrink().onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(MobEffects.SPEED, 20 * 60, 0))).build()));
		TAKEOUT_BOX = register("takeout_box", Item::new, new Item.Properties().stacksTo(16).food(
			new FoodProperties.Builder().nutrition(8).saturationModifier(0.7F).build()));
		for (ComplexType type : ComplexType.values()) {
			BLUEPRINTS.put(type, register("blueprint_" + type.id(), p -> new BlueprintItem(p, type),
				new Item.Properties().stacksTo(1).rarity(Rarity.RARE)));
		}
		DEMOLITION_PERMIT = register("demolition_permit", DemolitionPermitItem::new, new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON));
	}
}
