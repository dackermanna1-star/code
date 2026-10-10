package com.blademode.client.gore;

import com.blademode.BladeConfig;
import com.blademode.BladeMode;
import com.blademode.cut.Slash;
import com.blademode.cut.SlashHandler;
import com.blademode.geom.Plane;
import com.blademode.gore.Body;
import com.blademode.gore.Piece;
import com.blademode.gore.Ragdoll;
import com.blademode.gore.RagdollBuilder;
import com.blademode.net.MobSlicePayload;
import com.blademode.net.SlashFxPayload;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.function.Predicate;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/**
 * Every creature cut apart on this client: the corpse that replaces it, its physics and its gore.
 * Corpses are purely visual and live only on the client; the server only says which creature was
 * cut and where.
 */
public final class CorpseManager {
	/** Speed the two sides of a cut move apart with (blocks/second). */
	private static final double SEPARATE = 0.6;
	/** Speed the blade gives the parts it passes through (blocks/second). */
	private static final double DRAG = 1.0;
	/** A creature stays hidden this long after it was cut, even before the client hears it died. */
	private static final int HIDE_TICKS = 40;

	private static final List<Corpse> CORPSES = new ArrayList<>();
	/** Creatures cut apart, by entity id: hidden while they are dead (or just cut). */
	private static final Int2ObjectMap<Sliced> SLICED = new Int2ObjectOpenHashMap<>();
	private static final Random RANDOM = new Random();
	private static @Nullable ClientLevel level;
	private static int clock;
	private static boolean warned;

	private record Sliced(Entity entity, int at) {
	}

	private CorpseManager() {
	}

	static List<Corpse> corpses() {
		return CORPSES;
	}

	/** The server cut a creature in two along a plane. */
	public static void onSlice(MobSlicePayload payload) {
		ClientLevel world = Minecraft.getInstance().level;
		if (world == null) {
			return;
		}
		follow(world);
		Plane plane = new Plane(payload.normal().x, payload.normal().y, payload.normal().z, payload.d());
		Vector3d blade = new Vector3d(payload.bladeDirection().x, payload.bladeDirection().y, payload.bladeDirection().z);
		if (!blade.isFinite() || blade.lengthSquared() < 1.0E-8) {
			blade.set(0, -1, 0);
		}
		blade.normalize();
		Corpse existing = find(payload.entityId());
		if (existing != null) {
			cut(world, existing, plane, blade, body -> true);
			return;
		}
		Entity entity = world.getEntity(payload.entityId());
		BladeConfig cfg = BladeConfig.get();
		if (!(entity instanceof LivingEntity living) || cfg.maxCorpses <= 0) {
			return;
		}
		try {
			start(world, living, plane, blade, cfg);
		} catch (RuntimeException e) {
			// Whatever it was (a modded creature drawn in some unusual way), it dies the ordinary way.
			SLICED.remove(living.getId());
			CORPSES.removeIf(c -> c.entityId == living.getId());
			warn("Could not cut up " + living, e);
		}
	}

	private static void start(ClientLevel world, LivingEntity living, Plane plane, Vector3d blade, BladeConfig cfg) {
		float partialTick = Minecraft.getInstance().getDeltaTracker().getGameTimeDeltaPartialTick(false);
		ModelCapture.Snapshot snapshot = ModelCapture.capture(living, partialTick);
		if (snapshot == null) {
			return;
		}
		Ragdoll ragdoll = RagdollBuilder.build(snapshot.anchor(), snapshot.pieces(), RANDOM.nextLong());
		if (ragdoll == null) {
			return;
		}
		// Keep going the way it was going.
		Vec3 motion = new Vec3(living.getX() - living.xo, living.getY() - living.yo, living.getZ() - living.zo).scale(20.0);
		if (motion.lengthSqr() > 100.0) {
			motion = motion.normalize().scale(10.0);
		}
		for (Body body : ragdoll.bodies) {
			body.vel.set(motion.x, motion.y, motion.z);
			body.light = lightAt(world, body.pos);
		}
		Corpse corpse = new Corpse(living.getId(), living.getType(), snapshot.layers(), ragdoll, BloodStyle.of(living.getType()), world);
		SLICED.put(living.getId(), new Sliced(living, clock));
		VisceralBridge.cancelRagdoll(living);
		CORPSES.add(corpse);
		while (CORPSES.size() > cfg.maxCorpses) {
			CORPSES.removeFirst();
		}
		if (!cut(world, corpse, plane, blade, body -> true)) {
			// The blade only clipped the edge of its hitbox: cut through the part of the body nearest the blade.
			Plane through = nearestCut(corpse, plane);
			if (through != null) {
				cut(world, corpse, through, blade, body -> true);
			}
		}
	}

	/** Any slash also cuts the corpses lying in its way. */
	public static void onSlash(SlashFxPayload fx) {
		ClientLevel world = Minecraft.getInstance().level;
		if (world == null || CORPSES.isEmpty()) {
			return;
		}
		follow(world);
		Slash slash = Slash.of(fx.eye(), fx.dirA(), fx.dirB(), fx.reach());
		if (slash == null) {
			return;
		}
		Plane plane = slash.worldPlane();
		Predicate<Body> reach = body -> {
			double dist = slash.dist(body.pos.x, body.pos.y, body.pos.z);
			return Math.abs(dist) <= body.boundingRadius
				&& slash.inSector(body.pos.x - slash.n.x * dist, body.pos.y - slash.n.y * dist, body.pos.z - slash.n.z * dist, body.boundingRadius);
		};
		for (Corpse corpse : new ArrayList<>(CORPSES)) {
			if (corpse.wasJustCutBy(plane) || !SlashHandler.touches(slash, corpse.ragdoll.bounds())) {
				continue;
			}
			Vec3 c = corpse.ragdoll.bounds().getCenter();
			cut(world, corpse, plane, slash.bladeDirection(c.x, c.y, c.z), reach);
		}
	}

	private static boolean cut(ClientLevel world, Corpse corpse, Plane plane, Vector3d blade, Predicate<Body> reach) {
		Ragdoll.Cut result;
		try {
			result = corpse.ragdoll.cut(plane, reach, blade, SEPARATE, DRAG);
		} catch (RuntimeException e) {
			warn("Could not cut a corpse", e);
			return false;
		}
		if (!result.happened()) {
			return false;
		}
		corpse.lastCut = plane;
		corpse.lastCutAge = corpse.age;
		Gore.onCut(world, corpse, result, plane, blade);
		return true;
	}

	/**
	 * A plane parallel to {@code plane} that takes a slice off the side of the body facing the blade:
	 * for cuts that only grazed the hitbox and missed the model inside it.
	 */
	private static @Nullable Plane nearestCut(Corpse corpse, Plane plane) {
		double min = Double.MAX_VALUE;
		double max = -Double.MAX_VALUE;
		List<Vector3d> points = new ArrayList<>();
		for (Body body : corpse.ragdoll.bodies) {
			for (Piece piece : body.pieces) {
				if (!piece.isMain()) {
					continue;
				}
				points.clear();
				piece.rebased(body.currentWorld(piece)).points(points);
				for (Vector3d p : points) {
					double d = plane.dist(p.x + corpse.ragdoll.anchor.x, p.y + corpse.ragdoll.anchor.y, p.z + corpse.ragdoll.anchor.z);
					min = Math.min(min, d);
					max = Math.max(max, d);
				}
			}
		}
		if (min > max) {
			return null;
		}
		double offset = min > 0 ? min + (max - min) * 0.3 : max < 0 ? max - (max - min) * 0.3 : 0;
		return offset == 0 ? null : new Plane(plane.nx(), plane.ny(), plane.nz(), plane.d() + offset);
	}

	public static void tick(Minecraft mc) {
		ClientLevel world = mc.level;
		if (world == null) {
			clear();
			return;
		}
		follow(world);
		if (mc.isPaused() || !world.tickRateManager().runsNormally()) {
			return;
		}
		clock++;
		SLICED.values().removeIf(s -> s.entity.isRemoved()
			|| clock - s.at > HIDE_TICKS && s.entity instanceof LivingEntity living && !living.isDeadOrDying());
		if (CORPSES.isEmpty()) {
			return;
		}
		BladeConfig cfg = BladeConfig.get();
		int lifetime = cfg.corpseSeconds * 20;
		double gravity = cfg.gravity;
		CORPSES.removeIf(corpse -> {
			try {
				corpse.age++;
				if (corpse.age >= 10) {
					shoveByEntities(world, corpse);
				}
				corpse.ragdoll.tick(corpse.collider, gravity, lifetime);
				if ((corpse.age + corpse.entityId) % 4 == 0) {
					for (Body body : corpse.ragdoll.bodies) {
						body.light = lightAt(world, body.pos);
					}
				}
				Gore.tick(world, corpse);
				return corpse.ragdoll.isFinished(lifetime, world.getMinY());
			} catch (RuntimeException e) {
				warn("A corpse failed to simulate and was removed", e);
				return true;
			}
		});
	}

	private static void warn(String message, RuntimeException e) {
		if (!warned) {
			warned = true;
			BladeMode.LOGGER.error(message, e);
		}
	}

	/** Walking through a corpse kicks the pieces around. */
	private static void shoveByEntities(ClientLevel world, Corpse corpse) {
		for (Entity entity : world.getEntities((Entity) null, corpse.ragdoll.bounds(), e -> e instanceof LivingEntity && !e.isSpectator())) {
			Vec3 motion = entity.position().subtract(entity.xo, entity.yo, entity.zo);
			if (motion.lengthSqr() < 1.0E-4 || isHidden(entity)) {
				continue;
			}
			Vec3 at = entity.position().add(0, entity.getBbHeight() * 0.25, 0);
			corpse.ragdoll.shove(new Vector3d(at.x, at.y, at.z), entity.getBbWidth() * 0.6,
				new Vector3d(motion.x * 20.0, motion.y * 20.0, motion.z * 20.0));
		}
	}

	public static void onExplosion(Vec3 center, float radius) {
		double blastRadius = Math.max(2.0, radius * 2.0);
		Vector3d c = new Vector3d(center.x, center.y, center.z);
		for (Corpse corpse : CORPSES) {
			if (corpse.ragdoll.bounds().getCenter().distanceTo(center) < blastRadius + 2.0) {
				corpse.ragdoll.blast(c, Mth.clamp(radius * 3.5, 4.0, 22.0), blastRadius, RANDOM);
			}
		}
	}

	/** Whether this creature was cut apart, so its corpse stands in for it. */
	public static boolean isSliced(Entity entity) {
		Sliced sliced = SLICED.isEmpty() ? null : SLICED.get(entity.getId());
		return sliced != null && sliced.entity == entity;
	}

	/** Whether to keep the creature itself from being drawn: its corpse is drawn instead. */
	public static boolean isHidden(Entity entity) {
		Sliced sliced = SLICED.isEmpty() ? null : SLICED.get(entity.getId());
		if (sliced == null || sliced.entity != entity) {
			return false;
		}
		return clock - sliced.at <= HIDE_TICKS || !(entity instanceof LivingEntity living) || living.isDeadOrDying();
	}

	// ------------------------------------------------------------------------------------------
	// For game tests and debugging.

	public static int corpseCount() {
		return CORPSES.size();
	}

	public static int bodyCount() {
		return CORPSES.stream().mapToInt(c -> c.ragdoll.bodies.size()).sum();
	}

	/** Corpses that are in more than one piece. */
	public static int cutCount() {
		return (int) CORPSES.stream().filter(c -> c.ragdoll.chunkCount() > 1).count();
	}

	/** Centre of the heaviest piece of any corpse. */
	public static @Nullable Vec3 heaviestBody() {
		Body heaviest = null;
		for (Corpse corpse : CORPSES) {
			for (Body body : corpse.ragdoll.bodies) {
				if (heaviest == null || body.mass > heaviest.mass) {
					heaviest = body;
				}
			}
		}
		return heaviest == null ? null : new Vec3(heaviest.pos.x, heaviest.pos.y, heaviest.pos.z);
	}

	public static List<String> describe() {
		List<String> lines = new ArrayList<>();
		for (Corpse corpse : CORPSES) {
			StringBuilder sb = new StringBuilder();
			sb.append(EntityType.getKey(corpse.type).getPath()).append(": ")
				.append(corpse.ragdoll.bodies.size()).append(" bodies, ").append(corpse.ragdoll.jointCount()).append(" joints, ")
				.append(corpse.ragdoll.chunkCount()).append(" chunks, ").append(corpse.layers.size()).append(" layers, ")
				.append(corpse.wounds.size()).append(" wounds, sleeping=").append(corpse.ragdoll.isSleeping());
			for (Body body : corpse.ragdoll.bodies) {
				sb.append(String.format(Locale.ROOT, "%n    %s pieces=%d mass=%.3f pos=(%.2f, %.2f, %.2f) vel=%.2f",
					body.name, body.pieces.size(), body.mass, body.pos.x, body.pos.y, body.pos.z, body.vel.length()));
			}
			lines.add(sb.toString());
		}
		return lines;
	}

	private static @Nullable Corpse find(int entityId) {
		for (Corpse corpse : CORPSES) {
			if (corpse.entityId == entityId) {
				return corpse;
			}
		}
		return null;
	}

	/** Forgets everything when the client leaves a world. */
	private static void follow(ClientLevel world) {
		if (level != world) {
			clear();
			level = world;
		}
	}

	public static void clear() {
		CORPSES.clear();
		SLICED.clear();
		level = null;
	}

	private static int lightAt(ClientLevel world, Vector3d pos) {
		return LevelRenderer.getLightColor(world, BlockPos.containing(pos.x, pos.y, pos.z));
	}
}
