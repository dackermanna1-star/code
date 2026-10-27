package dev.visceral.client.anim;

import org.joml.Vector3f;

/**
 * Damped angular spring (three independent axes, degrees) for secondary motion: flinches,
 * landing compression, weapon recoil. Integrated with semi-implicit Euler at frame rate.
 */
public final class Spring3 {
	public final Vector3f value = new Vector3f();
	public final Vector3f velocity = new Vector3f();
	public float stiffness;
	public float damping;
	public float limit = 80f;

	public Spring3(float stiffness, float dampingRatio) {
		this.stiffness = stiffness;
		this.damping = 2f * dampingRatio * (float) Math.sqrt(stiffness);
	}

	public void kick(float x, float y, float z) {
		velocity.add(x, y, z);
	}

	public void update(float dt) {
		// Sub-step for stability at low frame rates.
		int steps = Math.max(1, (int) Math.ceil(dt / (1f / 120f)));
		float h = dt / steps;
		for (int i = 0; i < steps; i++) {
			velocity.x += (-stiffness * value.x - damping * velocity.x) * h;
			velocity.y += (-stiffness * value.y - damping * velocity.y) * h;
			velocity.z += (-stiffness * value.z - damping * velocity.z) * h;
			value.fma(h, velocity);
		}
		value.x = clamp(value.x);
		value.y = clamp(value.y);
		value.z = clamp(value.z);
	}

	private float clamp(float v) {
		return Math.max(-limit, Math.min(limit, v));
	}

	public void reset() {
		value.zero();
		velocity.zero();
	}
}
