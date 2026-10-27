package dev.visceral.client.anim;

import net.minecraft.util.Mth;

/**
 * Procedural gait for rigid-limbed humanoids.
 *
 * <p>The gait phase advances with distance actually travelled (stride length scales with leg
 * length and speed), so feet do not slide. Leg swing amplitude is solved from the stride so the
 * stance foot keeps pace with the ground: for a rigid leg of length L swinging ±A, the foot
 * covers 2·L·sin(A) per step. The pelvis drops as the legs spread (inverted pendulum walking) or
 * dips at mid-stance when running; swing-phase legs are retracted into the torso to fake knee
 * flexion for ground clearance.
 */
public final class Locomotion {
	public double phase;
	public float amplitude;
	public float walkWeight = 1f, runWeight, sprintWeight;
	public float hipYaw;
	private float smoothSpeed;

	/** Outputs (degrees / pixels / blocks). */
	public float rightLegSwing, leftLegSwing, swingDir;
	public float rightLift, leftLift;
	public float pelvisBob, pelvisSway;
	public float torsoTwist, torsoLean, torsoRoll;
	public float armSwingRight, armSwingLeft, armBase, armSpread;
	public float headBob;

	/**
	 * @param speed     horizontal speed, blocks/second
	 * @param moveAngle direction of travel relative to facing, degrees (0 forward, +90 right)
	 * @param legLen    leg length in blocks
	 * @param sprinting entity sprint flag
	 * @param crouching crouch flag
	 */
	public void update(float dt, float speed, float moveAngle, float legLen, boolean sprinting, boolean crouching, float limp) {
		smoothSpeed += (speed - smoothSpeed) * Math.min(1f, dt * 12f);
		float v = smoothSpeed;
		float sizeRef = Math.max(0.15f, legLen / 0.75f);
		float rel = v / sizeRef;
		runWeight = smoothstep(2.0f, 3.4f, rel);
		walkWeight = 1f - runWeight;
		float sprintTarget = sprinting ? Math.max(0.6f, smoothstep(4.6f, 6.0f, rel)) : smoothstep(5.0f, 6.5f, rel);
		sprintWeight += (sprintTarget - sprintWeight) * Math.min(1f, dt * 6f);

		float stride = legLen * (walkWeight * 2.1f + runWeight * (3.0f + sprintWeight * 1.0f));
		if (crouching) stride *= 0.7f;
		float ratio = Math.min(0.88f, stride / (4f * legLen));
		float ramp = smoothstep(0.05f, 0.9f, rel);
		amplitude = (float) Math.toDegrees(Math.asin(ratio)) * ramp;
		phase += v * dt / Math.max(0.2f, stride);
		phase -= Math.floor(phase);

		// Hips turn towards the direction of travel when strafing (up to 40 degrees).
		float a = Mth.wrapDegrees(moveAngle);
		float axis = Math.abs(a) > 90 ? Mth.wrapDegrees(a + 180) : a;
		float targetHip = ramp * Mth.clamp(axis, -40, 40);
		hipYaw += (targetHip - hipYaw) * Math.min(1f, dt * 8f);
		swingDir = Mth.wrapDegrees(a - hipYaw);

		double p = phase * Math.PI * 2;
		float s = (float) Math.sin(p), c = (float) Math.cos(p);
		// A limp shortens the injured stride and hurries through its stance.
		float limpR = Math.max(0, limp), limpL = Math.max(0, -limp);
		rightLegSwing = amplitude * s * (1 - limpR * 0.45f);
		leftLegSwing = -amplitude * s * (1 - limpL * 0.45f);
		float lift = walkWeight * 1.6f + runWeight * (3.0f + sprintWeight * 1.2f);
		rightLift = lift * Math.max(0, c) * ramp;
		leftLift = lift * Math.max(0, -c) * ramp;

		float theta = (float) Math.toRadians(Math.abs(rightLegSwing));
		float walkBob = legLen * ((float) Math.cos(theta) - 1f);
		float runBob = legLen * 0.075f * (Math.abs(s) - 0.65f);
		pelvisBob = (walkWeight * walkBob + runWeight * runBob) * ramp - Math.abs(limp) * 0.03f * Math.max(0, limp > 0 ? -c : c) * ramp;
		pelvisSway = 0.02f * legLen / 0.75f * (-c) * walkWeight * ramp;

		torsoTwist = (3.5f + 5f * runWeight + 3f * sprintWeight) * s * ramp;
		torsoLean = (2f * walkWeight + runWeight * (5f + 9f * sprintWeight)) * ramp;
		torsoRoll = 1.5f * (-c) * walkWeight * ramp;

		float armRatio = 0.65f * walkWeight + runWeight * (0.85f + 0.35f * sprintWeight);
		armSwingRight = Mth.clamp(rightLegSwing * armRatio, -75, 75);
		armSwingLeft = Mth.clamp(leftLegSwing * armRatio, -75, 75);
		armBase = -(runWeight * (12f + 10f * sprintWeight)) * ramp;
		armSpread = 3f + 4f * runWeight;
		headBob = runWeight * 1.8f * (float) Math.sin(p * 2) * ramp;
	}

	static float smoothstep(float a, float b, float x) {
		float t = Mth.clamp((x - a) / (b - a), 0, 1);
		return t * t * (3 - 2 * t);
	}
}
