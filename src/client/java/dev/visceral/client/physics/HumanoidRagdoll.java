package dev.visceral.client.physics;

import dev.visceral.client.anim.Bone;
import dev.visceral.client.anim.Rig;
import dev.visceral.client.config.ClientConfig;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import org.joml.Quaterniond;
import org.joml.Quaternionf;
import org.joml.Vector3d;
import org.joml.Vector3f;

/**
 * Six-body humanoid active ragdoll (torso, head, arms, legs) built from the live model's
 * geometry and its last rendered pose, so the hand-off from animation to physics is seamless.
 *
 * <p>Joint "muscles" are XPBD angular motors whose targets come from behaviours modelled on
 * natural protective reflexes: bracing for the ground in the direction of the fall, tucking the
 * chin, writhing and pushing up while downed, twitching out after death. Motor strength fades
 * as the body loses control, so heavy hits produce limp falls and light ones controlled ones.
 */
public final class HumanoidRagdoll extends Ragdoll {
	public enum Behaviour {
		LIMP,
		PROTECTIVE_FALL,
		WRITHE,
		DEATH_THROES
	}

	private static final int T = Bone.BODY.ordinal();
	private static final double[] MASS = {3.0, 12.0, 2.4, 2.4, 5.0, 5.0};

	public final RigidBody[] parts = new RigidBody[Bone.COUNT];
	public final Joint[] jointOf = new Joint[Bone.COUNT];
	public final Vector3d[] pivotLocal = new Vector3d[Bone.COUNT];
	public final float modelScale;
	public Behaviour behaviour = Behaviour.PROTECTIVE_FALL;
	public double behaviourTime;
	/** Overall muscle control (1 = conscious, 0 = unconscious), decays with impact force. */
	public double control = 1.0;
	/** Fall/push direction in world space (horizontal). */
	public final Vector3d fallDir = new Vector3d();
	/** 0..1 how close the server says we are to trying to get up (drives push-up attempts). */
	public double riseUrgency;
	/** Bone the entity is clutching (wounded region), or -1. */
	public int clutchBone = -1;
	public boolean asleep;
	private final RandomSource random = RandomSource.create();
	private final double phaseA = random.nextDouble() * 10, phaseB = random.nextDouble() * 10;
	private final Quaterniond qTmp = new Quaterniond();
	private final Vector3d vTmp = new Vector3d();

	private HumanoidRagdoll(float modelScale) {
		this.modelScale = modelScale;
	}

	/**
	 * Builds the ragdoll. Bone transforms are the rendered pivot positions (relative to
	 * {@code origin}) and orientations from the last frame.
	 */
	public static HumanoidRagdoll build(Rig rig, Vector3f[] bonePos, Quaternionf[] boneRot, Vector3d origin, float modelScale, Vector3d velocity) {
		ClientConfig cfg = ClientConfig.get();
		HumanoidRagdoll r = new HumanoidRagdoll(modelScale);
		r.gravity.set(0, -cfg.ragdollGravity, 0);
		r.substeps = cfg.ragdollSubsteps;
		double s = modelScale / 16.0;
		Vector3f c = new Vector3f(), h = new Vector3f();
		for (int i = 0; i < Bone.COUNT; i++) {
			rig.cubeCenter(i, c);
			rig.cubeHalf(i, h);
			RigidBody b = new RigidBody();
			double shrink = i == T ? 0.97 : 0.92;
			b.setBox(MASS[i], Math.max(0.03, h.x * s * shrink), Math.max(0.03, h.y * s * shrink), Math.max(0.03, h.z * s * shrink));
			b.rot.set(boneRot[i].x, boneRot[i].y, boneRot[i].z, boneRot[i].w).normalize();
			Vector3d centerOffset = new Vector3d(c.x * s, c.y * s, c.z * s);
			b.rot.transform(centerOffset);
			b.pos.set(origin).add(bonePos[i].x, bonePos[i].y, bonePos[i].z).add(centerOffset);
			b.vel.set(velocity);
			b.buildSamples(0.95, i == T);
			b.friction = i == T ? 0.85 : 0.75;
			r.pivotLocal[i] = new Vector3d(-c.x * s, -c.y * s, -c.z * s);
			b.prevPos.set(b.pos);
			b.prevRot.set(b.rot);
			b.stepStartPos.set(b.pos);
			b.stepStartRot.set(b.rot);
			r.parts[i] = b;
			r.bodies.add(b);
		}
		RigidBody torso = r.parts[T];
		Quaternionf restTorsoInv = new Quaternionf(rig.restRot[T]).conjugate();
		for (Bone bone : Bone.ALL) {
			int i = bone.ordinal();
			if (i == T) continue;
			RigidBody child = r.parts[i];
			Joint j = new Joint(torso, child);
			j.childAnchor.set(r.pivotLocal[i]);
			Vector3d pivotWorld = child.localToWorld(r.pivotLocal[i], new Vector3d());
			torso.rot.transformInverse(pivotWorld.sub(torso.pos), j.parentAnchor);
			Quaternionf rel = new Quaternionf(restTorsoInv).mul(rig.restRot[i]);
			j.restRelative.set(rel.x, rel.y, rel.z, rel.w);
			switch (bone) {
				case HEAD -> {
					j.childAxis.set(0, -1, 0);
					j.swing(-0.65, 0.9, -0.55, 0.55).twist(-1.1, 1.1);
				}
				case RIGHT_ARM -> j.swing(-3.0, 1.0, -0.35, 2.7).twist(-1.4, 1.4);
				case LEFT_ARM -> j.swing(-3.0, 1.0, -2.7, 0.35).twist(-1.4, 1.4);
				case RIGHT_LEG -> j.swing(-1.9, 0.45, -0.12, 0.8).twist(-0.5, 0.5);
				case LEFT_LEG -> j.swing(-1.9, 0.45, -0.8, 0.12).twist(-0.5, 0.5);
				default -> {
				}
			}
			j.damping = bone.isLeg() ? 6.0 : 4.0;
			r.jointOf[i] = j;
			r.joints.add(j);
		}

		// Self collision: legs against each other, arms against the torso halves and same-side leg.
		int[] cap = new int[Bone.COUNT];
		for (int i = 0; i < Bone.COUNT; i++) {
			if (i == T) continue;
			RigidBody b = r.parts[i];
			double rad = Math.min(b.halfExtents.x, b.halfExtents.z) * 0.9;
			double len = Math.max(0, b.halfExtents.y - rad);
			cap[i] = r.addCapsule(new Capsule(b, new Vector3d(0, -len, 0), new Vector3d(0, len, 0), rad));
		}
		double tx = torso.halfExtents.x * 0.5, ty = Math.max(0, torso.halfExtents.y - torso.halfExtents.z), tr = Math.min(torso.halfExtents.x * 0.5, torso.halfExtents.z);
		int torsoL = r.addCapsule(new Capsule(torso, new Vector3d(tx, -ty, 0), new Vector3d(tx, ty, 0), tr));
		int torsoR = r.addCapsule(new Capsule(torso, new Vector3d(-tx, -ty, 0), new Vector3d(-tx, ty, 0), tr));
		int ra = cap[Bone.RIGHT_ARM.ordinal()], la = cap[Bone.LEFT_ARM.ordinal()], rl = cap[Bone.RIGHT_LEG.ordinal()], ll = cap[Bone.LEFT_LEG.ordinal()];
		r.addSelfPair(rl, ll);
		r.addSelfPair(ra, torsoR);
		r.addSelfPair(ra, torsoL);
		r.addSelfPair(la, torsoL);
		r.addSelfPair(la, torsoR);
		r.addSelfPair(ra, rl);
		r.addSelfPair(la, ll);
		r.addSelfPair(ra, la);
		r.tetherBody = torso;
		return r;
	}

	public RigidBody torso() {
		return parts[T];
	}

	/** World position of a bone's pivot (interpolated). */
	public void bonePivot(int bone, double alpha, Vector3d outPos, Quaterniond outRot) {
		RigidBody b = parts[bone];
		b.interpolate(alpha, outPos, outRot);
		outRot.transform(pivotLocal[bone], vTmp);
		outPos.add(vTmp);
	}

	public boolean faceUp() {
		Vector3d fwd = torso().rot.transform(new Vector3d(0, 0, -1));
		return fwd.y > 0;
	}

	/** Head-to-feet axis of the torso, flattened (world). */
	public Vector3d bodyAxis(Vector3d out) {
		torso().rot.transform(out.set(0, 1, 0));
		out.y = 0;
		if (out.lengthSquared() < 1e-6) torso().rot.transform(out.set(0, 0, 1));
		out.y = 0;
		return out.normalize();
	}

	public void wake() {
		asleep = false;
		restingSteps = 0;
	}

	public void setBehaviour(Behaviour b) {
		if (behaviour != b) {
			behaviour = b;
			behaviourTime = 0;
		}
	}

	@Override
	protected void beforeStep(double dt) {
		behaviourTime += dt;
		ClientConfig cfg = ClientConfig.get();
		double muscle = cfg.activeRagdollBehaviours ? cfg.muscleStrength : 0;
		control = Math.min(1.0, control + dt * 0.12);
		switch (behaviour) {
			case LIMP -> setAll(0);
			case PROTECTIVE_FALL -> protectiveFall(muscle);
			case WRITHE -> writhe(muscle);
			case DEATH_THROES -> {
				double k = Math.max(0, 1 - behaviourTime / 1.1);
				if (k <= 0) {
					setBehaviour(Behaviour.LIMP);
					setAll(0);
					break;
				}
				for (Bone bone : Bone.ALL) {
					Joint j = jointOf[bone.ordinal()];
					if (j == null) continue;
					if (random.nextFloat() < 0.08f) {
						target(j, (random.nextDouble() - 0.5) * 1.4, (random.nextDouble() - 0.5) * 0.6, (random.nextDouble() - 0.5) * 0.8);
					}
					j.motorStrength = 0.12 * k * muscle;
				}
			}
		}
	}

	private void setAll(double strength) {
		for (Joint j : joints) j.motorStrength = strength;
	}

	private void target(Joint j, double x, double y, double z) {
		j.motorTarget.rotationZYX(z, y, x);
	}

	private void target(Bone bone, double x, double y, double z, double strength) {
		Joint j = jointOf[bone.ordinal()];
		if (j == null || j.broken) return;
		target(j, x, y, z);
		j.motorStrength = Math.max(0, strength);
	}

	/** Fall direction relative to the torso frame: +z = towards its back, +x = towards its left. */
	private Vector3d localFall(Vector3d out) {
		torso().rot.transformInverse(out.set(fallDir));
		return out;
	}

	private void protectiveFall(double muscle) {
		double t = behaviourTime;
		double fade = Math.max(0, 1 - t / 1.0);
		double s = (0.08 + 0.45 * Math.sqrt(fade)) * control * muscle;
		if (t > 1.4) {
			setBehaviour(Behaviour.WRITHE);
			return;
		}
		Vector3d d = localFall(vTmp);
		double back = d.z, left = d.x;
		// Arms: brace towards where the ground will come up.
		double armX = Mth.lerp(Mth.clamp((back + 1) * 0.5, 0, 1), -1.35, 0.55);
		double spread = 0.35 + Math.max(0, back) * 0.8;
		double leftReach = Math.max(0, left) * 1.1, rightReach = Math.max(0, -left) * 1.1;
		target(Bone.RIGHT_ARM, armX, 0, spread + rightReach, s);
		target(Bone.LEFT_ARM, armX, 0, -spread - leftReach, s);
		// Head: tuck the chin falling backwards, lift the face falling forwards.
		target(Bone.HEAD, back > 0 ? 0.75 : -0.55, 0, 0, s * 1.3);
		// Legs: hips flex (legs come up) going backwards, stay long going forwards.
		double legX = back > 0 ? -0.55 * back : 0.15;
		target(Bone.RIGHT_LEG, legX, 0, 0.1, s * 0.8);
		target(Bone.LEFT_LEG, legX * 0.85, 0, -0.1, s * 0.8);
	}

	private void writhe(double muscle) {
		double t = behaviourTime + phaseA;
		double base = (0.07 + 0.08 * control + 0.25 * riseUrgency) * muscle;
		double slow = Math.sin(t * 2.3) * 0.5 + 0.5;
		double alt = Math.sin(t * 1.7 + phaseB);
		// Legs drawing up and pushing out alternately.
		target(Bone.RIGHT_LEG, -0.2 - 0.7 * Math.max(0, alt), 0, 0.12, base);
		target(Bone.LEFT_LEG, -0.2 - 0.7 * Math.max(0, -alt), 0, -0.12, base);
		boolean faceDown = !faceUp();
		if (riseUrgency > 0.55) {
			// Trying to push up: hands planted under the shoulders.
			double push = faceDown ? -1.45 : 0.9;
			target(Bone.RIGHT_ARM, push, 0, 0.35, base * 1.6);
			target(Bone.LEFT_ARM, push, 0, -0.35, base * 1.6);
			target(Bone.HEAD, faceDown ? -0.6 : 0.6, 0, 0, base * 1.5);
		} else if (clutchBone >= 0) {
			// Clutch the wound.
			double armX = clutchBone == Bone.HEAD.ordinal() ? -2.4 : (clutchBone == Bone.BODY.ordinal() ? -1.0 : -0.6);
			target(Bone.RIGHT_ARM, armX, 0, -0.4 - 0.15 * slow, base * 1.2);
			target(Bone.LEFT_ARM, armX + 0.2, 0, 0.4 + 0.15 * slow, base * 1.2);
			target(Bone.HEAD, 0.4 * slow, 0.3 * alt, 0, base);
		} else {
			target(Bone.RIGHT_ARM, -0.5 - 0.5 * slow, 0, 0.3, base);
			target(Bone.LEFT_ARM, -0.3 - 0.5 * (1 - slow), 0, -0.3, base);
			target(Bone.HEAD, -0.3 * slow, 0.4 * alt, 0, base);
		}
	}

	/** Snaps a joint (dismemberment): the part becomes a free rigid body. */
	public void sever(int bone) {
		Joint j = jointOf[bone];
		if (j != null) j.broken = true;
	}

	public void applyHit(int bone, Vector3d impulse) {
		wake();
		RigidBody b = parts[Math.max(0, Math.min(Bone.COUNT - 1, bone))];
		b.applyImpulse(impulse, new Vector3d());
		// Big hits knock the fight out of the muscles for a while.
		control = Math.max(0, control - impulse.length() * 0.08);
	}
}
