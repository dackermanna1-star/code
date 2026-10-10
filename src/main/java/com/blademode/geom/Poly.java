package com.blademode.geom;

import java.util.Arrays;
import org.joml.Vector3d;

/**
 * A convex planar polygon whose vertices carry {@code stride} doubles each. The first three
 * components are always x, y, z; any extra components (UVs, ...) are interpolated linearly
 * when the polygon is clipped.
 */
public final class Poly {
	public static final double EPS = 1.0E-9;

	public final int stride;
	public double[] v;
	public int count;

	public Poly(int stride, int capacity) {
		this.stride = stride;
		this.v = new double[Math.max(1, capacity) * stride];
	}

	public static Poly quad(double... xyz) {
		Poly p = new Poly(3, 4);
		for (int i = 0; i < 4; i++) {
			p.add(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]);
		}
		return p;
	}

	public void add(double... comps) {
		this.ensure(this.count + 1);
		System.arraycopy(comps, 0, this.v, this.count * this.stride, this.stride);
		this.count++;
	}

	private void addLerp(Poly src, int a, int b, double t) {
		this.ensure(this.count + 1);
		int o = this.count * this.stride;
		int oa = a * src.stride;
		int ob = b * src.stride;
		for (int k = 0; k < this.stride; k++) {
			this.v[o + k] = src.v[oa + k] + (src.v[ob + k] - src.v[oa + k]) * t;
		}
		this.count++;
	}

	private void addCopy(Poly src, int a) {
		this.ensure(this.count + 1);
		System.arraycopy(src.v, a * src.stride, this.v, this.count * this.stride, this.stride);
		this.count++;
	}

	private void ensure(int n) {
		if (n * this.stride > this.v.length) {
			this.v = Arrays.copyOf(this.v, Math.max(n * this.stride, this.v.length * 2));
		}
	}

	public double x(int i) {
		return this.v[i * this.stride];
	}

	public double y(int i) {
		return this.v[i * this.stride + 1];
	}

	public double z(int i) {
		return this.v[i * this.stride + 2];
	}

	public double get(int i, int comp) {
		return this.v[i * this.stride + comp];
	}

	/**
	 * Keeps the part of this polygon on the solid side of the plane (dist &lt;= 0).
	 * Returns {@code this} when nothing is clipped and {@code null} when nothing remains.
	 */
	public Poly clip(Plane plane) {
		if (this.count == 0) {
			return null;
		}

		double[] dist = new double[this.count];
		boolean anyOut = false;
		boolean anyIn = false;
		for (int i = 0; i < this.count; i++) {
			double d = plane.dist(this.x(i), this.y(i), this.z(i));
			dist[i] = d;
			if (d > EPS) {
				anyOut = true;
			} else {
				anyIn = true;
			}
		}

		if (!anyOut) {
			return this;
		}
		if (!anyIn) {
			return null;
		}

		Poly out = new Poly(this.stride, this.count + 2);
		for (int i = 0; i < this.count; i++) {
			int j = (i + 1) % this.count;
			double di = dist[i];
			double dj = dist[j];
			boolean inI = di <= EPS;
			boolean inJ = dj <= EPS;
			if (inI) {
				out.addCopy(this, i);
			}
			if (inI != inJ) {
				double t = di / (di - dj);
				out.addLerp(this, i, j, Math.min(1.0, Math.max(0.0, t)));
			}
		}

		out.removeDuplicates();
		return out.count >= 3 ? out : null;
	}

	/** Clips by each plane in turn; returns null if nothing remains. */
	public Poly clipAll(Iterable<Plane> planes) {
		Poly p = this;
		for (Plane plane : planes) {
			p = p.clip(plane);
			if (p == null) {
				return null;
			}
		}
		return p;
	}

	private void removeDuplicates() {
		if (this.count < 2) {
			return;
		}
		int w = 0;
		for (int i = 0; i < this.count; i++) {
			int prev = w == 0 ? -1 : w - 1;
			if (prev >= 0 && this.same(prev, i)) {
				continue;
			}
			if (w != i) {
				System.arraycopy(this.v, i * this.stride, this.v, w * this.stride, this.stride);
			}
			w++;
		}
		while (w > 1 && this.same(w - 1, 0)) {
			w--;
		}
		this.count = w;
	}

	private boolean same(int a, int b) {
		double dx = this.x(a) - this.x(b);
		double dy = this.y(a) - this.y(b);
		double dz = this.z(a) - this.z(b);
		return dx * dx + dy * dy + dz * dz < 1.0E-14;
	}

	/** Newell normal; its length equals twice the polygon area. */
	public Vector3d newell(Vector3d out) {
		double nx = 0;
		double ny = 0;
		double nz = 0;
		for (int i = 0; i < this.count; i++) {
			int j = (i + 1) % this.count;
			double xi = this.x(i);
			double yi = this.y(i);
			double zi = this.z(i);
			double xj = this.x(j);
			double yj = this.y(j);
			double zj = this.z(j);
			nx += (yi - yj) * (zi + zj);
			ny += (zi - zj) * (xi + xj);
			nz += (xi - xj) * (yi + yj);
		}
		return out.set(nx, ny, nz);
	}

	public double area() {
		return this.newell(new Vector3d()).length() * 0.5;
	}

	public Vector3d centroid(Vector3d out) {
		double x = 0;
		double y = 0;
		double z = 0;
		for (int i = 0; i < this.count; i++) {
			x += this.x(i);
			y += this.y(i);
			z += this.z(i);
		}
		return out.set(x / this.count, y / this.count, z / this.count);
	}

	public Poly copy() {
		Poly p = new Poly(this.stride, this.count);
		System.arraycopy(this.v, 0, p.v, 0, this.count * this.stride);
		p.count = this.count;
		return p;
	}
}
