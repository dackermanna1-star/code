package com.blademode.gore;

import java.util.ArrayList;
import java.util.List;
import org.joml.Matrix4d;
import org.joml.Quaterniond;
import org.joml.Vector3d;

/**
 * A rigid chunk of a creature: one bone of its skeleton, or what is left of it after cuts. Box shaped
 * for inertia and self collision, but it touches the world with the corners of its real geometry, so
 * a half cut on the slant rests on its cut face.
 *
 * <p>Positions are absolute world coordinates, velocities are in blocks per second. Solver adapted
 * from Visceral's ragdolls (XPBD, Müller et al. 2020).
 */
public final class Body {
	private static final int MAX_SAMPLES = 40;

	public final String name;
	public final double density;
	/** Centre of mass. */
	public final Vector3d pos = new Vector3d();
	public final Quaterniond rot = new Quaterniond();
	public final Vector3d vel = new Vector3d();
	public final Vector3d omega = new Vector3d();
	final Vector3d prevPos = new Vector3d();
	final Quaterniond prevRot = new Quaterniond();
	/** State at the start of the current tick, for render interpolation. */
	public final Vector3d tickPos = new Vector3d();
	public final Quaterniond tickRot = new Quaterniond();
	/** Reference pose: the pieces' {@link Piece#world0} are relative to it. */
	public final Vector3d pos0 = new Vector3d();
	public final Quaterniond rot0 = new Quaterniond();

	double invMass;
	public double mass;
	final Vector3d invInertia = new Vector3d();
	public final Vector3d halfExtents = new Vector3d();
	/** Collision points, body space (relative to the centre of mass). */
	final Vector3d[] samples;
	/** Self collision spheres along the longest axis: x, y, z (body space), radius. */
	final double[] spheres;
	public final double boundingRadius;
	public final double volume;

	/** What the body is made of. */
	public final List<Piece> pieces;
	/** The anchor all piece transforms are relative to. */
	public final Vector3d anchor;
	/** Packed light at the body, refreshed by the owner. */
	public int light = 0xF000F0;

	private final Vector3d tmp = new Vector3d();
	private final Vector3d tmp2 = new Vector3d();

	private Body(String name, double density, Vector3d anchor, List<Piece> pieces, Vector3d center, Quaterniond rotation, Vector3d half,
		double volume, Vector3d[] samples) {
		this.name = name;
		this.density = density;
		this.anchor = new Vector3d(anchor);
		this.pieces = List.copyOf(pieces);
		this.pos.set(center);
		this.rot.set(rotation).normalize();
		this.pos0.set(this.pos);
		this.rot0.set(this.rot);
		this.prevPos.set(this.pos);
		this.prevRot.set(this.rot);
		this.tickPos.set(this.pos);
		this.tickRot.set(this.rot);
		double hx = Math.max(0.02, half.x);
		double hy = Math.max(0.02, half.y);
		double hz = Math.max(0.02, half.z);
		this.halfExtents.set(hx, hy, hz);
		this.volume = volume;
		this.setMass(Math.max(Math.max(volume, 8.0 * hx * hy * hz * 0.15) * density, 1.0E-4));
		this.boundingRadius = Math.sqrt(hx * hx + hy * hy + hz * hz);
		this.samples = samples;
		this.spheres = buildSpheres(hx, hy, hz);
	}

	/**
	 * Builds a body around the given pieces, whose {@link Piece#world0} describe where they are now
	 * (this pose becomes the body's reference pose).
	 *
	 * @param orientation frame of the body (usually the bone's rotation), absolute
	 * @return null if the pieces have no geometry
	 */
	public static Body create(String name, double density, Vector3d anchor, Quaterniond orientation, List<Piece> pieces) {
		// The creature's own model decides shape and mass; armor and other layers just ride along.
		boolean hasMain = pieces.stream().anyMatch(Piece::isMain);
		List<Vector3d> points = new ArrayList<>();
		double volume = 0;
		for (Piece piece : pieces) {
			if (piece.isMain() || !hasMain) {
				piece.points(points);
				volume += piece.volume();
			}
		}
		if (points.isEmpty()) {
			for (Piece piece : pieces) {
				piece.points(points);
			}
		}
		if (points.isEmpty()) {
			return null;
		}
		Quaterniond rotation = new Quaterniond(orientation).normalize();
		Vector3d min = new Vector3d(Double.MAX_VALUE);
		Vector3d max = new Vector3d(-Double.MAX_VALUE);
		Vector3d local = new Vector3d();
		for (Vector3d p : points) {
			rotation.transformInverse(local.set(p));
			min.min(local);
			max.max(local);
		}
		Vector3d centerLocal = new Vector3d(min).add(max).mul(0.5);
		Vector3d half = new Vector3d(max).sub(min).mul(0.5);
		Vector3d center = rotation.transform(new Vector3d(centerLocal)).add(anchor);
		Vector3d[] samples = buildSamples(points, rotation, anchor, center, half);
		return new Body(name, density, anchor, pieces, center, rotation, half, volume, samples);
	}

	/** Collision points: the real corners of the geometry (deduplicated, thinned out if there are too many). */
	private static Vector3d[] buildSamples(List<Vector3d> points, Quaterniond rotation, Vector3d anchor, Vector3d center, Vector3d half) {
		List<Vector3d> unique = new ArrayList<>();
		Vector3d local = new Vector3d();
		for (Vector3d p : points) {
			local.set(p).add(anchor).sub(center);
			rotation.transformInverse(local);
			boolean seen = false;
			for (Vector3d u : unique) {
				if (u.distanceSquared(local) < 1.0E-4) {
					seen = true;
					break;
				}
			}
			if (!seen) {
				unique.add(new Vector3d(local));
			}
		}
		if (unique.size() > MAX_SAMPLES) {
			// Keep the points farthest out: they are the ones that touch things.
			unique.sort((a, b) -> Double.compare(b.lengthSquared(), a.lengthSquared()));
			unique = new ArrayList<>(unique.subList(0, MAX_SAMPLES));
		}
		// Long thin bodies also need points along their length to lie flat on the ground.
		double maxHalf = Math.max(half.x, Math.max(half.y, half.z));
		if (maxHalf > 0.2) {
			int axis = maxHalf == half.x ? 0 : maxHalf == half.y ? 1 : 2;
			List<Vector3d> extra = new ArrayList<>();
			for (Vector3d u : unique) {
				double along = axis == 0 ? u.x : axis == 1 ? u.y : u.z;
				if (along > maxHalf * 0.6) {
					Vector3d mid = new Vector3d(u);
					if (axis == 0) {
						mid.x = 0;
					} else if (axis == 1) {
						mid.y = 0;
					} else {
						mid.z = 0;
					}
					extra.add(mid);
				}
			}
			for (Vector3d e : extra) {
				if (unique.size() < MAX_SAMPLES + 8) {
					unique.add(e);
				}
			}
		}
		return unique.toArray(new Vector3d[0]);
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

	/** Sets the mass and the matching inertia of a solid box with this body's extents. */
	void setMass(double mass) {
		double hx = this.halfExtents.x;
		double hy = this.halfExtents.y;
		double hz = this.halfExtents.z;
		this.mass = mass;
		this.invMass = 1.0 / mass;
		double ix = mass / 3.0 * (hy * hy + hz * hz);
		double iy = mass / 3.0 * (hx * hx + hz * hz);
		double iz = mass / 3.0 * (hx * hx + hy * hy);
		// Clamped so thin parts don't spin like propellers.
		double minInertia = mass * 0.004;
		this.invInertia.set(1.0 / Math.max(ix, minInertia), 1.0 / Math.max(iy, minInertia), 1.0 / Math.max(iz, minInertia));
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
	public Vector3d pointVelocity(Vector3d r, Vector3d dest) {
		this.omega.cross(r, dest);
		return dest.add(this.vel);
	}

	public Vector3d worldPoint(Vector3d local, Vector3d dest) {
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

	/**
	 * Current transform of a piece of this body: part space → world relative to {@code origin},
	 * interpolated between the last two ticks.
	 */
	public Matrix4d pieceTransform(Piece piece, float partialTick, double originX, double originY, double originZ, Matrix4d dest) {
		Vector3d position = this.tickPos.lerp(this.pos, partialTick, new Vector3d());
		Quaterniond rotation = this.tickRot.slerp(this.rot, partialTick, new Quaterniond());
		Quaterniond delta = rotation.mul(new Quaterniond(this.rot0).conjugate(), new Quaterniond());
		return dest.identity()
			.translate(position.x - originX, position.y - originY, position.z - originZ)
			.rotate(delta)
			.translate(this.anchor.x - this.pos0.x, this.anchor.y - this.pos0.y, this.anchor.z - this.pos0.z)
			.mul(piece.world0);
	}

	/** Where a piece is right now (no interpolation), relative to the anchor: for cutting. */
	public Matrix4d currentWorld(Piece piece) {
		Quaterniond delta = new Quaterniond(this.rot).mul(new Quaterniond(this.rot0).conjugate());
		return new Matrix4d()
			.translate(this.pos.x - this.anchor.x, this.pos.y - this.anchor.y, this.pos.z - this.anchor.z)
			.rotate(delta)
			.translate(this.anchor.x - this.pos0.x, this.anchor.y - this.pos0.y, this.anchor.z - this.pos0.z)
			.mul(piece.world0);
	}

	/** Copies the motion of {@code from} (as a rigid body) onto this body. */
	void inheritMotion(Body from) {
		Vector3d r = new Vector3d(this.pos).sub(from.pos);
		from.pointVelocity(r, this.vel);
		this.omega.set(from.omega);
		this.tickPos.set(this.pos).sub(new Vector3d(from.pos).sub(from.tickPos));
		this.tickRot.set(from.tickRot).mul(new Quaterniond(from.rot).conjugate()).mul(this.rot).normalize();
	}
}
