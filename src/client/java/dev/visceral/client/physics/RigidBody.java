package dev.visceral.client.physics;

import org.joml.Quaterniond;
import org.joml.Vector3d;

/**
 * A rigid box body for the XPBD solver (Müller et al., "Detailed Rigid Body Simulation with
 * Extended Position Based Dynamics", 2020). All quantities are in world space, blocks and seconds.
 * The orientation maps body-local vectors to world vectors.
 */
public final class RigidBody {
	public final Vector3d pos = new Vector3d();
	public final Quaterniond rot = new Quaterniond();
	public final Vector3d vel = new Vector3d();
	public final Vector3d angVel = new Vector3d();

	/** State at the start of the current substep (XPBD velocity derivation and friction). */
	final Vector3d prevPos = new Vector3d();
	final Quaterniond prevRot = new Quaterniond();

	/** State at the start/end of the last fixed step, used for render interpolation. */
	public final Vector3d stepStartPos = new Vector3d();
	public final Quaterniond stepStartRot = new Quaterniond();

	public final Vector3d halfExtents = new Vector3d();
	/** Diagonal inverse inertia tensor in body space. */
	public final Vector3d invInertia = new Vector3d();
	public double invMass;
	public double friction = 0.75;
	public double restitution = 0.08;
	public double linearDamping = 0.6;
	public double angularDamping = 1.2;
	public boolean collidesWithWorld = true;
	/** Local-space sample points used for world collision (box corners + extras). */
	public Vector3d[] samples = new Vector3d[0];
	/** Number of world contacts touching this body during the last step (used by behaviours). */
	public int contactCount;
	/** Deepest contact normal of the last step, valid when {@link #contactCount} > 0. */
	public final Vector3d lastContactNormal = new Vector3d();

	private final Vector3d tmpA = new Vector3d();
	private final Vector3d tmpB = new Vector3d();
	private final Quaterniond tmpQ = new Quaterniond();

	public RigidBody setBox(double mass, double hx, double hy, double hz) {
		halfExtents.set(hx, hy, hz);
		if (mass <= 0) {
			invMass = 0;
			invInertia.zero();
		} else {
			invMass = 1.0 / mass;
			double ix = mass * (4 * hy * hy + 4 * hz * hz) / 12.0;
			double iy = mass * (4 * hx * hx + 4 * hz * hz) / 12.0;
			double iz = mass * (4 * hx * hx + 4 * hy * hy) / 12.0;
			invInertia.set(1.0 / ix, 1.0 / iy, 1.0 / iz);
		}
		return this;
	}

	/** Uses the 8 box corners (slightly inset) plus face centres of the two large faces. */
	public void buildSamples(double inset, boolean extraFaceSamples) {
		double x = halfExtents.x * inset, y = halfExtents.y * inset, z = halfExtents.z * inset;
		int n = extraFaceSamples ? 8 + 6 : 8;
		samples = new Vector3d[n];
		int i = 0;
		for (int sx = -1; sx <= 1; sx += 2)
			for (int sy = -1; sy <= 1; sy += 2)
				for (int sz = -1; sz <= 1; sz += 2)
					samples[i++] = new Vector3d(sx * x, sy * y, sz * z);
		if (extraFaceSamples) {
			samples[i++] = new Vector3d(x, 0, 0);
			samples[i++] = new Vector3d(-x, 0, 0);
			samples[i++] = new Vector3d(0, y, 0);
			samples[i++] = new Vector3d(0, -y, 0);
			samples[i++] = new Vector3d(0, 0, z);
			samples[i] = new Vector3d(0, 0, -z);
		}
	}

	public boolean isStatic() {
		return invMass == 0;
	}

	/** World-space point of a local point. */
	public Vector3d localToWorld(Vector3d local, Vector3d out) {
		return rot.transform(local, out).add(pos);
	}

	/** World-space offset (not translated) of a local vector. */
	public Vector3d localToWorldDir(Vector3d local, Vector3d out) {
		return rot.transform(local, out);
	}

	/** Applies I^-1 (world) to a world vector. */
	public Vector3d applyInvInertia(Vector3d v, Vector3d out) {
		rot.transformInverse(v, out);
		out.mul(invInertia);
		return rot.transform(out);
	}

	/** Generalised inverse mass for a positional correction along {@code n} at world offset {@code r}. */
	public double positionalInvMass(Vector3d n, Vector3d r) {
		if (invMass == 0) return 0;
		Vector3d rn = r.cross(n, tmpA);
		rot.transformInverse(rn);
		double w = rn.x * rn.x * invInertia.x + rn.y * rn.y * invInertia.y + rn.z * rn.z * invInertia.z;
		return invMass + w;
	}

	/** Generalised inverse mass for a rotation about world axis {@code n}. */
	public double angularInvMass(Vector3d n) {
		if (invMass == 0) return 0;
		Vector3d l = rot.transformInverse(n, tmpA);
		return l.x * l.x * invInertia.x + l.y * l.y * invInertia.y + l.z * l.z * invInertia.z;
	}

	/** Applies a positional impulse {@code p} (world) at world offset {@code r} from the centre of mass. */
	public void applyPositionalCorrection(Vector3d p, Vector3d r, double sign) {
		if (invMass == 0) return;
		pos.fma(sign * invMass, p);
		Vector3d dw = r.cross(p, tmpB);
		applyInvInertia(dw, dw).mul(sign);
		rotateBy(dw, 1.0);
	}

	/** Applies an angular impulse {@code p} (world). */
	public void applyAngularCorrection(Vector3d p, double sign) {
		if (invMass == 0) return;
		Vector3d dw = applyInvInertia(p, tmpB).mul(sign);
		rotateBy(dw, 1.0);
	}

	/** q += 0.5 * [w, 0] * q * scale, then normalise. */
	void rotateBy(Vector3d w, double scale) {
		Quaterniond dq = tmpQ.set(w.x * scale, w.y * scale, w.z * scale, 0).mul(rot);
		rot.x += 0.5 * dq.x;
		rot.y += 0.5 * dq.y;
		rot.z += 0.5 * dq.z;
		rot.w += 0.5 * dq.w;
		rot.normalize();
	}

	/** Velocity of a world offset {@code r} from the centre of mass. */
	public Vector3d pointVelocity(Vector3d r, Vector3d out) {
		return angVel.cross(r, out).add(vel);
	}

	/** Applies a velocity-level impulse at world offset {@code r}. */
	public void applyImpulse(Vector3d p, Vector3d r) {
		if (invMass == 0) return;
		vel.fma(invMass, p);
		Vector3d t = r.cross(p, tmpB);
		applyInvInertia(t, t);
		angVel.add(t);
	}

	void integrate(double h, Vector3d gravity) {
		prevPos.set(pos);
		prevRot.set(rot);
		if (invMass == 0) return;
		vel.fma(h, gravity);
		double ld = Math.max(0, 1 - linearDamping * h);
		vel.mul(ld);
		double ad = Math.max(0, 1 - angularDamping * h);
		angVel.mul(ad);
		pos.fma(h, vel);
		rotateBy(angVel, h);
	}

	void updateVelocities(double h) {
		if (invMass == 0) return;
		vel.set(pos).sub(prevPos).div(h);
		Quaterniond dq = prevRot.invert(tmpQ).premul(rot);
		angVel.set(dq.x, dq.y, dq.z).mul(2.0 / h);
		if (dq.w < 0) angVel.negate();
	}

	public void beginStep() {
		stepStartPos.set(pos);
		stepStartRot.set(rot);
		contactCount = 0;
	}

	/** Interpolated render transform between the previous and current fixed step. */
	public void interpolate(double alpha, Vector3d outPos, Quaterniond outRot) {
		stepStartPos.lerp(pos, alpha, outPos);
		stepStartRot.slerp(rot, alpha, outRot);
	}

	public void translate(double dx, double dy, double dz) {
		pos.add(dx, dy, dz);
		prevPos.add(dx, dy, dz);
		stepStartPos.add(dx, dy, dz);
	}
}
