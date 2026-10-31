package com.jjkshowdown.ability;

import com.jjkshowdown.sorcerer.SorcererData;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Targeting;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Everything an ability needs about its caster for one invocation. */
public record CastContext(ServerLevel level, LivingEntity caster, SorcererData data, SorcererState state) {
	public static CastContext of(LivingEntity caster) {
		return new CastContext((ServerLevel) caster.level(), caster, Sorcerers.data(caster), Sorcerers.state(caster));
	}

	public boolean isPlayer() {
		return caster instanceof ServerPlayer;
	}

	@Nullable
	public ServerPlayer player() {
		return caster instanceof ServerPlayer p ? p : null;
	}

	public Vec3 eye() {
		return caster.getEyePosition();
	}

	/** The entity the caster is focused on: the mob's attack target, or the player's crosshair target. */
	@Nullable
	public LivingEntity target(double range) {
		if (caster instanceof Mob mob && mob.getTarget() != null && mob.getTarget().isAlive()) {
			return mob.getTarget();
		}
		return Targeting.lookTarget(caster, range, 1.2);
	}

	/** Aim direction: players aim with their view; mobs aim at the centre of their target (with slight lead). */
	public Vec3 aim() {
		if (caster instanceof Mob mob && mob.getTarget() != null && mob.getTarget().isAlive()) {
			LivingEntity t = mob.getTarget();
			Vec3 tp = t.position().add(0, t.getBbHeight() * 0.55, 0).add(t.getDeltaMovement().scale(4));
			Vec3 d = tp.subtract(eye());
			return d.lengthSqr() < 1.0E-6 ? caster.getLookAngle() : d.normalize();
		}
		return caster.getViewVector(1.0f);
	}

	/** Point under the crosshair (block hit, entity hit, or max range). */
	public Vec3 aimPoint(double range) {
		LivingEntity t = target(range);
		if (t != null && !(caster instanceof Mob)) {
			return t.position().add(0, t.getBbHeight() * 0.5, 0);
		}
		if (caster instanceof Mob && t != null) {
			return t.position().add(0, t.getBbHeight() * 0.5, 0);
		}
		return Targeting.blockAimPoint(caster, eye(), aim(), range);
	}
}
