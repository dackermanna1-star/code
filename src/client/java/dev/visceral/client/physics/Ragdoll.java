package dev.visceral.client.physics;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.level.Level;
import org.joml.Quaterniond;
import org.joml.Vector3d;

/**
 * A set of rigid bodies connected by joints, simulated with substepped XPBD at a fixed rate and
 * interpolated for rendering. Collides with block shapes and (coarsely) with itself.
 */
public class Ragdoll {
	public static final double STEP = 1.0 / 60.0;

	public final List<RigidBody> bodies = new ArrayList<>();
	public final List<Joint> joints = new ArrayList<>();
	/** Capsule pairs (indices into {@link #capsules}) that must not interpenetrate. */
	protected final List<int[]> selfPairs = new ArrayList<>();
	protected final List<Capsule> capsules = new ArrayList<>();
	public final Vector3d gravity = new Vector3d(0, -24, 0);
	public int substeps = 8;
	public double accumulator;
	public double time;
	/** Root body kept loosely near the server-side entity position. */
	public RigidBody tetherBody;
	public final Vector3d tetherTarget = new Vector3d();
	public double tetherRadius = 0.6;
	public double tetherVertical = 1.2;
	public double tetherStiffness = 6.0;
	public boolean tetherEnabled = true;
	/** Average speed over the last step (blocks/second), used for settling/sleeping. */
	public double kineticSpeed;
	public int restingSteps;

	private final WorldCollider collider = new WorldCollider();
	private final WorldCollider.Contact contact = new WorldCollider.Contact();
	private final Vector3d tmpP = new Vector3d(), tmpPrev = new Vector3d(), tmpR = new Vector3d(), tmpN = new Vector3d();
	private final Vector3d tmpA = new Vector3d(), tmpB = new Vector3d(), tmpC = new Vector3d();
	private final List<ContactRecord> contacts = new ArrayList<>();
	private final List<ContactRecord> contactPool = new ArrayList<>();
	private final Vector3d sa0 = new Vector3d(), sa1 = new Vector3d(), sb0 = new Vector3d(), sb1 = new Vector3d();
	private final Vector3d spa = new Vector3d(), spb = new Vector3d(), sd = new Vector3d(), sra = new Vector3d(), srb = new Vector3d(), sp = new Vector3d();

	/** A capsule segment along a body's local axis, for self collision. */
	public static final class Capsule {
		final RigidBody body;
		final Vector3d a, b;
		final double radius;

		public Capsule(RigidBody body, Vector3d a, Vector3d b, double radius) {
			this.body = body;
			this.a = a;
			this.b = b;
			this.radius = radius;
		}
	}

	private static final class ContactRecord {
		RigidBody body;
		final Vector3d r = new Vector3d();
		final Vector3d n = new Vector3d();
		double vnBefore;
	}

	public int addCapsule(Capsule c) {
		capsules.add(c);
		return capsules.size() - 1;
	}

	public void addSelfPair(int a, int b) {
		selfPairs.add(new int[] {a, b});
	}

	/** Advances by {@code dt} seconds using fixed steps; returns the interpolation alpha. */
	public double advance(Level level, double dt) {
		accumulator += Math.min(dt, 0.1);
		int steps = 0;
		while (accumulator >= STEP && steps < 6) {
			step(level, STEP);
			accumulator -= STEP;
			steps++;
		}
		if (steps == 6) accumulator = 0;
		return accumulator / STEP;
	}

	protected void beforeStep(double dt) {
	}

	public void step(Level level, double dt) {
		for (RigidBody b : bodies) b.beginStep();
		beforeStep(dt);
		collider.begin(level);
		double h = dt / substeps;
		double ke = 0;
		for (int s = 0; s < substeps; s++) {
			for (RigidBody b : bodies) b.integrate(h, gravity);
			for (Joint j : joints) j.solvePosition(h);
			for (Joint j : joints) j.solveAngular(h);
			solveSelfCollisions();
			if (tetherEnabled && tetherBody != null) solveTether(h);
			contacts.clear();
			solveWorld();
			for (RigidBody b : bodies) b.updateVelocities(h);
			solveContactVelocities(h);
			for (Joint j : joints) j.dampVelocity(h);
		}
		for (RigidBody b : bodies) ke += b.vel.length() + b.angVel.length() * 0.15;
		kineticSpeed = ke / Math.max(1, bodies.size());
		restingSteps = kineticSpeed < 0.08 ? restingSteps + 1 : 0;
		time += dt;
	}

	private void solveWorld() {
		for (RigidBody b : bodies) {
			if (!b.collidesWithWorld || b.isStatic()) continue;
			double deepest = 0;
			for (Vector3d s : b.samples) {
				b.rot.transform(s, tmpR);
				tmpP.set(tmpR).add(b.pos);
				b.prevRot.transform(s, tmpPrev).add(b.prevPos);
				if (!collider.resolve(tmpP, tmpPrev, contact)) continue;
				tmpN.set(contact.nx, contact.ny, contact.nz);
				double depth = contact.depth;
				double w = b.positionalInvMass(tmpN, tmpR);
				if (w <= 0) continue;
				double lambda = depth / w;
				tmpA.set(tmpN).mul(lambda);
				b.applyPositionalCorrection(tmpA, tmpR, 1);
				// Static friction: undo tangential slip of the contact point this substep.
				b.rot.transform(s, tmpR);
				tmpP.set(tmpR).add(b.pos);
				tmpB.set(tmpP).sub(tmpPrev);
				tmpB.fma(-tmpB.dot(tmpN), tmpN);
				double slip = tmpB.length();
				if (slip > 1e-9 && slip < b.friction * depth * 2.5) {
					tmpC.set(tmpB).div(slip);
					double wt = b.positionalInvMass(tmpC, tmpR);
					if (wt > 0) {
						tmpA.set(tmpC).mul(-slip / wt);
						b.applyPositionalCorrection(tmpA, tmpR, 1);
					}
				}
				ContactRecord rec = contacts.size() < contactPool.size() ? contactPool.get(contacts.size()) : addPooled();
				rec.body = b;
				rec.r.set(tmpR);
				rec.n.set(tmpN);
				b.pointVelocity(tmpR, tmpA);
				rec.vnBefore = tmpA.dot(tmpN);
				contacts.add(rec);
				b.contactCount++;
				if (depth > deepest) {
					deepest = depth;
					b.lastContactNormal.set(tmpN);
				}
			}
		}
	}

	private ContactRecord addPooled() {
		ContactRecord rec = new ContactRecord();
		contactPool.add(rec);
		return rec;
	}

	private void solveContactVelocities(double h) {
		for (ContactRecord c : contacts) {
			RigidBody b = c.body;
			Vector3d v = b.pointVelocity(c.r, tmpA);
			double vn = v.dot(c.n);
			Vector3d vt = tmpB.set(v).fma(-vn, c.n);
			double vtLen = vt.length();
			// Dynamic friction (velocity level), proportional to how hard we are pressed into the ground.
			if (vtLen > 1e-6) {
				double normalImpulse = Math.abs(Math.min(0, c.vnBefore)) + 9.0 * h;
				double dv = Math.min(vtLen, b.friction * normalImpulse);
				tmpC.set(vt).mul(-dv / vtLen);
				double w = b.positionalInvMass(tmpC.lengthSquared() > 0 ? tmpN.set(tmpC).normalize() : tmpN.set(c.n), c.r);
				if (w > 0) b.applyImpulse(tmpC.div(w), c.r);
			}
			// Restitution for real impacts only.
			if (c.vnBefore < -1.5) {
				double target = -b.restitution * c.vnBefore;
				double dv = target - vn;
				if (dv > 0) {
					double w = b.positionalInvMass(c.n, c.r);
					if (w > 0) b.applyImpulse(tmpC.set(c.n).mul(dv / w), c.r);
				}
			}
		}
	}

	private void solveSelfCollisions() {
		for (int[] pair : selfPairs) {
			Capsule ca = capsules.get(pair[0]), cb = capsules.get(pair[1]);
			ca.body.localToWorld(ca.a, sa0);
			ca.body.localToWorld(ca.b, sa1);
			cb.body.localToWorld(cb.a, sb0);
			cb.body.localToWorld(cb.b, sb1);
			closestPoints(sa0, sa1, sb0, sb1, spa, spb, tmpA, tmpB, tmpC);
			Vector3d d = sd.set(spb).sub(spa);
			double dist = d.length();
			double min = ca.radius + cb.radius;
			if (dist >= min || dist < 1e-9) continue;
			d.div(dist);
			double pen = min - dist;
			Vector3d ra = sra.set(spa).sub(ca.body.pos);
			Vector3d rb = srb.set(spb).sub(cb.body.pos);
			double w = ca.body.positionalInvMass(d, ra) + cb.body.positionalInvMass(d, rb);
			if (w <= 0) continue;
			Vector3d p = sp.set(d).mul(pen / w);
			cb.body.applyPositionalCorrection(p, rb, 1);
			ca.body.applyPositionalCorrection(p, ra, -1);
		}
	}

	private void solveTether(double h) {
		RigidBody b = tetherBody;
		double dx = b.pos.x - tetherTarget.x, dz = b.pos.z - tetherTarget.z, dy = b.pos.y - tetherTarget.y;
		double horiz = Math.sqrt(dx * dx + dz * dz);
		double k = Math.min(1.0, tetherStiffness * h);
		if (horiz > tetherRadius) {
			double excess = (horiz - tetherRadius) * k;
			b.pos.x -= dx / horiz * excess;
			b.pos.z -= dz / horiz * excess;
		}
		if (Math.abs(dy) > tetherVertical) {
			double excess = (Math.abs(dy) - tetherVertical) * k;
			b.pos.y -= Math.signum(dy) * excess;
		}
	}

	/** Moves every body rigidly (teleports, large server corrections). */
	public void translate(double dx, double dy, double dz) {
		for (RigidBody b : bodies) b.translate(dx, dy, dz);
	}

	public void applyImpulseAt(RigidBody body, Vector3d impulse, Vector3d worldPoint) {
		Vector3d r = new Vector3d(worldPoint).sub(body.pos);
		body.applyImpulse(impulse, r);
	}

	static void closestPoints(Vector3d p1, Vector3d q1, Vector3d p2, Vector3d q2, Vector3d c1, Vector3d c2, Vector3d d1, Vector3d d2, Vector3d r) {
		d1.set(q1).sub(p1);
		d2.set(q2).sub(p2);
		r.set(p1).sub(p2);
		double a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
		double s, t;
		if (a <= 1e-9 && e <= 1e-9) {
			c1.set(p1);
			c2.set(p2);
			return;
		}
		if (a <= 1e-9) {
			s = 0;
			t = clamp01(f / e);
		} else {
			double c = d1.dot(r);
			if (e <= 1e-9) {
				t = 0;
				s = clamp01(-c / a);
			} else {
				double b = d1.dot(d2), denom = a * e - b * b;
				s = denom != 0 ? clamp01((b * f - c * e) / denom) : 0;
				t = (b * s + f) / e;
				if (t < 0) {
					t = 0;
					s = clamp01(-c / a);
				} else if (t > 1) {
					t = 1;
					s = clamp01((b - c) / a);
				}
			}
		}
		c1.set(p1).fma(s, d1);
		c2.set(p2).fma(t, d2);
	}

	private static double clamp01(double v) {
		return v < 0 ? 0 : (v > 1 ? 1 : v);
	}

	public void interpolatedTransform(RigidBody b, double alpha, Vector3d pos, Quaterniond rot) {
		b.interpolate(alpha, pos, rot);
	}
}
