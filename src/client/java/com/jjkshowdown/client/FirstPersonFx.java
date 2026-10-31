package com.jjkshowdown.client;

import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.util.ParticleDensity;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/**
 * What you see of your own techniques in first person: energy gathering in your hands while charging —
 * Blue in the right hand, Red at the fingertip, Blue and Red converging into Purple, Fuga's flame, the World Slash glint.
 */
public final class FirstPersonFx {
	private FirstPersonFx() {
	}

	public static void tick(Minecraft mc) {
		if (mc.player == null || mc.level == null || !mc.options.getCameraType().isFirstPerson()) return;
		Payloads.SorcererSync s = ClientState.self;
		if (s == null || s.chargeSlot() < 0) return;
		CharacterType c = ClientState.character();
		Camera cam = mc.gameRenderer.getMainCamera();
		Vec3 eye = cam.position();
		Vec3 look = Vec3.directionFromRotation(cam.xRot(), cam.yRot());
		Vec3 right = look.cross(new Vec3(0, 1, 0));
		right = right.lengthSqr() < 1.0E-4 ? new Vec3(1, 0, 0) : right.normalize();
		Vec3 up = right.cross(look).normalize();
		float f = s.maxCharge() > 0 ? Mth.clamp(s.chargeTicks() / (float) s.maxCharge(), 0f, 1f) : 0f;
		Vec3 rightHand = eye.add(look.scale(0.9)).add(right.scale(0.38)).add(up.scale(-0.28));
		Vec3 leftHand = eye.add(look.scale(0.9)).add(right.scale(-0.38)).add(up.scale(-0.28));
		Vec3 centre = eye.add(look.scale(1.1)).add(up.scale(-0.18));
		AbilitySlot slot = AbilitySlot.byOrdinal(s.chargeSlot());
		if (c == CharacterType.GOJO) {
			switch (slot) {
				case PRIMARY -> swirl(mc, ModParticles.BLUE_SPARK, rightHand, 0.12 + f * 0.12, 3);
				case SECONDARY -> swirl(mc, ModParticles.RED_SPARK, rightHand, 0.08 + f * 0.06, 3);
				case ULTIMATE -> {
					float conv = Mth.clamp(s.chargeTicks() / 40f, 0f, 1f);
					swirl(mc, ModParticles.BLUE_SPARK, leftHand.lerp(centre, conv), 0.12, 3);
					swirl(mc, ModParticles.RED_SPARK, rightHand.lerp(centre, conv), 0.12, 3);
					if (conv >= 1f) swirl(mc, ModParticles.PURPLE_SPARK, centre, 0.22, 5);
				}
				default -> {
				}
			}
		} else if (c == CharacterType.SUKUNA) {
			switch (slot) {
				case TERTIARY -> {
					swirl(mc, ModParticles.FUGA_FLAME, centre, 0.1 + f * 0.1, 3);
					swirl(mc, ParticleTypes.FLAME, centre, 0.15, 2);
				}
				case ULTIMATE -> swirl(mc, ModParticles.SLASH, eye.add(look.scale(1.4)).add(up.scale(0.55)).add(right.scale(0.3)), 0.1, 1);
				case SECONDARY -> swirl(mc, ModParticles.CE_WISP_RED, rightHand, 0.1, 2);
				default -> {
				}
			}
		}
	}

	private static void swirl(Minecraft mc, ParticleOptions p, Vec3 at, double radius, int count) {
		int n = ParticleDensity.scale(count);
		var rnd = mc.level.getRandom();
		for (int i = 0; i < n; i++) {
			double a = rnd.nextDouble() * Math.PI * 2;
			Vec3 pos = at.add(Math.cos(a) * radius, (rnd.nextDouble() - 0.5) * radius, Math.sin(a) * radius);
			Vec3 v = at.subtract(pos).scale(0.15);
			mc.level.addParticle(p, pos.x, pos.y, pos.z, v.x, v.y, v.z);
		}
	}
}
