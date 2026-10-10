package com.blademode.client.gore;

import com.blademode.geom.ConvexPart;
import com.blademode.geom.Plane;
import com.blademode.geom.Poly;
import com.blademode.gore.Cube;
import com.blademode.gore.Piece;
import java.util.List;
import org.joml.Vector3d;

/**
 * Drawable geometry of one piece in part space: its textured faces clipped by every cut, and
 * flesh-textured caps over the cuts. Quads, eight floats per vertex: x, y, z, u, v, nx, ny, nz.
 */
final class PieceMesh {
	/** Blocks the flesh texture spans on a cut face: 16 pixels per block, like the creatures themselves. */
	private static final double CAP_TEXTURE_SIZE = 1.0;

	final float[] faces;
	final int faceVertices;
	final float[] caps;
	final int capVertices;

	private PieceMesh(float[] faces, int faceVertices, float[] caps, int capVertices) {
		this.faces = faces;
		this.faceVertices = faceVertices;
		this.caps = caps;
		this.capVertices = capVertices;
	}

	static PieceMesh of(Piece piece) {
		if (piece.renderCache instanceof PieceMesh mesh) {
			return mesh;
		}
		Builder faces = new Builder();
		Builder caps = new Builder();
		List<Plane> planes = piece.planes;
		for (Cube cube : piece.cubes) {
			float[] f = cube.faces;
			int o = 0;
			while (o < f.length) {
				int count = (int) f[o];
				float nx = f[o + 1];
				float ny = f[o + 2];
				float nz = f[o + 3];
				o += 4;
				Poly poly = new Poly(5, count);
				for (int v = 0; v < count; v++) {
					poly.add(f[o], f[o + 1], f[o + 2], f[o + 3], f[o + 4]);
					o += 5;
				}
				Poly clipped = planes.isEmpty() ? poly : poly.clipAll(planes);
				if (clipped != null) {
					faces.fan(clipped, nx, ny, nz, null);
				}
			}
			// Only the creature's own body has an inside; armor and other layers are shells.
			if (!planes.isEmpty() && piece.isMain()) {
				ConvexPart solid = new ConvexPart(cube.x0, cube.y0, cube.z0, cube.x1, cube.y1, cube.z1, planes);
				for (ConvexPart.Face face : solid.faces) {
					if (face.isCap()) {
						Vector3d n = face.normal();
						caps.fan(face.poly(), (float) n.x, (float) n.y, (float) n.z, n);
					}
				}
			}
		}
		PieceMesh mesh = new PieceMesh(faces.data(), faces.vertices, caps.data(), caps.vertices);
		piece.renderCache = mesh;
		return mesh;
	}

	private static final class Builder {
		float[] data = new float[64];
		int size;
		int vertices;

		float[] data() {
			return java.util.Arrays.copyOf(this.data, this.size);
		}

		/**
		 * Splits a convex polygon into quads (the last one degenerate for odd counts). Polygons with
		 * a {@code capNormal} get flesh texture coordinates projected along that normal.
		 */
		void fan(Poly p, float nx, float ny, float nz, Vector3d capNormal) {
			if (p.count < 3) {
				return;
			}
			float[] us = new float[p.count];
			float[] vs = new float[p.count];
			if (capNormal != null) {
				// Flesh texture projected onto the cut, kept inside one tile of the texture.
				Vector3d a = Math.abs(capNormal.y) < 0.9 ? new Vector3d(0, 1, 0) : new Vector3d(1, 0, 0);
				Vector3d t1 = new Vector3d(capNormal).cross(a).normalize();
				Vector3d t2 = new Vector3d(capNormal).cross(t1).normalize();
				double minS = Double.MAX_VALUE, maxS = -Double.MAX_VALUE, minT = Double.MAX_VALUE, maxT = -Double.MAX_VALUE;
				double[] ss = new double[p.count];
				double[] ts = new double[p.count];
				for (int i = 0; i < p.count; i++) {
					ss[i] = p.x(i) * t1.x + p.y(i) * t1.y + p.z(i) * t1.z;
					ts[i] = p.x(i) * t2.x + p.y(i) * t2.y + p.z(i) * t2.z;
					minS = Math.min(minS, ss[i]);
					maxS = Math.max(maxS, ss[i]);
					minT = Math.min(minT, ts[i]);
					maxT = Math.max(maxT, ts[i]);
				}
				double tile = Math.max(CAP_TEXTURE_SIZE, Math.max(maxS - minS, maxT - minT));
				for (int i = 0; i < p.count; i++) {
					us[i] = (float) ((ss[i] - minS) / tile);
					vs[i] = (float) ((ts[i] - minT) / tile);
				}
			} else {
				for (int i = 0; i < p.count; i++) {
					us[i] = (float) p.get(i, 3);
					vs[i] = (float) p.get(i, 4);
				}
			}
			for (int i = 1; i + 1 < p.count; i += 2) {
				int c = Math.min(i + 2, p.count - 1);
				this.vertex(p, 0, nx, ny, nz, us, vs);
				this.vertex(p, i, nx, ny, nz, us, vs);
				this.vertex(p, i + 1, nx, ny, nz, us, vs);
				this.vertex(p, c, nx, ny, nz, us, vs);
			}
		}

		private void vertex(Poly p, int i, float nx, float ny, float nz, float[] us, float[] vs) {
			if (this.size + 8 > this.data.length) {
				this.data = java.util.Arrays.copyOf(this.data, this.data.length * 2);
			}
			double x = p.x(i);
			double y = p.y(i);
			double z = p.z(i);
			float u = us[i];
			float v = vs[i];
			this.data[this.size++] = (float) x;
			this.data[this.size++] = (float) y;
			this.data[this.size++] = (float) z;
			this.data[this.size++] = u;
			this.data[this.size++] = v;
			this.data[this.size++] = nx;
			this.data[this.size++] = ny;
			this.data[this.size++] = nz;
			this.vertices++;
		}
	}
}
