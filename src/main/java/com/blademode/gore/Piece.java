package com.blademode.gore;

import com.blademode.geom.ConvexPart;
import com.blademode.geom.Poly;
import com.blademode.geom.Plane;
import java.util.ArrayList;
import java.util.List;
import org.joml.Matrix4d;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/**
 * The geometry of one model part riding on a body: its cubes in part space, the cuts made through
 * it, and where part space sat in the world when the owning body was last rebuilt.
 */
public final class Piece {
	/** Index of the model the part came from; 0 is the creature's own model, higher ones are layers (armor, wool...). */
	public final int layer;
	public final String path;
	/** Part space → world, relative to the corpse anchor, at the owning body's reference pose. */
	public final Matrix4d world0;
	public final List<Cube> cubes;
	/** Cuts through this part, in part space; the kept side is {@code n·p <= d}. */
	public final List<Plane> planes;
	/** Client side render data, rebuilt whenever the piece is replaced. */
	public @Nullable Object renderCache;

	public Piece(int layer, String path, Matrix4d world0, List<Cube> cubes, List<Plane> planes) {
		this.layer = layer;
		this.path = path;
		this.world0 = new Matrix4d(world0);
		this.cubes = List.copyOf(cubes);
		this.planes = List.copyOf(planes);
	}

	public boolean isMain() {
		return this.layer == 0;
	}

	public boolean isCut() {
		return !this.planes.isEmpty();
	}

	/** This piece with one more cut, given in world space relative to the anchor; null when nothing is left. */
	public @Nullable Piece cut(Plane anchorRelative) {
		Plane local = toPartSpace(anchorRelative, this.world0);
		if (local == null) {
			return this;
		}
		List<Plane> list = new ArrayList<>(this.planes.size() + 1);
		list.addAll(this.planes);
		list.add(local);
		Piece piece = new Piece(this.layer, this.path, this.world0, this.cubes, list);
		return piece.isEmpty() ? null : piece;
	}

	/** Same geometry with a different reference pose. */
	public Piece rebased(Matrix4d world) {
		return new Piece(this.layer, this.path, world, this.cubes, this.planes);
	}

	/** Expresses a plane given in world space (anchor relative) in this part's space. */
	static @Nullable Plane toPartSpace(Plane world, Matrix4d partToWorld) {
		// n·(A p + t) <= d  ⇔  (Aᵀ n)·p <= d − n·t
		double nx = world.nx(), ny = world.ny(), nz = world.nz();
		double ax = partToWorld.m00() * nx + partToWorld.m01() * ny + partToWorld.m02() * nz;
		double ay = partToWorld.m10() * nx + partToWorld.m11() * ny + partToWorld.m12() * nz;
		double az = partToWorld.m20() * nx + partToWorld.m21() * ny + partToWorld.m22() * nz;
		double len = Math.sqrt(ax * ax + ay * ay + az * az);
		if (len < 1.0E-12) {
			return null;
		}
		double d = world.d() - (nx * partToWorld.m30() + ny * partToWorld.m31() + nz * partToWorld.m32());
		return new Plane(ax / len, ay / len, az / len, d / len);
	}

	/** Volume factor of part space → world. */
	double scale() {
		return Math.abs(this.world0.determinant3x3());
	}

	/** Solid convex parts of every cube after the cuts. */
	public List<ConvexPart> solids() {
		List<ConvexPart> list = new ArrayList<>(this.cubes.size());
		for (Cube cube : this.cubes) {
			ConvexPart part = new ConvexPart(cube.x0, cube.y0, cube.z0, cube.x1, cube.y1, cube.z1, this.planes);
			if (!part.faces.isEmpty()) {
				list.add(part);
			}
		}
		return list;
	}

	public boolean isEmpty() {
		return this.solids().isEmpty();
	}

	/** World volume of the remaining geometry. */
	public double volume() {
		double v = 0;
		for (ConvexPart part : this.solids()) {
			v += part.volume;
		}
		return v * this.scale();
	}

	/** Corners of the remaining geometry, in world space relative to the anchor, appended to {@code out}. */
	public void points(List<Vector3d> out) {
		for (ConvexPart part : this.solids()) {
			for (ConvexPart.Face face : part.faces) {
				Poly p = face.poly();
				for (int i = 0; i < p.count; i++) {
					out.add(this.world0.transformPosition(new Vector3d(p.x(i), p.y(i), p.z(i))));
				}
			}
		}
	}

	/** Volumes (world) on the back ({@code n·p <= d}) and front side of a world plane, anchor relative. */
	double[] split(Plane anchorRelative) {
		Plane local = toPartSpace(anchorRelative, this.world0);
		if (local == null) {
			return new double[]{this.volume(), 0};
		}
		double back = 0;
		double front = 0;
		List<Plane> withBack = new ArrayList<>(this.planes);
		withBack.add(local);
		List<Plane> withFront = new ArrayList<>(this.planes);
		withFront.add(local.flip());
		for (Cube cube : this.cubes) {
			back += new ConvexPart(cube.x0, cube.y0, cube.z0, cube.x1, cube.y1, cube.z1, withBack).volume;
			front += new ConvexPart(cube.x0, cube.y0, cube.z0, cube.x1, cube.y1, cube.z1, withFront).volume;
		}
		double s = this.scale();
		return new double[]{back * s, front * s};
	}
}
