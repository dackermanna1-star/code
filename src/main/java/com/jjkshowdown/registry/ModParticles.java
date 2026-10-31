package com.jjkshowdown.registry;

import com.jjkshowdown.JjkShowdown;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.particles.SimpleParticleType;

public final class ModParticles {
	public static final SimpleParticleType BLUE_SPARK = reg("blue_spark");
	public static final SimpleParticleType RED_SPARK = reg("red_spark");
	public static final SimpleParticleType PURPLE_SPARK = reg("purple_spark");
	public static final SimpleParticleType CE_WISP_BLUE = reg("ce_wisp_blue");
	public static final SimpleParticleType CE_WISP_RED = reg("ce_wisp_red");
	public static final SimpleParticleType SLASH = reg("slash");
	public static final SimpleParticleType SLASH_RED = reg("slash_red");
	public static final SimpleParticleType BLACK_FLASH = reg("black_flash");
	public static final SimpleParticleType VOID_STAR = reg("void_star");
	public static final SimpleParticleType SHOCKWAVE = reg("shockwave");
	public static final SimpleParticleType IMPACT_FLASH = reg("impact_flash");
	public static final SimpleParticleType RCT_GLOW = reg("rct_glow");
	public static final SimpleParticleType FUGA_FLAME = reg("fuga_flame");
	public static final SimpleParticleType BLOOD = reg("blood");
	public static final SimpleParticleType DOMAIN_EMBER = reg("domain_ember");

	private ModParticles() {
	}

	private static SimpleParticleType reg(String name) {
		// alwaysSpawn=true so big set-piece effects are not culled by the "decreased particles" option
		return Registry.register(BuiltInRegistries.PARTICLE_TYPE, JjkShowdown.id(name), FabricParticleTypes.simple(true));
	}

	public static void init() {
	}
}
