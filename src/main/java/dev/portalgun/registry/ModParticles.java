package dev.portalgun.registry;

import dev.portalgun.PortalGunMod;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;

public final class ModParticles {
	public static final SimpleParticleType PORTAL_SPARK = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
		PortalGunMod.id("portal_spark"), FabricParticleTypes.simple());

	private ModParticles() {
	}

	public static void init() {
	}
}
