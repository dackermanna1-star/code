package com.blademode.cut;

import com.blademode.geom.Plane;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3d;

/**
 * One blade stroke: the cut plane passes through the eye and the two view rays at the ends of the
 * line the player drew. Only the planar sector between those rays (up to {@code reach}) is cut.
 *
 * <p>World-space cut plane: {@code n.x <= d} is the "back" side, {@code n.x > d} the "front" side.
 */
public final class Slash {
	public final Vector3d eye;
	public final Vector3d r1;
	public final Vector3d r2;
	public final Vector3d n;
	public final double d;
	public final double reach;
	/** Unit vector in the plane, perpendicular to the bisector: the direction the blade travels. */
	private final Vector3d bisector;
	private final double cosHalfAngle;

	private Slash(Vector3d eye, Vector3d r1, Vector3d r2, Vector3d n, double reach) {
		this.eye = eye;
		this.r1 = r1;
		this.r2 = r2;
		this.n = n;
		this.d = n.dot(eye);
		this.reach = reach;
		this.bisector = new Vector3d(r1).add(r2).normalize();
		this.cosHalfAngle = this.bisector.dot(r1);
	}

	/** Returns null if the rays are (nearly) parallel or invalid. */
	public static Slash of(Vec3 eye, Vec3 dirA, Vec3 dirB, double reach) {
		Vector3d a = new Vector3d(dirA.x, dirA.y, dirA.z);
		Vector3d b = new Vector3d(dirB.x, dirB.y, dirB.z);
		if (!a.isFinite() || !b.isFinite() || a.lengthSquared() < 1.0E-8 || b.lengthSquared() < 1.0E-8) {
			return null;
		}
		a.normalize();
		b.normalize();
		Vector3d n = new Vector3d(a).cross(b);
		double len = n.length();
		// Rays must span a real angle (≈0.6°) and must not point in opposite directions.
		if (len < 0.01 || a.dot(b) < -0.7) {
			return null;
		}
		n.div(len);
		return new Slash(new Vector3d(eye.x, eye.y, eye.z), a, b, n, reach);
	}

	public Plane worldPlane() {
		return new Plane(this.n.x, this.n.y, this.n.z, this.d);
	}

	/** Signed distance from the plane (positive = front side). */
	public double dist(double x, double y, double z) {
		return this.n.x * x + this.n.y * y + this.n.z * z - this.d;
	}

	/**
	 * Whether a point (assumed close to the plane) lies inside the swept sector.
	 *
	 * @param margin extra distance allowed outside the sector edges and reach
	 */
	public boolean inSector(double x, double y, double z, double margin) {
		double vx = x - this.eye.x;
		double vy = y - this.eye.y;
		double vz = z - this.eye.z;
		double dn = vx * this.n.x + vy * this.n.y + vz * this.n.z;
		vx -= this.n.x * dn;
		vy -= this.n.y * dn;
		vz -= this.n.z * dn;
		double len = Math.sqrt(vx * vx + vy * vy + vz * vz);
		if (len > this.reach + margin || len < 0.25) {
			return false;
		}
		double cos = (vx * this.bisector.x + vy * this.bisector.y + vz * this.bisector.z) / len;
		if (cos >= this.cosHalfAngle) {
			return true;
		}
		if (margin <= 0) {
			return false;
		}
		// Distance from the point to the nearest edge ray.
		double e1 = distToRay(vx, vy, vz, this.r1);
		double e2 = distToRay(vx, vy, vz, this.r2);
		return Math.min(e1, e2) <= margin;
	}

	private static double distToRay(double vx, double vy, double vz, Vector3d r) {
		double t = Math.max(0, vx * r.x + vy * r.y + vz * r.z);
		double dx = vx - r.x * t;
		double dy = vy - r.y * t;
		double dz = vz - r.z * t;
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	/** Direction the blade edge travels at a given world point (from r1 towards r2), unit length. */
	public Vector3d bladeDirection(double x, double y, double z) {
		Vector3d radial = new Vector3d(x - this.eye.x, y - this.eye.y, z - this.eye.z);
		radial.fma(-radial.dot(this.n), this.n);
		if (radial.lengthSquared() < 1.0E-8) {
			radial.set(this.bisector);
		}
		return new Vector3d(this.n).cross(radial).normalize();
	}

	/** Bounding box of the sector. */
	public AABB bounds() {
		double minX = this.eye.x, minY = this.eye.y, minZ = this.eye.z;
		double maxX = minX, maxY = minY, maxZ = minZ;
		Vector3d tmp = new Vector3d();
		for (int i = 0; i <= 16; i++) {
			double t = i / 16.0;
			tmp.set(this.r1).mul(1 - t).fma(t, this.r2).normalize().mul(this.reach).add(this.eye);
			minX = Math.min(minX, tmp.x);
			minY = Math.min(minY, tmp.y);
			minZ = Math.min(minZ, tmp.z);
			maxX = Math.max(maxX, tmp.x);
			maxY = Math.max(maxY, tmp.y);
			maxZ = Math.max(maxZ, tmp.z);
		}
		return new AABB(minX, minY, minZ, maxX, maxY, maxZ);
	}
}
