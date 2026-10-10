package com.blademode.piece;

import com.blademode.geom.BlockGeometry;
import com.blademode.geom.ConvexPart;
import com.blademode.geom.PartShape;
import com.blademode.geom.Poly;
import it.unimi.dsi.fastutil.doubles.DoubleArrayList;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix3d;
import org.joml.Vector3d;

/**
 * Physical properties derived from a {@link PieceData}: mass, inertia, collision sample points and
 * a cell lookup table. All local coordinates are relative to the centre of mass ("body frame").
 */
public final class PieceBody {
	public final PieceData data;
	public final List<PieceBlock> blocks;
	public final PartShape[] shapes;
	public final double mass;
	public final double invMass;
	public final Matrix3d inertia = new Matrix3d();
	public final Matrix3d invInertia = new Matrix3d();
	/** Centre of mass in grid coordinates. */
	public final Vector3d comGrid = new Vector3d();
	/** Body-frame sample points (x, y, z triples) used for collision. */
	public final double[] samples;
	/** Body-frame centroid of each block (for buoyancy / lighting). */
	public final double[] blockCenters;
	public final Long2IntOpenHashMap cellIndex = new Long2IntOpenHashMap();
	public final double minX, minY, minZ, maxX, maxY, maxZ;
	public final double radius;
	public final double volume;

	public PieceBody(PieceData data) {
		this.data = data;
		this.blocks = data.blocks();
		int n = this.blocks.size();
		this.shapes = new PartShape[n];
		this.cellIndex.defaultReturnValue(-1);

		double totalMass = 0;
		double totalVolume = 0;
		Vector3d weighted = new Vector3d();
		double[] masses = new double[n];
		Vector3d[] centroids = new Vector3d[n];
		for (int i = 0; i < n; i++) {
			PieceBlock b = this.blocks.get(i);
			this.cellIndex.put(b.pos().asLong(), i);
			PartShape shape = BlockGeometry.shape(b.state(), b.planes());
			this.shapes[i] = shape;
			Vector3d c = new Vector3d(b.pos().getX() + shape.centroid.x, b.pos().getY() + shape.centroid.y, b.pos().getZ() + shape.centroid.z);
			centroids[i] = c;
			double m = shape.volume * BlockGeometry.density(b.state());
			masses[i] = m;
			totalMass += m;
			totalVolume += shape.volume;
			weighted.fma(m, c);
		}

		if (totalMass < 1.0E-4) {
			// Only non-collidable bits (torches, flowers...). Give it a token mass at the cell centres.
			totalMass = 0;
			weighted.zero();
			for (int i = 0; i < n; i++) {
				BlockPos p = this.blocks.get(i).pos();
				masses[i] = 0.05;
				centroids[i] = new Vector3d(p.getX() + 0.5, p.getY() + 0.5, p.getZ() + 0.5);
				totalMass += 0.05;
				weighted.fma(0.05, centroids[i]);
			}
		}

		this.mass = totalMass;
		this.invMass = 1.0 / totalMass;
		this.volume = totalVolume;
		this.comGrid.set(weighted).div(totalMass);

		// Inertia about the centre of mass (each fragment approximated by a cube of equal volume).
		double ixx = 0, iyy = 0, izz = 0, ixy = 0, ixz = 0, iyz = 0;
		for (int i = 0; i < n; i++) {
			double m = masses[i];
			if (m <= 0) {
				continue;
			}
			double side = Math.cbrt(Math.max(this.shapes[i].volume, 0.001));
			double self = m * side * side / 6.0;
			double rx = centroids[i].x - this.comGrid.x;
			double ry = centroids[i].y - this.comGrid.y;
			double rz = centroids[i].z - this.comGrid.z;
			ixx += self + m * (ry * ry + rz * rz);
			iyy += self + m * (rx * rx + rz * rz);
			izz += self + m * (rx * rx + ry * ry);
			ixy -= m * rx * ry;
			ixz -= m * rx * rz;
			iyz -= m * ry * rz;
		}
		double eps = 0.02 * totalMass;
		// JOML Matrix3d constructor is column-major: m00, m01, m02 is the first column.
		this.inertia.set(ixx + eps, ixy, ixz, ixy, iyy + eps, iyz, ixz, iyz, izz + eps);
		this.inertia.invert(this.invInertia);

		// Block centres in body frame.
		Vec3 off = data.gridOffset();
		this.blockCenters = new double[n * 3];
		for (int i = 0; i < n; i++) {
			this.blockCenters[i * 3] = centroids[i].x + off.x;
			this.blockCenters[i * 3 + 1] = centroids[i].y + off.y;
			this.blockCenters[i * 3 + 2] = centroids[i].z + off.z;
		}

		// Collision sample points on exposed faces.
		DoubleArrayList pts = new DoubleArrayList();
		LongOpenHashSet seen = new LongOpenHashSet();
		double bx0 = Double.MAX_VALUE, by0 = Double.MAX_VALUE, bz0 = Double.MAX_VALUE;
		double bx1 = -Double.MAX_VALUE, by1 = -Double.MAX_VALUE, bz1 = -Double.MAX_VALUE;
		for (int i = 0; i < n; i++) {
			PieceBlock b = this.blocks.get(i);
			double ox = b.pos().getX() + off.x;
			double oy = b.pos().getY() + off.y;
			double oz = b.pos().getZ() + off.z;
			bx0 = Math.min(bx0, ox);
			by0 = Math.min(by0, oy);
			bz0 = Math.min(bz0, oz);
			bx1 = Math.max(bx1, ox + 1);
			by1 = Math.max(by1, oy + 1);
			bz1 = Math.max(bz1, oz + 1);
			for (ConvexPart part : this.shapes[i].parts) {
				for (ConvexPart.Face face : part.faces) {
					if (!face.isCap() && this.isFaceHidden(b, part, face.boxFace())) {
						continue;
					}
					Poly p = face.poly();
					for (int v = 0; v < p.count; v++) {
						int w = (v + 1) % p.count;
						addPoint(pts, seen, ox + p.x(v), oy + p.y(v), oz + p.z(v));
						addPoint(pts, seen, ox + (p.x(v) + p.x(w)) * 0.5, oy + (p.y(v) + p.y(w)) * 0.5, oz + (p.z(v) + p.z(w)) * 0.5);
					}
					Vector3d c = p.centroid(new Vector3d());
					addPoint(pts, seen, ox + c.x, oy + c.y, oz + c.z);
				}
			}
		}
		this.samples = pts.toDoubleArray();
		if (n == 0) {
			bx0 = by0 = bz0 = -0.5;
			bx1 = by1 = bz1 = 0.5;
		}
		this.minX = bx0;
		this.minY = by0;
		this.minZ = bz0;
		this.maxX = bx1;
		this.maxY = by1;
		this.maxZ = bz1;
		double r = 0;
		for (int i = 0; i < this.samples.length; i += 3) {
			r = Math.max(r, this.samples[i] * this.samples[i] + this.samples[i + 1] * this.samples[i + 1] + this.samples[i + 2] * this.samples[i + 2]);
		}
		this.radius = Math.sqrt(r);
	}

	/** Centre of mass of a set of blocks, in grid coordinates. */
	public static Vector3d centerOfMass(List<PieceBlock> blocks) {
		double total = 0;
		Vector3d c = new Vector3d();
		for (PieceBlock b : blocks) {
			PartShape shape = BlockGeometry.shape(b.state(), b.planes());
			double m = shape.volume * BlockGeometry.density(b.state());
			total += m;
			c.x += m * (b.pos().getX() + shape.centroid.x);
			c.y += m * (b.pos().getY() + shape.centroid.y);
			c.z += m * (b.pos().getZ() + shape.centroid.z);
		}
		if (total < 1.0E-4) {
			c.zero();
			for (PieceBlock b : blocks) {
				c.add(b.pos().getX() + 0.5, b.pos().getY() + 0.5, b.pos().getZ() + 0.5);
			}
			return blocks.isEmpty() ? c : c.div(blocks.size());
		}
		return c.div(total);
	}

	private static void addPoint(DoubleArrayList pts, LongOpenHashSet seen, double x, double y, double z) {
		long key = (Math.round(x * 512) & 0x1FFFFFL) | (Math.round(y * 512) & 0x1FFFFFL) << 21 | (Math.round(z * 512) & 0x1FFFFFL) << 42;
		if (seen.add(key)) {
			pts.add(x);
			pts.add(y);
			pts.add(z);
		}
	}

	/** A box face on the cell boundary is hidden if the neighbouring cell holds an uncut full cube. */
	private boolean isFaceHidden(PieceBlock b, ConvexPart part, int boxFace) {
		int[] d = ConvexPart.BOX_NORMALS[boxFace];
		boolean onBoundary = switch (boxFace) {
			case 0 -> part.y0 <= 1.0E-6;
			case 1 -> part.y1 >= 1 - 1.0E-6;
			case 2 -> part.z0 <= 1.0E-6;
			case 3 -> part.z1 >= 1 - 1.0E-6;
			case 4 -> part.x0 <= 1.0E-6;
			default -> part.x1 >= 1 - 1.0E-6;
		};
		if (!onBoundary) {
			return false;
		}
		int j = this.cellIndex.get(BlockPos.asLong(b.pos().getX() + d[0], b.pos().getY() + d[1], b.pos().getZ() + d[2]));
		if (j < 0) {
			return false;
		}
		PieceBlock other = this.blocks.get(j);
		return !other.isCut() && BlockGeometry.isFullCube(other.state());
	}

	/** Index of the block whose solid geometry contains the body-frame point, or -1. */
	public int blockAt(double x, double y, double z, double margin) {
		Vec3 off = this.data.gridOffset();
		double gx = x - off.x;
		double gy = y - off.y;
		double gz = z - off.z;
		int cx = (int) Math.floor(gx);
		int cy = (int) Math.floor(gy);
		int cz = (int) Math.floor(gz);
		int i = this.cellIndex.get(BlockPos.asLong(cx, cy, cz));
		if (i < 0) {
			return -1;
		}
		return this.shapes[i].contains(gx - cx, gy - cy, gz - cz, margin) ? i : -1;
	}

	/** True if the cell next to block {@code i} in direction {@code d} is solid in this body at the given body-frame point. */
	public boolean solidAt(double x, double y, double z) {
		return this.blockAt(x, y, z, 0.0) >= 0;
	}
}
