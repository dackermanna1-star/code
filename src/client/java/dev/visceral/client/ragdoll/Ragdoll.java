package dev.visceral.client.ragdoll;

import dev.visceral.VisceralConfig;
import dev.visceral.blood.BloodType;
import dev.visceral.blood.BloodTypes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4d;
import org.joml.Matrix4f;
import org.joml.Quaterniond;
import org.joml.Vector3d;

/**
 * A dead creature whose model parts are driven by rigid bodies.
 *
 * <p>Simulation: extended position based dynamics (Müller et al. 2020) with substepping. Bodies are
 * oriented boxes, joints are ball sockets with cone limits, the world is the real block collision
 * geometry, with static and dynamic friction and a little restitution.
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

	public final LivingEntity entity;
	public final int entityId;
	public final BloodType blood;
	final double anchorX;
	final double anchorY;
	final double anchorZ;
	final float bodyYaw;
	final float headYaw;
	final float headPitch;
	final float walkPosition;
	final float ageInTicks;
	final long bornTick;
	final RagdollManager.RecentHit killingHit;
	final Vec3 initialVelocity;

	private boolean built;
	private boolean failed;
	private int pendingTicks;
	private final List<RigidBody> bodies = new ArrayList<>();
	private final List<Joint> joints = new ArrayList<>();
	private final List<Part> parts = new ArrayList<>();
	private boolean[][] ignoreCollision = new boolean[0][0];
	private final WorldCollider collider = new WorldCollider();
	private final List<ContactPoint> contacts = new ArrayList<>();
	private boolean[] touching = new boolean[0];
	private int settleTicks;
	private boolean settling;
	private Vec3 restCheck;
	private long sleepSignature;
	private int contactCount;
	private boolean sleeping;
	private int calmTicks;
	private int age;
	private int sinkTicks;
	int light = 0xF000F0;
	private AABB bounds;
	private int poolFeeds;

	/** A model part driven by a body: its world transform at death (relative to the anchor). */
	record Part(String path, int body, Matrix4d world0) {
	}

	private static final class ContactPoint {
		RigidBody body;
		final Vector3d local = new Vector3d();
		final Vector3d normal = new Vector3d();
		double lambda;
		double normalVelocityBefore;
	}

	Ragdoll(LivingEntity entity, long tick, RagdollManager.RecentHit killingHit) {
		this.entity = entity;
		this.entityId = entity.getId();
		this.blood = BloodTypes.of(entity.getType());
		this.anchorX = entity.getX();
		this.anchorY = entity.getY();
		this.anchorZ = entity.getZ();
		this.bodyYaw = entity.yBodyRot;
		this.headYaw = Mth.wrapDegrees(entity.getYHeadRot() - entity.yBodyRot);
		this.headPitch = entity.getXRot();
		this.walkPosition = entity.walkAnimation.position();
		this.ageInTicks = entity.tickCount;
		this.bornTick = tick;
		this.killingHit = killingHit;
		Vec3 motion = entity.getDeltaMovement();
		Vec3 moved = entity.position().subtract(entity.xo, entity.yo, entity.zo);
		Vec3 perTick = moved.lengthSqr() > motion.lengthSqr() ? moved : motion;
		this.initialVelocity = new Vec3(perTick.x, Math.max(perTick.y, -0.5), perTick.z).scale(20.0);
		this.bounds = entity.getBoundingBox();
	}

	public boolean isBuilt() {
		return this.built;
	}

	public boolean isFailed() {
		return this.failed;
	}

	public boolean isSleeping() {
		return this.sleeping;
	}

	public int age() {
		return this.age;
	}

	public AABB bounds() {
		return this.bounds;
	}

	public boolean isCorpse() {
		return this.entity.isRemoved() || this.entity.level() == null;
	}

	void markFailed() {
		this.failed = true;
	}

	/** Pending ragdolls give up when their entity is never rendered. */
	boolean tickPending() {
		return ++this.pendingTicks < 60;
	}

	// ------------------------------------------------------------------ construction

	void install(List<RigidBody> bodies, List<Joint> joints, List<Part> parts) {
		this.bodies.addAll(bodies);
		this.joints.addAll(joints);
		this.parts.addAll(parts);
		int n = bodies.size();
		this.ignoreCollision = new boolean[n][n];
		for (Joint joint : joints) {
			this.ignoreCollision[joint.parentIndex][joint.childIndex] = true;
			this.ignoreCollision[joint.childIndex][joint.parentIndex] = true;
		}
		// Parts that already overlap at rest (hips, shoulders) never push each other apart.
		for (int i = 0; i < n; i++) {
			for (int j = i + 1; j < n; j++) {
				if (!this.ignoreCollision[i][j] && this.spheresOverlap(bodies.get(i), bodies.get(j), 0.02)) {
					this.ignoreCollision[i][j] = true;
					this.ignoreCollision[j][i] = true;
				}
			}
		}
		this.built = true;
		this.updateBounds();
		this.applyInitialMotion();
	}

	private void applyInitialMotion() {
		VisceralConfig config = VisceralConfig.get();
		Vector3d base = new Vector3d(this.initialVelocity.x, this.initialVelocity.y, this.initialVelocity.z);
		for (RigidBody body : this.bodies) {
			body.vel.set(base);
		}
		RagdollManager.RecentHit hit = this.killingHit;
		if (hit == null || this.bodies.isEmpty()) {
			return;
		}
		Vector3d dir = new Vector3d(hit.direction().x, hit.direction().y, hit.direction().z);
		if (dir.lengthSquared() < 1.0E-6) {
			return;
		}
		dir.normalize();
		double scale = config.ragdollImpulseScale;
		if (hit.explosion()) {
			double speed = Mth.clamp(hit.damage() * 0.8, 3.0, 14.0) * scale;
			for (RigidBody body : this.bodies) {
				Vector3d away = new Vector3d(body.pos).sub(hit.point().x, hit.point().y, hit.point().z);
				if (away.lengthSquared() < 1.0E-4) {
					away.set(dir);
				}
				away.normalize().mul(speed).add(0.0, speed * 0.35, 0.0);
				body.vel.add(away);
				body.omega.add((Math.random() - 0.5) * 8.0, (Math.random() - 0.5) * 8.0, (Math.random() - 0.5) * 8.0);
			}
			return;
		}
		double speed = Mth.clamp(hit.damage() * 0.45, 1.2, 7.0) * scale;
		// Part of the blow moves the whole body, the rest hits the part that was struck and makes it spin.
		for (RigidBody body : this.bodies) {
			body.vel.fma(speed * 0.55, dir);
			body.vel.y += speed * 0.12;
		}
		Vector3d point = new Vector3d(hit.point().x, hit.point().y, hit.point().z);
		RigidBody struck = this.bodies.getFirst();
		double best = Double.MAX_VALUE;
		for (RigidBody body : this.bodies) {
			double d = body.distanceTo(point);
			if (d < best) {
				best = d;
				struck = body;
			}
		}
		Vector3d impulse = new Vector3d(dir).mul(speed * 0.9 * struck.mass);
		Vector3d r = new Vector3d(point).sub(struck.pos);
		struck.applyVelocityImpulse(impulse, r);
		// Thin limbs have tiny inertia: an off-centre blow must not turn them into propellers.
		for (RigidBody body : this.bodies) {
			if (body.omega.lengthSquared() > 36.0) {
				body.omega.normalize(6.0);
			}
		}
	}

	// ------------------------------------------------------------------ simulation

	void tick(ClientLevel level, VisceralConfig config, int lifetimeTicks) {
		this.age++;
		for (RigidBody body : this.bodies) {
			body.tickPos.set(body.pos);
			body.tickRot.set(body.rot);
		}
		if (this.age > lifetimeTicks - SINK_TICKS) {
			this.sink();
			return;
		}
		if (this.sleeping) {
			// Asleep: only wake up when the blocks around the corpse change (or something pushes it).
			if (this.age % 40 == 0) {
				this.collider.prepare(level, this.simulationRegion());
				if (this.collider.signature() != this.sleepSignature) {
					this.wake();
				}
			}
			if (this.sleeping) {
				return;
			}
		}

		this.collider.prepare(level, this.simulationRegion());
		this.deathThroes();
		double h = TICK / SUBSTEPS;
		double gravity = config.ragdollGravity;
		for (int step = 0; step < SUBSTEPS; step++) {
			this.integrate(h, gravity);
			for (Joint joint : this.joints) {
				joint.solvePosition();
			}
			for (Joint joint : this.joints) {
				joint.solveLimit();
			}
			this.solveSelfCollision();
			this.solveContacts();
			this.updateVelocities(h);
			this.solveContactVelocities(h, gravity);
			for (Joint joint : this.joints) {
				joint.solveVelocity(h);
			}
			this.dampRestingBodies();
		}
		this.updateBounds();
		this.updateSleep();
		this.light = LevelRenderer.getLightColor(level, BlockPos.containing(this.bodies.getFirst().pos.x, this.bodies.getFirst().pos.y + 0.1, this.bodies.getFirst().pos.z));
	}

	private void integrate(double h, double gravity) {
		double linear = Math.max(0.0, 1.0 - LINEAR_DAMPING * h);
		double angular = Math.max(0.0, 1.0 - ANGULAR_DAMPING * h);
		for (RigidBody body : this.bodies) {
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
		for (RigidBody body : this.bodies) {
			body.vel.set(body.pos).sub(body.prevPos).div(h);
			body.prevRot.conjugate(delta);
			delta.premul(body.rot);
			double sign = delta.w < 0.0 ? -1.0 : 1.0;
			body.omega.set(delta.x, delta.y, delta.z).mul(2.0 * sign / h);
			// Guard against numerical explosions.
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

	private void solveContacts() {
		this.contactCount = 0;
		if (this.touching.length != this.bodies.size()) {
			this.touching = new boolean[this.bodies.size()];
		}
		java.util.Arrays.fill(this.touching, false);
		if (this.collider.isEmpty()) {
			return;
		}
		WorldCollider.Contact contact = new WorldCollider.Contact();
		Vector3d world = new Vector3d();
		Vector3d previous = new Vector3d();
		Vector3d r = new Vector3d();
		Vector3d impulse = new Vector3d();
		Vector3d tangent = new Vector3d();
		Vector3d velocity = new Vector3d();
		for (int index = 0; index < this.bodies.size(); index++) {
			RigidBody body = this.bodies.get(index);
			for (Vector3d sample : body.samples) {
				body.worldPoint(sample, world);
				if (!this.collider.collide(world, body.prevWorldPoint(sample, previous), contact)) {
					continue;
				}
				body.rot.transform(sample, r);
				double w = body.generalizedInvMass(r, contact.normal);
				double lambda = Math.min(contact.depth, MAX_CORRECTION) / w;
				this.touching[index] = true;
				impulse.set(contact.normal).mul(lambda);
				body.applyPositionImpulse(impulse, r, 1.0);

				// Static friction: undo sliding while the contact holds.
				body.worldPoint(sample, world);
				world.sub(previous, tangent);
				tangent.fma(-tangent.dot(contact.normal), contact.normal);
				double slide = tangent.length();
				if (slide > 1.0E-9 && slide < STATIC_FRICTION * contact.depth) {
					body.rot.transform(sample, r);
					tangent.div(slide);
					double wt = body.generalizedInvMass(r, tangent);
					impulse.set(tangent).mul(-slide / wt);
					body.applyPositionImpulse(impulse, r, 1.0);
				}

				ContactPoint point = this.nextContact();
				point.body = body;
				point.local.set(sample);
				point.normal.set(contact.normal);
				point.lambda = lambda;
				body.rot.transform(sample, r);
				point.normalVelocityBefore = body.pointVelocity(r, velocity).dot(contact.normal);
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
			RigidBody body = point.body;
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
	 * Dying bodies don't balance: during the first second the torso gets small random shoves and the
	 * limbs go limp, so a creature that died standing buckles and topples instead of freezing upright.
	 */
	private void deathThroes() {
		if (this.age > 36 || this.age % 4 != 1 || this.bodies.isEmpty()) {
			return;
		}
		RigidBody torso = this.heaviest();
		java.util.Random random = new java.util.Random(this.entityId * 31L + this.age);
		double strength = this.age < 12 ? 1.0 : 0.6;
		torso.vel.add((random.nextDouble() - 0.5) * 1.6 * strength, -0.4 * strength, (random.nextDouble() - 0.5) * 1.6 * strength);
		torso.omega.add((random.nextDouble() - 0.5) * 3.0 * strength, (random.nextDouble() - 0.5) * 1.0 * strength, (random.nextDouble() - 0.5) * 3.0 * strength);
		for (RigidBody body : this.bodies) {
			if (body != torso) {
				body.omega.add((random.nextDouble() - 0.5) * 2.5 * strength, (random.nextDouble() - 0.5) * 2.5 * strength, (random.nextDouble() - 0.5) * 2.5 * strength);
			}
		}
	}

	private RigidBody heaviest() {
		RigidBody heaviest = this.bodies.getFirst();
		for (RigidBody body : this.bodies) {
			if (body.mass > heaviest.mass) {
				heaviest = body;
			}
		}
		return heaviest;
	}

	/**
	 * Bodies lying on something lose energy quickly when they are nearly still: models the soft,
	 * inelastic contact of a body with the ground and lets corpses come to rest instead of creeping.
	 */
	private void dampRestingBodies() {
		if (this.settling) {
			// Nearly at rest everywhere: bleed off the last jitter between joints, contacts and limits.
			for (RigidBody body : this.bodies) {
				body.vel.mul(0.86);
				body.omega.mul(0.86);
			}
			return;
		}
		for (int i = 0; i < this.bodies.size(); i++) {
			if (!this.touching[i]) {
				continue;
			}
			RigidBody body = this.bodies.get(i);
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
		for (int i = 0; i < n; i++) {
			RigidBody first = this.bodies.get(i);
			for (int j = i + 1; j < n; j++) {
				if (this.ignoreCollision[i][j]) {
					continue;
				}
				RigidBody second = this.bodies.get(j);
				double reach = first.boundingRadius + second.boundingRadius;
				if (first.pos.distanceSquared(second.pos) > reach * reach) {
					continue;
				}
				for (int s = 0; s < first.spheres.length; s += 4) {
					first.worldPoint(new Vector3d(first.spheres[s], first.spheres[s + 1], first.spheres[s + 2]), a);
					for (int t = 0; t < second.spheres.length; t += 4) {
						second.worldPoint(new Vector3d(second.spheres[t], second.spheres[t + 1], second.spheres[t + 2]), b);
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

	private boolean spheresOverlap(RigidBody first, RigidBody second, double margin) {
		Vector3d a = new Vector3d();
		Vector3d b = new Vector3d();
		for (int s = 0; s < first.spheres.length; s += 4) {
			first.worldPoint(new Vector3d(first.spheres[s], first.spheres[s + 1], first.spheres[s + 2]), a);
			for (int t = 0; t < second.spheres.length; t += 4) {
				second.worldPoint(new Vector3d(second.spheres[t], second.spheres[t + 1], second.spheres[t + 2]), b);
				if (a.distance(b) < first.spheres[s + 3] + second.spheres[t + 3] + margin) {
					return true;
				}
			}
		}
		return false;
	}

	private void sink() {
		this.sinkTicks++;
		for (RigidBody body : this.bodies) {
			body.pos.y -= 0.025;
			body.vel.zero();
			body.omega.zero();
		}
		this.updateBounds();
	}

	public boolean isFinished(int lifetimeTicks) {
		if (this.age > lifetimeTicks) {
			return true;
		}
		for (RigidBody body : this.bodies) {
			if (body.pos.y < this.entity.level().getMinY() - 32 || !Double.isFinite(body.pos.y)) {
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
		for (RigidBody body : this.bodies) {
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
		for (RigidBody body : this.bodies) {
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

	private void updateSleep() {
		double energy = 0.0;
		for (RigidBody body : this.bodies) {
			energy = Math.max(energy, body.vel.length() + body.omega.length() * Math.min(body.boundingRadius, 0.25));
		}
		// A torso that stays put for a second and a half means the corpse is at rest, whatever its limbs twitch.
		Vec3 torso = this.torsoPosition();
		if (this.age % 30 == 0) {
			if (this.restCheck != null && this.restCheck.distanceTo(torso) < 0.025 && energy < 0.8 && this.age > 60) {
				this.calmTicks = 1000;
			}
			this.restCheck = torso;
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
				this.sleepSignature = this.collider.signature();
				for (RigidBody body : this.bodies) {
					body.vel.zero();
					body.omega.zero();
				}
			}
		} else {
			this.calmTicks = 0;
			this.sleeping = false;
		}
	}

	/** Pushes every body (explosions, players walking through corpses). */
	public void push(Vec3 center, double strength, double radius, boolean radial) {
		if (!this.built) {
			return;
		}
		boolean moved = false;
		for (RigidBody body : this.bodies) {
			Vector3d away = new Vector3d(body.pos).sub(center.x, center.y, center.z);
			double distance = away.length();
			if (distance > radius) {
				continue;
			}
			double falloff = 1.0 - distance / radius;
			if (radial) {
				if (distance < 1.0E-4) {
					away.set(0, 1, 0);
				} else {
					away.div(distance);
				}
				away.mul(strength * falloff).add(0.0, strength * falloff * 0.4, 0.0);
				body.vel.add(away);
				body.omega.add((Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength);
			}
			moved = true;
		}
		if (moved) {
			this.wake();
		}
	}

	/** Gives the bodies near {@code center} a velocity, used for kicking corpses around. */
	public void shove(Vec3 center, double radius, Vec3 velocity) {
		if (!this.built) {
			return;
		}
		for (RigidBody body : this.bodies) {
			double distance = body.pos.distance(center.x, center.y, center.z);
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

	private void wake() {
		this.sleeping = false;
		this.calmTicks = 0;
		this.restCheck = null;
		this.settleTicks = 0;
		this.settling = false;
	}

	// ------------------------------------------------------------------ rendering

	/**
	 * Freezes the vanilla render state at the moment of death (no tipping over, no idle animations,
	 * no shadow at the old position) and attaches this frame's bone transforms.
	 */
	public void applyRenderState(net.minecraft.client.renderer.entity.state.LivingEntityRenderState state, float partialTick, Vec3 camera) {
		state.x = this.anchorX;
		state.y = this.anchorY;
		state.z = this.anchorZ;
		state.bodyRot = this.bodyYaw;
		state.yRot = this.headYaw;
		state.xRot = this.headPitch;
		state.walkAnimationPos = this.walkPosition;
		state.walkAnimationSpeed = 0.0F;
		state.ageInTicks = this.ageInTicks;
		state.deathTime = 0.0F;
		state.hasRedOverlay = this.age < 4;
		state.isFullyFrozen = false;
		state.isAutoSpinAttack = false;
		state.shadowPieces.clear();
		state.shadowRadius = 0.0F;
		state.nameTag = null;
		// Flames would stay at the death spot while the body tumbles away.
		state.displayFireAnimation = false;
		if (this.built) {
			state.lightCoords = this.light;
			state.setData(dev.visceral.client.VisceralClientKeys.RAGDOLL_FRAME, this.frame(partialTick, camera));
		} else {
			state.setData(dev.visceral.client.VisceralClientKeys.RAGDOLL_PENDING, this);
		}
	}


	/** Bone transforms for this frame, camera relative. */
	public RagdollFrame frame(float partialTick, Vec3 camera) {
		Map<String, Matrix4f> targets = new HashMap<>(this.parts.size() * 2);
		Quaterniond rotation = new Quaterniond();
		Quaterniond delta = new Quaterniond();
		Vector3d position = new Vector3d();
		Matrix4d matrix = new Matrix4d();
		for (Part part : this.parts) {
			RigidBody body = this.bodies.get(part.body);
			body.tickPos.lerp(body.pos, partialTick, position);
			body.tickRot.slerp(body.rot, partialTick, rotation);
			rotation.mul(body.rot0.conjugate(delta), delta);
			matrix.identity()
				.translate(position.x - camera.x, position.y - camera.y, position.z - camera.z)
				.rotate(delta)
				.translate(this.anchorX - body.pos0.x, this.anchorY - body.pos0.y, this.anchorZ - body.pos0.z)
				.mul(part.world0);
			targets.put(part.path, new Matrix4f(matrix));
		}
		return new RagdollFrame(targets);
	}

	/** Centre of the heaviest body: where the corpse pools its blood. */
	public Vec3 torsoPosition() {
		RigidBody heaviest = null;
		for (RigidBody body : this.bodies) {
			if (heaviest == null || body.mass > heaviest.mass) {
				heaviest = body;
			}
		}
		return heaviest == null ? new Vec3(this.anchorX, this.anchorY, this.anchorZ) : new Vec3(heaviest.pos.x, heaviest.pos.y, heaviest.pos.z);
	}

	public double torsoSpeed() {
		double speed = 0.0;
		for (RigidBody body : this.bodies) {
			speed = Math.max(speed, body.vel.length());
		}
		return speed;
	}

	int poolFeeds() {
		return this.poolFeeds;
	}

	void addPoolFeed() {
		this.poolFeeds++;
	}

	public int bodyCount() {
		return this.bodies.size();
	}

	/** Per-body state, for diagnosing jitter. */
	public String debugBodies() {
		StringBuilder builder = new StringBuilder();
		for (int i = 0; i < this.bodies.size(); i++) {
			RigidBody body = this.bodies.get(i);
			builder.append(String.format(java.util.Locale.ROOT, "%n    %-12s v=%.3f w=%.3f touching=%s pos=(%.3f, %.3f, %.3f) half=(%.2f, %.2f, %.2f) m=%.4f",
				body.name, body.vel.length(), body.omega.length(), i < this.touching.length && this.touching[i], body.pos.x, body.pos.y, body.pos.z,
				body.halfExtents.x, body.halfExtents.y, body.halfExtents.z, body.mass));
		}
		return builder.toString();
	}

	/** One line describing the simulation state, for logs and tests. */
	public String debugSummary() {
		double maxSpeed = 0.0;
		double maxSpin = 0.0;
		double minY = Double.MAX_VALUE;
		for (RigidBody body : this.bodies) {
			maxSpeed = Math.max(maxSpeed, body.vel.length());
			maxSpin = Math.max(maxSpin, body.omega.length());
			minY = Math.min(minY, body.pos.y);
		}
		Vec3 torso = this.torsoPosition();
		return String.format(java.util.Locale.ROOT, "%s bodies=%d joints=%d age=%d sleeping=%s maxSpeed=%.3f maxSpin=%.3f torso=(%.2f, %.2f, %.2f) lowestBody=%.2f",
			net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(this.entity.getType()).getPath(), this.bodies.size(), this.joints.size(), this.age, this.sleeping,
			maxSpeed, maxSpin, torso.x, torso.y, torso.z, minY);
	}
}
