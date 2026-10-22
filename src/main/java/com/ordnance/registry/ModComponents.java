package com.ordnance.registry;

import com.ordnance.Ordnance;
import com.ordnance.weapon.FireMode;
import com.ordnance.weapon.MagazineComponent;
import java.util.function.UnaryOperator;
import net.minecraft.component.ComponentType;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.util.dynamic.Codecs;

/**
 * Item data components. All of them change during normal use, so they skip the re-equip hand animation and are
 * always present on the stack (default values come from the item settings).
 */
public final class ModComponents {
	/** Rounds currently loaded, fired first-in first-out. */
	public static final ComponentType<MagazineComponent> MAGAZINE = register(
		"magazine", builder -> builder.codec(MagazineComponent.CODEC).packetCodec(MagazineComponent.PACKET_CODEC).cache().skipsHandAnimation()
	);
	/** Flamethrower fuel units. */
	public static final ComponentType<Integer> FUEL = register(
		"fuel", builder -> builder.codec(Codecs.NON_NEGATIVE_INT).packetCodec(PacketCodecs.VAR_INT).skipsHandAnimation()
	);
	/** Detonation mode for launcher rounds. */
	public static final ComponentType<FireMode> FIRE_MODE = register(
		"fire_mode", builder -> builder.codec(FireMode.CODEC).packetCodec(FireMode.PACKET_CODEC).skipsHandAnimation()
	);

	private ModComponents() {
	}

	private static <T> ComponentType<T> register(String name, UnaryOperator<ComponentType.Builder<T>> builder) {
		return Registry.register(Registries.DATA_COMPONENT_TYPE, Ordnance.id(name), builder.apply(ComponentType.builder()).build());
	}

	public static void init() {
	}
}
