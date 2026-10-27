package dev.visceral.physics;

import dev.visceral.combat.AttackDef;
import dev.visceral.combat.CombatContext;
import dev.visceral.combat.WeaponClass;
import dev.visceral.config.CommonConfig;
import dev.visceral.entity.CombatState;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.net.Payloads;
import dev.visceral.net.ServerNet;
import dev.visceral.registry.VisceralRegistry;
import dev.visceral.state.BloodType;
import dev.visceral.state.BodyRegion;
import dev.visceral.state.WoundType;
import dev.visceral.wound.WoundSystem;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Turns any successful damage into a physical impact: where it landed, which way it pushed and
 * how hard. Feeds the balance model, wounds, and broadcasts an {@link Payloads.Impact} so
 * clients can drive hit reactions, ragdoll impulses and blood. Our own melee hits carry exact
 * data through {@link CombatContext}; everything else (mobs, projectiles, explosions, falls) is
 * estimated from the damage source.
 */
public final class ImpactSystem {
	private ImpactSystem() {
	}

	public static void onDamaged(LivingEntity target, DamageSource source, float damage) {
		if (target.level().isClientSide() || damage <= 0) return;
		if (source.is(VisceralRegistry.BLEEDING) || source.is(VisceralRegistry.WALL_SLAM)) return;
		CommonConfig cfg = CommonConfig.get();
		boolean fatal = target.isDeadOrDying();
		CombatContext ctx = CombatContext.forTarget(target);

		Vec3 hitPoint;
		Vec3 dir;
		float force;
		BodyRegion region;
		WoundType woundType;
		int flags = 0;
		AABB box = target.getBoundingBox();
		Vec3 center = box.getCenter();
		Entity attacker = source.getEntity();
		Entity direct = source.getDirectEntity();

		if (ctx != null) {
			AttackDef def = ctx.def;
			hitPoint = ctx.hitPoint;
			dir = ctx.push;
			region = ctx.region;
			woundType = def.wound;
			force = def.force * cfg.meleeForceMultiplier * weaponWeight(ctx.attacker, def);
			if (def.kind == AttackDef.Kind.KICK) force *= cfg.kickForce;
			flags |= Payloads.Impact.FLAG_MELEE;
			if (def.kind == AttackDef.Kind.KICK || def.kind == AttackDef.Kind.STOMP) flags |= Payloads.Impact.FLAG_KICK;
			if (def.heavy) flags |= Payloads.Impact.FLAG_HEAVY;
			if (ctx.finisher) flags |= Payloads.Impact.FLAG_FINISHER;
			ctx.landed = true;
			ctx.dealt = damage;
		} else if (direct instanceof Projectile projectile) {
			Vec3 vel = projectile.getDeltaMovement();
			dir = vel.lengthSqr() > 1e-6 ? vel.normalize() : center.subtract(projectile.position()).normalize();
			hitPoint = BodyMath.clampToBox(projectile.position(), box.deflate(0.05));
			region = BodyMath.region(target, hitPoint);
			woundType = WoundType.STAB;
			force = 0.3f + damage * 0.09f;
		} else if (source.is(DamageTypeTags.IS_EXPLOSION)) {
			Vec3 from = source.getSourcePosition() != null ? source.getSourcePosition() : center.add(0, -1, 0);
			dir = center.subtract(from);
			dir = dir.lengthSqr() > 1e-6 ? dir.normalize() : new Vec3(0, 1, 0);
			hitPoint = BodyMath.clampToBox(from, box);
			region = BodyRegion.TORSO;
			woundType = WoundType.BURN;
			force = damage * 0.28f;
			flags |= Payloads.Impact.FLAG_HEAVY;
		} else if (source.is(DamageTypes.FALL)) {
			Vec3 v = target.getDeltaMovement();
			dir = new Vec3(v.x, -1, v.z).normalize();
			hitPoint = new Vec3(target.getX(), target.getY() + 0.1, target.getZ());
			region = target.getRandom().nextBoolean() ? BodyRegion.LEFT_LEG : BodyRegion.RIGHT_LEG;
			woundType = WoundType.BLUNT;
			force = damage >= 4 ? damage * 0.5f : damage * 0.15f;
		} else if (attacker != null && attacker != target) {
			Vec3 from = attacker.getEyePosition();
			dir = BodyMath.horizontal(center.subtract(attacker.position()));
			double y = Mth.clamp(from.y - 0.25, box.minY + 0.1, box.maxY - 0.05);
			hitPoint = BodyMath.clampToBox(new Vec3(center.x - dir.x * box.getXsize(), y, center.z - dir.z * box.getZsize()), box);
			region = BodyMath.region(target, hitPoint);
			woundType = attacker instanceof LivingEntity la && WeaponClass.of(la.getMainHandItem()).woundType == WoundType.CUT ? WoundType.CUT : WoundType.BLUNT;
			force = 0.35f + damage * 0.12f;
		} else {
			// Fire, poison, starvation, magic... no physical push. Still a flinch for big hits.
			if (damage < 4 && !fatal) return;
			hitPoint = center;
			dir = Vec3.ZERO;
			region = BodyRegion.TORSO;
			woundType = WoundType.BLUNT;
			force = 0;
		}

		CombatState cs = VisceralEntity.getOrCreate(target);
		float effForce = force * BalanceSystem.susceptibility(target, cs, region, dir);

		// Gore: heavy edged killing blows can take a limb or the head.
		if (fatal && cfg.maxGoreLevel >= 2 && woundType == WoundType.CUT && region != BodyRegion.TORSO && BloodType.of(target).isFluid()) {
			float chance = ctx != null ? (ctx.def.weapon == WeaponClass.AXE ? 0.85f : (ctx.def.heavy ? 0.6f : 0.35f)) : 0.15f;
			if (force >= 0.9f && target.getRandom().nextFloat() < chance) {
				flags |= Payloads.Impact.FLAG_SEVER;
				WoundSystem.sever(target, region);
			}
		}
		if (fatal) flags |= Payloads.Impact.FLAG_FATAL;

		if (woundType != WoundType.BURN || cfg.maxGoreLevel >= 1) {
			WoundSystem.inflict(target, region, woundType, hitPoint, dir, damage);
		}

		// Melee knockback is ours (vanilla's was suppressed): directional and force-scaled.
		if (ctx != null && dir.lengthSqr() > 1e-6) {
			double resist = 1.0 - target.getAttributeValue(net.minecraft.world.entity.ai.attributes.Attributes.KNOCKBACK_RESISTANCE);
			double kb = (0.16 + 0.09 * Math.min(effForce, 5f)) * Math.max(0, resist);
			Vec3 v = target.getDeltaMovement();
			double up = target.onGround() ? Math.min(0.45, 0.06 + ctx.def.lift * 0.6 + effForce * 0.03) : v.y;
			target.setDeltaMovement(v.x * 0.4 + dir.x * kb, Math.max(v.y, up), v.z * 0.4 + dir.z * kb);
			target.hurtMarked = true;
		}

		BalanceSystem.applyImpact(target, dir, effForce, fatal);

		ServerNet.broadcast(target, new Payloads.Impact(target.getId(), attacker != null ? attacker.getId() : -1,
			(float) hitPoint.x, (float) hitPoint.y, (float) hitPoint.z, (float) dir.x, (float) dir.y, (float) dir.z,
			effForce, damage, region.ordinal(), woundType.ordinal(), flags));
		// The attacker also wants to know (recoil, hit-stop) even if it is not tracking itself.
		if (attacker instanceof net.minecraft.server.level.ServerPlayer sp && attacker != target && !net.fabricmc.fabric.api.networking.v1.PlayerLookup.tracking(target).contains(sp)) {
			ServerNet.send(sp, new Payloads.Impact(target.getId(), attacker.getId(), (float) hitPoint.x, (float) hitPoint.y, (float) hitPoint.z,
				(float) dir.x, (float) dir.y, (float) dir.z, effForce, damage, region.ordinal(), woundType.ordinal(), flags));
		}
	}

	/** Heavier weapons transfer more force. */
	private static float weaponWeight(LivingEntity attacker, AttackDef def) {
		if (def.kind == AttackDef.Kind.KICK || def.kind == AttackDef.Kind.STOMP) return 1f;
		return switch (def.weapon) {
			case AXE -> 1.25f;
			case MACE -> 1.35f;
			case SWORD, SPEAR -> 1.0f;
			case TOOL -> 0.9f;
			case FIST -> attacker.getMainHandItem().isEmpty() ? 0.85f : 0.95f;
		};
	}
}
