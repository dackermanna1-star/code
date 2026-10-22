package com.ordnance.network;

import com.ordnance.Ordnance;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.weapon.GrenadeLauncherItem;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.entity.Entity;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.Vec3d;

/**
 * Custom packets. The server only tells clients <em>what happened</em> (an explosion of a given profile at a
 * position, a knockback impulse, a muzzle flash); all damage and world changes stay on the server.
 */
public final class OrdnanceNetworking {
	private OrdnanceNetworking() {
	}

	public static void init() {
		PayloadTypeRegistry.playS2C().register(ExplosionFx.ID, ExplosionFx.CODEC);
		PayloadTypeRegistry.playS2C().register(Knockback.ID, Knockback.CODEC);
		PayloadTypeRegistry.playS2C().register(MuzzleFlash.ID, MuzzleFlash.CODEC);
		PayloadTypeRegistry.playS2C().register(StrikeWarning.ID, StrikeWarning.CODEC);
		PayloadTypeRegistry.playC2S().register(CycleFireMode.ID, CycleFireMode.CODEC);

		ServerPlayNetworking.registerGlobalReceiver(CycleFireMode.ID, (payload, context) -> GrenadeLauncherItem.cycleFireMode(context.player()));
	}

	/** Sends an explosion effect to every player close enough to see or hear it. */
	public static void sendExplosion(ServerWorld world, Vec3d pos, ExplosionProfile profile, float scale, Vec3d normal, long seed) {
		double range = Math.max(128.0, 56.0 * scale);
		ExplosionFx payload = new ExplosionFx(pos, (byte)profile.ordinal(), scale, normal, seed);
		for (ServerPlayerEntity player : world.getPlayers()) {
			if (player.squaredDistanceTo(pos) < range * range) {
				ServerPlayNetworking.send(player, payload);
			}
		}
	}

	/** Muzzle flash for everyone watching the shooter (the shooter predicts their own). */
	public static void sendMuzzleFlash(Entity shooter, MuzzleFlash.Kind kind) {
		MuzzleFlash payload = new MuzzleFlash(shooter.getId(), (byte)kind.ordinal());
		for (ServerPlayerEntity player : PlayerLookup.tracking(shooter)) {
			if (player != shooter) {
				ServerPlayNetworking.send(player, payload);
			}
		}
	}

	public record ExplosionFx(Vec3d pos, byte profile, float scale, Vec3d normal, long seed) implements CustomPayload {
		public static final Id<ExplosionFx> ID = new Id<>(Ordnance.id("explosion_fx"));
		public static final PacketCodec<RegistryByteBuf, ExplosionFx> CODEC = PacketCodec.tuple(
			Vec3d.PACKET_CODEC, ExplosionFx::pos,
			PacketCodecs.BYTE, ExplosionFx::profile,
			PacketCodecs.FLOAT, ExplosionFx::scale,
			Vec3d.PACKET_CODEC, ExplosionFx::normal,
			PacketCodecs.VAR_LONG, ExplosionFx::seed,
			ExplosionFx::new
		);

		public ExplosionProfile explosionProfile() {
			return ExplosionProfile.byId(this.profile);
		}

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	/** Blast pressure impulse for the receiving player (player movement is client-authoritative). */
	public record Knockback(Vec3d velocity) implements CustomPayload {
		public static final Id<Knockback> ID = new Id<>(Ordnance.id("knockback"));
		public static final PacketCodec<RegistryByteBuf, Knockback> CODEC = PacketCodec.tuple(Vec3d.PACKET_CODEC, Knockback::velocity, Knockback::new);

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	public record MuzzleFlash(int entityId, byte kind) implements CustomPayload {
		public static final Id<MuzzleFlash> ID = new Id<>(Ordnance.id("muzzle_flash"));
		public static final PacketCodec<RegistryByteBuf, MuzzleFlash> CODEC = PacketCodec.tuple(
			PacketCodecs.VAR_INT, MuzzleFlash::entityId, PacketCodecs.BYTE, MuzzleFlash::kind, MuzzleFlash::new
		);

		public Kind weaponKind() {
			Kind[] kinds = Kind.values();
			return this.kind >= 0 && this.kind < kinds.length ? kinds[this.kind] : Kind.ROCKET;
		}

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}

		public enum Kind {
			ROCKET,
			GRENADE_LAUNCHER
		}
	}

	/** Incoming missile marker: shown to players near the target until impact. */
	public record StrikeWarning(Vec3d target, int ticksToImpact) implements CustomPayload {
		public static final Id<StrikeWarning> ID = new Id<>(Ordnance.id("strike_warning"));
		public static final PacketCodec<RegistryByteBuf, StrikeWarning> CODEC = PacketCodec.tuple(
			Vec3d.PACKET_CODEC, StrikeWarning::target, PacketCodecs.VAR_INT, StrikeWarning::ticksToImpact, StrikeWarning::new
		);

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	/** Client asks to cycle the fire mode of the weapon in its main hand. */
	public record CycleFireMode() implements CustomPayload {
		public static final CycleFireMode INSTANCE = new CycleFireMode();
		public static final Id<CycleFireMode> ID = new Id<>(Ordnance.id("cycle_fire_mode"));
		public static final PacketCodec<RegistryByteBuf, CycleFireMode> CODEC = PacketCodec.unit(INSTANCE);

		@Override
		public Id<? extends CustomPayload> getId() {
			return ID;
		}
	}
}
