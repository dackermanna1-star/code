package dev.visceral.client.ragdoll;

import org.joml.Quaterniond;
import org.joml.Vector3d;

/**
 * Box shaped rigid body for the XPBD solver. Positions are absolute world coordinates (doubles),
 * velocities are in blocks per second.
 */
final class RigidBody {
	final String name;
	/** Centre of mass. */
	final Vector3d pos = new Vector3d();
	final Quaterniond rot = new Quaterniond();
	final Vector3d vel = new Vector3d();
	final Vector3d omega = new Vector3d();

	/** State at the start of the current substep. */
	final Vector3d prevPos = new Vector3d();
	final Quaterniond prevRot = new Quaterniond();
	/** State at the start of the current tick, for render interpolation. */
	final Vector3d tickPos = new Vector3d();
	final Quaterniond tickRot = new Quaterniond();

	/** Pose at death, used to turn the simulated pose into a rigid motion of the model part. */
	final Vector3d pos0 = new Vector3d();
	final Quaterniond rot0 = new Quaterniond();

	double invMass;
	double mass;
	/** Inverse inertia, diagonal in body space. */
	final Vector3d invInertia = new Vector3d();
	final Vector3d halfExtents = new Vector3d();
	/** Collision sample points relative to the centre of mass, body space. */
	final Vector3d[] samples;
	/** Spheres along the longest axis used for self collision: x, y, z (body space), radius. */
	final double[] spheres;
	final double boundingRadius;
	final double volume;

	private final Vector3d tmp = new Vector3d();
	private final Vector3d tmp2 = new Vector3d();

	RigidBody(String name, Vector3d center, Quaterniond rotation, Vector3d halfExtents, double density) {
		this.name = name;
		this.pos.set(center);
		this.rot.set(rotation).normalize();
		this.pos0.set(this.pos);
		this.rot0.set(this.rot);
		this.prevPos.set(this.pos);
		this.prevRot.set(this.rot);
		this.tickPos.set(this.pos);
		this.tickRot.set(this.rot);

		double hx = Math.max(0.02, halfExtents.x);
		double hy = Math.max(0.02, halfExtents.y);
		double hz = Math.max(0.02, halfExtents.z);
		this.halfExtents.set(hx, hy, hz);
		this.volume = 8.0 * hx * hy * hz;
		this.setMass(Math.max(this.volume * density, 1.0E-4));
		this.boundingRadius = Math.sqrt(hx * hx + hy * hy + hz * hz);
		this.samples = buildSamples(hx, hy, hz);
		this.spheres = buildSpheres(hx, hy, hz);
	}

	/** Sets the mass and the matching inertia of a solid box with this body's extents. */
	void setMass(double mass) {
		double hx = this.halfExtents.x;
		double hy = this.halfExtents.y;
		double hz = this.halfExtents.z;
		this.mass = mass;
		this.invMass = 1.0 / mass;
		// Clamped so very thin parts (skeleton limbs, wings) don't spin like propellers.
		double ix = mass / 3.0 * (hy * hy + hz * hz);
		double iy = mass / 3.0 * (hx * hx + hz * hz);
		double iz = mass / 3.0 * (hx * hx + hy * hy);
		double minInertia = mass * 0.004;
		this.invInertia.set(1.0 / Math.max(ix, minInertia), 1.0 / Math.max(iy, minInertia), 1.0 / Math.max(iz, minInertia));
	}

	private static Vector3d[] buildSamples(double hx, double hy, double hz) {
		java.util.List<Vector3d> points = new java.util.ArrayList<>();
		for (int i = 0; i < 8; i++) {
			points.add(new Vector3d((i & 1) == 0 ? -hx : hx, (i & 2) == 0 ? -hy : hy, (i & 4) == 0 ? -hz : hz));
		}
		points.add(new Vector3d(hx, 0, 0));
		points.add(new Vector3d(-hx, 0, 0));
		points.add(new Vector3d(0, hy, 0));
		points.add(new Vector3d(0, -hy, 0));
		points.add(new Vector3d(0, 0, hz));
		points.add(new Vector3d(0, 0, -hz));
		// Long parts get extra points along their edges so they rest on the ground properly.
		double max = Math.max(hx, Math.max(hy, hz));
		if (max > 0.2) {
			int axis = max == hx ? 0 : max == hy ? 1 : 2;
			double a = axis == 0 ? hy : hx;
			double b = axis == 2 ? hy : hz;
			for (int s1 = -1; s1 <= 1; s1 += 2) {
				for (int s2 = -1; s2 <= 1; s2 += 2) {
					double[] v = new double[3];
					v[axis] = 0.0;
					v[axis == 0 ? 1 : 0] = s1 * a;
					v[axis == 2 ? 1 : 2] = s2 * b;
					points.add(new Vector3d(v[0], v[1], v[2]));
				}
			}
		}
		return points.toArray(new Vector3d[0]);
	}

	private static double[] buildSpheres(double hx, double hy, double hz) {
		double max = Math.max(hx, Math.max(hy, hz));
		int axis = max == hx ? 0 : max == hy ? 1 : 2;
		double radius = Math.max(0.03, axis == 0 ? Math.min(hy, hz) : axis == 1 ? Math.min(hx, hz) : Math.min(hx, hy)) * 0.95;
		int count = max > radius * 2.5 ? 3 : 1;
		double[] result = new double[count * 4];
		for (int i = 0; i < count; i++) {
			double offset = count == 1 ? 0.0 : (i - 1) * (max - radius);
			result[i * 4] = axis == 0 ? offset : 0.0;
			result[i * 4 + 1] = axis == 1 ? offset : 0.0;
			result[i * 4 + 2] = axis == 2 ? offset : 0.0;
			result[i * 4 + 3] = count == 1 ? Math.min(radius, max) : radius;
		}
		return result;
	}

	/** {@code dest = R * diag(invInertia) * R^T * v}. */
	Vector3d applyInvInertia(Vector3d v, Vector3d dest) {
		this.rot.transformInverse(v, dest);
		dest.mul(this.invInertia);
		return this.rot.transform(dest);
	}

	/** Generalized inverse mass of a point at world offset {@code r} for a correction along unit {@code n}. */
	double generalizedInvMass(Vector3d r, Vector3d n) {
		r.cross(n, this.tmp);
		this.applyInvInertia(this.tmp, this.tmp2);
		return this.invMass + this.tmp.dot(this.tmp2);
	}

	/** Inverse mass for a pure rotation about unit axis {@code n}. */
	double angularInvMass(Vector3d n) {
		this.applyInvInertia(n, this.tmp2);
		return n.dot(this.tmp2);
	}

	/** Positional impulse {@code p} applied at world offset {@code r}. */
	void applyPositionImpulse(Vector3d p, Vector3d r, double sign) {
		this.pos.fma(sign * this.invMass, p);
		r.cross(p, this.tmp).mul(sign);
		this.applyInvInertia(this.tmp, this.tmp2);
		this.rotate(this.tmp2);
	}

	/** Rotation by the small rotation vector {@code w} (already multiplied by the inverse inertia). */
	void rotate(Vector3d w) {
		// q += 0.5 * [w, 0] * q
		Quaterniond q = this.rot;
		double x = w.x * q.w + w.y * q.z - w.z * q.y;
		double y = -w.x * q.z + w.y * q.w + w.z * q.x;
		double z = w.x * q.y - w.y * q.x + w.z * q.w;
		double s = -w.x * q.x - w.y * q.y - w.z * q.z;
		q.x += 0.5 * x;
		q.y += 0.5 * y;
		q.z += 0.5 * z;
		q.w += 0.5 * s;
		q.normalize();
	}

	void applyVelocityImpulse(Vector3d impulse, Vector3d r) {
		this.vel.fma(this.invMass, impulse);
		r.cross(impulse, this.tmp);
		this.applyInvInertia(this.tmp, this.tmp2);
		this.omega.add(this.tmp2);
	}

	/** Velocity of the material point at world offset {@code r}. */
	Vector3d pointVelocity(Vector3d r, Vector3d dest) {
		this.omega.cross(r, dest);
		return dest.add(this.vel);
	}

	Vector3d worldPoint(Vector3d local, Vector3d dest) {
		return this.rot.transform(local, dest).add(this.pos);
	}

	Vector3d prevWorldPoint(Vector3d local, Vector3d dest) {
		return this.prevRot.transform(local, dest).add(this.prevPos);
	}

	/** Distance from a world point to this body's box (0 inside). */
	double distanceTo(Vector3d world) {
		Vector3d local = this.rot.transformInverse(new Vector3d(world).sub(this.pos));
		double dx = Math.max(Math.abs(local.x) - this.halfExtents.x, 0.0);
		double dy = Math.max(Math.abs(local.y) - this.halfExtents.y, 0.0);
		double dz = Math.max(Math.abs(local.z) - this.halfExtents.z, 0.0);
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	/** Closest point of this body's box to a world point. */
	Vector3d closestPoint(Vector3d world) {
		Vector3d local = this.rot.transformInverse(new Vector3d(world).sub(this.pos));
		local.set(
			Math.max(-this.halfExtents.x, Math.min(this.halfExtents.x, local.x)),
			Math.max(-this.halfExtents.y, Math.min(this.halfExtents.y, local.y)),
			Math.max(-this.halfExtents.z, Math.min(this.halfExtents.z, local.z))
		);
		return this.rot.transform(local).add(this.pos);
	}
}
