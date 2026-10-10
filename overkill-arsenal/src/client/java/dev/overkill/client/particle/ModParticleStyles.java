package dev.overkill.client.particle;

import dev.overkill.registry.ModParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.core.particles.SimpleParticleType;

import static dev.overkill.client.particle.ParticleStyle.Curve;
import static dev.overkill.client.particle.ParticleStyle.Fade;

/** The look of every particle type. Textures are greyscale/white and get tinted by these colours. */
public final class ModParticleStyles {
	private ModParticleStyles() {
	}

	public static void register() {
		// --- Fire & aftermath ------------------------------------------------------------------
		register(ModParticles.EMBER, ParticleStyle.builder()
			.size(0.05F, 0.11F).life(25, 60).friction(0.96F).physics().glowing()
			.color(0xFFE39A, 0xB8260A).fade(Fade.LATE).curve(Curve.SHRINK)
			.rise(0.0035F).jitter(0.008F).flicker(0.35F));
		register(ModParticles.ASH, ParticleStyle.builder()
			.size(0.06F, 0.12F).life(70, 130).gravity(0.12F).friction(0.95F).physics()
			.color(0xA6A29E, 0x6E6A66).alpha(0.95F).fade(Fade.SMOOTH)
			.spin(0.12F).jitter(0.007F));
		register(ModParticles.CHAR_FLAKE, ParticleStyle.builder()
			.size(0.07F, 0.15F).life(40, 90).gravity(0.35F).friction(0.94F).physics()
			.color(0x2E2620, 0x151210).fade(Fade.LATE)
			.spin(0.3F).jitter(0.005F));
		register(ModParticles.HEAVY_SMOKE, ParticleStyle.builder()
			.size(0.45F, 0.9F).life(60, 130).friction(0.95F)
			.color(0x2E2C2A, 0x707070).alpha(0.82F).fade(Fade.SMOOTH).curve(Curve.GROW)
			.animated().rise(0.0016F).spin(0.02F));
		register(ModParticles.MAGMA, ParticleStyle.builder()
			.size(0.1F, 0.2F).life(25, 50).gravity(1.0F).friction(0.98F).physics().glowing()
			.color(0xFFEFA0, 0x8A1404).fade(Fade.LATE).curve(Curve.SHRINK).flicker(0.15F));
		register(ModParticles.BLAST_DUST, ParticleStyle.builder()
			.size(0.4F, 0.8F).life(30, 60).gravity(0.04F).friction(0.86F)
			.color(0x8E7A64, 0x625A52).alpha(0.8F).fade(Fade.SMOOTH).curve(Curve.GROW).spin(0.04F));
		register(ModParticles.FIRE_BURST, ParticleStyle.builder()
			.size(0.3F, 0.6F).life(12, 22).friction(0.9F).glowing()
			.color(0xFFFFFF, 0xFF9A5A).fade(Fade.LATE).curve(Curve.POP)
			.animated().rise(0.006F));

		// --- Sunline -----------------------------------------------------------------------
		register(ModParticles.SUN_BEAM, ParticleStyle.builder()
			.size(0.22F, 0.22F).life(14, 14).glowing()
			.color(0xFFF8DA, 0xFFA43A).fade(Fade.LATE).curve(Curve.CONSTANT).staticParams());
		register(ModParticles.SUN_SPARK, ParticleStyle.builder()
			.size(0.04F, 0.08F).life(8, 18).gravity(0.6F).friction(0.95F).physics().glowing()
			.color(0xFFFFE6, 0xFF9A1F).fade(Fade.LATE).curve(Curve.SHRINK));

		// --- Rift / void -------------------------------------------------------------------
		register(ModParticles.VOID_MOTE, ParticleStyle.builder()
			.size(0.07F, 0.16F).life(12, 26).friction(0.93F).glowing()
			.color(0x4A1270, 0x07000E).alpha(0.95F).fade(Fade.LINEAR).curve(Curve.SHRINK));
		register(ModParticles.RIFT_GLOW, ParticleStyle.builder()
			.size(0.3F, 0.3F).life(5, 5).glowing()
			.color(0xF39BFF, 0x8B2BE2).fade(Fade.LATE).staticParams());
		register(ModParticles.RIFT_SPARK, ParticleStyle.builder()
			.size(0.05F, 0.1F).life(10, 22).friction(0.96F).glowing()
			.color(0xF7B8FF, 0x6E1FC8).fade(Fade.LATE).curve(Curve.SHRINK));
		register(ModParticles.SINGULARITY, ParticleStyle.builder()
			.size(1.0F, 1.0F).life(3, 3).glowing()
			.color(0xFFFFFF, 0xFFFFFF).fade(Fade.LATE).staticParams());
		register(ModParticles.WHITE_FLARE, ParticleStyle.builder()
			.size(0.07F, 0.15F).life(10, 22).friction(0.9F).glowing()
			.color(0xFFFFFF, 0xBDE6FF).fade(Fade.LATE).curve(Curve.SHRINK));

		// --- Storm -------------------------------------------------------------------------
		register(ModParticles.STATIC_SPARK, ParticleStyle.builder()
			.size(0.04F, 0.09F).life(5, 11).friction(0.9F).glowing()
			.color(0xF0FFFF, 0x45B2FF).fade(Fade.LATE).curve(Curve.SHRINK).jitter(0.07F));
		register(ModParticles.ARC, ParticleStyle.builder()
			.size(0.12F, 0.12F).life(4, 4).glowing()
			.color(0xFFFFFF, 0x7FDFFF).fade(Fade.LINEAR).staticParams());

		// --- Shared ------------------------------------------------------------------------
		register(ModParticles.ORB_CORE, ParticleStyle.builder()
			.size(1.0F, 1.0F).life(3, 3).glowing()
			.color(0xF2FDFF, 0xA8E2FF).fade(Fade.LATE).staticParams());
		register(ModParticles.SHOCKWAVE, ParticleStyle.builder()
			.size(1.0F, 1.0F).life(10, 10).glowing()
			.color(0xFFF6EC, 0xE2D6FF).fade(Fade.LINEAR).curve(Curve.RING).staticParams().horizontal());
	}

	private static void register(SimpleParticleType type, ParticleStyle.Builder style) {
		ParticleStyle built = style.build();
		ParticleFactoryRegistry.getInstance().register(type, sprites -> OverkillParticle.provider(sprites, built));
	}
}
