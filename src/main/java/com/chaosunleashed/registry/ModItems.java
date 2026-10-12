package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.item.KaijuHeartItem;
import com.chaosunleashed.item.PlasmaPistolItem;
import com.chaosunleashed.item.RiftShardItem;
import com.chaosunleashed.item.StabilizerCoreItem;
import net.minecraft.component.type.AttributeModifierSlot;
import net.minecraft.component.type.AttributeModifiersComponent;
import net.minecraft.entity.attribute.EntityAttributeModifier;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.item.Item;
import net.minecraft.item.SpawnEggItem;
import net.minecraft.item.equipment.EquipmentType;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.util.Rarity;

import java.util.function.Function;

public final class ModItems {
	public static final Item ALIEN_ALLOY = register("alien_alloy", Item::new, new Item.Settings().rarity(Rarity.UNCOMMON));
	public static final Item PLASMA_PISTOL = register("plasma_pistol", PlasmaPistolItem::new,
		new Item.Settings().maxDamage(300).rarity(Rarity.RARE).repairable(ModTags.ALIEN_ALLOY_REPAIR));
	/** Technical item: the sprite of the plasma bolt projectile. */
	public static final Item PLASMA_BOLT = register("plasma_bolt", Item::new, new Item.Settings());
	public static final Item ANTI_GRAVITY_BOOTS = register("anti_gravity_boots", Item::new,
		new Item.Settings().armor(ModArmorMaterials.ALIEN_ALLOY, EquipmentType.BOOTS).rarity(Rarity.RARE)
			.attributeModifiers(antiGravityModifiers()));

	public static final Item KAIJU_SCALE = register("kaiju_scale", Item::new, new Item.Settings().rarity(Rarity.RARE).fireproof());
	public static final Item KAIJU_HEART = register("kaiju_heart", KaijuHeartItem::new, new Item.Settings().maxCount(16).rarity(Rarity.EPIC).fireproof());
	public static final Item KAIJU_SCALE_HELMET = register("kaiju_scale_helmet", Item::new,
		new Item.Settings().armor(ModArmorMaterials.KAIJU_SCALE, EquipmentType.HELMET).rarity(Rarity.EPIC).fireproof());
	public static final Item KAIJU_SCALE_CHESTPLATE = register("kaiju_scale_chestplate", Item::new,
		new Item.Settings().armor(ModArmorMaterials.KAIJU_SCALE, EquipmentType.CHESTPLATE).rarity(Rarity.EPIC).fireproof());
	public static final Item KAIJU_SCALE_LEGGINGS = register("kaiju_scale_leggings", Item::new,
		new Item.Settings().armor(ModArmorMaterials.KAIJU_SCALE, EquipmentType.LEGGINGS).rarity(Rarity.EPIC).fireproof());
	public static final Item KAIJU_SCALE_BOOTS = register("kaiju_scale_boots", Item::new,
		new Item.Settings().armor(ModArmorMaterials.KAIJU_SCALE, EquipmentType.BOOTS).rarity(Rarity.EPIC).fireproof());

	public static final Item STABILIZER_CORE = register("stabilizer_core", StabilizerCoreItem::new, new Item.Settings().maxCount(16).rarity(Rarity.UNCOMMON));
	public static final Item RIFT_SHARD = register("rift_shard", RiftShardItem::new, new Item.Settings().rarity(Rarity.RARE));

	public static final Item ALIEN_SOLDIER_SPAWN_EGG = register("alien_soldier_spawn_egg", SpawnEggItem::new,
		new Item.Settings().spawnEgg(ModEntities.ALIEN_SOLDIER));
	public static final Item SHADE_STALKER_SPAWN_EGG = register("shade_stalker_spawn_egg", SpawnEggItem::new,
		new Item.Settings().spawnEgg(ModEntities.SHADE_STALKER));
	public static final Item BISON_SPAWN_EGG = register("bison_spawn_egg", SpawnEggItem::new,
		new Item.Settings().spawnEgg(ModEntities.BISON));

	private ModItems() {
	}

	/** Armor + lighter gravity (slow falls, higher jumps) and softer landings. */
	private static AttributeModifiersComponent antiGravityModifiers() {
		return AttributeModifiersComponent.builder()
			.add(EntityAttributes.ARMOR, modifier("anti_gravity_boots.armor", 3.0, EntityAttributeModifier.Operation.ADD_VALUE), AttributeModifierSlot.FEET)
			.add(EntityAttributes.ARMOR_TOUGHNESS, modifier("anti_gravity_boots.toughness", 1.0, EntityAttributeModifier.Operation.ADD_VALUE), AttributeModifierSlot.FEET)
			.add(EntityAttributes.GRAVITY, modifier("anti_gravity_boots.gravity", -0.45, EntityAttributeModifier.Operation.ADD_MULTIPLIED_TOTAL), AttributeModifierSlot.FEET)
			.add(EntityAttributes.JUMP_STRENGTH, modifier("anti_gravity_boots.jump", 0.1, EntityAttributeModifier.Operation.ADD_VALUE), AttributeModifierSlot.FEET)
			.add(EntityAttributes.SAFE_FALL_DISTANCE, modifier("anti_gravity_boots.safe_fall", 6.0, EntityAttributeModifier.Operation.ADD_VALUE), AttributeModifierSlot.FEET)
			.add(EntityAttributes.FALL_DAMAGE_MULTIPLIER, modifier("anti_gravity_boots.fall_damage", -0.5, EntityAttributeModifier.Operation.ADD_MULTIPLIED_TOTAL), AttributeModifierSlot.FEET)
			.build();
	}

	private static EntityAttributeModifier modifier(String name, double value, EntityAttributeModifier.Operation operation) {
		return new EntityAttributeModifier(ChaosUnleashed.id(name), value, operation);
	}

	static Item register(String name, Function<Item.Settings, Item> factory, Item.Settings settings) {
		RegistryKey<Item> key = RegistryKey.of(RegistryKeys.ITEM, ChaosUnleashed.id(name));
		return Registry.register(Registries.ITEM, key, factory.apply(settings.registryKey(key)));
	}

	/** Technical items (e.g. projectile models) that should not show up in the creative tab. */
	public static boolean isHidden(Item item) {
		return item == PLASMA_BOLT;
	}

	public static void init() {
	}
}
