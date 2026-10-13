package dev.calibercraft.combat;

import dev.calibercraft.config.ServerConfig;
import dev.calibercraft.network.ImpactPayload;
import dev.calibercraft.network.WhizPayload;
import dev.calibercraft.registry.ModTags;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Server-authoritative projectile simulation for one dimension. Bullets are plain objects advanced once per
 * tick (sub-stepped so long segments stay cheap); the first tick of a new bullet is processed immediately
 * so close-range hits register on the same tick the shot arrives.
 */
public final class BulletManager {
	private static final Map<ResourceKey<Level>, BulletManager> MANAGERS = new HashMap<>();
	private static final double MAX_STEP = 16.0;
	private static final double WHIZ_RADIUS = 2.5;

	private final ServerLevel level;
	private final ArrayDeque<Bullet> bullets = new ArrayDeque<>();
	private final List<Bullet> spawned = new ArrayList<>();
	private final Map<ShotGroup, Boolean> touched = new IdentityHashMap<>();
	private final Map<ServerPlayer, List<ImpactPayload.Impact>> impacts = new IdentityHashMap<>();
	private final RandomSource random = RandomSource.create();

	private BulletManager(ServerLevel level) {
		this.level = level;
	}

	public static BulletManager get(ServerLevel level) {
		return MANAGERS.computeIfAbsent(level.dimension(), k -> new BulletManager(level));
	}

	public static void tickAll(ServerLevel level) {
		BulletManager m = MANAGERS.get(level.dimension());
		if (m != null) {
			m.tick();
		}
	}

	public static void clear() {
		MANAGERS.clear();
	}

	public int active() {
		return bullets.size();
	}

	/** Creates a shot group for subsequent {@link #spawn} calls. */
	public static ShotGroup group(ServerPlayer shooter, double effectiveRange, double maxRange, double minMult, double headshotMult,
			double armorPen, double knockback, int fireSeconds) {
		return new ShotGroup(shooter, effectiveRange, maxRange, minMult, headshotMult, armorPen, knockback, fireSeconds);
	}

	/** Adds a bullet; it is advanced immediately for its first tick. */
	public void spawn(ShotGroup group, Vec3 origin, Vec3 velocity, double gravity, double damage, double penetration) {
		int cap = ServerConfig.get().maxActiveBullets;
		while (bullets.size() >= cap) {
			bullets.pollFirst();
		}
		Bullet b = new Bullet(group.shooter, group, origin, velocity, gravity, damage, penetration);
		spawned.add(b);
	}

	/** Processes freshly spawned bullets right away (called after a shot's pellets are spawned). */
	public void flushSpawned() {
		for (Bullet b : spawned) {
			step(b);
			if (!b.dead) {
				bullets.addLast(b);
			}
		}
		spawned.clear();
		finish();
	}

	private void tick() {
		Iterator<Bullet> it = bullets.iterator();
		while (it.hasNext()) {
			Bullet b = it.next();
			step(b);
			if (b.dead) {
				it.remove();
			}
		}
		finish();
	}

	private void finish() {
		for (ShotGroup g : touched.keySet()) {
			for (Map.Entry<Entity, ShotGroup.Hit> e : g.pending.entrySet()) {
				if (!g.shooter.hasDisconnected()) {
					CombatDamage.apply(level, g, e.getKey(), e.getValue());
				}
			}
			g.pending.clear();
		}
		touched.clear();
		for (Map.Entry<ServerPlayer, List<ImpactPayload.Impact>> e : impacts.entrySet()) {
			if (!e.getKey().hasDisconnected()) {
				ServerPlayNetworking.send(e.getKey(), new ImpactPayload(List.copyOf(e.getValue())));
			}
		}
		impacts.clear();
	}

	// ------------------------------------------------------------------------------------------- simulation

	private void step(Bullet b) {
		b.age++;
		if (b.age > 200 || b.shooter.isRemoved() && b.shooter.hasDisconnected()) {
			b.dead = true;
			return;
		}
		Vec3 remaining = b.vel;
		double total = remaining.length();
		int steps = Math.max(1, (int) Math.ceil(total / MAX_STEP));
		Vec3 stepVec = remaining.scale(1.0 / steps);
		for (int i = 0; i < steps && !b.dead; i++) {
			traceSegment(b, b.pos, b.pos.add(stepVec), 0);
		}
		if (!b.dead) {
			if (b.inWater) {
				b.vel = b.vel.scale(0.35);
				if (b.vel.lengthSqr() < 0.25) {
					b.dead = true;
				}
			}
			b.vel = b.vel.add(0, -b.gravity, 0);
			if (b.traveled > b.group.maxRange || b.pos.y < level.getMinY() - 64) {
				b.dead = true;
			}
		}
	}

	/** Traces one segment, resolving entity hits, water entry and block interactions in order. */
	private void traceSegment(Bullet b, Vec3 from, Vec3 to, int depth) {
		if (depth > 8) {
			b.dead = true;
			return;
		}
		Entity shooter = b.shooter;
		BlockHitResult blockHit = level.clip(new ClipContext(from, to, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, shooter));
		Vec3 end = blockHit.getType() == HitResult.Type.MISS ? to : blockHit.getLocation();

		if (!b.inWater) {
			BlockHitResult water = level.clip(new ClipContext(from, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.WATER, shooter));
			if (water.getType() != HitResult.Type.MISS && !level.getFluidState(water.getBlockPos()).isEmpty()) {
				Vec3 w = water.getLocation();
				if (w.distanceToSqr(from) < end.distanceToSqr(from) - 1e-6) {
					// Entities between the muzzle and the water surface still get hit first.
					if (hitEntities(b, from, w)) {
						return;
					}
					addImpact(w, Direction.UP.ordinal(), 0, ImpactPayload.Kind.WATER);
					b.inWater = true;
					b.damage *= 0.5;
					b.vel = b.vel.scale(0.25);
					b.traveled += from.distanceTo(w);
					b.pos = w;
					return;
				}
			}
		}

		if (hitEntities(b, from, end)) {
			return;
		}
		double segLen = from.distanceTo(end);
		b.traveled += segLen;
		whiz(b, from, end);
		b.pos = end;
		if (b.traveled > b.group.maxRange) {
			b.dead = true;
			return;
		}
		if (blockHit.getType() != HitResult.Type.BLOCK) {
			return;
		}
		handleBlock(b, blockHit, to, depth);
	}

	/** Returns true if the bullet stopped inside an entity. */
	private boolean hitEntities(Bullet b, Vec3 from, Vec3 to) {
		AABB box = new AABB(from, to).inflate(1.0);
		List<Entity> candidates = level.getEntities(b.shooter, box, e -> e.isAlive() && !e.isSpectator()
			&& (e.isPickable() || e instanceof LivingEntity) && EntitySelector.NO_SPECTATORS.test(e) && !b.hitEntities.contains(e.getId())
			&& !e.isPassengerOfSameVehicle(b.shooter));
		if (candidates.isEmpty()) {
			return false;
		}
		record Cand(Entity e, Vec3 at, double dist) {
		}
		List<Cand> hits = new ArrayList<>();
		for (Entity e : candidates) {
			AABB bb = e.getBoundingBox().inflate(e.getPickRadius() + 0.05);
			Optional<Vec3> hit = bb.clip(from, to);
			if (hit.isEmpty() && bb.contains(from)) {
				hit = Optional.of(from);
			}
			hit.ifPresent(at -> hits.add(new Cand(e, at, at.distanceToSqr(from))));
		}
		hits.sort(Comparator.comparingDouble(Cand::dist));
		for (Cand c : hits) {
			Entity e = c.e();
			b.hitEntities.add(e.getId());
			double dist = b.traveled + Math.sqrt(c.dist());
			double dmg = b.damage * dev.calibercraft.core.Ballistics.falloff(dist, b.group.effectiveRange, b.group.maxRange, b.group.minDamageMult);
			boolean head = isHeadshot(e, c.at());
			if (head) {
				dmg *= b.group.headshotMult;
			}
			b.group.add(e, dmg, head, c.at(), b.vel.normalize());
			touched.put(b.group, Boolean.TRUE);
			addImpact(c.at(), -1, 0, ImpactPayload.Kind.ENTITY);
			if (ServerConfig.get().penetration && b.penetration >= 1.0 && e instanceof LivingEntity) {
				b.penetration -= 1.0;
				b.damage *= 0.65;
				continue;
			}
			b.traveled += Math.sqrt(c.dist());
			b.pos = c.at();
			b.dead = true;
			return true;
		}
		return false;
	}

	private boolean isHeadshot(Entity e, Vec3 at) {
		if (!ServerConfig.get().headshots || !(e instanceof LivingEntity) || e.getType().is(ModTags.NO_HEADSHOT)) {
			return false;
		}
		float h = e.getBbHeight();
		if (h < 0.9f) {
			return false;
		}
		return at.y >= e.getEyeY() - h * 0.13;
	}

	private void handleBlock(Bullet b, BlockHitResult hit, Vec3 segmentEnd, int depth) {
		BlockPos pos = hit.getBlockPos();
		BlockState state = level.getBlockState(pos);
		Direction face = hit.getDirection();
		Vec3 at = hit.getLocation();
		Vec3 dir = b.vel.normalize();
		ServerConfig cfg = ServerConfig.get();
		int stateId = Block.getId(state);

		if (state.is(ModTags.BULLET_PASSABLE)) {
			continueThrough(b, pos, state, at, dir, segmentEnd, depth);
			return;
		}
		if (state.is(ModTags.SHATTERABLE) && cfg.bulletsBreakGlass && level.mayInteract(b.shooter, pos) && b.shooter.mayBuild()) {
			level.destroyBlock(pos, false, b.shooter);
			addImpact(at, face.ordinal(), stateId, ImpactPayload.Kind.SHATTER);
			b.damage *= 0.85;
			b.penetration = Math.max(0, b.penetration - 0.2);
			traceSegment(b, at.add(dir.scale(0.01)), segmentEnd, depth + 1);
			return;
		}
		SurfaceType surface = SurfaceType.of(state);
		double hardness = state.getDestroySpeed(level, pos);
		if (cfg.ricochets && !b.ricocheted && (surface.hard() || state.is(ModTags.RICOCHET_SURFACES))) {
			double cos = Math.abs(dir.dot(Vec3.atLowerCornerOf(face.getUnitVec3i())));
			if (cos < 0.26 && random.nextFloat() < 0.65) {
				Vec3 n = Vec3.atLowerCornerOf(face.getUnitVec3i());
				Vec3 reflected = dir.subtract(n.scale(2 * dir.dot(n)));
				b.vel = reflected.scale(b.vel.length() * 0.6);
				b.damage *= 0.5;
				b.penetration *= 0.5;
				b.ricocheted = true;
				b.hitEntities.clear();
				addImpact(at, face.ordinal(), stateId, ImpactPayload.Kind.RICOCHET);
				b.pos = at.add(n.scale(0.02));
				return;
			}
		}
		if (cfg.penetration && hardness >= 0 && b.penetration > Math.max(0.2, hardness)) {
			addImpact(at, face.ordinal(), stateId, ImpactPayload.Kind.BLOCK);
			b.penetration -= Math.max(0.25, hardness);
			b.damage *= Math.max(0.35, 1.0 - 0.12 * Math.max(0.5, hardness));
			continueThrough(b, pos, state, at, dir, segmentEnd, depth);
			return;
		}
		addImpact(at, face.ordinal(), stateId, ImpactPayload.Kind.BLOCK);
		b.dead = true;
	}

	/** Moves the bullet to where its ray exits the block's shape and continues the segment from there. */
	private void continueThrough(Bullet b, BlockPos pos, BlockState state, Vec3 at, Vec3 dir, Vec3 segmentEnd, int depth) {
		VoxelShape shape = state.getCollisionShape(level, pos);
		AABB bounds = shape.isEmpty() ? new AABB(pos) : shape.bounds().move(pos);
		double tExit = exitDistance(bounds, at, dir);
		Vec3 exit = at.add(dir.scale(tExit + 0.01));
		b.traveled += tExit;
		if (exit.distanceToSqr(at) >= segmentEnd.distanceToSqr(at)) {
			b.pos = segmentEnd;
			return;
		}
		traceSegment(b, exit, segmentEnd, depth + 1);
	}

	private static double exitDistance(AABB box, Vec3 p, Vec3 d) {
		double t = Double.MAX_VALUE;
		t = Math.min(t, axisExit(p.x, d.x, box.minX, box.maxX));
		t = Math.min(t, axisExit(p.y, d.y, box.minY, box.maxY));
		t = Math.min(t, axisExit(p.z, d.z, box.minZ, box.maxZ));
		return t == Double.MAX_VALUE ? 0 : Math.max(0, t);
	}

	private static double axisExit(double p, double d, double min, double max) {
		if (Math.abs(d) < 1e-9) {
			return Double.MAX_VALUE;
		}
		return d > 0 ? (max - p) / d : (min - p) / d;
	}

	private void whiz(Bullet b, Vec3 from, Vec3 to) {
		if (!ServerConfig.get().bulletWhiz) {
			return;
		}
		Vec3 mid = from.add(to).scale(0.5);
		double reach = from.distanceTo(to) / 2 + WHIZ_RADIUS;
		for (ServerPlayer p : level.players()) {
			if (p == b.shooter || p.isSpectator() || b.whizzed.contains(p.getUUID()) || p.distanceToSqr(mid) > reach * reach) {
				continue;
			}
			Vec3 eye = p.getEyePosition();
			Vec3 seg = to.subtract(from);
			double len2 = seg.lengthSqr();
			double t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, eye.subtract(from).dot(seg) / len2));
			Vec3 closest = from.add(seg.scale(t));
			if (closest.distanceToSqr(eye) < WHIZ_RADIUS * WHIZ_RADIUS) {
				b.whizzed.add(p.getUUID());
				ServerPlayNetworking.send(p, new WhizPayload(closest.x, closest.y, closest.z));
			}
		}
	}

	private void addImpact(Vec3 at, int face, int stateId, ImpactPayload.Kind kind) {
		ImpactPayload.Impact impact = new ImpactPayload.Impact(at.x, at.y, at.z, face, stateId, kind.ordinal());
		for (ServerPlayer p : PlayerLookup.around(level, at, 96)) {
			List<ImpactPayload.Impact> list = impacts.computeIfAbsent(p, k -> new ArrayList<>());
			if (list.size() < ImpactPayload.MAX) {
				list.add(impact);
			}
		}
	}
}
