package dev.visceral.combat;

import dev.visceral.config.CommonConfig;
import dev.visceral.entity.CombatState;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.mixin.LivingEntityAccessor;
import dev.visceral.net.Payloads;
import dev.visceral.net.ServerNet;
import dev.visceral.physics.BodyMath;
import dev.visceral.registry.VisceralRegistry;
import dev.visceral.state.BodyRegion;
import dev.visceral.state.PhysState;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Server-side runner for player attacks: validates requests, plays out the wind-up / active /
 * recovery timeline and sweeps the weapon arc through the world during the active window.
 * Damage goes through vanilla {@code Player.attack} so enchantments, crits, durability and
 * statistics keep working.
 */
public final class PlayerCombat {
	private PlayerCombat() {
	}

	public static void onAttackRequest(ServerPlayer player, Payloads.AttackRequest req) {
		CommonConfig cfg = CommonConfig.get();
		if (!cfg.meleeOverhaul) return;
		AttackDef def = Attacks.byId(req.attackId());
		if (def == null || !player.isAlive() || player.isSpectator() || player.isPassenger()) return;
		CombatState cs = VisceralEntity.getOrCreate(player);
		if (cs.state != PhysState.STANDING) return;
		WeaponClass weapon = WeaponClass.of(player.getMainHandItem());
		if (!Attacks.allowedWith(def, weapon)) return;
		boolean leg = def.kind == AttackDef.Kind.KICK || def.kind == AttackDef.Kind.STOMP;
		if (leg && cs.kickCooldown > 2) return;
		if (cs.attack != null) {
			// Allow a little latency slack on the cancel point; otherwise buffer one follow-up.
			if (cs.attackTick >= cs.attack.cancelPoint(cs.attackScale) - 2) {
				start(player, cs, def, req.targetId(), req.comboStep());
			} else {
				cs.queuedAttack = def;
				cs.queuedTargetHint = req.targetId();
				cs.comboStep = req.comboStep();
			}
			return;
		}
		start(player, cs, def, req.targetId(), req.comboStep());
	}

	private static void start(ServerPlayer player, CombatState cs, AttackDef def, int targetHint, int comboStep) {
		cs.attack = def;
		cs.attackTick = 0;
		cs.attackHits.clear();
		cs.prevSweepProgress = 0;
		cs.attackTargetHint = targetHint;
		cs.comboStep = comboStep;
		cs.queuedAttack = null;
		boolean leg = def.kind == AttackDef.Kind.KICK || def.kind == AttackDef.Kind.STOMP;
		cs.attackScale = leg ? CommonConfig.get().attackTimeScale : Attacks.timeScale(player, def.weapon);
		if (leg) cs.kickCooldown = CommonConfig.get().kickCooldownTicks;
		player.resetAttackStrengthTicker();
		ServerNet.broadcast(player, new Payloads.PlayAnim(player.getId(), def.id, cs.attackScale), false);
	}

	public static void tick(ServerPlayer player, CombatState cs) {
		AttackDef def = cs.attack;
		if (def == null) return;
		if (cs.state != PhysState.STANDING || !player.isAlive()) {
			cs.attack = null;
			cs.queuedAttack = null;
			return;
		}
		cs.attackTick++;
		float scale = cs.attackScale;
		int windup = def.windup(scale);
		int active = def.active(scale);
		if (cs.attackTick == windup) {
			player.level().playSound(null, player.getX(), player.getEyeY(), player.getZ(),
				def.heavy ? VisceralRegistry.SWING_HEAVY : VisceralRegistry.SWING_LIGHT, SoundSource.PLAYERS, 0.6f, 0.9f + player.getRandom().nextFloat() * 0.25f);
		}
		if (cs.attackTick > windup && cs.attackTick <= windup + active) {
			float p1 = (cs.attackTick - windup) / (float) active;
			sweep(player, cs, def, cs.prevSweepProgress, p1);
			cs.prevSweepProgress = p1;
		}
		if (cs.queuedAttack != null && cs.attackTick >= def.cancelPoint(scale)) {
			start(player, cs, cs.queuedAttack, cs.queuedTargetHint, cs.comboStep);
			return;
		}
		if (cs.attackTick >= def.total(scale)) cs.attack = null;
	}

	private static void sweep(ServerPlayer player, CombatState cs, AttackDef def, float p0, float p1) {
		ServerLevel level = player.level();
		Vec3 eye = player.getEyePosition();
		SwingGeometry geo = new SwingGeometry(def, eye, player.getYRot(), player.getXRot());
		float reachScale = (float) (player.entityInteractionRange() / 3.0);
		double maxReach = def.reach * reachScale + 1.0;
		List<LivingEntity> candidates = level.getEntitiesOfClass(LivingEntity.class, player.getBoundingBox().inflate(maxReach + 1.0),
			e -> e != player && e.isAlive() && !e.isSpectator() && !cs.attackHits.contains(e.getId()) && !player.isAlliedTo(e)
				&& e != player.getVehicle() && !(e instanceof ArmorStand stand && stand.isMarker()));
		if (candidates.isEmpty()) return;
		List<LivingEntity> hits = new ArrayList<>();
		List<Vec3> points = new ArrayList<>();

		if (def.targetsGround()) {
			// Downward strikes: anything low enough in front of the feet.
			Vec3 feet = player.position();
			Vec3 flat = new Vec3(geo.forward.x, 0, geo.forward.z).normalize();
			for (LivingEntity e : candidates) {
				AABB box = e.getBoundingBox();
				boolean low = VisceralEntity.state(e).grounded() || box.getYsize() < 0.9 || box.maxY < player.getY() + 0.9;
				if (!low) continue;
				Vec3 c = box.getCenter();
				Vec3 to = new Vec3(c.x - feet.x, 0, c.z - feet.z);
				double dist = to.length() - box.getXsize() * 0.5;
				if (dist > def.reach * reachScale) continue;
				if (to.lengthSqr() > 1e-4 && to.normalize().dot(flat) < 0.35) continue;
				hits.add(e);
				points.add(new Vec3(c.x - flat.x * box.getXsize() * 0.3, box.maxY, c.z - flat.z * box.getZsize() * 0.3));
			}
		} else {
			int steps = 3;
			for (int s = 0; s <= steps; s++) {
				float t = p0 + (p1 - p0) * s / steps;
				Vec3 dir = geo.direction(t);
				float reach = geo.reach(t, reachScale);
				for (float r = def.minReach; r <= reach + 1e-3; r += 0.3f) {
					Vec3 pt = geo.origin.add(dir.scale(Math.min(r, reach)));
					for (LivingEntity e : candidates) {
						if (hits.contains(e)) continue;
						if (e.getBoundingBox().inflate(0.15).contains(pt)) {
							hits.add(e);
							points.add(pt);
						}
					}
				}
			}
		}

		float t = (p0 + p1) * 0.5f;
		Vec3 push = geo.push(t);
		for (int i = 0; i < hits.size(); i++) {
			LivingEntity target = hits.get(i);
			Vec3 pt = points.get(i);
			if (level.clip(new ClipContext(eye, pt, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player)).getType() != HitResult.Type.MISS) {
				continue;
			}
			cs.attackHits.add(target.getId());
			performHit(player, def, target, pt, push);
		}
	}

	private static void performHit(ServerPlayer player, AttackDef def, LivingEntity target, Vec3 hitPoint, Vec3 push) {
		CommonConfig cfg = CommonConfig.get();
		CombatState tcs = VisceralEntity.getOrCreate(target);
		boolean finisher = false;
		if (def.isFinisher() && cfg.finishers) {
			finisher = def.kind == AttackDef.Kind.FINISHER_GROUND ? tcs.state.grounded() || tcs.state == PhysState.FALLING
				: tcs.state == PhysState.STAGGERED || tcs.openingTicks > 0;
		}
		Vec3 clamped = BodyMath.clampToBox(hitPoint, target.getBoundingBox());
		BodyRegion region = def.targetsGround() ? (target.getRandom().nextFloat() < 0.3f ? BodyRegion.HEAD : BodyRegion.TORSO)
			: BodyMath.region(target, clamped);
		CombatContext.begin(player, target, def, clamped, push, region, finisher, tcs.openingTicks > 0);
		try {
			if (cfg.ignoreHurtCooldown) target.invulnerableTime = 0;
			if (def.usesWeaponDamage()) {
				((LivingEntityAccessor) player).visceral$setAttackStrengthTicker(1000);
				player.attack(target);
			} else {
				float damage = def.kind == AttackDef.Kind.STOMP ? cfg.stompDamage : cfg.kickDamage * def.damage;
				if (!player.getItemBySlot(net.minecraft.world.entity.EquipmentSlot.FEET).isEmpty()) damage += 1f;
				target.hurtServer(player.level(), player.damageSources().source(VisceralRegistry.KICK, player), damage);
				player.level().playSound(null, target.getX(), target.getY() + target.getBbHeight() * 0.5, target.getZ(),
					def.kind == AttackDef.Kind.STOMP ? VisceralRegistry.STOMP : VisceralRegistry.KICK_HIT, SoundSource.PLAYERS, 1f,
					0.9f + player.getRandom().nextFloat() * 0.2f);
				player.causeFoodExhaustion(0.2f);
			}
		} finally {
			CombatContext.end();
		}
		// Shield-bashing kick: a kick into a raised shield breaks the guard.
		if (def.kind == AttackDef.Kind.KICK && target instanceof Player tp && tp.isBlocking()) {
			tp.getCooldowns().addCooldown(tp.getUseItem(), 40);
			tp.stopUsingItem();
		}
	}

	/** Entities a player is allowed to hit (used by client-side soft targeting too). */
	public static boolean isValidTarget(Player player, Entity e) {
		return e instanceof LivingEntity le && le != player && le.isAlive() && !le.isSpectator() && !player.isAlliedTo(le)
			&& !(le instanceof ArmorStand stand && stand.isMarker());
	}
}
