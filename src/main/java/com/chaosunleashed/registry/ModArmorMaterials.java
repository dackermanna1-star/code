package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import net.minecraft.item.equipment.ArmorMaterial;
import net.minecraft.item.equipment.EquipmentAsset;
import net.minecraft.item.equipment.EquipmentAssetKeys;
import net.minecraft.item.equipment.EquipmentType;
import net.minecraft.registry.RegistryKey;
import net.minecraft.sound.SoundEvents;

import java.util.Map;

/** Armor materials. Equipment model JSONs live in assets/chaosunleashed/equipment/. */
public final class ModArmorMaterials {
	public static final RegistryKey<EquipmentAsset> ALIEN_ALLOY_ASSET = RegistryKey.of(EquipmentAssetKeys.REGISTRY_KEY, ChaosUnleashed.id("alien_alloy"));
	public static final RegistryKey<EquipmentAsset> KAIJU_SCALE_ASSET = RegistryKey.of(EquipmentAssetKeys.REGISTRY_KEY, ChaosUnleashed.id("kaiju_scale"));

	public static final ArmorMaterial ALIEN_ALLOY = new ArmorMaterial(25,
		Map.of(EquipmentType.BOOTS, 3, EquipmentType.LEGGINGS, 6, EquipmentType.CHESTPLATE, 7, EquipmentType.HELMET, 3, EquipmentType.BODY, 6),
		15, SoundEvents.ITEM_ARMOR_EQUIP_NETHERITE, 1.0F, 0.0F, ModTags.ALIEN_ALLOY_REPAIR, ALIEN_ALLOY_ASSET);

	/** Kaiju Scale: tougher than diamond, a bit below netherite, with knockback resistance. */
	public static final ArmorMaterial KAIJU_SCALE = new ArmorMaterial(35,
		Map.of(EquipmentType.BOOTS, 3, EquipmentType.LEGGINGS, 6, EquipmentType.CHESTPLATE, 8, EquipmentType.HELMET, 3, EquipmentType.BODY, 11),
		18, SoundEvents.ITEM_ARMOR_EQUIP_TURTLE, 3.0F, 0.15F, ModTags.KAIJU_SCALE_REPAIR, KAIJU_SCALE_ASSET);

	private ModArmorMaterials() {
	}
}
