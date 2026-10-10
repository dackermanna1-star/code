package com.blademode.geom;

import java.util.ArrayList;
import java.util.List;
import org.joml.Vector3d;

/**
 * An axis-aligned box intersected with a set of clipping half-spaces: a convex polyhedron.
 * Faces are stored as polygons wound counter-clockwise when seen from outside.
 */
public final class ConvexPart {
	/** Face index meaning "this face is a cut (cap) face". */
	public static final int CAP = -1;

	public final double x0, y0, z0, x1, y1, z1;
	public final List<Plane> planes;
	public final List<Face> faces = new ArrayList<>();
	public final double volume;
	public final Vector3d centroid;

	/**
	 * @param poly       face polygon (stride 3)
	 * @param normal     outward unit normal
	 * @param boxFace    0..5 = box face (D,U,N,S,W,E order of {@link #BOX_NORMALS}), {@link #CAP} for a cut face
	 * @param planeIndex index into {@link #planes} for cap faces, -1 otherwise
	 */
	public record Face(Poly poly, Vector3d normal, int boxFace, int planeIndex) {
		public boolean isCap() {
			return this.boxFace == CAP;
		}
	}

	/** Box face normals in Direction order: DOWN, UP, NORTH(-Z), SOUTH(+Z), WEST(-X), EAST(+X). */
	public static final int[][] BOX_NORMALS = {{0, -1, 0}, {0, 1, 0}, {0, 0, -1}, {0, 0, 1}, {-1, 0, 0}, {1, 0, 0}};

	public ConvexPart(double x0, double y0, double z0, double x1, double y1, double z1, List<Plane> planes) {
		this.x0 = x0;
		this.y0 = y0;
		this.z0 = z0;
		this.x1 = x1;
		this.y1 = y1;
		this.z1 = z1;
		// A plane listed twice would add its cap twice and corrupt the volume.
		planes = distinct(planes);
		this.planes = planes;

		for (int f = 0; f < 6; f++) {
			Poly face = boxFace(f, x0, y0, z0, x1, y1, z1).clipAll(planes);
			if (face != null && face.area() > 1.0E-9) {
				int[] n = BOX_NORMALS[f];
				this.faces.add(new Face(face, new Vector3d(n[0], n[1], n[2]), f, -1));
			}
		}

		List<Plane> boxPlanes = boxPlanes(x0, y0, z0, x1, y1, z1);
		for (int k = 0; k < planes.size(); k++) {
			Plane pk = planes.get(k);
			Poly cap = planeSquare(pk, (x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5, 4.0);
			cap = cap.clipAll(boxPlanes);
			if (cap == null) {
				continue;
			}
			for (int j = 0; j < planes.size() && cap != null; j++) {
				if (j != k) {
					cap = cap.clip(planes.get(j));
				}
			}
			if (cap != null && cap.area() > 1.0E-9) {
				this.faces.add(new Face(cap, new Vector3d(pk.nx(), pk.ny(), pk.nz()), CAP, k));
			}
		}

		// Volume and centroid by summing signed tetrahedra against an interior reference point.
		double rx = (x0 + x1) * 0.5;
		double ry = (y0 + y1) * 0.5;
		double rz = (z0 + z1) * 0.5;
		double vol = 0;
		double cx = 0;
		double cy = 0;
		double cz = 0;
		for (Face face : this.faces) {
			Poly p = face.poly;
			for (int i = 1; i + 1 < p.count; i++) {
				double ax = p.x(0) - rx, ay = p.y(0) - ry, az = p.z(0) - rz;
				double bx = p.x(i) - rx, by = p.y(i) - ry, bz = p.z(i) - rz;
				double qx = p.x(i + 1) - rx, qy = p.y(i + 1) - ry, qz = p.z(i + 1) - rz;
				double v = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6.0;
				vol += v;
				cx += v * (ax + bx + qx) / 4.0;
				cy += v * (ay + by + qy) / 4.0;
				cz += v * (az + bz + qz) / 4.0;
			}
		}

		if (vol > 1.0E-12) {
			this.volume = vol;
			this.centroid = new Vector3d(rx + cx / vol, ry + cy / vol, rz + cz / vol);
		} else {
			this.volume = 0;
			this.centroid = new Vector3d(rx, ry, rz);
		}
	}

	public boolean isEmpty() {
		return this.volume <= 1.0E-9;
	}

	/** Drops planes that repeat an earlier one (within numerical noise). */
	static List<Plane> distinct(List<Plane> planes) {
		if (planes.size() < 2) {
			return planes;
		}
		List<Plane> out = null;
		for (int i = 0; i < planes.size(); i++) {
			Plane p = planes.get(i);
			boolean repeat = false;
			for (int j = 0; j < i && !repeat; j++) {
				repeat = same(planes.get(j), p);
			}
			if (repeat && out == null) {
				out = new ArrayList<>(planes.subList(0, i));
			} else if (!repeat && out != null) {
				out.add(p);
			}
		}
		return out == null ? planes : List.copyOf(out);
	}

	private static boolean same(Plane a, Plane b) {
		final double e = 1.0E-7;
		return Math.abs(a.nx() - b.nx()) < e && Math.abs(a.ny() - b.ny()) < e && Math.abs(a.nz() - b.nz()) < e && Math.abs(a.d() - b.d()) < e;
	}

	/** True if the point lies inside (with an optional inward margin). */
	public boolean contains(double x, double y, double z, double margin) {
		if (x < this.x0 + margin || x > this.x1 - margin || y < this.y0 + margin || y > this.y1 - margin || z < this.z0 + margin || z > this.z1 - margin) {
			return false;
		}
		for (Plane p : this.planes) {
			if (p.dist(x, y, z) > -margin) {
				return false;
			}
		}
		return true;
	}

	public static Poly boxFace(int f, double x0, double y0, double z0, double x1, double y1, double z1) {
		return switch (f) {
			case 0 -> Poly.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1);
			case 1 -> Poly.quad(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0);
			case 2 -> Poly.quad(x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0);
			case 3 -> Poly.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1);
			case 4 -> Poly.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0);
			case 5 -> Poly.quad(x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1);
			default -> throw new IllegalArgumentException("face " + f);
		};
	}

	public static List<Plane> boxPlanes(double x0, double y0, double z0, double x1, double y1, double z1) {
		return List.of(
			new Plane(0, -1, 0, -y0),
			new Plane(0, 1, 0, y1),
			new Plane(0, 0, -1, -z0),
			new Plane(0, 0, 1, z1),
			new Plane(-1, 0, 0, -x0),
			new Plane(1, 0, 0, x1));
	}

	/** A large square lying in the plane, wound counter-clockwise around the plane normal. */
	public static Poly planeSquare(Plane plane, double cx, double cy, double cz, double halfSize) {
		Vector3d n = new Vector3d(plane.nx(), plane.ny(), plane.nz());
		double dist = plane.dist(cx, cy, cz);
		Vector3d c = new Vector3d(cx - n.x * dist, cy - n.y * dist, cz - n.z * dist);
		Vector3d t1 = tangent(n);
		Vector3d t2 = new Vector3d(n).cross(t1);
		Poly p = new Poly(3, 4);
		double s = halfSize;
		p.add(c.x - t1.x * s - t2.x * s, c.y - t1.y * s - t2.y * s, c.z - t1.z * s - t2.z * s);
		p.add(c.x + t1.x * s - t2.x * s, c.y + t1.y * s - t2.y * s, c.z + t1.z * s - t2.z * s);
		p.add(c.x + t1.x * s + t2.x * s, c.y + t1.y * s + t2.y * s, c.z + t1.z * s + t2.z * s);
		p.add(c.x - t1.x * s + t2.x * s, c.y - t1.y * s + t2.y * s, c.z - t1.z * s + t2.z * s);
		return p;
	}

	/** A unit vector perpendicular to n. */
	public static Vector3d tangent(Vector3d n) {
		double ax = Math.abs(n.x);
		double ay = Math.abs(n.y);
		double az = Math.abs(n.z);
		Vector3d a;
		if (ax <= ay && ax <= az) {
			a = new Vector3d(1, 0, 0);
		} else if (ay <= az) {
			a = new Vector3d(0, 1, 0);
		} else {
			a = new Vector3d(0, 0, 1);
		}
		return n.cross(a, new Vector3d()).normalize();
	}
}
