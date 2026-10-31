package com.jjkshowdown.util;

import com.jjkshowdown.entity.boss.SorcererBoss;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

/** Ray casts and area queries used by techniques and AI. */
public final class Targeting {
	private Targeting() {
	}

	/** Living entities that a caster may hit with techniques. */
	public static Predicate<Entity> hostileTo(Entity caster) {
		return e -> e != caster && e instanceof LivingEntity le && le.isAlive() && !le.isSpectator()
				&& !(e instanceof ArmorStand as && as.isMarker())
				&& !(e instanceof Player p && p.isCreative() && !(caster instanceof SorcererBoss))
				&& !e.isAlliedTo(caster) && e.getVehicle() != caster && caster.getVehicle() != e;
	}

	/** Entity under the caster's crosshair, with a generous hit margin for fast-paced combat. */
	@Nullable
	public static LivingEntity lookTarget(LivingEntity caster, double range, double margin) {
		Vec3 eye = caster.getEyePosition();
		Vec3 dir = caster.getViewVector(1.0f);
		Vec3 end = eye.add(dir.scale(range));
		BlockHitResult block = caster.level().clip(new ClipContext(eye, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, caster));
		double maxDist = block.getType() == HitResult.Type.MISS ? range : block.getLocation().distanceTo(eye) + 0.5;
		LivingEntity best = null;
		double bestScore = Double.MAX_VALUE;
		AABB search = caster.getBoundingBox().expandTowards(dir.scale(range)).inflate(margin + 1.0);
		for (Entity e : caster.level().getEntities(caster, search, hostileTo(caster))) {
			AABB box = e.getBoundingBox().inflate(margin);
			Optional<Vec3> hit = box.clip(eye, end);
			if (box.contains(eye)) hit = Optional.of(eye);
			if (hit.isPresent()) {
				double d = hit.get().distanceTo(eye);
				if (d <= maxDist) {
					// prefer targets close to the exact view ray
					Vec3 c = e.getBoundingBox().getCenter();
					double off = c.subtract(eye).cross(dir).length();
					double score = d * 0.15 + off;
					if (score < bestScore) {
						bestScore = score;
						best = (LivingEntity) e;
					}
				}
			}
		}
		return best;
	}

	/** Point where the aim ray hits a block, or the max-range point. */
	public static Vec3 blockAimPoint(Entity caster, Vec3 from, Vec3 dir, double range) {
		Vec3 end = from.add(dir.scale(range));
		BlockHitResult r = caster.level().clip(new ClipContext(from, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, caster));
		return r.getType() == HitResult.Type.MISS ? end : r.getLocation();
	}

	public static BlockHitResult clip(Level level, Entity source, Vec3 from, Vec3 to) {
		return level.clip(new ClipContext(from, to, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, source));
	}

	public static List<LivingEntity> livingInRadius(Entity caster, Vec3 center, double radius) {
		List<LivingEntity> out = new ArrayList<>();
		AABB box = new AABB(center, center).inflate(radius);
		double r2 = radius * radius;
		for (Entity e : caster.level().getEntities(caster, box, hostileTo(caster))) {
			if (e.getBoundingBox().getCenter().distanceToSqr(center) <= r2 || e.position().distanceToSqr(center) <= r2) {
				out.add((LivingEntity) e);
			}
		}
		return out;
	}

	/** Living entities inside a cone in front of the caster. */
	public static List<LivingEntity> livingInCone(LivingEntity caster, double range, double halfAngleDeg) {
		List<LivingEntity> out = new ArrayList<>();
		Vec3 eye = caster.getEyePosition();
		Vec3 dir = caster.getViewVector(1.0f);
		double cos = Math.cos(Math.toRadians(halfAngleDeg));
		for (LivingEntity e : livingInRadius(caster, eye, range)) {
			Vec3 to = e.getBoundingBox().getCenter().subtract(eye);
			double len = to.length();
			if (len < 1.0E-4 || to.scale(1.0 / len).dot(dir) >= cos) out.add(e);
		}
		return out;
	}

	/** Shortest distance between a point and a segment. */
	public static double distanceToSegment(Vec3 p, Vec3 a, Vec3 b) {
		Vec3 ab = b.subtract(a);
		double len2 = ab.lengthSqr();
		if (len2 < 1.0E-8) return p.distanceTo(a);
		double t = Math.max(0, Math.min(1, p.subtract(a).dot(ab) / len2));
		return p.distanceTo(a.add(ab.scale(t)));
	}
}
