package dev.visceral.client.physics;

import dev.visceral.client.config.ClientConfig;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.world.phys.Vec3;

/**
 * Steps every active ragdoll once per rendered frame (fixed 60 Hz internally). Distant or
 * long-settled ragdolls sleep to keep the cost bounded.
 */
public final class RagdollManager {
	private static final List<HumanoidRagdoll> ACTIVE = new ArrayList<>();
	private static final Map<HumanoidRagdoll, Double> ALPHA = new IdentityHashMap<>();
	private static long lastNanos = -1;
	public static int steppedLastFrame;

	private RagdollManager() {
	}

	public static boolean canAdd() {
		return ACTIVE.size() < ClientConfig.get().maxActiveRagdolls + 8;
	}

	public static void add(HumanoidRagdoll r) {
		ACTIVE.add(r);
		int max = ClientConfig.get().maxActiveRagdolls;
		// Over budget: put the oldest settled ones to sleep.
		for (int i = 0; i < ACTIVE.size() && countAwake() > max; i++) ACTIVE.get(i).asleep = true;
	}

	public static void remove(HumanoidRagdoll r) {
		ACTIVE.remove(r);
		ALPHA.remove(r);
	}

	private static int countAwake() {
		int n = 0;
		for (HumanoidRagdoll r : ACTIVE) if (!r.asleep) n++;
		return n;
	}

	public static double alpha(HumanoidRagdoll r) {
		Double a = ALPHA.get(r);
		return a == null ? 1.0 : a;
	}

	public static int count() {
		return ACTIVE.size();
	}

	public static void clear() {
		ACTIVE.clear();
		ALPHA.clear();
		lastNanos = -1;
	}

	/** Called once per frame before entities are extracted for rendering. */
	public static void stepAll() {
		Minecraft mc = Minecraft.getInstance();
		long now = System.nanoTime();
		double dt = lastNanos < 0 ? 0 : Math.min(0.1, (now - lastNanos) / 1e9);
		lastNanos = now;
		if (mc.level == null || mc.isPaused()) return;
		Vec3 cam = mc.gameRenderer.getMainCamera().position();
		double maxDist = ClientConfig.get().ragdollDistance;
		steppedLastFrame = 0;
		for (HumanoidRagdoll r : ACTIVE) {
			double dx = r.torso().pos.x - cam.x, dy = r.torso().pos.y - cam.y, dz = r.torso().pos.z - cam.z;
			boolean far = dx * dx + dy * dy + dz * dz > maxDist * maxDist;
			if (r.behaviour == HumanoidRagdoll.Behaviour.LIMP && r.restingSteps > 120) r.asleep = true;
			if (r.asleep || far) {
				ALPHA.put(r, 1.0);
				continue;
			}
			ALPHA.put(r, r.advance(mc.level, dt));
			steppedLastFrame++;
		}
	}
}
