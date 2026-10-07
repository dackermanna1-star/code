package dev.visceral.client.ragdoll;

import org.joml.Quaterniond;
import org.joml.Vector3d;

/** Ball-and-socket joint with a cone limit on how far the child may rotate away from its rest pose. */
final class Joint {
	final RigidBody parent;
	final RigidBody child;
	final int parentIndex;
	final int childIndex;
	/** Anchor offsets from each centre of mass, in body space. */
	final Vector3d parentAnchor;
	final Vector3d childAnchor;
	/** parent^-1 * child at rest. */
	final Quaterniond restRelative;
	final double maxAngle;
	/** Velocity damping of relative rotation, per second: gives limbs a little muscle tone. */
	final double damping;

	private final Vector3d r1 = new Vector3d();
	private final Vector3d r2 = new Vector3d();
	private final Vector3d p1 = new Vector3d();
	private final Vector3d p2 = new Vector3d();
	private final Vector3d delta = new Vector3d();
	private final Vector3d impulse = new Vector3d();
	private final Quaterniond relative = new Quaterniond();
	private final Quaterniond deviation = new Quaterniond();
	private final Vector3d axis = new Vector3d();
	private final Vector3d w = new Vector3d();

	Joint(RigidBody parent, int parentIndex, RigidBody child, int childIndex, Vector3d worldAnchor, double maxAngle, double damping) {
		this.parent = parent;
		this.child = child;
		this.parentIndex = parentIndex;
		this.childIndex = childIndex;
		this.parentAnchor = parent.rot.transformInverse(new Vector3d(worldAnchor).sub(parent.pos));
		this.childAnchor = child.rot.transformInverse(new Vector3d(worldAnchor).sub(child.pos));
		this.restRelative = new Quaterniond(parent.rot).conjugate().mul(child.rot).normalize();
		this.maxAngle = maxAngle;
		this.damping = damping;
	}

	/** Pulls the two anchor points together. */
	void solvePosition() {
		this.parent.rot.transform(this.parentAnchor, this.r1);
		this.child.rot.transform(this.childAnchor, this.r2);
		this.p1.set(this.parent.pos).add(this.r1);
		this.p2.set(this.child.pos).add(this.r2);
		this.p2.sub(this.p1, this.delta);
		double c = this.delta.length();
		if (c < 1.0E-7) {
			return;
		}
		this.delta.div(c);
		double w1 = this.parent.generalizedInvMass(this.r1, this.delta);
		double w2 = this.child.generalizedInvMass(this.r2, this.delta);
		double lambda = c / (w1 + w2);
		this.impulse.set(this.delta).mul(lambda);
		this.parent.applyPositionImpulse(this.impulse, this.r1, 1.0);
		this.child.applyPositionImpulse(this.impulse, this.r2, -1.0);
	}

	/** Keeps the child within {@link #maxAngle} of its rest orientation relative to the parent. */
	void solveLimit() {
		this.relative.set(this.parent.rot).conjugate().mul(this.child.rot);
		this.deviation.set(this.restRelative).conjugate().mul(this.relative);
		if (this.deviation.w < 0.0) {
			this.deviation.set(-this.deviation.x, -this.deviation.y, -this.deviation.z, -this.deviation.w);
		}
		double angle = 2.0 * Math.acos(Math.min(1.0, this.deviation.w));
		if (angle <= this.maxAngle) {
			return;
		}
		this.axis.set(this.deviation.x, this.deviation.y, this.deviation.z);
		double length = this.axis.length();
		if (length < 1.0E-9) {
			return;
		}
		this.axis.div(length);
		this.child.rot.transform(this.axis);
		double correction = angle - this.maxAngle;
		double w1 = this.parent.angularInvMass(this.axis);
		double w2 = this.child.angularInvMass(this.axis);
		double lambda = correction / (w1 + w2);
		this.w.set(this.axis).mul(lambda);
		this.parent.applyInvInertia(this.w, this.impulse);
		this.parent.rotate(this.impulse);
		this.w.set(this.axis).mul(-lambda);
		this.child.applyInvInertia(this.w, this.impulse);
		this.child.rotate(this.impulse);
	}

	/** Damps the relative angular velocity. */
	void solveVelocity(double h) {
		this.delta.set(this.child.omega).sub(this.parent.omega);
		double speed = this.delta.length();
		if (speed < 1.0E-6) {
			return;
		}
		double reduce = Math.min(1.0, this.damping * h);
		this.axis.set(this.delta).div(speed);
		double w1 = this.parent.angularInvMass(this.axis);
		double w2 = this.child.angularInvMass(this.axis);
		double lambda = speed * reduce / (w1 + w2);
		this.w.set(this.axis).mul(lambda);
		this.parent.applyInvInertia(this.w, this.impulse);
		this.parent.omega.add(this.impulse);
		this.w.set(this.axis).mul(-lambda);
		this.child.applyInvInertia(this.w, this.impulse);
		this.child.omega.add(this.impulse);
	}
}
