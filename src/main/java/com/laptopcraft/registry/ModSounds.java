package com.laptopcraft.registry;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;

/**
 * Custom sounds. The ids map to entries in {@code assets/laptopcraft/sounds.json}
 * (generated .ogg files live under {@code assets/laptopcraft/sounds/}).
 */
public final class ModSounds {
	public static final SoundEvent LAPTOP_BOOT = register("laptop.boot");
	public static final SoundEvent LAPTOP_SHUTDOWN = register("laptop.shutdown");
	public static final SoundEvent LAPTOP_CLICK = register("laptop.click");
	public static final SoundEvent LAPTOP_NOTIFY = register("laptop.notify");
	public static final SoundEvent LAPTOP_ERROR = register("laptop.error");
	public static final SoundEvent LAPTOP_LID = register("laptop.lid");
	public static final SoundEvent SHOP_PURCHASE = register("shop.purchase");
	public static final SoundEvent DELIVERY_ARRIVE = register("delivery.arrive");
	public static final SoundEvent DELIVERY_UNBOX = register("delivery.unbox");
	public static final SoundEvent TOY_SQUEAK = register("toy.squeak");
	public static final SoundEvent TOY_POP = register("toy.pop");

	private ModSounds() {
	}

	private static SoundEvent register(String name) {
		Identifier id = Reg.id(name);
		return Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
	}

	public static void init() {
		// Class loading registers the fields above.
	}
}
