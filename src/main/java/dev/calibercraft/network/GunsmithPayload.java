package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.data.AttachmentSlot;
import io.netty.buffer.ByteBuf;
import java.util.Optional;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/** Client → server: customization request for the weapon in the main hand. */
public record GunsmithPayload(Op op, AttachmentSlot slot, Optional<Identifier> target) implements CustomPacketPayload {
	public static final Type<GunsmithPayload> TYPE = new Type<>(CaliberCraft.id("gunsmith"));
	public static final StreamCodec<ByteBuf, GunsmithPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT.map(i -> Op.values()[Math.floorMod(i, Op.values().length)], Op::ordinal), GunsmithPayload::op,
		ByteBufCodecs.VAR_INT.map(i -> AttachmentSlot.values()[Math.floorMod(i, AttachmentSlot.values().length)], AttachmentSlot::ordinal),
		GunsmithPayload::slot,
		ByteBufCodecs.optional(Identifier.STREAM_CODEC), GunsmithPayload::target,
		GunsmithPayload::new);

	public enum Op {
		INSTALL, REMOVE, SKIN, RESET, CLOSE
	}

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
