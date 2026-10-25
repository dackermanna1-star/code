package com.godforge.registry;

import com.godforge.Godforge;
import com.godforge.weapon.items.AsteroidGunItem;
import com.godforge.weapon.items.BlackHoleItem;
import com.godforge.weapon.items.GodfistItem;
import com.godforge.weapon.items.LaserBeamItem;
import com.godforge.weapon.items.OrbEraserItem;
import com.godforge.weapon.items.PlanetCrackerItem;
import com.godforge.weapon.items.RealityBreakerItem;
import com.godforge.weapon.items.StarfallBowItem;
import com.godforge.weapon.items.SunforgeItem;
import com.godforge.weapon.items.WorldcutterItem;
import java.util.List;
import java.util.function.Function;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.component.ItemAttributeModifiers;

public final class ModItems {
	public static final Item WORLDCUTTER = register("worldcutter", WorldcutterItem::new, weapon().attributes(melee(31.0, -2.7)));
	public static final Item LASER_BEAM = register("laser_beam", LaserBeamItem::new, weapon());
	public static final Item ORB_ERASER = register("orb_eraser", OrbEraserItem::new, weapon());
	public static final Item ASTEROID_GUN = register("asteroid_gun", AsteroidGunItem::new, weapon());
	public static final Item BLACK_HOLE = register("black_hole", BlackHoleItem::new, weapon());
	public static final Item REALITY_BREAKER = register("reality_breaker", RealityBreakerItem::new, weapon().attributes(melee(18.0, -3.0)));
	public static final Item STARFALL_BOW = register("starfall_bow", StarfallBowItem::new, weapon());
	public static final Item GODFIST = register("godfist", GodfistItem::new, weapon().attributes(melee(23.0, -2.0)));
	public static final Item SUNFORGE = register("sunforge", SunforgeItem::new, weapon());
	public static final Item PLANET_CRACKER = register("planet_cracker", PlanetCrackerItem::new, weapon());

	/** Crafting heart of every god weapon. */
	public static final Item DIVINE_CORE = register(
		"divine_core", Item::new, new Item.Properties().stacksTo(16).rarity(Rarity.EPIC).fireResistant().component(DataComponents.ENCHANTMENT_GLINT_OVERRIDE, true)
	);

	public static final List<Item> WEAPONS = List.of(
		WORLDCUTTER, LASER_BEAM, ORB_ERASER, ASTEROID_GUN, BLACK_HOLE, REALITY_BREAKER, STARFALL_BOW, GODFIST, SUNFORGE, PLANET_CRACKER
	);

	private ModItems() {
	}

	private static Item.Properties weapon() {
		return new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant();
	}

	private static ItemAttributeModifiers melee(double damage, double speed) {
		return ItemAttributeModifiers.builder()
			.add(Attributes.ATTACK_DAMAGE, new AttributeModifier(Item.BASE_ATTACK_DAMAGE_ID, damage, AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND)
			.add(Attributes.ATTACK_SPEED, new AttributeModifier(Item.BASE_ATTACK_SPEED_ID, speed, AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND)
			.build();
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, Godforge.id(name));
		return Registry.register(BuiltInRegistries.ITEM, key, factory.apply(properties.setId(key)));
	}

	public static void init() {
	}
}
