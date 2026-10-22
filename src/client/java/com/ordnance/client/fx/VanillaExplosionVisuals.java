package com.ordnance.client.fx;

import com.ordnance.config.ConfigManager;
import net.minecraft.client.MinecraftClient;
import net.minecraft.network.packet.s2c.play.ExplosionS2CPacket;
import net.minecraft.particle.ParticleType;
import net.minecraft.particle.ParticleTypes;

/** Renders vanilla explosions with the Ordnance effects instead of the vanilla particles and sound. */
public final class VanillaExplosionVisuals {
	private VanillaExplosionVisuals() {
	}

	/** Returns true when the packet was handled (vanilla handling should be skipped). */
	public static boolean handle(ExplosionS2CPacket packet) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (!ConfigManager.get().general.overhaulVanillaExplosionVisuals || client.world == null || client.player == null) {
			return false;
		}

		// Only real blasts: wind charges and modded "explosions" with other particles keep their own look.
		ParticleType<?> type = packet.explosionParticle().getType();
		if (type != ParticleTypes.EXPLOSION && type != ParticleTypes.EXPLOSION_EMITTER) {
			return false;
		}

		ExplosionEffects.playVanilla(client.world, packet.center(), packet.radius());
		packet.playerKnockback().ifPresent(client.player::addVelocityInternal);
		return true;
	}
}
