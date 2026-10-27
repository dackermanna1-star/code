package dev.visceral.client.render;

import dev.visceral.client.anim.EntityAnimator;
import dev.visceral.client.config.ClientConfig;
import dev.visceral.client.physics.HumanoidRagdoll;
import dev.visceral.client.physics.RagdollManager;
import dev.visceral.client.physics.RigidBody;
import java.util.ArrayDeque;
import java.util.Iterator;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.LivingEntity;

/**
 * Keeps dead ragdolls around after the server removes the entity, rendering them through the
 * normal entity pipeline. Corpses settle, then sink into the ground and disappear.
 */
public final class CorpseManager {
	private static final ArrayDeque<Corpse> CORPSES = new ArrayDeque<>();

	private record Corpse(LivingEntity entity, EntityAnimator animator, long adoptedAt) {
	}

	private CorpseManager() {
	}

	/** Called when a client entity is unloaded/removed. */
	public static void onRemoved(LivingEntity entity) {
		EntityAnimator anim = EntityAnimator.get(entity);
		if (anim == null) return;
		ClientConfig cfg = ClientConfig.get();
		if (anim.isDead() && anim.ragdoll != null && cfg.corpseSeconds > 0 && cfg.maxCorpses > 0 && entity.isDeadOrDying()) {
			CORPSES.addLast(new Corpse(entity, anim, System.currentTimeMillis()));
			while (CORPSES.size() > cfg.maxCorpses) CORPSES.removeFirst().animator.dropRagdoll();
		} else {
			anim.dropRagdoll();
		}
	}

	public static int count() {
		return CORPSES.size();
	}

	public static void clear() {
		for (Corpse c : CORPSES) c.animator.dropRagdoll();
		CORPSES.clear();
	}

	/** Client tick: expire and sink old corpses. */
	public static void tick() {
		ClientConfig cfg = ClientConfig.get();
		long now = System.currentTimeMillis();
		long life = (long) (cfg.corpseSeconds * 1000);
		Iterator<Corpse> it = CORPSES.iterator();
		while (it.hasNext()) {
			Corpse c = it.next();
			HumanoidRagdoll r = c.animator.ragdoll;
			long age = now - c.adoptedAt;
			if (r == null || age > life + 2500 || c.entity.level() != Minecraft.getInstance().level) {
				c.animator.dropRagdoll();
				it.remove();
				continue;
			}
			if (age > life) {
				// Sink into the ground over the last few seconds.
				r.wake();
				for (RigidBody b : r.bodies) {
					b.collidesWithWorld = false;
					b.vel.set(0, -0.12, 0);
					b.angVel.zero();
				}
				r.gravity.set(0, 0, 0);
				r.tetherEnabled = false;
			}
		}
	}

	/** Adds corpse render states during world entity extraction. */
	public static void extract(List<EntityRenderState> states, float partialTick) {
		if (CORPSES.isEmpty()) return;
		Minecraft mc = Minecraft.getInstance();
		for (Corpse c : CORPSES) {
			if (c.animator.ragdoll == null) continue;
			try {
				states.add(mc.getEntityRenderDispatcher().extractEntity(c.entity, partialTick));
			} catch (RuntimeException e) {
				c.animator.dropRagdoll();
			}
		}
	}

	public static boolean isCorpse(LivingEntity e) {
		for (Corpse c : CORPSES) if (c.entity == e) return true;
		return false;
	}

	static int activeRagdolls() {
		return RagdollManager.count();
	}
}
