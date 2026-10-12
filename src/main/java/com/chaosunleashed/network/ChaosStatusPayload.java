package com.chaosunleashed.network;

import com.chaosunleashed.ChaosUnleashed;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;

import java.util.ArrayList;
import java.util.List;

/**
 * Server -> client: full Chaos status (toggles, master switch, cooldown, running events). Sent to every player
 * whenever anything changes and once per second while events run. Drives the Control Panel GUI and all
 * client-side sky/fog/screen effects.
 */
public record ChaosStatusPayload(boolean randomEnabled, int enabledMask, int cooldownTicks, boolean canEdit,
								 List<EventInfo> events) implements CustomPayload {
	public static final Id<ChaosStatusPayload> ID = new Id<>(ChaosUnleashed.id("status"));
	public static final PacketCodec<PacketByteBuf, ChaosStatusPayload> CODEC = CustomPayload.codecOf(ChaosStatusPayload::write, ChaosStatusPayload::read);

	public record EventInfo(int type, int phase, int phaseTicks, int phaseLength, int remaining, int intensity,
							Identifier dimension, BlockPos pos, float value, boolean waiting) {
		void write(PacketByteBuf buf) {
			buf.writeVarInt(this.type);
			buf.writeVarInt(this.phase);
			buf.writeVarInt(this.phaseTicks);
			buf.writeVarInt(this.phaseLength);
			buf.writeVarInt(this.remaining);
			buf.writeVarInt(this.intensity);
			buf.writeIdentifier(this.dimension);
			buf.writeBlockPos(this.pos);
			buf.writeFloat(this.value);
			buf.writeBoolean(this.waiting);
		}

		static EventInfo read(PacketByteBuf buf) {
			return new EventInfo(buf.readVarInt(), buf.readVarInt(), buf.readVarInt(), buf.readVarInt(), buf.readVarInt(),
				buf.readVarInt(), buf.readIdentifier(), buf.readBlockPos(), buf.readFloat(), buf.readBoolean());
		}
	}

	private void write(PacketByteBuf buf) {
		buf.writeBoolean(this.randomEnabled);
		buf.writeVarInt(this.enabledMask);
		buf.writeVarInt(this.cooldownTicks);
		buf.writeBoolean(this.canEdit);
		buf.writeVarInt(this.events.size());
		for (EventInfo info : this.events) {
			info.write(buf);
		}
	}

	private static ChaosStatusPayload read(PacketByteBuf buf) {
		boolean random = buf.readBoolean();
		int mask = buf.readVarInt();
		int cooldown = buf.readVarInt();
		boolean canEdit = buf.readBoolean();
		int count = Math.min(buf.readVarInt(), 64);
		List<EventInfo> events = new ArrayList<>(count);
		for (int i = 0; i < count; i++) {
			events.add(EventInfo.read(buf));
		}
		return new ChaosStatusPayload(random, mask, cooldown, canEdit, events);
	}

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
