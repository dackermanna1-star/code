package dev.calibercraft.combat;

import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

/** Shared parameters and hit accumulation for all projectiles of a single shot. */
final class ShotGroup {
	final ServerPlayer shooter;
	final double effectiveRange;
	final double maxRange;
	final double minDamageMult;
	final double headshotMult;
	final double armorPenetration;
	final double knockback;
	final int fireSeconds;
	final Map<Entity, Hit> pending = new LinkedHashMap<>();

	ShotGroup(ServerPlayer shooter, double effectiveRange, double maxRange, double minDamageMult, double headshotMult,
			double armorPenetration, double knockback, int fireSeconds) {
		this.shooter = shooter;
		this.effectiveRange = effectiveRange;
		this.maxRange = maxRange;
		this.minDamageMult = minDamageMult;
		this.headshotMult = headshotMult;
		this.armorPenetration = armorPenetration;
		this.knockback = knockback;
		this.fireSeconds = fireSeconds;
	}

	void add(Entity target, double damage, boolean headshot, Vec3 at, Vec3 dir) {
		Hit h = pending.computeIfAbsent(target, t -> new Hit());
		h.damage += damage;
		h.headshot |= headshot;
		h.at = at;
		h.dir = dir;
	}

	static final class Hit {
		double damage;
		boolean headshot;
		Vec3 at;
		Vec3 dir;
	}
}
