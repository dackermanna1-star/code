package com.laptopcraft.item.clothing;

import com.laptopcraft.registry.Reg;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.equipment.EquipmentAsset;
import net.minecraft.world.item.equipment.EquipmentAssets;
import net.minecraft.world.item.equipment.Equippable;
import org.jspecify.annotations.Nullable;

/**
 * Builds item properties for cosmetic wearables.
 *
 * <p>Two flavours exist:
 * <ul>
 *   <li><b>Hats &amp; accessories</b> are equippable in the head slot <i>without</i> an equipment asset, so the
 *   vanilla {@code CustomHeadLayer} draws their 3D item model with the {@code "head"} display transform
 *   (exactly like a carved pumpkin).</li>
 *   <li><b>Garments</b> reference an equipment asset ({@code assets/laptopcraft/equipment/<id>.json}) whose
 *   64x32 textures are painted onto the wearer like armor layers.</li>
 * </ul>
 * Wearables give no armor, have no durability and stack to 1.
 */
public final class Wearables {
	private Wearables() {
	}

	/** Equipment asset key {@code laptopcraft:<name>}. */
	public static ResourceKey<EquipmentAsset> assetKey(String name) {
		return ResourceKey.create(EquipmentAssets.ROOT_ID, Reg.id(name));
	}

	/** Properties for a head accessory rendered with its own 3D item model. */
	public static Item.Properties hat(Holder<SoundEvent> equipSound, Rarity rarity, @Nullable Identifier cameraOverlay) {
		Equippable.Builder equippable = Equippable.builder(EquipmentSlot.HEAD)
				.setEquipSound(equipSound)
				.setDamageOnHurt(false);
		if (cameraOverlay != null) {
			equippable.setCameraOverlay(cameraOverlay);
		}
		return base(rarity).component(DataComponents.EQUIPPABLE, equippable.build());
	}

	/** Properties for a garment drawn from the equipment asset with the same id. */
	public static Item.Properties garment(String id, EquipmentSlot slot, Holder<SoundEvent> equipSound, Rarity rarity) {
		Equippable equippable = Equippable.builder(slot)
				.setEquipSound(equipSound)
				.setAsset(assetKey(id))
				.setDamageOnHurt(false)
				.build();
		return base(rarity).component(DataComponents.EQUIPPABLE, equippable);
	}

	private static Item.Properties base(Rarity rarity) {
		Item.Properties properties = new Item.Properties().stacksTo(1);
		if (rarity != Rarity.COMMON) {
			properties.rarity(rarity);
		}
		return properties;
	}
}
