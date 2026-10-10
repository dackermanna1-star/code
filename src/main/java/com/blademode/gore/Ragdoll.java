package com.blademode.gore;

import com.blademode.geom.Plane;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.function.Predicate;
import net.minecraft.world.phys.AABB;
import org.joml.Quaterniond;
import org.joml.Vector3d;

/**
 * A creature's body as jointed rigid chunks, which can be cut apart.
 *
 * <p>Simulation: extended position based dynamics with substepping. Bodies are boxes for inertia and
 * self collision and touch the world with the corners of their real (cut) geometry; joints are ball
 * sockets with cone limits; the world is the real block collision geometry, with static and dynamic
 * friction. (Solver adapted from Visceral's ragdolls.)
 */
public final class Ragdoll {
	private static final int SUBSTEPS = 8;
	private static final double TICK = 0.05;
	private static final double STATIC_FRICTION = 0.6;
	private static final double DYNAMIC_FRICTION = 0.45;
	private static final double RESTITUTION = 0.12;
	private static final double LINEAR_DAMPING = 0.05;
	private static final double ANGULAR_DAMPING = 1.0;
	private static final int SINK_TICKS = 50;
	private static final double MAX_SPEED = 30.0;
	private static final double MAX_SPIN = 22.0;
	/** Deep penetrations are resolved over several substeps instead of launching the body. */
	private static final double MAX_CORRECTION = 0.035;
	/** A body is only cut when the smaller side holds at least this fraction of it. */
	public static final double MIN_CUT_FRACTION = 0.04;

	public final Vector3d anchor;
	public final List<Body> bodies = new ArrayList<>();
	final List<Joint> joints = new ArrayList<>();
	private boolean[][] ignoreCollision = new boolean[0][0];
	/** Heaviest body of every loose chunk: dying bodies buckle there. */
	private final List<Body> chunkHeads = new ArrayList<>();
	private final List<ContactPoint> contacts = new ArrayList<>();
	private boolean[] touching = new boolean[0];
	private int contactCount;
	private int settleTicks;
	private boolean settling;
	private Vector3d restCheck;
	private long sleepSignature;
	private boolean sleeping;
	private int calmTicks;
	private int age;
	private int throesUntil = 36;
	private final long seed;
	private AABB bounds = new AABB(0, 0, 0, 0, 0, 0);

	private static final class ContactPoint {
		Body body;
		final Vector3d local = new Vector3d();
		final Vector3d normal = new Vector3d();
		double lambda;
		double normalVelocityBefore;
	}

	public Ragdoll(Vector3d anchor, List<Body> bodies, List<Joint> joints, long seed) {
		this.anchor = new Vector3d(anchor);
		this.bodies.addAll(bodies);
		this.joints.addAll(joints);
		this.seed = seed;
		this.rebuild();
	}

	public int age() {
		return this.age;
	}

	public boolean isSleeping() {
		return this.sleeping;
	}

	public AABB bounds() {
		return this.bounds;
	}

	public int jointCount() {
		return this.joints.size();
	}

	/** Number of separate chunks (bodies connected through joints count as one). */
	public int chunkCount() {
		return this.chunkHeads.size();
	}

	/** Recomputes everything derived from the body/joint lists. */
	private void rebuild() {
		int n = this.bodies.size();
		this.ignoreCollision = new boolean[n][n];
		Map<Body, Integer> index = new IdentityHashMap<>();
		for (int i = 0; i < n; i++) {
			index.put(this.bodies.get(i), i);
		}
		int[] root = new int[n];
		for (int i = 0; i < n; i++) {
			root[i] = i;
		}
		for (Joint joint : this.joints) {
			int a = index.get(joint.parent);
			int b = index.get(joint.child);
			this.ignoreCollision[a][b] = true;
			this.ignoreCollision[b][a] = true;
			int ra = find(root, a);
			int rb = find(root, b);
			if (ra != rb) {
				root[rb] = ra;
			}
		}
		// Parts that already overlap (hips, shoulders, the two faces of a fresh cut) never push each other apart.
		for (int i = 0; i < n; i++) {
			for (int j = i + 1; j < n; j++) {
				if (!this.ignoreCollision[i][j] && spheresOverlap(this.bodies.get(i), this.bodies.get(j), 0.02)) {
					this.ignoreCollision[i][j] = true;
					this.ignoreCollision[j][i] = true;
				}
			}
		}
		Map<Integer, Body> heads = new LinkedHashMap<>();
		for (int i = 0; i < n; i++) {
			Body body = this.bodies.get(i);
			heads.merge(find(root, i), body, (a, b) -> b.mass > a.mass ? b : a);
		}
		this.chunkHeads.clear();
		this.chunkHeads.addAll(heads.values());
		this.touching = new boolean[n];
		this.updateBounds();
	}

	private static int find(int[] root, int i) {
		while (root[i] != i) {
			root[i] = root[root[i]];
			i = root[i];
		}
		return i;
	}

	// ------------------------------------------------------------------------------------------
	// Cutting

	/**
	 * Result of a cut: the new bodies, which side of the plane every body is on (-1 back, 1 front),
	 * and the joints that came apart between two whole parts.
	 */
	public record Cut(List<Body> created, Map<Body, Integer> sides, List<Severed> severed) {
		public boolean happened() {
			return !this.created.isEmpty() || !this.severed.isEmpty();
		}
	}

	/** Two whole parts that were jointed at {@code at} and are not any more. */
	public record Severed(Body a, Body b, Vector3d at) {
	}

	/**
	 * Cuts every body the predicate accepts along a world plane (absolute coordinates; the back side
	 * is {@code n·p <= d}). Joints across the cut are severed, the two sides are pushed apart.
	 *
	 * @param reach    which bodies the blade actually passes through
	 * @param blade    direction the blade travels (unit), drags the pieces along
	 * @param separate speed the two sides move apart with (blocks/second)
	 * @param drag     speed the blade gives the pieces it passes through (blocks/second)
	 */
	public Cut cut(Plane plane, Predicate<Body> reach, Vector3d blade, double separate, double drag) {
		Plane relative = plane.translated(this.anchor.x, this.anchor.y, this.anchor.z);
		Map<Body, Body[]> split = new IdentityHashMap<>();
		Map<Body, Integer> sides = new IdentityHashMap<>();
		List<Body> result = new ArrayList<>();
		List<Body> created = new ArrayList<>();
		for (Body body : this.bodies) {
			if (!reach.test(body)) {
				result.add(body);
				sides.put(body, plane.dist(body.pos.x, body.pos.y, body.pos.z) > 0 ? 1 : -1);
				continue;
			}
			List<Piece> now = new ArrayList<>(body.pieces.size());
			for (Piece piece : body.pieces) {
				now.add(piece.rebased(body.currentWorld(piece)));
			}
			boolean hasMain = now.stream().anyMatch(Piece::isMain);
			double back = 0;
			double front = 0;
			for (Piece piece : now) {
				if (piece.isMain() || !hasMain) {
					double[] v = piece.split(relative);
					back += v[0];
					front += v[1];
				}
			}
			double total = back + front;
			if (total < 1.0E-9 || Math.min(back, front) < MIN_CUT_FRACTION * total) {
				result.add(body);
				int side = total < 1.0E-9 ? (plane.dist(body.pos.x, body.pos.y, body.pos.z) > 0 ? 1 : -1) : (front > back ? 1 : -1);
				sides.put(body, side);
				continue;
			}
			List<Piece> backPieces = new ArrayList<>();
			List<Piece> frontPieces = new ArrayList<>();
			for (Piece piece : now) {
				int side = sideOf(piece, relative);
				if (side <= 0) {
					Piece b = side < 0 ? piece : piece.cut(relative);
					if (b != null) {
						backPieces.add(b);
					}
				}
				if (side >= 0) {
					Piece f = side > 0 ? piece : piece.cut(relative.flip());
					if (f != null) {
						frontPieces.add(f);
					}
				}
			}
			Body backBody = backPieces.isEmpty() ? null : Body.create(body.name, body.density, this.anchor, body.rot, backPieces);
			Body frontBody = frontPieces.isEmpty() ? null : Body.create(body.name, body.density, this.anchor, body.rot, frontPieces);
			Body[] halves = {backBody, frontBody};
			split.put(body, halves);
			for (int s = 0; s < 2; s++) {
				Body half = halves[s];
				if (half != null) {
					half.inheritMotion(body);
					half.light = body.light;
					result.add(half);
					created.add(half);
					sides.put(half, s == 0 ? -1 : 1);
				}
			}
		}
		List<Joint> kept = new ArrayList<>();
		for (Joint joint : this.joints) {
			Body[] parentHalves = split.get(joint.parent);
			Body[] childHalves = split.get(joint.child);
			if (parentHalves == null && childHalves == null) {
				// Two whole parts that ended up on either side of the cut come apart where they met.
				boolean apart = !sides.get(joint.parent).equals(sides.get(joint.child));
				if (!apart || !(reach.test(joint.parent) || reach.test(joint.child))) {
					kept.add(joint);
				}
				continue;
			}
			Vector3d at = joint.worldAnchor();
			double dist = plane.dist(at.x, at.y, at.z);
			int s = dist > 1.0E-6 ? 1 : dist < -1.0E-6 ? 0 : (plane.dist(joint.child.pos.x, joint.child.pos.y, joint.child.pos.z) > 0 ? 1 : 0);
			Body parent = parentHalves != null ? parentHalves[s] : (sides.get(joint.parent) == (s == 1 ? 1 : -1) ? joint.parent : null);
			Body child = childHalves != null ? childHalves[s] : (sides.get(joint.child) == (s == 1 ? 1 : -1) ? joint.child : null);
			if (parent != null && child != null) {
				// The halves keep their bone's frame, so the joint's rest pose still applies.
				kept.add(new Joint(parent, child, at, joint.maxAngle, joint.damping, joint.restRelative));
			}
		}

		List<Severed> severed = new ArrayList<>();
		for (Joint joint : this.joints) {
			if (!kept.contains(joint) && split.get(joint.parent) == null && split.get(joint.child) == null) {
				severed.add(new Severed(joint.parent, joint.child, joint.worldAnchor()));
			}
		}
		if (created.isEmpty() && severed.isEmpty()) {
			return new Cut(List.of(), Map.of(), List.of());
		}

		Vector3d normal = new Vector3d(plane.nx(), plane.ny(), plane.nz());
		for (Body body : result) {
			if (!created.contains(body) && !reach.test(body)) {
				continue;
			}
			int side = sides.get(body);
			double massScale = Math.min(1.0, 1.2 / Math.sqrt(Math.max(body.mass, 0.05)));
			body.vel.fma(side * separate * (0.6 + 0.4 * massScale), normal);
			body.vel.fma(drag * (0.5 + 0.5 * massScale), blade);
			body.omega.add(new Vector3d(normal).cross(blade).mul(side * drag * 0.8 * massScale));
		}

		this.bodies.clear();
		this.bodies.addAll(result);
		this.joints.clear();
		this.joints.addAll(kept);
		this.rebuild();
		this.wake();
		this.throesUntil = Math.max(this.throesUntil, this.age + 30);
		return new Cut(created, sides, severed);
	}

	/** -1 when a piece lies entirely on the back side, 1 when entirely in front, 0 when the plane passes through it. */
	private static int sideOf(Piece piece, Plane relative) {
		List<Vector3d> points = new ArrayList<>();
		piece.points(points);
		boolean back = false;
		boolean front = false;
		for (Vector3d p : points) {
			double d = relative.dist(p.x, p.y, p.z);
			back |= d < -1.0E-5;
			front |= d > 1.0E-5;
		}
		return back && front ? 0 : front ? 1 : -1;
	}

	// ------------------------------------------------------------------------------------------
	// Simulation

	public void tick(WorldShape world, double gravity, int lifetimeTicks) {
		this.age++;
		for (Body body : this.bodies) {
			body.tickPos.set(body.pos);
			body.tickRot.set(body.rot);
		}
		if (this.bodies.isEmpty()) {
			return;
		}
		if (this.age > lifetimeTicks - SINK_TICKS) {
			this.sink();
			return;
		}
		if (this.sleeping) {
			// Asleep: only wake up when the blocks around change (or something pushes the body).
			if (this.age % 40 == 0) {
				world.prepare(this.simulationRegion());
				if (world.signature() != this.sleepSignature) {
					this.wake();
				}
			}
			if (this.sleeping) {
				return;
			}
		}

		world.prepare(this.simulationRegion());
		this.deathThroes();
		double h = TICK / SUBSTEPS;
		for (int step = 0; step < SUBSTEPS; step++) {
			this.integrate(h, gravity);
			for (Joint joint : this.joints) {
				joint.solvePosition();
			}
			for (Joint joint : this.joints) {
				joint.solveLimit();
			}
			this.solveSelfCollision();
			this.solveContacts(world);
			this.updateVelocities(h);
			this.solveContactVelocities(h, gravity);
			for (Joint joint : this.joints) {
				joint.solveVelocity(h);
			}
			this.dampRestingBodies();
		}
		this.updateBounds();
		this.updateSleep(world);
	}

	private void integrate(double h, double gravity) {
		double linear = Math.max(0.0, 1.0 - LINEAR_DAMPING * h);
		double angular = Math.max(0.0, 1.0 - ANGULAR_DAMPING * h);
		for (Body body : this.bodies) {
			body.prevPos.set(body.pos);
			body.prevRot.set(body.rot);
			body.vel.y -= gravity * h;
			body.vel.mul(linear);
			if (body.vel.lengthSquared() > MAX_SPEED * MAX_SPEED) {
				body.vel.normalize(MAX_SPEED);
			}
			if (body.omega.lengthSquared() > MAX_SPIN * MAX_SPIN) {
				body.omega.normalize(MAX_SPIN);
			}
			body.pos.fma(h, body.vel);
			body.omega.mul(angular);
			Vector3d spin = new Vector3d(body.omega).mul(h);
			body.rotate(spin);
		}
	}

	private void updateVelocities(double h) {
		Quaterniond delta = new Quaterniond();
		for (Body body : this.bodies) {
			body.vel.set(body.pos).sub(body.prevPos).div(h);
			body.prevRot.conjugate(delta);
			delta.premul(body.rot);
			double sign = delta.w < 0.0 ? -1.0 : 1.0;
			body.omega.set(delta.x, delta.y, delta.z).mul(2.0 * sign / h);
			if (!Double.isFinite(body.vel.x + body.vel.y + body.vel.z + body.omega.x + body.omega.y + body.omega.z)) {
				body.vel.zero();
				body.omega.zero();
				body.pos.set(body.prevPos);
				body.rot.set(body.prevRot);
			}
			if (body.vel.lengthSquared() > MAX_SPEED * MAX_SPEED) {
				body.vel.normalize(MAX_SPEED);
			}
			if (body.omega.lengthSquared() > MAX_SPIN * MAX_SPIN) {
				body.omega.normalize(MAX_SPIN);
			}
		}
	}

	private void solveContacts(WorldShape world) {
		this.contactCount = 0;
		if (this.touching.length != this.bodies.size()) {
			this.touching = new boolean[this.bodies.size()];
		}
		Arrays.fill(this.touching, false);
		if (world.isEmpty()) {
			return;
		}
		WorldShape.Contact contact = new WorldShape.Contact();
		Vector3d point = new Vector3d();
		Vector3d previous = new Vector3d();
		Vector3d r = new Vector3d();
		Vector3d impulse = new Vector3d();
		Vector3d tangent = new Vector3d();
		Vector3d velocity = new Vector3d();
		for (int index = 0; index < this.bodies.size(); index++) {
			Body body = this.bodies.get(index);
			for (Vector3d sample : body.samples) {
				body.worldPoint(sample, point);
				if (!world.collide(point, body.prevWorldPoint(sample, previous), contact)) {
					continue;
				}
				body.rot.transform(sample, r);
				double w = body.generalizedInvMass(r, contact.normal);
				double lambda = Math.min(contact.depth, MAX_CORRECTION) / w;
				this.touching[index] = true;
				impulse.set(contact.normal).mul(lambda);
				body.applyPositionImpulse(impulse, r, 1.0);

				// Static friction: undo sliding while the contact holds.
				body.worldPoint(sample, point);
				point.sub(previous, tangent);
				tangent.fma(-tangent.dot(contact.normal), contact.normal);
				double slide = tangent.length();
				if (slide > 1.0E-9 && slide < STATIC_FRICTION * contact.depth) {
					body.rot.transform(sample, r);
					tangent.div(slide);
					double wt = body.generalizedInvMass(r, tangent);
					impulse.set(tangent).mul(-slide / wt);
					body.applyPositionImpulse(impulse, r, 1.0);
				}

				ContactPoint cp = this.nextContact();
				cp.body = body;
				cp.local.set(sample);
				cp.normal.set(contact.normal);
				cp.lambda = lambda;
				body.rot.transform(sample, r);
				cp.normalVelocityBefore = body.pointVelocity(r, velocity).dot(contact.normal);
			}
		}
	}

	private ContactPoint nextContact() {
		if (this.contactCount == this.contacts.size()) {
			this.contacts.add(new ContactPoint());
		}
		return this.contacts.get(this.contactCount++);
	}

	private void solveContactVelocities(double h, double gravity) {
		Vector3d r = new Vector3d();
		Vector3d velocity = new Vector3d();
		Vector3d tangent = new Vector3d();
		Vector3d impulse = new Vector3d();
		for (int i = 0; i < this.contactCount; i++) {
			ContactPoint point = this.contacts.get(i);
			Body body = point.body;
			body.rot.transform(point.local, r);
			body.pointVelocity(r, velocity);
			double vn = velocity.dot(point.normal);
			tangent.set(velocity).fma(-vn, point.normal);
			double vt = tangent.length();
			if (vt > 1.0E-6) {
				double normalForce = point.lambda / (h * h);
				double change = Math.min(h * DYNAMIC_FRICTION * normalForce, vt);
				tangent.div(vt);
				double w = body.generalizedInvMass(r, tangent);
				impulse.set(tangent).mul(-change / w);
				body.applyVelocityImpulse(impulse, r);
			}
			double restitution = Math.abs(vn) < 2.0 * gravity * h ? 0.0 : RESTITUTION;
			double target = Math.max(-restitution * point.normalVelocityBefore, 0.0);
			if (vn < target) {
				double w = body.generalizedInvMass(r, point.normal);
				impulse.set(point.normal).mul((target - vn) / w);
				body.applyVelocityImpulse(impulse, r);
			}
		}
	}

	/**
	 * Dying bodies don't balance: for a second after death (or a cut) every loose chunk gets small
	 * random shoves and its limbs go limp, so whatever was left standing buckles and topples.
	 */
	private void deathThroes() {
		if (this.age > this.throesUntil || this.age % 4 != 1) {
			return;
		}
		Random random = new Random(this.seed * 31L + this.age);
		double strength = this.age < 12 ? 1.0 : 0.6;
		for (Body head : this.chunkHeads) {
			head.vel.add((random.nextDouble() - 0.5) * 1.6 * strength, -0.4 * strength, (random.nextDouble() - 0.5) * 1.6 * strength);
			head.omega.add((random.nextDouble() - 0.5) * 3.0 * strength, (random.nextDouble() - 0.5) * 1.0 * strength, (random.nextDouble() - 0.5) * 3.0 * strength);
		}
		for (Body body : this.bodies) {
			if (!this.chunkHeads.contains(body)) {
				body.omega.add((random.nextDouble() - 0.5) * 2.5 * strength, (random.nextDouble() - 0.5) * 2.5 * strength, (random.nextDouble() - 0.5) * 2.5 * strength);
			}
		}
	}

	/**
	 * Bodies lying on something lose energy quickly when they are nearly still: the soft, inelastic
	 * contact of flesh with the ground, so pieces come to rest instead of creeping.
	 */
	private void dampRestingBodies() {
		if (this.settling) {
			for (Body body : this.bodies) {
				body.vel.mul(0.86);
				body.omega.mul(0.86);
			}
			return;
		}
		for (int i = 0; i < this.bodies.size(); i++) {
			if (!this.touching[i]) {
				continue;
			}
			Body body = this.bodies.get(i);
			double speed = body.vel.length() + body.omega.length() * body.boundingRadius;
			if (speed < 1.5) {
				double factor = speed < 0.4 ? 0.8 : 0.93;
				body.vel.mul(factor);
				body.omega.mul(factor);
			}
		}
	}

	private void solveSelfCollision() {
		int n = this.bodies.size();
		Vector3d a = new Vector3d();
		Vector3d b = new Vector3d();
		Vector3d delta = new Vector3d();
		Vector3d ra = new Vector3d();
		Vector3d rb = new Vector3d();
		Vector3d impulse = new Vector3d();
		Vector3d local = new Vector3d();
		for (int i = 0; i < n; i++) {
			Body first = this.bodies.get(i);
			for (int j = i + 1; j < n; j++) {
				if (this.ignoreCollision[i][j]) {
					continue;
				}
				Body second = this.bodies.get(j);
				double reach = first.boundingRadius + second.boundingRadius;
				if (first.pos.distanceSquared(second.pos) > reach * reach) {
					continue;
				}
				for (int s = 0; s < first.spheres.length; s += 4) {
					first.worldPoint(local.set(first.spheres[s], first.spheres[s + 1], first.spheres[s + 2]), a);
					for (int t = 0; t < second.spheres.length; t += 4) {
						second.worldPoint(local.set(second.spheres[t], second.spheres[t + 1], second.spheres[t + 2]), b);
						double radius = first.spheres[s + 3] + second.spheres[t + 3];
						b.sub(a, delta);
						double distance = delta.length();
						if (distance >= radius || distance < 1.0E-7) {
							continue;
						}
						delta.div(distance);
						a.sub(first.pos, ra);
						b.sub(second.pos, rb);
						double w1 = first.generalizedInvMass(ra, delta);
						double w2 = second.generalizedInvMass(rb, delta);
						double lambda = (radius - distance) / (w1 + w2);
						impulse.set(delta).mul(lambda);
						first.applyPositionImpulse(impulse, ra, -1.0);
						second.applyPositionImpulse(impulse, rb, 1.0);
					}
				}
			}
		}
	}

	private static boolean spheresOverlap(Body first, Body second, double margin) {
		Vector3d a = new Vector3d();
		Vector3d b = new Vector3d();
		Vector3d local = new Vector3d();
		for (int s = 0; s < first.spheres.length; s += 4) {
			first.worldPoint(local.set(first.spheres[s], first.spheres[s + 1], first.spheres[s + 2]), a);
			for (int t = 0; t < second.spheres.length; t += 4) {
				second.worldPoint(local.set(second.spheres[t], second.spheres[t + 1], second.spheres[t + 2]), b);
				if (a.distance(b) < first.spheres[s + 3] + second.spheres[t + 3] + margin) {
					return true;
				}
			}
		}
		return false;
	}

	private void sink() {
		for (Body body : this.bodies) {
			body.pos.y -= 0.025;
			body.vel.zero();
			body.omega.zero();
		}
		this.updateBounds();
	}

	public boolean isFinished(int lifetimeTicks, double minY) {
		if (this.age > lifetimeTicks || this.bodies.isEmpty()) {
			return true;
		}
		for (Body body : this.bodies) {
			if (body.pos.y < minY - 32 || !Double.isFinite(body.pos.y)) {
				return true;
			}
		}
		return false;
	}

	private AABB simulationRegion() {
		double minX = Double.MAX_VALUE;
		double minY = Double.MAX_VALUE;
		double minZ = Double.MAX_VALUE;
		double maxX = -Double.MAX_VALUE;
		double maxY = -Double.MAX_VALUE;
		double maxZ = -Double.MAX_VALUE;
		for (Body body : this.bodies) {
			double reach = body.boundingRadius + body.vel.length() * TICK + 0.5;
			minX = Math.min(minX, body.pos.x - reach);
			minY = Math.min(minY, body.pos.y - reach);
			minZ = Math.min(minZ, body.pos.z - reach);
			maxX = Math.max(maxX, body.pos.x + reach);
			maxY = Math.max(maxY, body.pos.y + reach);
			maxZ = Math.max(maxZ, body.pos.z + reach);
		}
		return new AABB(minX, minY, minZ, maxX, maxY, maxZ);
	}

	private void updateBounds() {
		if (this.bodies.isEmpty()) {
			return;
		}
		double minX = Double.MAX_VALUE;
		double minY = Double.MAX_VALUE;
		double minZ = Double.MAX_VALUE;
		double maxX = -Double.MAX_VALUE;
		double maxY = -Double.MAX_VALUE;
		double maxZ = -Double.MAX_VALUE;
		for (Body body : this.bodies) {
			double r = body.boundingRadius;
			minX = Math.min(minX, body.pos.x - r);
			minY = Math.min(minY, body.pos.y - r);
			minZ = Math.min(minZ, body.pos.z - r);
			maxX = Math.max(maxX, body.pos.x + r);
			maxY = Math.max(maxY, body.pos.y + r);
			maxZ = Math.max(maxZ, body.pos.z + r);
		}
		this.bounds = new AABB(minX, minY, minZ, maxX, maxY, maxZ).inflate(0.25);
	}

	private void updateSleep(WorldShape world) {
		double energy = 0.0;
		for (Body body : this.bodies) {
			energy = Math.max(energy, body.vel.length() + body.omega.length() * Math.min(body.boundingRadius, 0.25));
		}
		// Chunks that stay put for a second and a half are at rest, whatever their limbs twitch.
		Vector3d centre = this.massCentre();
		if (this.age % 30 == 0) {
			if (this.restCheck != null && this.restCheck.distance(centre) < 0.025 && energy < 0.8 && this.age > 60) {
				this.calmTicks = 1000;
			}
			this.restCheck = centre;
		}
		if (energy < 0.9 && this.age > 45) {
			this.settleTicks++;
		} else {
			this.settleTicks = 0;
		}
		this.settling = this.settleTicks > 10;
		if (energy < 0.2 || this.calmTicks >= 1000) {
			if (++this.calmTicks > 25) {
				this.sleeping = true;
				this.sleepSignature = world.signature();
				for (Body body : this.bodies) {
					body.vel.zero();
					body.omega.zero();
				}
			}
		} else {
			this.calmTicks = 0;
			this.sleeping = false;
		}
	}

	private Vector3d massCentre() {
		Vector3d sum = new Vector3d();
		double mass = 0;
		for (Body body : this.bodies) {
			sum.fma(body.mass, body.pos);
			mass += body.mass;
		}
		return mass > 0 ? sum.div(mass) : sum;
	}

	public void wake() {
		this.sleeping = false;
		this.calmTicks = 0;
		this.restCheck = null;
		this.settleTicks = 0;
		this.settling = false;
	}

	/** Gives the bodies near {@code center} a velocity: walking into a corpse kicks it around. */
	public void shove(Vector3d center, double radius, Vector3d velocity) {
		for (Body body : this.bodies) {
			double distance = body.pos.distance(center);
			if (distance < radius + body.boundingRadius) {
				Vector3d push = new Vector3d(body.pos).sub(center.x, body.pos.y, center.z);
				if (push.lengthSquared() > 1.0E-6) {
					push.normalize(0.8);
				}
				body.vel.add(velocity.x * 0.8 + push.x, Math.max(0.0, velocity.y) + 0.4, velocity.z * 0.8 + push.z);
				this.wake();
			}
		}
	}

	/** Pushes every body away from a point (explosions). */
	public void blast(Vector3d center, double strength, double radius, Random random) {
		boolean moved = false;
		for (Body body : this.bodies) {
			Vector3d away = new Vector3d(body.pos).sub(center);
			double distance = away.length();
			if (distance > radius) {
				continue;
			}
			double falloff = 1.0 - distance / radius;
			if (distance < 1.0E-4) {
				away.set(0, 1, 0);
			} else {
				away.div(distance);
			}
			away.mul(strength * falloff).add(0.0, strength * falloff * 0.4, 0.0);
			body.vel.add(away);
			body.omega.add((random.nextDouble() - 0.5) * strength, (random.nextDouble() - 0.5) * strength, (random.nextDouble() - 0.5) * strength);
			moved = true;
		}
		if (moved) {
			this.wake();
		}
	}
}
