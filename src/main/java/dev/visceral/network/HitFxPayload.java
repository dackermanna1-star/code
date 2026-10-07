package dev.visceral.network;

import dev.visceral.Visceral;
import dev.visceral.wound.WoundType;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.world.phys.Vec3;

/**
 * "Something got hurt here": drives the client side burst of blood/particles and, for lethal hits,
 * the impulse the ragdoll receives.
 *
 * @param entityId victim
 * @param x        world position of the impact
 * @param y        world position of the impact
 * @param z        world position of the impact
 * @param dx       direction the blow travelled (normalized)
 * @param dy       direction the blow travelled (normalized)
 * @param dz       direction the blow travelled (normalized)
 * @param woundType wound type
 * @param damage   health removed
 * @param flags    {@link #LETHAL}, {@link #CRITICAL}, {@link #EXPLOSION}, {@link #NO_WOUND}
 * @param seed     shared randomness
 */
public record HitFxPayload(int entityId, double x, double y, double z, float dx, float dy, float dz, WoundType woundType, float damage, int flags, int seed)
	implements CustomPacketPayload {
	public static final int LETHAL = 1;
	public static final int CRITICAL = 2;
	public static final int EXPLOSION = 4;
	/** Effects only, the hit did not leave a lasting wound (e.g. repeated fire ticks). */
	public static final int NO_WOUND = 8;

	public static final Type<HitFxPayload> TYPE = new Type<>(Visceral.id("hit_fx"));
	public static final StreamCodec<RegistryFriendlyByteBuf, HitFxPayload> CODEC = StreamCodec.of(HitFxPayload::write, HitFxPayload::read);

	public Vec3 point() {
		return new Vec3(this.x, this.y, this.z);
	}

	public Vec3 direction() {
		return new Vec3(this.dx, this.dy, this.dz);
	}

	public boolean has(int flag) {
		return (this.flags & flag) != 0;
	}

	private static void write(RegistryFriendlyByteBuf buf, HitFxPayload payload) {
		buf.writeVarInt(payload.entityId);
		buf.writeDouble(payload.x);
		buf.writeDouble(payload.y);
		buf.writeDouble(payload.z);
		buf.writeFloat(payload.dx);
		buf.writeFloat(payload.dy);
		buf.writeFloat(payload.dz);
		buf.writeByte(payload.woundType.ordinal());
		buf.writeFloat(payload.damage);
		buf.writeByte(payload.flags);
		buf.writeInt(payload.seed);
	}

	private static HitFxPayload read(RegistryFriendlyByteBuf buf) {
		return new HitFxPayload(
			buf.readVarInt(), buf.readDouble(), buf.readDouble(), buf.readDouble(), buf.readFloat(), buf.readFloat(), buf.readFloat(),
			WoundType.byId(buf.readByte()), buf.readFloat(), buf.readByte(), buf.readInt()
		);
	}

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
