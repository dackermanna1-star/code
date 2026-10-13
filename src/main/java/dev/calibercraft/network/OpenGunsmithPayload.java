package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server → client: open the customization screen ({@code bench} = full access at a gunsmith bench). */
public record OpenGunsmithPayload(boolean bench) implements CustomPacketPayload {
	public static final Type<OpenGunsmithPayload> TYPE = new Type<>(CaliberCraft.id("open_gunsmith"));
	public static final StreamCodec<ByteBuf, OpenGunsmithPayload> CODEC = ByteBufCodecs.BOOL.map(OpenGunsmithPayload::new, OpenGunsmithPayload::bench);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
