package dev.juukulius.client.fx;

import dev.juukulius.combat.Ability;
import dev.juukulius.combat.ArtFeedback;
import dev.juukulius.network.FxPayload;
import dev.juukulius.network.FxType;
import dev.juukulius.registry.JuliusParticles;
import dev.juukulius.spirit.Spirit;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Turns effect events into visuals: magic circles, shockwaves, flashes, beams, particles and (for major impacts only)
 * camera shake. Effects are anchored to the entity they belong to so they follow Julius, his targets and projectiles.
 */
public final class FxHandler {
	private static final int RAINBOW = 0xFFFFFF;

	private FxHandler() {
	}

	public static void handle(FxPayload payload) {
		ClientLevel level = Minecraft.getInstance().level;
		if (level == null) {
			return;
		}

		Entity entity = payload.entityId() >= 0 ? level.getEntity(payload.entityId()) : null;
		spawn(level, payload.fxType(), entity, payload.pos(), payload.dir(), payload.color(), payload.power());
	}

	/** The caster's own cast effect, played the instant the key is pressed (the server skips the caster). */
	public static void castFeedback(Player player, Ability ability) {
		ClientLevel level = Minecraft.getInstance().level;
		if (level == null) {
			return;
		}

		Vec3 look = player.getLookAngle();
		Spirit spirit = ArtFeedback.spiritOf(ability);
		if (ability == Ability.AL_CLAUZERIA) {
			spawn(level, FxType.CLAUZERIA_GATHER, player, player.position(), look, RAINBOW, 1.0F);
			return;
		}

		if (ability == Ability.AL_CRANVEL) {
			spawn(level, FxType.CRANVEL_ACTIVATE, player, player.position(), look, RAINBOW, 1.0F);
			return;
		}

		FxType type = ArtFeedback.castFx(ability);
		if (type == null) {
			return;
		}

		boolean circle = type == FxType.CAST_CIRCLE;
		spawn(level, type, player, circle ? ArtFeedback.castPoint(player) : player.position(), look, spirit.color, circle ? 0.55F : 1.0F);
	}

	public static void spawn(ClientLevel level, FxType type, @Nullable Entity entity, Vec3 pos, Vec3 dir, int color, float power) {
		Vec3 chest = entity != null ? entity.position().add(0.0, entity.getBbHeight() * 0.6, 0.0) : pos;
		switch (type) {
			case TRANSFORM -> {
				EffectManager.add(new PillarEffect(Anchor.follow(entity, pos), 0.95F, 3.4F, RAINBOW, true, 32));
				EffectManager.add(MagicCircleEffect.ground(Anchor.follow(entity, pos), 2.3F, RAINBOW, true, 44));
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos), 4.2F, RAINBOW, true, 20));
				EffectManager.add(new DelayedEffect(10, new FlashEffect(Anchor.follow(entity, chest), 1.7F, 0xFFFFFF, 9)));
				Particles.spiral(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 1.1F), pos, 1.1, 3.0, 46, 0.06);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.LIGHT_MOTE, 0xFFF3D8, 1.0F), chest, 18, 0.08, 0.6);
				shake(pos, 0.28F, 10.0);
			}
			case REVERT -> {
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos), 2.6F, 0xE8E0FF, false, 14));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 0.9F), chest, 24, 0.06, 0.7);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, 0xD8CCFF, 0.8F), chest, 12, 0.03, 0.9);
			}
			case SPIRITS_SUMMON -> {
				EffectManager.add(new FlashEffect(Anchor.follow(entity, chest), 0.7F, 0xFFFFFF, 7));
				for (Spirit spirit : Spirit.values()) {
					Particles.burst(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, spirit.color, 0.9F), chest, 5, 0.12, 0.2);
				}
			}
			case SPIRITS_DISMISS -> {
				for (Spirit spirit : Spirit.values()) {
					Particles.burst(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, spirit.color, 0.8F), chest, 4, 0.03, 0.9);
				}
			}
			case SLASH_HIT -> {
				boolean big = power >= 3.0F;
				EffectManager.add(new FlashEffect(Anchor.fixed(pos), big ? 1.0F : 0.5F + power * 0.12F, color, big ? 7 : 5));
				Vec3 slash = dir.cross(new Vec3(0.0, 1.0, 0.0));
				slash = slash.lengthSqr() < 1.0E-4 ? new Vec3(1.0, 0.0, 0.0) : slash.normalize();
				Particles.cone(level, JuliusParticles.of(JuliusParticles.SLASH_LINE, color, 1.0F), pos, slash, big ? 8 : 5, 0.35, 0.35);
				Particles.cone(level, JuliusParticles.of(JuliusParticles.SLASH_LINE, color, 1.0F), pos, slash.scale(-1.0), big ? 8 : 5, 0.35, 0.35);
				Particles.burst(level, JuliusParticles.of(big ? JuliusParticles.RAINBOW_SPARK : JuliusParticles.GLOW_SPARK, color, 0.9F), pos, big ? 14 : 7,
					0.15, 0.2);
			}
			case HEAVY_HIT -> {
				EffectManager.add(new FlashEffect(Anchor.fixed(pos), 1.5F, 0xFFFFFF, 9));
				EffectManager.add(new RingWaveEffect(Anchor.fixed(pos), dir, 0.2F, 2.0F, 0.4F, RAINBOW, true, 10, 0.4F, 0.8F));
				Particles.cone(level, JuliusParticles.of(JuliusParticles.SLASH_LINE, 0xFFFFFF, 1.3F), pos, dir, 16, 0.55, 0.6);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 1.1F), pos, 22, 0.25, 0.3);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.IMPACT_FLASH, 0xFFFFFF, 1.2F), pos, 1, 0.0, 0.0);
				shake(pos, 0.55F, 12.0);
			}
			case HEAVY_GROUND -> {
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos), 2.3F, 0xFFF1D6, false, 12));
				EffectManager.add(new FlashEffect(Anchor.fixed(pos.add(0.0, 0.2, 0.0)), 0.9F, 0xFFFFFF, 6));
				Particles.ring(level, JuliusParticles.of(JuliusParticles.DUST_PUFF, 0xB7A68C, 1.2F), pos.add(0.0, 0.1, 0.0), 0.5, 12, 0.12, 0.04);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 0.9F), pos.add(0.0, 0.2, 0.0), 10, 0.18, 0.2);
				shake(pos, 0.35F, 10.0);
			}
			case WAVE_IMPACT -> {
				EffectManager.add(new FlashEffect(Anchor.fixed(pos), 1.0F + power, 0xFFFFFF, 8));
				EffectManager.add(new RingWaveEffect(Anchor.fixed(pos), dir, 0.3F, 1.6F + power, 0.45F, RAINBOW, true, 12, 0.0F, 0.85F));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 1.1F), pos, 16 + (int) (power * 14), 0.22, 0.4);
			}
			case CAST_CIRCLE -> {
				EffectManager.add(MagicCircleEffect.facing(Anchor.follow(entity, pos), dir, power, color, 14));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, color, 0.8F), pos, 6, 0.06, 0.25);
			}
			case FLAME_EXPLOSION -> {
				EffectManager.add(new FlashEffect(Anchor.fixed(pos), power * 0.75F, Spirit.IA.accent, 8));
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos.add(0.0, -0.4, 0.0)), power * 1.25F, Spirit.IA.color, false, 12));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.FLAME, Spirit.IA.color, 1.5F), pos, 30, 0.22, 0.4);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.EMBER, Spirit.IA.accent, 1.0F), pos, 26, 0.32, 0.3);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.DUST_PUFF, 0x4A3A35, 1.4F), pos, 8, 0.05, 0.6);
				shake(pos, 0.3F, 10.0);
			}
			case WATER_SPLASH -> {
				EffectManager.add(new RingWaveEffect(Anchor.fixed(pos), dir, 0.2F, 1.1F, 0.25F, Spirit.KUA.accent, false, 9, 0.0F, 0.75F));
				Particles.cone(level, JuliusParticles.of(JuliusParticles.DROPLET, Spirit.KUA.color, 1.0F), pos, dir.add(0.0, 0.4, 0.0), 18, 0.3, 0.6);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, Spirit.KUA.accent, 0.8F), pos, 8, 0.1, 0.2);
			}
			case HEALING_WATER -> {
				EffectManager.add(MagicCircleEffect.ground(Anchor.follow(entity, pos), 2.0F, Spirit.KUA.color, false, 34));
				EffectManager.add(new PillarEffect(Anchor.follow(entity, pos), 0.8F, 2.6F, Spirit.KUA.accent, false, 30));
				Particles.spiral(level, JuliusParticles.of(JuliusParticles.DROPLET, Spirit.KUA.color, 0.9F), pos, 1.0, 2.5, 30, 0.04);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, Spirit.KUA.accent, 0.9F), chest, 14, 0.05, 0.8);
			}
			case GALE_STEP -> {
				Vec3 flat = new Vec3(dir.x, 0.0, dir.z);
				flat = flat.lengthSqr() < 1.0E-4 ? new Vec3(0.0, 0.0, 1.0) : flat.normalize();
				EffectManager.add(new RingWaveEffect(Anchor.fixed(pos.add(0.0, 1.0, 0.0)), flat, 0.3F, 1.5F, 0.3F, Spirit.ARO.accent, false, 10, 1.0F, 0.6F));
				Particles.cone(level, JuliusParticles.of(JuliusParticles.WIND_STREAK, Spirit.ARO.accent, 1.2F), pos.add(0.0, 1.0, 0.0), flat, 18, 0.9, 0.12);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.LEAF, Spirit.ARO.color, 0.9F), pos.add(0.0, 0.8, 0.0), 10, 0.15, 0.5);
				Particles.ring(level, JuliusParticles.of(JuliusParticles.DUST_PUFF, 0xC9C2B0, 0.9F), pos.add(0.0, 0.1, 0.0), 0.4, 6, 0.08, 0.02);
			}
			case EL_FURA -> {
				Vec3 origin = (entity != null ? entity.getEyePosition() : pos).add(0.0, -0.35, 0.0);
				for (int i = 0; i < 3; i++) {
					EffectManager.add(new DelayedEffect(i * 2, new RingWaveEffect(Anchor.fixed(origin.add(dir.scale(0.6))), dir, 0.4F + i * 0.2F, 2.3F + i * 0.4F,
						0.5F, Spirit.ARO.accent, false, 12, 6.5F, 0.55F)));
				}

				EffectManager.add(MagicCircleEffect.facing(Anchor.follow(entity, origin.add(dir.scale(0.8))), dir, 0.85F, Spirit.ARO.color, 12));
				Particles.cone(level, JuliusParticles.of(JuliusParticles.WIND_STREAK, 0xFFFFFF, 1.4F), origin, dir, 40, 1.05, 0.28);
				Particles.cone(level, JuliusParticles.of(JuliusParticles.LEAF, Spirit.ARO.color, 1.0F), origin, dir, 12, 0.7, 0.35);
				Vec3 ground = entity != null ? entity.position() : pos;
				Vec3 flat = new Vec3(dir.x, 0.0, dir.z).normalize();
				for (int i = 1; i <= 5; i++) {
					Particles.burst(level, JuliusParticles.of(JuliusParticles.DUST_PUFF, 0xCFC6B2, 1.3F), ground.add(flat.scale(i * 1.3)).add(0.0, 0.15, 0.0), 3, 0.06,
						0.4);
				}

				shake(origin, 0.18F, 6.0);
			}
			case STONE_SPIRE -> {
				Particles.ring(level, JuliusParticles.of(JuliusParticles.DUST_PUFF, 0x9C8B70, 1.1F), pos.add(0.0, 0.1, 0.0), 0.35, 7, 0.07, 0.05);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, Spirit.IKU.color, 0.7F), pos.add(0.0, 0.4, 0.0), 4, 0.1, 0.3);
				shake(pos, 0.08F * power, 8.0);
			}
			case GROUND_SHATTER -> {
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos), 4.8F, Spirit.IKU.color, false, 16));
				EffectManager.add(new DelayedEffect(3, RingWaveEffect.ground(Anchor.fixed(pos), 3.6F, 0xB79A6A, false, 14)));
				EffectManager.add(MagicCircleEffect.ground(Anchor.follow(entity, pos), 2.0F, Spirit.IKU.color, false, 22));
				Particles.ring(level, JuliusParticles.of(JuliusParticles.DUST_PUFF, 0xA8977A, 1.5F), pos.add(0.0, 0.15, 0.0), 0.8, 26, 0.2, 0.05);
				Particles.ring(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, Spirit.IKU.color, 0.8F), pos.add(0.0, 0.2, 0.0), 1.2, 12, 0.15, 0.2);
				shake(pos, 0.5F, 14.0);
			}
			case RADIANT_BURST -> {
				Vec3 origin = entity instanceof Player p ? ArtFeedback.castPoint(p) : pos;
				EffectManager.add(new BeamEffect(Anchor.follow(entity, origin), dir, 10.0F, 0.32F, Spirit.IN.accent, 12));
				EffectManager.add(new FlashEffect(Anchor.follow(entity, origin), 1.0F, Spirit.IN.color, 8));
				Particles.line(level, JuliusParticles.of(JuliusParticles.LIGHT_MOTE, Spirit.IN.accent, 0.9F), origin, origin.add(dir.scale(9.0)), 22,
					new Vec3(0.0, 0.02, 0.0));
			}
			case STRENGTH_ENHANCEMENT -> {
				EffectManager.add(new PillarEffect(Anchor.follow(entity, pos), 0.75F, 2.5F, Spirit.IN.accent, false, 26));
				EffectManager.add(RingWaveEffect.ground(Anchor.follow(entity, pos), 2.0F, Spirit.IN.accent, false, 14));
				Particles.spiral(level, JuliusParticles.of(JuliusParticles.LIGHT_MOTE, Spirit.IN.accent, 1.0F), pos, 0.9, 2.5, 26, 0.05);
			}
			case UMBRAL_IMPACT -> {
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos.add(0.0, -0.3, 0.0)), power, Spirit.NES.color, false, 12));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.SHADOW_WISP, Spirit.NES.accent, 1.4F), pos, 22, 0.08, 0.5);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, Spirit.NES.color, 0.8F), pos, 12, 0.14, 0.3);
			}
			case YIN_SEAL -> {
				EffectManager.add(new SealEffect(Anchor.follow(entity, pos), entity != null ? Math.max(0.8F, entity.getBbWidth() * 1.3F) : 1.0F,
					Math.max(20, (int) power)));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.SHADOW_WISP, Spirit.NES.accent, 1.2F), chest, 14, 0.04, 0.6);
			}
			case UL_GORA_CAST -> {
				Vec3 hand = entity instanceof Player p ? ArtFeedback.castPoint(p) : pos;
				EffectManager.add(MagicCircleEffect.facing(Anchor.follow(entity, hand), dir, 0.75F, Spirit.IA.color, 18));
				EffectManager.add(MagicCircleEffect.ground(Anchor.follow(entity, pos), 1.6F, Spirit.ARO.color, false, 22));
				Particles.cone(level, JuliusParticles.of(JuliusParticles.FLAME, Spirit.IA.color, 1.2F), hand, dir, 14, 0.4, 0.3);
				Particles.cone(level, JuliusParticles.of(JuliusParticles.WIND_STREAK, Spirit.ARO.accent, 1.0F), hand, dir, 10, 0.6, 0.3);
			}
			case CLAUZERIA_GATHER -> {
				EffectManager.add(MagicCircleEffect.ground(Anchor.follow(entity, pos), 2.5F, RAINBOW, true, 34));
				if (entity != null) {
					EffectManager.add(new BarrierDomeEffect(Anchor.follow(entity, entity.position())));
				}

				Particles.spiral(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 1.0F), pos, 1.6, 2.6, 36, 0.05);
			}
			case CLAUZERIA_BURST -> {
				EffectManager.add(new FlashEffect(Anchor.fixed(pos), 3.0F, 0xFFFFFF, 12));
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos.add(0.0, -0.5, 0.0)), power * 1.35F, RAINBOW, true, 22));
				EffectManager.add(new DelayedEffect(4, new RingWaveEffect(Anchor.fixed(pos), dir, 0.5F, power, 0.7F, RAINBOW, true, 16, 0.0F, 0.7F)));
				EffectManager.add(new PillarEffect(Anchor.fixed(pos.add(0.0, -0.8, 0.0)), 1.2F, 4.2F, RAINBOW, true, 22));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 1.4F), pos, 64, 0.45, 0.6);
				Particles.burst(level, JuliusParticles.of(JuliusParticles.IMPACT_FLASH, 0xFFFFFF, 2.0F), pos, 1, 0.0, 0.0);
				shake(pos, 0.8F, 24.0);
			}
			case BARRIER -> {
				if (entity != null) {
					EffectManager.add(new BarrierDomeEffect(Anchor.follow(entity, entity.position())));
				}
			}
			case BARRIER_BLOCK -> {
				EffectManager.add(new FlashEffect(Anchor.fixed(pos), 0.7F, 0xFFFFFF, 6));
				EffectManager.add(new RingWaveEffect(Anchor.fixed(pos), dir, 0.1F, 0.9F, 0.3F, RAINBOW, true, 8, 0.0F, 0.9F));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 0.9F), pos, 10, 0.2, 0.1);
			}
			case CRANVEL_ACTIVATE -> {
				EffectManager.add(MagicCircleEffect.ground(Anchor.follow(entity, pos), 3.3F, RAINBOW, true, 44));
				EffectManager.add(new PillarEffect(Anchor.follow(entity, pos), 1.15F, 4.8F, RAINBOW, true, 36));
				EffectManager.add(new DelayedEffect(16, new FlashEffect(Anchor.follow(entity, chest.add(0.0, 0.8, 0.0)), 2.6F, 0xFFFFFF, 10)));
				Particles.spiral(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 1.2F), pos, 1.8, 4.0, 60, 0.07);
				shake(pos, 0.35F, 14.0);
			}
			case CRANVEL_BURST -> {
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos.add(0.0, -1.0, 0.0)), power * 1.2F, RAINBOW, true, 20));
				EffectManager.add(new FlashEffect(Anchor.fixed(pos.add(0.0, 0.5, 0.0)), 2.3F, 0xFFFFFF, 10));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 1.3F), pos, 54, 0.42, 0.5);
				shake(pos, 0.7F, 18.0);
			}
			case CRANVEL_END -> {
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos), 2.2F, 0xF4EEFF, false, 16));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, RAINBOW, 0.9F), chest, 30, 0.05, 1.0);
			}
			case CUSHION -> {
				EffectManager.add(RingWaveEffect.ground(Anchor.fixed(pos), 1.2F + power * 0.4F, Spirit.ARO.accent, false, 10));
				Particles.ring(level, JuliusParticles.of(JuliusParticles.WIND_STREAK, Spirit.ARO.accent, 1.0F), pos.add(0.0, 0.2, 0.0), 0.3, 14, 0.35, 0.02);
				Particles.ring(level, JuliusParticles.of(JuliusParticles.LEAF, Spirit.ARO.color, 0.8F), pos.add(0.0, 0.3, 0.0), 0.4, 8, 0.12, 0.06);
			}
			case HIT_SPARK -> {
				EffectManager.add(new FlashEffect(Anchor.fixed(pos), 0.45F, color, 5));
				Particles.burst(level, JuliusParticles.of(JuliusParticles.GLOW_SPARK, color, 0.8F), pos, 7, 0.15, 0.2);
			}
		}
	}

	private static void shake(Vec3 source, float strength, double range) {
		LocalPlayer player = Minecraft.getInstance().player;
		if (player != null) {
			CameraShake.impulse(strength, source, player.getEyePosition(), range);
		}
	}
}
