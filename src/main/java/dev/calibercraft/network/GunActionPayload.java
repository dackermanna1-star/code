package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Client → server: non-firing weapon actions. */
public record GunActionPayload(Action action, int slot) implements CustomPacketPayload {
	public static final Type<GunActionPayload> TYPE = new Type<>(CaliberCraft.id("gun_action"));
	public static final StreamCodec<ByteBuf, GunActionPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT.map(i -> Action.values()[Math.floorMod(i, Action.values().length)], Action::ordinal), GunActionPayload::action,
		ByteBufCodecs.VAR_INT, GunActionPayload::slot,
		GunActionPayload::new);

	public enum Action {
		RELOAD, CANCEL_RELOAD, CYCLE, FIRE_MODE, AMMO_TYPE, UNLOAD, MELEE, AIM_START, AIM_STOP, INSPECT
	}

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
