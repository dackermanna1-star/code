package dev.calibercraft.item;

import com.mojang.serialization.Codec;
import dev.calibercraft.data.AttachmentSlot;
import io.netty.buffer.ByteBuf;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.resources.Identifier;

/** Installed attachments per slot (data component). Immutable. */
public record AttachmentLoadout(Map<AttachmentSlot, Identifier> slots) {
	public static final AttachmentLoadout EMPTY = new AttachmentLoadout(Map.of());

	public static final Codec<AttachmentLoadout> CODEC = Codec.unboundedMap(AttachmentSlot.CODEC, Identifier.CODEC)
		.xmap(AttachmentLoadout::new, AttachmentLoadout::slots);

	private static final StreamCodec<ByteBuf, AttachmentSlot> SLOT_STREAM = ByteBufCodecs.VAR_INT.map(
		i -> AttachmentSlot.values()[Math.floorMod(i, AttachmentSlot.values().length)], Enum::ordinal);

	public static final StreamCodec<ByteBuf, AttachmentLoadout> STREAM_CODEC = ByteBufCodecs
		.<ByteBuf, AttachmentSlot, Identifier, Map<AttachmentSlot, Identifier>>map(i -> new EnumMap<>(AttachmentSlot.class), SLOT_STREAM,
			Identifier.STREAM_CODEC, AttachmentSlot.values().length)
		.map(AttachmentLoadout::new, AttachmentLoadout::slots);

	public AttachmentLoadout {
		EnumMap<AttachmentSlot, Identifier> copy = new EnumMap<>(AttachmentSlot.class);
		copy.putAll(slots);
		slots = Collections.unmodifiableMap(copy);
	}

	public Optional<Identifier> get(AttachmentSlot slot) {
		return Optional.ofNullable(slots.get(slot));
	}

	public AttachmentLoadout with(AttachmentSlot slot, Identifier attachment) {
		EnumMap<AttachmentSlot, Identifier> m = new EnumMap<>(AttachmentSlot.class);
		m.putAll(slots);
		m.put(slot, attachment);
		return new AttachmentLoadout(m);
	}

	public AttachmentLoadout without(AttachmentSlot slot) {
		EnumMap<AttachmentSlot, Identifier> m = new EnumMap<>(AttachmentSlot.class);
		m.putAll(slots);
		m.remove(slot);
		return new AttachmentLoadout(m);
	}
}
