package com.ordnance.weapon;

import com.mojang.serialization.Codec;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.item.Item;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.registry.entry.RegistryEntry;

/**
 * Immutable list of loaded rounds (ammo items). Stored as a plain list so item model definitions can select on it,
 * e.g. {@code "when": []} for an empty launcher.
 */
public record MagazineComponent(List<RegistryEntry<Item>> rounds) {
	public static final MagazineComponent EMPTY = new MagazineComponent(List.of());
	public static final Codec<MagazineComponent> CODEC = Item.ENTRY_CODEC.listOf().xmap(MagazineComponent::new, MagazineComponent::rounds);
	public static final PacketCodec<RegistryByteBuf, MagazineComponent> PACKET_CODEC = Item.ENTRY_PACKET_CODEC
		.collect(PacketCodecs.toList())
		.xmap(MagazineComponent::new, MagazineComponent::rounds);

	public MagazineComponent {
		rounds = List.copyOf(rounds);
	}

	public int size() {
		return this.rounds.size();
	}

	public boolean isEmpty() {
		return this.rounds.isEmpty();
	}

	public RegistryEntry<Item> next() {
		return this.rounds.getFirst();
	}

	public MagazineComponent withLoaded(RegistryEntry<Item> round) {
		List<RegistryEntry<Item>> list = new ArrayList<>(this.rounds);
		list.add(round);
		return new MagazineComponent(list);
	}

	public MagazineComponent withoutNext() {
		return this.rounds.size() <= 1 ? EMPTY : new MagazineComponent(this.rounds.subList(1, this.rounds.size()));
	}
}
