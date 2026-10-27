package dev.visceral.net;

import dev.visceral.Visceral;
import io.netty.buffer.ByteBuf;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** All custom packets. */
public final class Payloads {
	private Payloads() {
	}

	private static <T extends CustomPacketPayload> CustomPacketPayload.Type<T> newType(String path) {
		return new CustomPacketPayload.Type<>(Visceral.id(path));
	}

	/** S2C: an entity's physical state changed (or is being sent to a new tracker). */
	public record PhysStateSync(int entityId, int state, int ticks, int duration, float dirX, float dirZ, float force, int flags)
		implements CustomPacketPayload {
		public static final int FLAG_CRAWL = 1, FLAG_FAIL = 2, FLAG_FACE_UP = 4, FLAG_DEAD = 8;
		public static final Type<PhysStateSync> TYPE = newType("phys_state");
		public static final StreamCodec<ByteBuf, PhysStateSync> CODEC = new StreamCodec<>() {
			@Override
			public PhysStateSync decode(ByteBuf b) {
				return new PhysStateSync(readVarInt(b), b.readByte(), b.readShort(), b.readShort(), b.readFloat(), b.readFloat(), b.readFloat(), b.readByte());
			}

			@Override
			public void encode(ByteBuf b, PhysStateSync p) {
				writeVarInt(b, p.entityId);
				b.writeByte(p.state);
				b.writeShort(p.ticks);
				b.writeShort(p.duration);
				b.writeFloat(p.dirX);
				b.writeFloat(p.dirZ);
				b.writeFloat(p.force);
				b.writeByte(p.flags);
			}
		};

		@Override
		public Type<PhysStateSync> type() {
			return TYPE;
		}
	}

	/**
	 * S2C: a physical impact on an entity: drives hit reactions, ragdoll impulses, blood and
	 * gore. Position/direction are world space.
	 */
	public record Impact(int entityId, int attackerId, float x, float y, float z, float dx, float dy, float dz, float force, float damage,
		int region, int woundType, int flags) implements CustomPacketPayload {
		public static final int FLAG_FATAL = 1, FLAG_SEVER = 2, FLAG_BLOCKED = 4, FLAG_FINISHER = 8, FLAG_KICK = 16, FLAG_HEAVY = 32,
			FLAG_SLAM = 64, FLAG_MELEE = 128;
		public static final Type<Impact> TYPE = newType("impact");
		public static final StreamCodec<ByteBuf, Impact> CODEC = new StreamCodec<>() {
			@Override
			public Impact decode(ByteBuf b) {
				return new Impact(readVarInt(b), readVarInt(b), b.readFloat(), b.readFloat(), b.readFloat(), b.readFloat(), b.readFloat(), b.readFloat(),
					b.readFloat(), b.readFloat(), b.readByte(), b.readByte(), b.readShort());
			}

			@Override
			public void encode(ByteBuf b, Impact p) {
				writeVarInt(b, p.entityId);
				writeVarInt(b, p.attackerId);
				b.writeFloat(p.x);
				b.writeFloat(p.y);
				b.writeFloat(p.z);
				b.writeFloat(p.dx);
				b.writeFloat(p.dy);
				b.writeFloat(p.dz);
				b.writeFloat(p.force);
				b.writeFloat(p.damage);
				b.writeByte(p.region);
				b.writeByte(p.woundType);
				b.writeShort(p.flags);
			}
		};

		public boolean has(int flag) {
			return (flags & flag) != 0;
		}

		@Override
		public Type<Impact> type() {
			return TYPE;
		}
	}

	/**
	 * S2C: play an attack/telegraph animation on an entity (other players' swings, mob
	 * wind-ups). {@code attackId} indexes {@link dev.visceral.combat.Attacks}, or is negative
	 * for special clips (see constants).
	 */
	public record PlayAnim(int entityId, int attackId, float timeScale) implements CustomPacketPayload {
		public static final int MOB_WINDUP = -2, MOB_STRIKE = -3, MOB_WHIFF = -4, INTERRUPTED = -5;
		public static final Type<PlayAnim> TYPE = newType("play_anim");
		public static final StreamCodec<ByteBuf, PlayAnim> CODEC = new StreamCodec<>() {
			@Override
			public PlayAnim decode(ByteBuf b) {
				return new PlayAnim(readVarInt(b), b.readShort(), b.readFloat());
			}

			@Override
			public void encode(ByteBuf b, PlayAnim p) {
				writeVarInt(b, p.entityId);
				b.writeShort(p.attackId);
				b.writeFloat(p.timeScale);
			}
		};

		@Override
		public Type<PlayAnim> type() {
			return TYPE;
		}
	}

	/** S2C on join: server-side switches that clients must respect. */
	public record ServerSettings(boolean meleeOverhaul, boolean physicalReactions, int maxGoreLevel, boolean finishers, float attackTimeScale)
		implements CustomPacketPayload {
		public static final Type<ServerSettings> TYPE = newType("server_settings");
		public static final StreamCodec<ByteBuf, ServerSettings> CODEC = new StreamCodec<>() {
			@Override
			public ServerSettings decode(ByteBuf b) {
				return new ServerSettings(b.readBoolean(), b.readBoolean(), b.readByte(), b.readBoolean(), b.readFloat());
			}

			@Override
			public void encode(ByteBuf b, ServerSettings p) {
				b.writeBoolean(p.meleeOverhaul);
				b.writeBoolean(p.physicalReactions);
				b.writeByte(p.maxGoreLevel);
				b.writeBoolean(p.finishers);
				b.writeFloat(p.attackTimeScale);
			}
		};

		@Override
		public Type<ServerSettings> type() {
			return TYPE;
		}
	}

	/** C2S: the client started an attack (it is already animating it locally). */
	public record AttackRequest(int attackId, int targetId, int comboStep) implements CustomPacketPayload {
		public static final Type<AttackRequest> TYPE = newType("attack");
		public static final StreamCodec<ByteBuf, AttackRequest> CODEC = new StreamCodec<>() {
			@Override
			public AttackRequest decode(ByteBuf b) {
				return new AttackRequest(b.readShort(), readVarInt(b), b.readByte());
			}

			@Override
			public void encode(ByteBuf b, AttackRequest p) {
				b.writeShort(p.attackId);
				writeVarInt(b, p.targetId);
				b.writeByte(p.comboStep);
			}
		};

		@Override
		public Type<AttackRequest> type() {
			return TYPE;
		}
	}

	static int readVarInt(ByteBuf buf) {
		int value = 0, shift = 0;
		byte b;
		do {
			b = buf.readByte();
			value |= (b & 0x7F) << shift;
			shift += 7;
			if (shift > 35) throw new IllegalArgumentException("VarInt too big");
		} while ((b & 0x80) != 0);
		return value;
	}

	static void writeVarInt(ByteBuf buf, int value) {
		while ((value & ~0x7F) != 0) {
			buf.writeByte((value & 0x7F) | 0x80);
			value >>>= 7;
		}
		buf.writeByte(value);
	}

	public static void register() {
		PayloadTypeRegistry<RegistryFriendlyByteBuf> s2c = PayloadTypeRegistry.playS2C();
		s2c.register(PhysStateSync.TYPE, PhysStateSync.CODEC);
		s2c.register(Impact.TYPE, Impact.CODEC);
		s2c.register(PlayAnim.TYPE, PlayAnim.CODEC);
		s2c.register(ServerSettings.TYPE, ServerSettings.CODEC);
		PayloadTypeRegistry.playC2S().register(AttackRequest.TYPE, AttackRequest.CODEC);
	}
}
