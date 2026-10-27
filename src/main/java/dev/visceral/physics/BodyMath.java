package dev.visceral.physics;

import dev.visceral.state.BodyRegion;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Geometry helpers for hit localisation. */
public final class BodyMath {
	private BodyMath() {
	}

	/** Entity facing (body yaw) as a horizontal unit vector. */
	public static Vec3 facing(LivingEntity e) {
		float yaw = e.yBodyRot * Mth.DEG_TO_RAD;
		return new Vec3(-Mth.sin(yaw), 0, Mth.cos(yaw));
	}

	/** The entity's right-hand side as a horizontal unit vector. */
	public static Vec3 right(LivingEntity e) {
		Vec3 f = facing(e);
		return new Vec3(-f.z, 0, f.x);
	}

	public static Vec3 clampToBox(Vec3 p, AABB box) {
		return new Vec3(Mth.clamp(p.x, box.minX, box.maxX), Mth.clamp(p.y, box.minY, box.maxY), Mth.clamp(p.z, box.minZ, box.maxZ));
	}

	/** Height fraction of a world point within the entity's (standing) body. */
	public static double heightFraction(LivingEntity e, Vec3 p) {
		double h = Math.max(0.1, e.getBbHeight());
		return Mth.clamp((p.y - e.getY()) / h, 0, 1);
	}

	/** Lateral fraction in [-1,1]: negative = entity's right side. */
	public static double lateralFraction(LivingEntity e, Vec3 p) {
		Vec3 r = right(e);
		double half = Math.max(0.15, e.getBbWidth() * 0.5);
		double d = (p.x - e.getX()) * r.x + (p.z - e.getZ()) * r.z;
		return Mth.clamp(-d / half, -1, 1);
	}

	public static BodyRegion region(LivingEntity e, Vec3 p) {
		return BodyRegion.fromLocal(heightFraction(e, p), lateralFraction(e, p));
	}

	/** Which face of the hit part an attack from {@code dir} (direction of travel) lands on. */
	public static int face(LivingEntity e, Vec3 dir) {
		Vec3 f = facing(e);
		Vec3 r = right(e);
		double towardsFront = -(dir.x * f.x + dir.z * f.z);
		double towardsRight = -(dir.x * r.x + dir.z * r.z);
		if (dir.y < -0.75) return 4;
		if (Math.abs(towardsFront) >= Math.abs(towardsRight)) return towardsFront >= 0 ? 0 : 1;
		return towardsRight >= 0 ? 2 : 3;
	}

	public static Vec3 horizontal(Vec3 v) {
		double l = Math.sqrt(v.x * v.x + v.z * v.z);
		return l < 1e-6 ? Vec3.ZERO : new Vec3(v.x / l, 0, v.z / l);
	}
}
