package dev.visceral.client.physics;

import org.joml.Quaterniond;
import org.joml.Vector3d;

/**
 * Ball-and-socket joint with swing/twist limits and an optional angular motor ("muscle").
 *
 * <p>The joint frame is expressed in the parent's body space. {@link #restRelative} is the
 * child's orientation relative to the parent when the joint is at rest; {@link #childAxis} is the
 * child's long (twist) axis in child space. Swing limits are given as ranges of the swing
 * rotation vector's x and z components in the joint frame (radians), twist as a range about the
 * child axis.
 */
public final class Joint {
	public final RigidBody parent;
	public final RigidBody child;
	public final Vector3d parentAnchor = new Vector3d();
	public final Vector3d childAnchor = new Vector3d();
	public final Quaterniond restRelative = new Quaterniond();
	public final Vector3d childAxis = new Vector3d(0, 1, 0);
	public final Vector3d childRef = new Vector3d(1, 0, 0);

	public double swingMinX = -Math.PI, swingMaxX = Math.PI;
	public double swingMinZ = -Math.PI, swingMaxZ = Math.PI;
	public double twistMin = -Math.PI, twistMax = Math.PI;
	public boolean limitsEnabled = true;

	/** Motor target: child orientation relative to the parent joint frame. */
	public final Quaterniond motorTarget = new Quaterniond();
	/** 0 = limp, 1 = fully stiff. Converted to XPBD compliance. */
	public double motorStrength;
	/** Damping of the relative angular velocity (1/s). */
	public double damping = 4.0;
	public boolean broken;

	private final Vector3d wa = new Vector3d(), wb = new Vector3d(), ra = new Vector3d(), rb = new Vector3d();
	private final Vector3d n = new Vector3d(), tmp = new Vector3d(), tmp2 = new Vector3d();
	private final Quaterniond frame = new Quaterniond(), q = new Quaterniond();

	public Joint(RigidBody parent, RigidBody child) {
		this.parent = parent;
		this.child = child;
	}

	public Joint swing(double minX, double maxX, double minZ, double maxZ) {
		swingMinX = minX;
		swingMaxX = maxX;
		swingMinZ = minZ;
		swingMaxZ = maxZ;
		return this;
	}

	public Joint twist(double min, double max) {
		twistMin = min;
		twistMax = max;
		return this;
	}

	void solvePosition(double h) {
		if (broken) return;
		parent.rot.transform(parentAnchor, ra);
		child.rot.transform(childAnchor, rb);
		wa.set(parent.pos).add(ra);
		wb.set(child.pos).add(rb);
		n.set(wb).sub(wa);
		double c = n.length();
		if (c < 1e-9) return;
		n.div(c);
		double w = parent.positionalInvMass(n, ra) + child.positionalInvMass(n, rb);
		if (w <= 0) return;
		double lambda = -c / w;
		tmp.set(n).mul(lambda);
		child.applyPositionalCorrection(tmp, rb, 1);
		parent.applyPositionalCorrection(tmp, ra, -1);
	}

	/** World orientation of the joint frame (parent orientation * rest relative). */
	private Quaterniond jointFrame(Quaterniond out) {
		return out.set(parent.rot).mul(restRelative);
	}

	void solveAngular(double h) {
		if (broken) return;
		if (motorStrength > 0) solveMotor(h);
		if (limitsEnabled) {
			solveSwing();
			solveTwist();
		}
	}

	private void solveMotor(double h) {
		// Desired child orientation in world: frame * target.
		jointFrame(frame).mul(motorTarget);
		// Error rotation taking current child to target: target * child^-1.
		child.rot.invert(q).premul(frame);
		if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
		double sinHalf = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z);
		if (sinHalf < 1e-7) return;
		double angle = 2 * Math.atan2(sinHalf, q.w);
		n.set(q.x, q.y, q.z).div(sinHalf);
		double s = Math.min(motorStrength, 1.0);
		// Map strength to compliance: s=1 -> very stiff, s->0 -> very soft.
		double compliance = (1.0 - s) * (1.0 - s) * 0.08 / (s * s + 1e-4);
		applyRotation(n, angle, compliance / (h * h));
	}

	private void applyRotation(Vector3d axis, double angle, double alphaTilde) {
		double w = parent.angularInvMass(axis) + child.angularInvMass(axis);
		if (w + alphaTilde <= 0) return;
		double lambda = angle / (w + alphaTilde);
		tmp.set(axis).mul(lambda);
		child.applyAngularCorrection(tmp, 1);
		parent.applyAngularCorrection(tmp, -1);
	}

	private void solveSwing() {
		jointFrame(frame);
		// Child axis expressed in the joint frame.
		child.rot.transform(childAxis, tmp);
		frame.transformInverse(tmp);
		Vector3d rest = childAxis;
		// Swing rotation vector from rest axis to the current axis.
		tmp2.set(rest).cross(tmp);
		double sin = tmp2.length();
		double cos = rest.dot(tmp);
		double angle = Math.atan2(sin, cos);
		double sx, sz;
		if (sin < 1e-9) {
			sx = 0;
			sz = 0;
		} else {
			sx = tmp2.x / sin * angle;
			sz = tmp2.z / sin * angle;
		}
		double cx = clamp(sx, swingMinX, swingMaxX);
		double cz = clamp(sz, swingMinZ, swingMaxZ);
		if (cx == sx && cz == sz) return;
		// Target axis = rest axis rotated by the clamped swing vector.
		double ca = Math.sqrt(cx * cx + cz * cz);
		Vector3d target = n;
		if (ca < 1e-9) {
			target.set(rest);
		} else {
			q.setAngleAxis(ca, cx / ca, 0, cz / ca);
			q.transform(rest, target);
		}
		// Rotate the current axis onto the target: axis = current x target (joint frame).
		Vector3d corrAxis = tmp2.set(tmp).cross(target);
		double s = corrAxis.length();
		if (s < 1e-9) return;
		double corrAngle = Math.atan2(s, tmp.dot(target));
		corrAxis.div(s);
		frame.transform(corrAxis);
		applyRotation(corrAxis, corrAngle, 0);
	}

	private void solveTwist() {
		if (twistMin <= -Math.PI && twistMax >= Math.PI) return;
		jointFrame(frame);
		Vector3d axisP = frame.transform(childAxis, wa);
		Vector3d axisC = child.rot.transform(childAxis, wb);
		Vector3d nAxis = n.set(axisP).add(axisC);
		if (nAxis.lengthSquared() < 1e-9) return;
		nAxis.normalize();
		Vector3d refP = frame.transform(childRef, ra);
		Vector3d refC = child.rot.transform(childRef, rb);
		// Project onto the plane orthogonal to the average axis.
		refP.fma(-refP.dot(nAxis), nAxis);
		refC.fma(-refC.dot(nAxis), nAxis);
		if (refP.lengthSquared() < 1e-9 || refC.lengthSquared() < 1e-9) return;
		refP.normalize();
		refC.normalize();
		tmp.set(refP).cross(refC);
		double twist = Math.atan2(tmp.dot(nAxis), refP.dot(refC));
		double clamped = clamp(twist, twistMin, twistMax);
		if (clamped == twist) return;
		applyRotation(nAxis, clamped - twist, 0);
	}

	void dampVelocity(double h) {
		if (broken || damping <= 0) return;
		Vector3d rel = tmp.set(child.angVel).sub(parent.angVel);
		double k = Math.min(damping * h, 1.0);
		rel.mul(k);
		// Distribute by angular inverse mass along the relative axis.
		double len = rel.length();
		if (len < 1e-9) return;
		n.set(rel).div(len);
		double w1 = parent.angularInvMass(n), w2 = child.angularInvMass(n);
		double w = w1 + w2;
		if (w <= 0) return;
		double impulse = len / w;
		tmp2.set(n).mul(impulse);
		child.angVel.sub(child.applyInvInertia(tmp2, wa));
		parent.angVel.add(parent.applyInvInertia(tmp2, wb));
	}

	/** Current child orientation relative to the joint frame. */
	public Quaterniond relativeRotation(Quaterniond out) {
		jointFrame(out).conjugate();
		return out.mul(child.rot);
	}

	private static double clamp(double v, double lo, double hi) {
		return v < lo ? lo : (v > hi ? hi : v);
	}
}
