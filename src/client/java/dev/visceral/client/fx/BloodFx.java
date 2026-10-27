package dev.visceral.client.fx;

import dev.visceral.client.anim.Bone;
import dev.visceral.client.anim.EntityAnimator;
import dev.visceral.client.config.ClientConfig;
import dev.visceral.client.net.ClientNet;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.net.Payloads;
import dev.visceral.registry.VisceralRegistry;
import dev.visceral.state.BloodType;
import dev.visceral.state.Wound;
import dev.visceral.state.WoundList;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3d;

/**
 * Spawns blood (or bone fragments) for impacts, keeps wounds dripping while they bleed, grows
 * pools under bleeding bodies and makes severed stumps spurt. Amounts scale with damage and the
 * user's blood setting; every effect is local to the client.
 */
public final class BloodFx {
	private static final List<Emitter> EMITTERS = new ArrayList<>();
	private static final RandomSource RANDOM = RandomSource.create();
	private static int tick;

	private record Emitter(LivingEntity entity, int bone, int[] ticksLeft, float rate) {
	}

	private BloodFx() {
	}

	public static void onImpact(LivingEntity e, Payloads.Impact p) {
		ClientConfig cfg = ClientConfig.get();
		Minecraft mc = Minecraft.getInstance();
		ClientLevel level = mc.level;
		if (level == null || !cfg.blood || cfg.bloodAmount <= 0) return;
		BloodType type = BloodType.of(e);
		if (type == BloodType.NONE) return;
		Vec3 hit = new Vec3(p.x(), p.y(), p.z());
		Vec3 dir = new Vec3(p.dx(), p.dy(), p.dz());
		if (dir.lengthSqr() < 1e-4) dir = new Vec3(RANDOM.nextFloat() - 0.5, 0.3, RANDOM.nextFloat() - 0.5);
		dir = dir.normalize();
		float dmg = Math.max(0.5f, p.damage());
		boolean blunt = p.woundType() == 2;
		float amount = Mth.clamp(dmg * (blunt ? 1.0f : 2.2f), 2f, 28f) * cfg.bloodAmount;
		if (p.has(Payloads.Impact.FLAG_FATAL)) amount *= 1.4f;
		if (p.has(Payloads.Impact.FLAG_SLAM)) amount *= 0.5f;

		if (type == BloodType.BONE) {
			SpriteSet chips = BloodParticles.boneSprites;
			if (chips == null) return;
			int n = (int) Math.min(18, amount * 0.8f);
			for (int i = 0; i < n; i++) {
				Vec3 v = spray(dir, 0.6, 0.12 + RANDOM.nextFloat() * 0.18);
				mc.particleEngine.add(new BloodParticles.Chip(level, hit.x, hit.y, hit.z, v.x, v.y + 0.06, v.z, chips));
			}
			return;
		}
		SpriteSet drops = BloodParticles.dropSprites, mist = BloodParticles.mistSprites;
		if (drops == null || mist == null) return;
		float speed = 0.12f + Math.min(p.force(), 4f) * 0.05f;
		int n = (int) amount;
		for (int i = 0; i < n; i++) {
			// Exit spray continues along the blow; a little back-spatter towards the attacker.
			boolean back = RANDOM.nextFloat() < 0.15f;
			Vec3 v = spray(back ? dir.scale(-1) : dir, back ? 0.9 : 0.55, speed * (0.4 + RANDOM.nextFloat() * 0.9));
			mc.particleEngine.add(new BloodParticles.Drop(level, hit.x, hit.y, hit.z, v.x, v.y + 0.05, v.z, drops, type.r, type.g, type.b,
				RANDOM.nextFloat() < 0.6f, 0.25f + Math.min(dmg, 10) * 0.03f));
		}
		int puffs = blunt ? 1 : 2 + (int) Math.min(4, dmg / 3);
		for (int i = 0; i < puffs; i++) {
			Vec3 v = spray(dir, 0.4, 0.04 + RANDOM.nextFloat() * 0.05);
			mc.particleEngine.add(new BloodParticles.Mist(level, hit.x, hit.y, hit.z, v.x, v.y, v.z, mist, type.r * 0.9f, type.g, type.b,
				0.12f + Math.min(dmg, 12) * 0.012f));
		}
		if (p.has(Payloads.Impact.FLAG_SEVER) && Math.min(cfg.goreLevel, ClientNet.serverMaxGore) >= 2) {
			level.playLocalSound(p.x(), p.y(), p.z(), VisceralRegistry.GORE, e.getSoundSource(), 1f, 0.9f + RANDOM.nextFloat() * 0.2f, false);
			EMITTERS.add(new Emitter(e, Mth.clamp(p.region(), 0, 5), new int[] {40}, 1.0f));
		}
	}

	private static Vec3 spray(Vec3 dir, double spread, double speed) {
		Vec3 r = new Vec3(RANDOM.nextGaussian(), RANDOM.nextGaussian(), RANDOM.nextGaussian()).scale(spread);
		Vec3 v = dir.add(r);
		if (v.lengthSqr() < 1e-6) v = dir;
		return v.normalize().scale(speed);
	}

	/** Client tick: drips from bleeding wounds, pools under bleeding bodies, stump spurts. */
	public static void tick() {
		tick++;
		ClientConfig cfg = ClientConfig.get();
		Minecraft mc = Minecraft.getInstance();
		ClientLevel level = mc.level;
		if (level == null || mc.player == null || !cfg.blood) {
			EMITTERS.clear();
			return;
		}
		SpriteSet drops = BloodParticles.dropSprites;
		if (drops == null) return;
		Iterator<Emitter> it = EMITTERS.iterator();
		while (it.hasNext()) {
			Emitter em = it.next();
			if (--em.ticksLeft[0] <= 0 || em.entity.level() != level) {
				it.remove();
				continue;
			}
			EntityAnimator anim = EntityAnimator.get(em.entity);
			if (anim == null || !anim.haveBones) continue;
			BloodType type = BloodType.of(em.entity);
			Vector3d stump = anim.boneWorld(Bone.BODY.ordinal(), new Vector3d());
			if (em.bone != Bone.BODY.ordinal() && anim.ragdoll != null) {
				var parts = anim.ragdoll.parts;
				var torso = parts[Bone.BODY.ordinal()];
				var j = anim.ragdoll.jointOf[em.bone];
				if (j != null) torso.localToWorld(j.parentAnchor, stump);
			}
			float pulse = 0.5f + 0.5f * Mth.sin(em.ticksLeft[0] * 0.9f);
			int n = (int) (3 * pulse * em.rate * cfg.bloodAmount);
			for (int i = 0; i < n; i++) {
				Vec3 v = new Vec3(RANDOM.nextGaussian() * 0.06, 0.12 + RANDOM.nextFloat() * 0.1, RANDOM.nextGaussian() * 0.06);
				mc.particleEngine.add(new BloodParticles.Drop(level, stump.x, stump.y, stump.z, v.x, v.y, v.z, drops, type.r, type.g, type.b, true, 0.3f));
			}
		}
		if (tick % 3 != 0) return;
		long now = level.getGameTime();
		Vec3 cam = mc.gameRenderer.getMainCamera().position();
		for (Entity ent : level.entitiesForRendering()) {
			if (!(ent instanceof LivingEntity e) || ent.distanceToSqr(cam) > 32 * 32) continue;
			WoundList wounds = e.getAttached(VisceralRegistry.WOUNDS);
			if (wounds == null || wounds.isEmpty()) continue;
			BloodType type = BloodType.of(e);
			if (!type.isFluid()) continue;
			EntityAnimator anim = EntityAnimator.get(e);
			boolean down = VisceralEntity.state(e).grounded() || e.isDeadOrDying();
			for (Wound w : wounds.wounds()) {
				if (!w.isBleeding(now) && !(down && w.severity() > 0.5f && now - w.time() < 20 * 30)) continue;
				if (RANDOM.nextFloat() > 0.15f + w.severity() * 0.25f) continue;
				Vec3 at = woundPosition(e, anim, w);
				mc.particleEngine.add(new BloodParticles.Drop(level, at.x, at.y, at.z, RANDOM.nextGaussian() * 0.01, -0.02, RANDOM.nextGaussian() * 0.01,
					drops, type.r, type.g, type.b, true, 0.18f + w.severity() * 0.12f));
				if (down && cfg.bloodDecals && RANDOM.nextFloat() < 0.35f) {
					BloodDecals.pool(level, new Vec3(at.x, e.getY() + 0.3, at.z), 0.9f + w.severity() * 0.9f, type.r * 0.85f, type.g, type.b);
				}
			}
		}
	}

	private static Vec3 woundPosition(LivingEntity e, EntityAnimator anim, Wound w) {
		if (anim != null && anim.haveBones && System.nanoTime() - anim.boneFrameTime < 1_000_000_000L) {
			int bone = Bone.of(w.region()).ordinal();
			Vector3d p = anim.boneWorld(bone, new Vector3d());
			// Roughly the middle of the part along its length.
			org.joml.Vector3f mid = new org.joml.Vector3f(0, bone == Bone.HEAD.ordinal() ? -4f : 5f, 0).mul(anim.modelScale / 16f);
			anim.boneRot[bone].transform(mid);
			return new Vec3(p.x + mid.x, p.y + mid.y, p.z + mid.z);
		}
		double h = switch (w.region()) {
			case HEAD -> 0.88;
			case TORSO, RIGHT_ARM, LEFT_ARM -> 0.6;
			default -> 0.25;
		};
		return new Vec3(e.getX(), e.getY() + e.getBbHeight() * h, e.getZ());
	}

	public static void clear() {
		EMITTERS.clear();
	}
}
