package net.abyssaldescent.client.particle;

import net.abyssaldescent.dungeon.loot.Rarity;
import net.abyssaldescent.registry.ModParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.core.particles.SimpleParticleType;

public final class ModParticleProviders {
	private ModParticleProviders() {
	}

	private static void style(SimpleParticleType type, AdParticle.Style style) {
		ParticleFactoryRegistry.getInstance().register(type, sprites -> (ParticleProvider<SimpleParticleType>) (t, level, x, y, z, xd, yd, zd, random) ->
			new AdParticle(level, x, y, z, xd, yd, zd, sprites, style, random));
	}

	public static void init() {
		style(ModParticles.RUNE_GLYPH, AdParticle.Style.of(24, 40, 0.09F).fade(0.2F, 0.5F).friction(0.92F).color(0x9FEFFF));
		style(ModParticles.RIFT_MOTE, AdParticle.Style.of(30, 50, 0.1F).withAnimation().fade(0.1F, 0.4F).friction(0.95F).color(0xD7B4FF));
		style(ModParticles.LOOT_GLINT, AdParticle.Style.of(16, 24, 0.08F).withAnimation().fade(0.1F, 0.6F).friction(0.9F).color(0xFFE38A));
		style(ModParticles.BLOOD_MOTE, AdParticle.Style.of(20, 34, 0.07F).fade(0.1F, 0.5F).friction(0.93F).color(0xFF4A5E));
		style(ModParticles.CURSE_MOTE, AdParticle.Style.of(26, 44, 0.09F).fade(0.2F, 0.5F).friction(0.94F).spin(0.05F).color(0xC99BF5));
		style(ModParticles.SOUL_EMBER, AdParticle.Style.of(12, 24, 0.08F).withAnimation().gravity(-0.01F).fade(0.0F, 0.5F).friction(0.92F).color(0xB8F4FF));
		style(ModParticles.BONE_SHARD, AdParticle.Style.of(20, 32, 0.1F).dim().gravity(0.9F).withPhysics().fade(0.0F, 0.75F).spin(0.25F).color(0xE9DFC6));
		style(ModParticles.ARC_SPARK, AdParticle.Style.of(3, 5, 0.07F).fade(0.0F, 0.4F).friction(0.5F).color(0xE8FBFF));
		style(ModParticles.SUMMON_SWIRL, AdParticle.Style.of(10, 16, 0.12F).withAnimation().fade(0.0F, 0.5F).friction(0.85F).color(0x8FE6FF));
		style(ModParticles.BLEED_DRIP, AdParticle.Style.of(14, 24, 0.07F).dim().gravity(0.6F).withPhysics().fade(0.0F, 0.8F).color(0xB0122E));
		style(ModParticles.DUST_MOTE, AdParticle.Style.of(80, 140, 0.035F).dim().gravity(-0.0008F).friction(0.99F).fade(0.25F, 0.6F).color(0xC8C0B0));
		style(ModParticles.SPARK_UNCOMMON, AdParticle.Style.of(18, 26, 0.09F).withAnimation().gravity(-0.02F).fade(0.0F, 0.6F).friction(0.9F)
			.color(Rarity.UNCOMMON.color()));
		style(ModParticles.SPARK_RARE, AdParticle.Style.of(18, 28, 0.1F).withAnimation().gravity(-0.02F).fade(0.0F, 0.6F).friction(0.9F)
			.color(Rarity.RARE.color()));
		style(ModParticles.SPARK_EPIC, AdParticle.Style.of(20, 30, 0.11F).withAnimation().gravity(-0.025F).fade(0.0F, 0.6F).friction(0.9F)
			.color(Rarity.EPIC.color()));
		style(ModParticles.SPARK_LEGENDARY, AdParticle.Style.of(22, 34, 0.12F).withAnimation().gravity(-0.03F).fade(0.0F, 0.6F).friction(0.9F)
			.color(Rarity.LEGENDARY.color()));
		ParticleFactoryRegistry.getInstance().register(ModParticles.SHOCK_RING, sprites -> (ParticleProvider<SimpleParticleType>) (t, level, x, y, z, xd,
			yd, zd, random) -> new ShockRingEmitter(level, x, y, z));
	}
}
