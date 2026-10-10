package com.blademode.geom;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.phys.AABB;
import org.joml.Vector3d;

/**
 * Geometry of one (possibly cut) block in its local [0,1]^3 frame: the union of the block's
 * shape boxes, each intersected with the block's cut planes.
 */
public final class PartShape {
	public static final PartShape EMPTY = new PartShape(List.of(), List.of());

	public final List<ConvexPart> parts;
	public final List<Plane> planes;
	public final double volume;
	public final Vector3d centroid;
	/** Volume of the uncut shape (used to compute the fraction that remains). */
	public final double fullVolume;

	public PartShape(List<AABB> boxes, List<Plane> planes) {
		this.planes = planes;
		List<ConvexPart> list = new ArrayList<>(boxes.size());
		double vol = 0;
		double full = 0;
		Vector3d c = new Vector3d();
		for (AABB box : boxes) {
			full += (box.maxX - box.minX) * (box.maxY - box.minY) * (box.maxZ - box.minZ);
			ConvexPart part = new ConvexPart(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ, planes);
			if (!part.isEmpty()) {
				list.add(part);
				vol += part.volume;
				c.fma(part.volume, part.centroid);
			}
		}
		this.parts = List.copyOf(list);
		this.volume = vol;
		this.fullVolume = full;
		this.centroid = vol > 1.0E-12 ? c.div(vol) : new Vector3d(0.5, 0.5, 0.5);
	}

	public boolean isEmpty() {
		return this.parts.isEmpty();
	}

	public boolean contains(double x, double y, double z, double margin) {
		for (ConvexPart part : this.parts) {
			if (part.contains(x, y, z, margin)) {
				return true;
			}
		}
		return false;
	}

	/** Fraction of the original block volume that this shape still has (0..1). */
	public double fraction() {
		return this.fullVolume > 1.0E-9 ? Math.min(1.0, this.volume / this.fullVolume) : 0.0;
	}

	/**
	 * Area of contact between this part's face in direction {@code dir} (a unit axis vector) and the
	 * opposite face of a neighbouring part located one block over in that direction.
	 */
	public double contactArea(int dx, int dy, int dz, PartShape other) {
		double total = 0;
		List<Plane> otherPlanes = new ArrayList<>(other.planes.size());
		for (Plane p : other.planes) {
			// other-local = this-local - dir
			otherPlanes.add(p.translated(-dx, -dy, -dz));
		}

		for (ConvexPart a : this.parts) {
			if (!touchesFace(a, dx, dy, dz, true)) {
				continue;
			}
			for (ConvexPart b : other.parts) {
				if (!touchesFace(b, dx, dy, dz, false)) {
					continue;
				}
				// Overlap rectangle on the shared face, in this part's local coordinates.
				double ax0 = Math.max(a.x0, b.x0 + dx), ax1 = Math.min(a.x1, b.x1 + dx);
				double ay0 = Math.max(a.y0, b.y0 + dy), ay1 = Math.min(a.y1, b.y1 + dy);
				double az0 = Math.max(a.z0, b.z0 + dz), az1 = Math.min(a.z1, b.z1 + dz);
				Poly rect;
				if (dx != 0) {
					double x = dx > 0 ? 1.0 : 0.0;
					if (ay1 - ay0 <= 1.0E-6 || az1 - az0 <= 1.0E-6) {
						continue;
					}
					rect = Poly.quad(x, ay0, az0, x, ay1, az0, x, ay1, az1, x, ay0, az1);
				} else if (dy != 0) {
					double y = dy > 0 ? 1.0 : 0.0;
					if (ax1 - ax0 <= 1.0E-6 || az1 - az0 <= 1.0E-6) {
						continue;
					}
					rect = Poly.quad(ax0, y, az0, ax1, y, az0, ax1, y, az1, ax0, y, az1);
				} else {
					double z = dz > 0 ? 1.0 : 0.0;
					if (ax1 - ax0 <= 1.0E-6 || ay1 - ay0 <= 1.0E-6) {
						continue;
					}
					rect = Poly.quad(ax0, ay0, z, ax1, ay0, z, ax1, ay1, z, ax0, ay1, z);
				}
				Poly clipped = rect.clipAll(this.planes);
				if (clipped != null) {
					clipped = clipped.clipAll(otherPlanes);
				}
				if (clipped != null) {
					total += clipped.area();
				}
			}
		}
		return total;
	}

	private static boolean touchesFace(ConvexPart p, int dx, int dy, int dz, boolean positiveSide) {
		final double e = 1.0E-6;
		if (positiveSide) {
			return dx > 0 ? p.x1 >= 1 - e : dx < 0 ? p.x0 <= e : dy > 0 ? p.y1 >= 1 - e : dy < 0 ? p.y0 <= e : dz > 0 ? p.z1 >= 1 - e : p.z0 <= e;
		}
		return dx > 0 ? p.x0 <= e : dx < 0 ? p.x1 >= 1 - e : dy > 0 ? p.y0 <= e : dy < 0 ? p.y1 >= 1 - e : dz > 0 ? p.z0 <= e : p.z1 >= 1 - e;
	}
}
