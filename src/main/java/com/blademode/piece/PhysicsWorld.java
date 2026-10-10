package com.blademode.piece;

import com.blademode.BladeConfig;
import com.blademode.geom.ConvexPart;
import com.blademode.geom.PartShape;
import com.blademode.geom.Plane;
import com.blademode.registry.ModEntities;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix3d;
import org.joml.Quaterniond;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/**
 * Steps every piece in a level once per server tick: gravity, buoyancy, speculative contacts
 * against the world and between pieces, a sequential-impulse solver with Coulomb friction,
 * then integration and sleeping.
 */
public final class PhysicsWorld {
	private static final int SUBSTEPS = 4;
	private static final double DT = 0.05 / SUBSTEPS;
	private static final int ITERATIONS = 8;
	/** Contacts are predicted this far ahead of the moving point. */
	private static final double MARGIN = 0.04;
	private static final double SLOP = 0.004;
	/**
	 * Sliding points sit up to about {@link #SLOP} below the surface they rest on. When such a point
	 * passes over a gap it would hit the vertical side of the far edge and stop the whole body, so a
	 * point less than this deep under an upward-facing surface is lifted onto it instead.
	 */
	private static final double LIP = 0.012;
	/** Minimum upward component of a face normal for the lip rule (faces up to ~75° steep). */
	private static final double UP = 0.25;
	private static final double BAUMGARTE = 0.25;
	private static final double MAX_PUSH = 2.0;
	private static final double MAX_SPEED = 80.0;
	private static final double MAX_SPIN = 25.0;
	private static final double SLEEP_SPEED = 0.05;
	/** Freshly cut pieces may not fall asleep before this age (ticks), so slow starts can develop. */
	private static final int SLEEP_GRACE_TICKS = 40;
	private static final int SLEEP_TICKS = 12;

	private PhysicsWorld() {
	}

	/** Simulation view of one piece for the duration of a tick. */
	public static final class Sim {
		final @Nullable PieceEntity e;
		final PieceBody b;
		final Vector3d pos;
		final Quaterniond rot;
		final Vector3d vel;
		final Vector3d angVel;
		final Matrix3d r = new Matrix3d();
		final Matrix3d invI = new Matrix3d();
		final boolean dynamic;
		double invMass;
		boolean wet;
		AABB box;

		Sim(PieceEntity e, boolean dynamic) {
			this(e.body(), new Vector3d(e.getX(), e.getY(), e.getZ()), e.rot, e.vel, e.angVel, dynamic, e);
		}

		/** For tests: a body that is not backed by an entity. Rotation and velocities are used by reference. */
		public Sim(PieceBody body, Vector3d pos, Quaterniond rot, Vector3d vel, Vector3d angVel, boolean dynamic, @Nullable PieceEntity entity) {
			this.e = entity;
			this.b = body;
			this.pos = pos;
			this.rot = rot;
			this.vel = vel;
			this.angVel = angVel;
			this.dynamic = dynamic;
			this.invMass = dynamic ? this.b.invMass : 0.0;
			this.updateMatrices();
			this.worldBox();
		}

		public Vector3d position() {
			return this.pos;
		}

		void updateMatrices() {
			this.r.set(this.rot);
			if (this.dynamic) {
				// I_world^-1 = R I_body^-1 R^T
				this.invI.set(this.r).mul(this.b.invInertia).mul(new Matrix3d(this.r).transpose());
			} else {
				this.invI.zero();
			}
		}

		void applyImpulse(double jx, double jy, double jz, double rx, double ry, double rz) {
			if (!this.dynamic) {
				return;
			}
			this.vel.add(jx * this.invMass, jy * this.invMass, jz * this.invMass);
			double tx = ry * jz - rz * jy;
			double ty = rz * jx - rx * jz;
			double tz = rx * jy - ry * jx;
			this.angVel.add(
				this.invI.m00 * tx + this.invI.m10 * ty + this.invI.m20 * tz,
				this.invI.m01 * tx + this.invI.m11 * ty + this.invI.m21 * tz,
				this.invI.m02 * tx + this.invI.m12 * ty + this.invI.m22 * tz);
		}

		/** n . ((I^-1 (r x n)) x r) + 1/m along direction n. */
		double effectiveInvMass(double rx, double ry, double rz, double nx, double ny, double nz) {
			if (!this.dynamic) {
				return 0.0;
			}
			double cx = ry * nz - rz * ny;
			double cy = rz * nx - rx * nz;
			double cz = rx * ny - ry * nx;
			double ix = this.invI.m00 * cx + this.invI.m10 * cy + this.invI.m20 * cz;
			double iy = this.invI.m01 * cx + this.invI.m11 * cy + this.invI.m21 * cz;
			double iz = this.invI.m02 * cx + this.invI.m12 * cy + this.invI.m22 * cz;
			double kx = iy * rz - iz * ry;
			double ky = iz * rx - ix * rz;
			double kz = ix * ry - iy * rx;
			return this.invMass + nx * kx + ny * ky + nz * kz;
		}

		/** World bounds of the rotated body, grown by how far it may move this tick. */
		void worldBox() {
			double minX = Double.MAX_VALUE, minY = Double.MAX_VALUE, minZ = Double.MAX_VALUE;
			double maxX = -Double.MAX_VALUE, maxY = -Double.MAX_VALUE, maxZ = -Double.MAX_VALUE;
			Vector3d v = new Vector3d();
			for (int i = 0; i < 8; i++) {
				v.set((i & 1) == 0 ? this.b.minX : this.b.maxX, (i & 2) == 0 ? this.b.minY : this.b.maxY, (i & 4) == 0 ? this.b.minZ : this.b.maxZ);
				this.r.transform(v);
				minX = Math.min(minX, v.x);
				minY = Math.min(minY, v.y);
				minZ = Math.min(minZ, v.z);
				maxX = Math.max(maxX, v.x);
				maxY = Math.max(maxY, v.y);
				maxZ = Math.max(maxZ, v.z);
			}
			double grow = this.vel.length() * 0.05 + 0.1;
			this.box = new AABB(this.pos.x + minX, this.pos.y + minY, this.pos.z + minZ, this.pos.x + maxX, this.pos.y + maxY, this.pos.z + maxZ).inflate(grow);
		}
	}

	static final class Contact {
		Sim a;
		Sim b;
		double px, py, pz;
		double nx, ny, nz;
		double sep;
		double rax, ray, raz;
		double rbx, rby, rbz;
		double massN;
		double target;
		double accN;
		double atx, aty, atz;
		double friction;
	}

	public static void tick(ServerLevel level) {
		if (!level.tickRateManager().runsNormally()) {
			return;
		}
		List<? extends PieceEntity> entities = level.getEntities(ModEntities.PIECE, e -> !e.isRemoved() && !e.getPieceData().isEmpty());
		if (entities.isEmpty()) {
			return;
		}
		BladeConfig cfg = BladeConfig.get();
		List<Sim> active = new ArrayList<>();
		List<Sim> all = new ArrayList<>();
		for (PieceEntity e : entities) {
			if (!level.isPositionEntityTicking(e.blockPosition())) {
				continue;
			}
			boolean probe = e.sleeping && (e.tickCount + e.getId()) % 20 == 0;
			boolean run = !e.sleeping || probe;
			Sim s = new Sim(e, run);
			s.worldBox();
			all.add(s);
			if (run) {
				active.add(s);
			}
		}
		if (active.isEmpty()) {
			return;
		}

		CellCache cache = new CellCache(level);
		for (Sim s : active) {
			s.wet = level.containsAnyLiquid(s.box);
		}
		simulate(active, all, cache, cfg);

		for (Sim s : active) {
			PieceEntity e = s.e;
			if (e == null) {
				continue;
			}
			e.applyPhysicsTransform(s.pos);
			double lin = s.vel.length();
			double ang = s.angVel.length();
			if (lin < SLEEP_SPEED && ang < SLEEP_SPEED) {
				e.slowTicks++;
				if ((e.slowTicks >= SLEEP_TICKS && e.tickCount > SLEEP_GRACE_TICKS) || e.sleeping) {
					e.sleeping = true;
					e.vel.zero();
					e.angVel.zero();
					e.setResting(true);
				}
			} else {
				if (e.sleeping) {
					e.wake();
				}
				e.slowTicks = 0;
			}
			if (cfg.pieceDamage && lin > 3.0) {
				hurtEntities(level, s);
			}
		}
	}

	/** Advances the given bodies by one server tick (several substeps). */
	public static void simulate(List<Sim> active, List<Sim> all, CellSource cells, BladeConfig cfg) {
		List<Contact> contacts = new ArrayList<>();
		for (int step = 0; step < SUBSTEPS; step++) {
			for (Sim s : active) {
				s.updateMatrices();
				s.vel.y -= cfg.gravity * DT;
				if (s.wet) {
					applyFluid(s, cells, cfg.gravity);
				}
				s.vel.mul(1.0 - 0.02 * DT);
				s.angVel.mul(1.0 - 0.15 * DT);
			}

			contacts.clear();
			for (Sim s : active) {
				worldContacts(s, cells, contacts, cfg);
			}
			for (int i = 0; i < all.size(); i++) {
				Sim a = all.get(i);
				for (int j = i + 1; j < all.size(); j++) {
					Sim b = all.get(j);
					if ((!a.dynamic && !b.dynamic) || !a.box.intersects(b.box)) {
						continue;
					}
					pairContacts(a, b, contacts, cfg);
					pairContacts(b, a, contacts, cfg);
				}
			}

			for (Contact c : contacts) {
				prepare(c, cfg);
			}
			for (int it = 0; it < ITERATIONS; it++) {
				for (Contact c : contacts) {
					solve(c);
				}
			}

			for (Sim s : active) {
				clampVelocity(s);
				s.pos.fma(DT, s.vel);
				double w = s.angVel.length();
				if (w > 1.0E-9) {
					Quaterniond dq = new Quaterniond().fromAxisAngleRad(s.angVel.x / w, s.angVel.y / w, s.angVel.z / w, w * DT);
					s.rot.premul(dq).normalize();
				}
			}
		}
		for (Sim s : active) {
			s.updateMatrices();
			s.worldBox();
		}
		lastContactCount = contacts.size();
	}

	/** Number of contacts in the last substep (diagnostics/tests). */
	public static int lastContactCount;

	private static void clampVelocity(Sim s) {
		double v = s.vel.length();
		if (v > MAX_SPEED) {
			s.vel.mul(MAX_SPEED / v);
		}
		double w = s.angVel.length();
		if (w > MAX_SPIN) {
			s.angVel.mul(MAX_SPIN / w);
		}
	}

	// ------------------------------------------------------------------------------------------
	// Buoyancy

	private static void applyFluid(Sim s, CellSource cache, double gravity) {
		double[] centers = s.b.blockCenters;
		for (int i = 0; i < s.b.blocks.size(); i++) {
			double lx = centers[i * 3], ly = centers[i * 3 + 1], lz = centers[i * 3 + 2];
			double rx = s.r.m00 * lx + s.r.m10 * ly + s.r.m20 * lz;
			double ry = s.r.m01 * lx + s.r.m11 * ly + s.r.m21 * lz;
			double rz = s.r.m02 * lx + s.r.m12 * ly + s.r.m22 * lz;
			double wx = s.pos.x + rx, wy = s.pos.y + ry, wz = s.pos.z + rz;
			int cx = (int) Math.floor(wx), cy = (int) Math.floor(wy), cz = (int) Math.floor(wz);
			CellCache.Cell cell = cache.get(cx, cy, cz);
			if (cell.fluidHeight < 0 || wy - cy > cell.fluidHeight) {
				continue;
			}
			double vol = s.b.shapes[i].volume;
			if (vol <= 0) {
				continue;
			}
			// Archimedes: lift = rho_fluid * V * g, applied at the block centre.
			double lift = cell.fluidDensity * vol * gravity * DT;
			s.applyImpulse(0, lift, 0, rx, ry, rz);
			// Viscous drag on the moving point.
			double vx = s.vel.x + (s.angVel.y * rz - s.angVel.z * ry);
			double vy = s.vel.y + (s.angVel.z * rx - s.angVel.x * rz);
			double vz = s.vel.z + (s.angVel.x * ry - s.angVel.y * rx);
			double drag = cell.fluidDensity * vol * 3.0 * DT;
			s.applyImpulse(-vx * drag, -vy * drag, -vz * drag, rx, ry, rz);
		}
	}

	// ------------------------------------------------------------------------------------------
	// Contacts against the world

	private static void worldContacts(Sim s, CellSource cache, List<Contact> out, BladeConfig cfg) {
		double[] smp = s.b.samples;
		Matrix3d r = s.r;
		double[] hit = new double[5];
		for (int i = 0; i < smp.length; i += 3) {
			double lx = smp[i], ly = smp[i + 1], lz = smp[i + 2];
			double rx = r.m00 * lx + r.m10 * ly + r.m20 * lz;
			double ry = r.m01 * lx + r.m11 * ly + r.m21 * lz;
			double rz = r.m02 * lx + r.m12 * ly + r.m22 * lz;
			double px = s.pos.x + rx, py = s.pos.y + ry, pz = s.pos.z + rz;
			double vx = s.vel.x + (s.angVel.y * rz - s.angVel.z * ry);
			double vy = s.vel.y + (s.angVel.z * rx - s.angVel.x * rz);
			double vz = s.vel.z + (s.angVel.x * ry - s.angVel.y * rx);
			if (probe(cache, px, py, pz, vx * DT, vy * DT, vz * DT, hit)) {
				Contact c = new Contact();
				c.a = s;
				c.px = px;
				c.py = py;
				c.pz = pz;
				c.nx = hit[0];
				c.ny = hit[1];
				c.nz = hit[2];
				c.sep = hit[3];
				c.rax = rx;
				c.ray = ry;
				c.raz = rz;
				c.friction = hit[4] > 0 ? cfg.cutFriction : cfg.friction;
				out.add(c);
			}
		}
	}

	/**
	 * Looks for world geometry at or just ahead of a moving point.
	 * On success, {@code out} = (normal xyz, separation, cut flag) where separation &lt; 0 means
	 * penetration and the flag is 1 when the touched face is a cut surface.
	 */
	static boolean probe(CellSource cache, double px, double py, double pz, double dx, double dy, double dz, double[] out) {
		int cx = (int) Math.floor(px), cy = (int) Math.floor(py), cz = (int) Math.floor(pz);
		CellCache.Cell cell = cache.get(cx, cy, cz);
		if (!cell.isEmpty()) {
			double lx = px - cx, ly = py - cy, lz = pz - cz;
			int region = cell.full ? 0 : cell.regionAt(lx, ly, lz, 1.0E-7);
			if (cell.full && (lx <= 1.0E-7 || ly <= 1.0E-7 || lz <= 1.0E-7)) {
				region = -1;
			}
			if (region >= 0) {
				penetration(cache, cell, region, cx, cy, cz, lx, ly, lz, out);
				return true;
			}
		}

		double len = Math.sqrt(dx * dx + dy * dy + dz * dz);
		if (len < 1.0E-9) {
			dx = 0;
			dy = -MARGIN;
			dz = 0;
		} else {
			double s = (len + MARGIN) / len;
			dx *= s;
			dy *= s;
			dz *= s;
		}

		// Walk the cells the segment passes through (Amanatides–Woo).
		int x = cx, y = cy, z = cz;
		int stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
		int stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
		int stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
		double tMaxX = stepX == 0 ? Double.MAX_VALUE : (stepX > 0 ? (x + 1 - px) : (px - x)) / Math.abs(dx);
		double tMaxY = stepY == 0 ? Double.MAX_VALUE : (stepY > 0 ? (y + 1 - py) : (py - y)) / Math.abs(dy);
		double tMaxZ = stepZ == 0 ? Double.MAX_VALUE : (stepZ > 0 ? (z + 1 - pz) : (pz - z)) / Math.abs(dz);
		double tDeltaX = stepX == 0 ? Double.MAX_VALUE : 1.0 / Math.abs(dx);
		double tDeltaY = stepY == 0 ? Double.MAX_VALUE : 1.0 / Math.abs(dy);
		double tDeltaZ = stepZ == 0 ? Double.MAX_VALUE : 1.0 / Math.abs(dz);
		for (int n = 0; n < 12; n++) {
			CellCache.Cell c = n == 0 ? cell : cache.get(x, y, z);
			if (!c.isEmpty()) {
				double best = Double.MAX_VALUE;
				double bnx = 0, bny = 0, bnz = 0, bcut = 0;
				int bestBox = -1;
				double ox = px - x, oy = py - y, oz = pz - z;
				for (int bi = 0; bi < c.boxes.length; bi++) {
					double[] res = segmentEntry(ox, oy, oz, dx, dy, dz, c.boxes[bi], c.planes);
					if (res != null && res[0] < best) {
						best = res[0];
						bnx = res[1];
						bny = res[2];
						bnz = res[3];
						bcut = res[4];
						bestBox = bi;
					}
				}
				if (best <= 1.0) {
					out[0] = bnx;
					out[1] = bny;
					out[2] = bnz;
					out[3] = -best * (bnx * dx + bny * dy + bnz * dz);
					out[4] = bcut;
					if (bny < UP) {
						lipEntry(cache, c, c.boxes[bestBox], x, y, z, ox, oy, oz, ox + best * dx, oy + best * dy, oz + best * dz, out);
					}
					return true;
				}
			}
			double tNext = Math.min(tMaxX, Math.min(tMaxY, tMaxZ));
			if (tNext > 1.0) {
				break;
			}
			if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
				x += stepX;
				tMaxX += tDeltaX;
			} else if (tMaxY <= tMaxZ) {
				y += stepY;
				tMaxY += tDeltaY;
			} else {
				z += stepZ;
				tMaxZ += tDeltaZ;
			}
		}
		return false;
	}

	/** Cyrus–Beck: first parameter in [0,1] at which the segment enters box ∩ planes, with the entry normal. */
	private static double[] segmentEntry(double ox, double oy, double oz, double dx, double dy, double dz, AABB box, Plane[] planes) {
		final double tie = 1.0E-6;
		double tIn = 0;
		double tOut = 1;
		double nx = 0, ny = 0, nz = 0;
		double cut = 0;
		boolean entered = false;
		for (int f = 0; f < 6 + planes.length; f++) {
			double mx, my, mz, e;
			if (f < 6) {
				int[] n = ConvexPart.BOX_NORMALS[f];
				mx = n[0];
				my = n[1];
				mz = n[2];
				e = switch (f) {
					case 0 -> -box.minY;
					case 1 -> box.maxY;
					case 2 -> -box.minZ;
					case 3 -> box.maxZ;
					case 4 -> -box.minX;
					default -> box.maxX;
				};
			} else {
				Plane p = planes[f - 6];
				mx = p.nx();
				my = p.ny();
				mz = p.nz();
				e = p.d();
			}
			double num = e - (mx * ox + my * oy + mz * oz);
			double den = mx * dx + my * dy + mz * dz;
			if (Math.abs(den) < 1.0E-12) {
				if (num < 0) {
					return null;
				}
				continue;
			}
			double t = num / den;
			if (den < 0) {
				// Points sampled on a piece often sit exactly on the edge where a cut face meets a cell
				// face. On such near-ties the cut face is the real surface, so it wins; otherwise a
				// vertical cell boundary would act like a wall and pin pieces that should slide.
				boolean plane = f >= 6;
				boolean better;
				if (!entered) {
					better = t >= tIn - tie;
				} else if (t > tIn + tie) {
					better = true;
				} else {
					better = plane && cut == 0 && t >= tIn - tie;
				}
				if (better) {
					tIn = Math.max(tIn, t);
					nx = mx;
					ny = my;
					nz = mz;
					cut = plane ? 1 : 0;
					entered = true;
				}
			} else if (t < tOut) {
				tOut = t;
			}
			if (tIn > tOut + tie) {
				return null;
			}
		}
		if (!entered) {
			return null;
		}
		return new double[]{tIn, nx, ny, nz, cut};
	}

	/**
	 * Lip rule for a predicted hit on a side face: if the entry point lies only a hair below an
	 * upward-facing face of the same solid (with nothing solid on top of it), the point is gliding
	 * along that surface, so the contact is made with that surface instead.
	 *
	 * @param ox current point, cell-local
	 * @param ex entry point, cell-local
	 */
	private static void lipEntry(CellSource cache, CellCache.Cell cell, AABB box, int cx, int cy, int cz,
			double ox, double oy, double oz, double ex, double ey, double ez, double[] out) {
		double bestDepth = LIP;
		for (int f = -1; f < cell.planes.length; f++) {
			double mx, my, mz, e;
			if (f < 0) {
				mx = 0;
				my = 1;
				mz = 0;
				e = box.maxY;
			} else {
				Plane p = cell.planes[f];
				mx = p.nx();
				my = p.ny();
				mz = p.nz();
				e = p.d();
			}
			if (my < UP) {
				continue;
			}
			double depth = e - (mx * ex + my * ey + mz * ez);
			if (depth < -1.0E-6 || depth > bestDepth) {
				continue;
			}
			double push = Math.max(depth, 0) + 0.02;
			if (cache.solidAt(cx + ex + mx * push, cy + ey + my * push, cz + ez + mz * push)) {
				continue;
			}
			bestDepth = depth;
			out[0] = mx;
			out[1] = my;
			out[2] = mz;
			out[3] = mx * ox + my * oy + mz * oz - e;
			out[4] = f >= 0 ? 1 : 0;
		}
	}

	/** Depth and push-out direction for a point inside solid world geometry. */
	private static void penetration(CellSource cache, CellCache.Cell cell, int region, int cx, int cy, int cz, double lx, double ly, double lz, double[] out) {
		AABB box = cell.boxes[region];
		double bestFree = Double.MAX_VALUE;
		double bestAny = Double.MAX_VALUE;
		double bestLip = LIP;
		double fx = 0, fy = 1, fz = 0, ax = 0, ay = 1, az = 0, ux = 0, uy = 1, uz = 0;
		double freeCut = 0, anyCut = 0, lipCut = 0;
		boolean lip = false;
		int faces = 6 + cell.planes.length;
		for (int f = 0; f < faces; f++) {
			double mx, my, mz, depth;
			if (f < 6) {
				int[] n = ConvexPart.BOX_NORMALS[f];
				mx = n[0];
				my = n[1];
				mz = n[2];
				depth = switch (f) {
					case 0 -> ly - box.minY;
					case 1 -> box.maxY - ly;
					case 2 -> lz - box.minZ;
					case 3 -> box.maxZ - lz;
					case 4 -> lx - box.minX;
					default -> box.maxX - lx;
				};
			} else {
				Plane p = cell.planes[f - 6];
				mx = p.nx();
				my = p.ny();
				mz = p.nz();
				depth = -p.dist(lx, ly, lz);
			}
			if (depth < 0) {
				continue;
			}
			if (depth < bestAny) {
				bestAny = depth;
				ax = mx;
				ay = my;
				az = mz;
				anyCut = f >= 6 ? 1 : 0;
			}
			double push = depth + 0.02;
			boolean plane = f >= 6;
			boolean better = depth < bestFree - 1.0E-4 || (depth < bestFree + 1.0E-4 && plane && freeCut == 0);
			boolean lipCandidate = my >= UP && depth <= bestLip;
			if ((better || lipCandidate) && !cache.solidAt(cx + lx + mx * push, cy + ly + my * push, cz + lz + mz * push)) {
				if (better) {
					bestFree = depth;
					fx = mx;
					fy = my;
					fz = mz;
					freeCut = plane ? 1 : 0;
				}
				if (lipCandidate) {
					bestLip = depth;
					ux = mx;
					uy = my;
					uz = mz;
					lipCut = plane ? 1 : 0;
					lip = true;
				}
			}
		}
		if (lip && fy < UP) {
			// Barely under a supporting surface: ride up onto it rather than into a side face.
			out[0] = ux;
			out[1] = uy;
			out[2] = uz;
			out[3] = -bestLip;
			out[4] = lipCut;
			return;
		}
		if (bestFree < Double.MAX_VALUE) {
			out[0] = fx;
			out[1] = fy;
			out[2] = fz;
			out[3] = -bestFree;
			out[4] = freeCut;
		} else {
			out[0] = ax;
			out[1] = ay;
			out[2] = az;
			out[3] = -Math.min(bestAny, 0.5);
			out[4] = anyCut;
		}
	}

	// ------------------------------------------------------------------------------------------
	// Contacts between pieces: points of {@code a} inside the solid volume of {@code b}.

	private static void pairContacts(Sim a, Sim b, List<Contact> out, BladeConfig cfg) {
		if (!a.dynamic && !b.dynamic) {
			return;
		}
		double[] smp = a.b.samples;
		Vec3 offB = b.b.data.gridOffset();
		double reach = b.b.radius + 0.05;
		double reach2 = reach * reach;
		for (int i = 0; i < smp.length; i += 3) {
			double lx = smp[i], ly = smp[i + 1], lz = smp[i + 2];
			double rx = a.r.m00 * lx + a.r.m10 * ly + a.r.m20 * lz;
			double ry = a.r.m01 * lx + a.r.m11 * ly + a.r.m21 * lz;
			double rz = a.r.m02 * lx + a.r.m12 * ly + a.r.m22 * lz;
			double px = a.pos.x + rx, py = a.pos.y + ry, pz = a.pos.z + rz;
			double wx = px - b.pos.x, wy = py - b.pos.y, wz = pz - b.pos.z;
			if (wx * wx + wy * wy + wz * wz > reach2) {
				continue;
			}
			// Into b's body frame: q = R_b^T w
			double qx = b.r.m00 * wx + b.r.m01 * wy + b.r.m02 * wz;
			double qy = b.r.m10 * wx + b.r.m11 * wy + b.r.m12 * wz;
			double qz = b.r.m20 * wx + b.r.m21 * wy + b.r.m22 * wz;
			int idx = b.b.blockAt(qx, qy, qz, 1.0E-6);
			if (idx < 0) {
				continue;
			}
			BlockPos cell = b.b.blocks.get(idx).pos();
			double gx = qx - offB.x - cell.getX();
			double gy = qy - offB.y - cell.getY();
			double gz = qz - offB.z - cell.getZ();
			double[] n = pieceNormal(b, idx, gx, gy, gz, qx, qy, qz);
			if (n == null) {
				continue;
			}
			// Back to world.
			double nx = b.r.m00 * n[0] + b.r.m10 * n[1] + b.r.m20 * n[2];
			double ny = b.r.m01 * n[0] + b.r.m11 * n[1] + b.r.m21 * n[2];
			double nz = b.r.m02 * n[0] + b.r.m12 * n[1] + b.r.m22 * n[2];
			Contact c = new Contact();
			c.a = a;
			c.b = b;
			c.px = px;
			c.py = py;
			c.pz = pz;
			c.nx = nx;
			c.ny = ny;
			c.nz = nz;
			c.sep = -n[3];
			c.rax = rx;
			c.ray = ry;
			c.raz = rz;
			c.rbx = px - b.pos.x;
			c.rby = py - b.pos.y;
			c.rbz = pz - b.pos.z;
			c.friction = n[4] > 0 ? cfg.cutFriction : cfg.friction;
			out.add(c);
		}
	}

	/** Exit direction (body frame) and depth for a point inside block {@code idx} of piece {@code s}. */
	private static double[] pieceNormal(Sim s, int idx, double gx, double gy, double gz, double qx, double qy, double qz) {
		PartShape shape = s.b.shapes[idx];
		ConvexPart part = null;
		for (ConvexPart p : shape.parts) {
			if (p.contains(gx, gy, gz, 1.0E-6)) {
				part = p;
				break;
			}
		}
		if (part == null) {
			return null;
		}
		double best = Double.MAX_VALUE;
		double[] res = null;
		double bestAny = Double.MAX_VALUE;
		double[] any = null;
		double bestLip = LIP;
		double[] lip = null;
		// World "up" expressed in the body frame of s.
		double upX = s.r.m01, upY = s.r.m11, upZ = s.r.m21;
		int faces = 6 + part.planes.size();
		for (int f = 0; f < faces; f++) {
			double mx, my, mz, depth;
			if (f < 6) {
				int[] n = ConvexPart.BOX_NORMALS[f];
				mx = n[0];
				my = n[1];
				mz = n[2];
				depth = switch (f) {
					case 0 -> gy - part.y0;
					case 1 -> part.y1 - gy;
					case 2 -> gz - part.z0;
					case 3 -> part.z1 - gz;
					case 4 -> gx - part.x0;
					default -> part.x1 - gx;
				};
			} else {
				Plane p = part.planes.get(f - 6);
				mx = p.nx();
				my = p.ny();
				mz = p.nz();
				depth = -p.dist(gx, gy, gz);
			}
			if (depth < 0) {
				continue;
			}
			if (depth < bestAny) {
				bestAny = depth;
				any = new double[]{mx, my, mz, depth, f >= 6 ? 1 : 0};
			}
			double push = depth + 0.02;
			boolean plane = f >= 6;
			boolean better = depth < best - 1.0E-4 || (depth < best + 1.0E-4 && plane && (res == null || res[4] == 0));
			boolean lipCandidate = mx * upX + my * upY + mz * upZ >= UP && depth <= bestLip;
			if ((better || lipCandidate) && s.b.blockAt(qx + mx * push, qy + my * push, qz + mz * push, 0.0) < 0) {
				double[] face = {mx, my, mz, depth, plane ? 1 : 0};
				if (better) {
					best = depth;
					res = face;
				}
				if (lipCandidate) {
					bestLip = depth;
					lip = face;
				}
			}
		}
		if (lip != null && (res == null || res[0] * upX + res[1] * upY + res[2] * upZ < UP)) {
			return lip;
		}
		return res != null ? res : any;
	}

	// ------------------------------------------------------------------------------------------
	// Solver

	private static void prepare(Contact c, BladeConfig cfg) {
		Sim a = c.a;
		Sim b = c.b;
		double k = a.effectiveInvMass(c.rax, c.ray, c.raz, c.nx, c.ny, c.nz);
		if (b != null) {
			k += b.effectiveInvMass(c.rbx, c.rby, c.rbz, c.nx, c.ny, c.nz);
		}
		c.massN = k > 1.0E-12 ? 1.0 / k : 0.0;
		double vn = relativeNormalVelocity(c);
		if (c.sep > 0) {
			c.target = -c.sep / DT;
		} else {
			double pen = -c.sep - SLOP;
			c.target = pen > 0 ? Math.min(BAUMGARTE * pen / DT, MAX_PUSH) : 0.0;
		}
		if (c.sep <= 0.01 && vn < -2.0) {
			c.target = Math.max(c.target, -cfg.restitution * vn);
		}
	}

	private static double relativeNormalVelocity(Contact c) {
		Sim a = c.a;
		double vx = a.vel.x + (a.angVel.y * c.raz - a.angVel.z * c.ray);
		double vy = a.vel.y + (a.angVel.z * c.rax - a.angVel.x * c.raz);
		double vz = a.vel.z + (a.angVel.x * c.ray - a.angVel.y * c.rax);
		if (c.b != null) {
			Sim b = c.b;
			vx -= b.vel.x + (b.angVel.y * c.rbz - b.angVel.z * c.rby);
			vy -= b.vel.y + (b.angVel.z * c.rbx - b.angVel.x * c.rbz);
			vz -= b.vel.z + (b.angVel.x * c.rby - b.angVel.y * c.rbx);
		}
		return vx * c.nx + vy * c.ny + vz * c.nz;
	}

	private static void solve(Contact c) {
		if (c.massN <= 0) {
			return;
		}
		Sim a = c.a;
		Sim b = c.b;
		double vn = relativeNormalVelocity(c);
		double lambda = (c.target - vn) * c.massN;
		double acc = Math.max(c.accN + lambda, 0.0);
		lambda = acc - c.accN;
		c.accN = acc;
		if (lambda != 0) {
			a.applyImpulse(c.nx * lambda, c.ny * lambda, c.nz * lambda, c.rax, c.ray, c.raz);
			if (b != null) {
				b.applyImpulse(-c.nx * lambda, -c.ny * lambda, -c.nz * lambda, c.rbx, c.rby, c.rbz);
			}
		}
		if (c.accN <= 0 || c.friction <= 0) {
			return;
		}

		// Coulomb friction, accumulated as a 2D vector in the tangent plane.
		double vx = a.vel.x + (a.angVel.y * c.raz - a.angVel.z * c.ray);
		double vy = a.vel.y + (a.angVel.z * c.rax - a.angVel.x * c.raz);
		double vz = a.vel.z + (a.angVel.x * c.ray - a.angVel.y * c.rax);
		if (b != null) {
			vx -= b.vel.x + (b.angVel.y * c.rbz - b.angVel.z * c.rby);
			vy -= b.vel.y + (b.angVel.z * c.rbx - b.angVel.x * c.rbz);
			vz -= b.vel.z + (b.angVel.x * c.rby - b.angVel.y * c.rbx);
		}
		double dn = vx * c.nx + vy * c.ny + vz * c.nz;
		double tx = vx - c.nx * dn, ty = vy - c.ny * dn, tz = vz - c.nz * dn;
		double vt = Math.sqrt(tx * tx + ty * ty + tz * tz);
		if (vt < 1.0E-7) {
			return;
		}
		tx /= vt;
		ty /= vt;
		tz /= vt;
		double kt = a.effectiveInvMass(c.rax, c.ray, c.raz, tx, ty, tz);
		if (b != null) {
			kt += b.effectiveInvMass(c.rbx, c.rby, c.rbz, tx, ty, tz);
		}
		if (kt <= 1.0E-12) {
			return;
		}
		double lt = -vt / kt;
		double nax = c.atx + tx * lt, nay = c.aty + ty * lt, naz = c.atz + tz * lt;
		double max = c.friction * c.accN;
		double mag = Math.sqrt(nax * nax + nay * nay + naz * naz);
		if (mag > max) {
			double s = max / mag;
			nax *= s;
			nay *= s;
			naz *= s;
		}
		double jx = nax - c.atx, jy = nay - c.aty, jz = naz - c.atz;
		c.atx = nax;
		c.aty = nay;
		c.atz = naz;
		a.applyImpulse(jx, jy, jz, c.rax, c.ray, c.raz);
		if (b != null) {
			b.applyImpulse(-jx, -jy, -jz, c.rbx, c.rby, c.rbz);
		}
	}

	// ------------------------------------------------------------------------------------------

	private static void hurtEntities(ServerLevel level, Sim s) {
		AABB box = s.e.getBoundingBox().inflate(0.25);
		List<LivingEntity> victims = level.getEntitiesOfClass(LivingEntity.class, box, LivingEntity::isAlive);
		for (LivingEntity victim : victims) {
			AABB vb = victim.getBoundingBox();
			double cx = (vb.minX + vb.maxX) * 0.5;
			double cz = (vb.minZ + vb.maxZ) * 0.5;
			double[][] probes = {{cx, (vb.minY + vb.maxY) * 0.5, cz}, {cx, vb.minY + 0.15, cz}, {cx, vb.maxY - 0.15, cz}};
			for (double[] p : probes) {
				Vector3d q = s.e.toBody(p[0], p[1], p[2]);
				if (s.b.blockAt(q.x, q.y, q.z, -0.15) < 0) {
					continue;
				}
				double rx = p[0] - s.pos.x, ry = p[1] - s.pos.y, rz = p[2] - s.pos.z;
				double vx = s.vel.x + (s.angVel.y * rz - s.angVel.z * ry);
				double vy = s.vel.y + (s.angVel.z * rx - s.angVel.x * rz);
				double vz = s.vel.z + (s.angVel.x * ry - s.angVel.y * rx);
				double speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
				if (speed > 3.0) {
					float damage = (float) Math.min(30.0, (speed - 3.0) * Math.sqrt(s.b.mass) * 0.6);
					if (damage >= 1.0F) {
						victim.hurtServer(level, level.damageSources().fallingBlock(s.e), damage);
						victim.push(vx * 0.02, Math.max(0.1, vy * 0.02), vz * 0.02);
					}
				}
				break;
			}
		}
	}
}
