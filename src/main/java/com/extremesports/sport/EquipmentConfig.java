package com.extremesports.sport;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * Customization stored on equipment items (as a data component) and on placed equipment entities.
 * Missing entries fall back to the catalog defaults, so old items stay valid when new parts are added.
 */
public record EquipmentConfig(Map<String, String> parts, Map<String, Integer> colors) {
	public static final EquipmentConfig EMPTY = new EquipmentConfig(Map.of(), Map.of());

	public static final Codec<EquipmentConfig> CODEC = RecordCodecBuilder.create(instance -> instance.group(
		Codec.unboundedMap(Codec.STRING, Codec.STRING).optionalFieldOf("parts", Map.of()).forGetter(EquipmentConfig::parts),
		Codec.unboundedMap(Codec.STRING, Codec.INT).optionalFieldOf("colors", Map.of()).forGetter(EquipmentConfig::colors)
	).apply(instance, EquipmentConfig::new));

	public static final StreamCodec<ByteBuf, EquipmentConfig> STREAM_CODEC = StreamCodec.composite(
		ByteBufCodecs.map(HashMap::new, ByteBufCodecs.stringUtf8(64), ByteBufCodecs.stringUtf8(64), 32), config -> new HashMap<>(config.parts()),
		ByteBufCodecs.map(HashMap::new, ByteBufCodecs.stringUtf8(64), ByteBufCodecs.INT, 32), config -> new HashMap<>(config.colors()),
		EquipmentConfig::new
	);

	public EquipmentConfig {
		parts = Map.copyOf(parts);
		colors = Map.copyOf(colors);
	}

	public String part(SportType sport, String slot) {
		PartCatalog.Slot catalogSlot = PartCatalog.slot(sport, slot);
		String value = parts.get(slot);
		if (catalogSlot == null) {
			return value == null ? "none" : value;
		}
		return catalogSlot.option(value == null ? "" : value).id();
	}

	public int color(EquipmentKind kind, String slot) {
		Integer value = colors.get(slot);
		return value != null ? value & 0xFFFFFF : PartCatalog.defaultColor(kind, slot);
	}

	public EquipmentConfig withPart(String slot, String option) {
		Map<String, String> copy = new HashMap<>(parts);
		copy.put(slot, option);
		return new EquipmentConfig(copy, colors);
	}

	public EquipmentConfig withColor(String slot, int color) {
		Map<String, Integer> copy = new HashMap<>(colors);
		copy.put(slot, color & 0xFFFFFF);
		return new EquipmentConfig(parts, copy);
	}

	public CompoundTag toTag() {
		return (CompoundTag) CODEC.encodeStart(NbtOps.INSTANCE, this).result().orElseGet(CompoundTag::new);
	}

	public static EquipmentConfig fromTag(CompoundTag tag) {
		return CODEC.parse(NbtOps.INSTANCE, tag).result().orElse(EMPTY);
	}

	/** Removes unknown slots and options so a malicious client can't store arbitrary data. */
	public EquipmentConfig sanitized(EquipmentKind kind) {
		Map<String, String> cleanParts = new HashMap<>();
		PartCatalog.slots(kind.sport()).forEach((slotId, slot) -> {
			String value = parts.get(slotId);
			if (value != null) {
				cleanParts.put(slotId, slot.option(value).id());
			}
		});
		Map<String, Integer> cleanColors = new HashMap<>();
		for (PartCatalog.ColorSlot colorSlot : PartCatalog.colorSlots(kind)) {
			Integer value = colors.get(colorSlot.id());
			if (value != null) {
				cleanColors.put(colorSlot.id(), value & 0xFFFFFF);
			}
		}
		return new EquipmentConfig(cleanParts, cleanColors);
	}
}
