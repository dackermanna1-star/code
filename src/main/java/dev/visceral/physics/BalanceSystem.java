package dev.visceral.physics;

import dev.visceral.config.CommonConfig;
import dev.visceral.entity.CombatState;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.net.Payloads;
import dev.visceral.net.ServerNet;
import dev.visceral.registry.VisceralRegistry;
import dev.visceral.registry.VisceralTags;
import dev.visceral.state.BodyRegion;
import dev.visceral.state.PhysState;
import dev.visceral.state.WoundList;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Server-authoritative balance model and physical state machine.
 *
 * <p>Impacts reduce an entity's balance and push an imbalance vector. Moderate imbalance makes
 * the entity stagger (it takes real stumbling steps in the push direction, which can carry it
 * into walls or off ledges); losing balance entirely makes it fall. A fallen entity lies with a
 * low hitbox, struggles, and tries to get up again (sometimes failing), or crawls if crippled.
 * Clients mirror the state and animate it with an active ragdoll.
 */
public final class BalanceSystem {
	public static final int RECOVER_TICKS = 26;
	public static final int RECOVER_STAND_TICK = 13;
	public static final int FALL_LOW_HITBOX_TICK = 5;
	private static final net.minecraft.resources.Identifier IMMOBILE_MODIFIER = dev.visceral.Visceral.id("knocked_down");

	private BalanceSystem() {
	}

	// ------------------------------------------------------------------------------------------
	// Shared (both logical sides)
	// ------------------------------------------------------------------------------------------

	/** True if the downed (low) hitbox should be used for the given state. */
	public static boolean useLowHitbox(CombatState cs) {
		return switch (cs.state) {
			case DOWNED, CRAWLING -> true;
			case FALLING -> cs.stateTicks >= FALL_LOW_HITBOX_TICK;
			case RECOVERING -> cs.stateTicks < RECOVER_STAND_TICK;
			default -> false;
		};
	}

	public static EntityDimensions lowDimensions(EntityDimensions standing) {
		float w = Math.max(standing.width(), Math.min(standing.height() * 0.5f, standing.width() * 1.6f));
		float h = Math.min(standing.height(), Math.max(0.35f, standing.width() * 0.9f));
		return EntityDimensions.scalable(w, h).withEyeHeight(h * 0.55f);
	}

	/** Advances synced state timers. Runs on server and client so hitbox changes line up. */
	public static void tickShared(LivingEntity e, CombatState cs) {
		if (cs.state == PhysState.STANDING) return;
		boolean before = useLowHitbox(cs);
		cs.stateTicks++;
		if (before != useLowHitbox(cs)) e.refreshDimensions();
	}

	// ------------------------------------------------------------------------------------------
	// Server
	// ------------------------------------------------------------------------------------------

	public static boolean participates(LivingEntity e) {
		if (!CommonConfig.get().physicalReactions) return false;
		if (e.getType().is(VisceralTags.NO_PHYSICS) || e.getType().is(VisceralTags.UNSHAKEABLE)) return false;
		if (e instanceof Player p && (p.isCreative() || p.isSpectator())) return false;
		return !e.isPassenger() && !e.isVehicle();
	}

	/**
	 * How strongly a raw force affects this entity: heavier/sturdier bodies resist, attacking or
	 * already-unbalanced bodies are more vulnerable, leg hits destabilise most.
	 */
	public static float susceptibility(LivingEntity e, CombatState cs, BodyRegion region, Vec3 dir) {
		double volume = e.getBbWidth() * e.getBbWidth() * e.getBbHeight();
		float mass = (float) Mth.clamp(0.7 / Math.max(0.05, volume), 0.25, 2.0);
		if (e.getType().is(VisceralTags.HEAVY)) mass *= 0.3f;
		float resist = (float) (1.0 - e.getAttributeValue(Attributes.KNOCKBACK_RESISTANCE));
		float posture = 1f;
		if (cs.windupTicks > 0 || cs.attack != null) posture *= 1.3f;
		if (cs.state == PhysState.STAGGERED) posture *= 1.5f;
		if (!e.onGround()) posture *= 1.35f;
		if (e.isCrouching()) posture *= 0.7f;
		// Moving into the blow (momentum against the impulse) destabilises.
		Vec3 v = e.getDeltaMovement();
		double into = -(v.x * dir.x + v.z * dir.z);
		if (into > 0.05) posture *= 1f + (float) Math.min(0.4, into * 2);
		WoundList wounds = e.getAttachedOrElse(VisceralRegistry.WOUNDS, WoundList.EMPTY);
		float legs = wounds.severity(BodyRegion.LEFT_LEG) + wounds.severity(BodyRegion.RIGHT_LEG);
		posture *= 1f + Math.min(0.6f, legs * 0.3f);
		float health = e.getMaxHealth() > 0 ? e.getHealth() / e.getMaxHealth() : 1f;
		posture *= 1f + (1f - Mth.clamp(health, 0, 1)) * 0.35f;
		return mass * Math.max(0, resist) * posture * region.balanceFactor();
	}

	/** Applies an impact (already scaled to "effective force") to the balance model. */
	public static void applyImpact(LivingEntity e, Vec3 pushDir, float effForce, boolean fatal) {
		if (!participates(e) || effForce <= 0.01f) return;
		CommonConfig cfg = CommonConfig.get();
		CombatState cs = VisceralEntity.getOrCreate(e);
		cs.lastImpactTime = e.level().getGameTime();
		Vec3 dir = BodyMath.horizontal(pushDir);

		if (cs.windupTicks > 0 && effForce >= 0.45f) {
			cs.windupTicks = 0;
			cs.windupTarget = null;
			cs.openingTicks = Math.max(cs.openingTicks, 20);
			ServerNet.broadcast(e, new Payloads.PlayAnim(e.getId(), Payloads.PlayAnim.INTERRUPTED, 1f));
		}

		cs.imbX += dir.x * effForce;
		cs.imbZ += dir.z * effForce;
		cs.balance -= effForce * 0.32f;
		if (fatal) {
			// Dead bodies just go down; the client turns the corpse into a limp ragdoll.
			if (cs.state != PhysState.FALLING && !cs.state.grounded()) startFalling(e, cs, dir, Math.max(effForce, 1.5f));
			return;
		}
		boolean isPlayer = e instanceof Player;
		switch (cs.state) {
			case DOWNED, CRAWLING -> {
				cs.stateDuration = Math.min(cfg.maxDownedTicks, cs.stateDuration + (int) (effForce * 8));
				cs.force = effForce;
				ServerNet.syncState(e, cs);
			}
			case FALLING -> {
				cs.force = Math.max(cs.force, effForce);
			}
			case RECOVERING -> {
				if (effForce >= 0.6f) enterDowned(e, cs, effForce, true);
			}
			default -> {
				if (isPlayer && !cfg.knockdownsAffectPlayers) return;
				boolean staggered = cs.state == PhysState.STAGGERED;
				float threshold = cfg.knockdownThreshold;
				boolean fall = effForce >= threshold || cs.balance <= 0f || (staggered && effForce >= threshold * 0.55f);
				if (!fall && effForce >= cfg.staggerThreshold * 0.8f && (nearLedge(e, dir) || trips(e, dir))) fall = true;
				if (fall) {
					startFalling(e, cs, dir, effForce);
				} else if (effForce >= cfg.staggerThreshold || staggered) {
					startStagger(e, cs, effForce);
				}
			}
		}
	}

	private static void startStagger(LivingEntity e, CombatState cs, float effForce) {
		int remaining = cs.state == PhysState.STAGGERED ? Math.max(0, cs.stateDuration - cs.stateTicks) : 0;
		int duration = Math.min(40, (int) (7 + effForce * 9) + remaining / 2);
		cs.setState(PhysState.STAGGERED, duration);
		double len = Math.sqrt(cs.imbX * cs.imbX + cs.imbZ * cs.imbZ);
		if (len > 1e-4) {
			cs.dirX = (float) (cs.imbX / len);
			cs.dirZ = (float) (cs.imbZ / len);
		}
		cs.force = effForce;
		cs.openingTicks = Math.max(cs.openingTicks, duration + 8);
		cs.stepCooldown = 2;
		stopMob(e);
		ServerNet.syncState(e, cs);
	}

	public static void startFalling(LivingEntity e, CombatState cs, Vec3 dir, float effForce) {
		double len = Math.sqrt(cs.imbX * cs.imbX + cs.imbZ * cs.imbZ);
		Vec3 fallDir = len > 1e-4 ? new Vec3(cs.imbX / len, 0, cs.imbZ / len) : dir;
		if (fallDir.lengthSqr() < 1e-6) fallDir = BodyMath.facing(e).scale(-1);
		cs.setState(PhysState.FALLING, Math.min(30, 14 + (int) (effForce * 2)));
		cs.dirX = (float) fallDir.x;
		cs.dirZ = (float) fallDir.z;
		cs.force = effForce;
		cs.knockdowns++;
		cs.windupTicks = 0;
		cs.attack = null;
		double push = 0.14 + 0.06 * Math.min(effForce, 6f);
		double up = e.onGround() ? Math.min(0.42, 0.08 + 0.035 * effForce) : 0;
		Vec3 v = e.getDeltaMovement();
		e.setDeltaMovement(v.x * 0.5 + fallDir.x * push, Math.max(v.y, up), v.z * 0.5 + fallDir.z * push);
		e.hurtMarked = true;
		stopMob(e);
		applyImmobile(e, true);
		ServerNet.syncState(e, cs);
	}

	private static void enterDowned(LivingEntity e, CombatState cs, float force, boolean fromFailedRise) {
		CommonConfig cfg = CommonConfig.get();
		WoundList wounds = e.getAttachedOrElse(VisceralRegistry.WOUNDS, WoundList.EMPTY);
		float legs = wounds.severity(BodyRegion.LEFT_LEG) + wounds.severity(BodyRegion.RIGHT_LEG);
		int duration = cfg.minDownedTicks + (int) (force * 9 + legs * 22 + cs.knockdowns * 4);
		if (fromFailedRise) duration = cfg.minDownedTicks / 2 + e.getRandom().nextInt(20);
		if (e instanceof Player) duration = (int) (duration * cfg.playerDownedTimeMultiplier);
		duration = Mth.clamp(duration, cfg.minDownedTicks / 2, cfg.maxDownedTicks);
		cs.setState(PhysState.DOWNED, duration);
		cs.failedAttempt = false;
		cs.crawling = false;
		cs.force = force;
		e.refreshDimensions();
		applyImmobile(e, true);
		if (!fromFailedRise) {
			e.level().playSound(null, e.getX(), e.getY(), e.getZ(), VisceralRegistry.BODY_FALL, e.getSoundSource(), 1.0f,
				0.85f + e.getRandom().nextFloat() * 0.3f);
		}
		ServerNet.syncState(e, cs);
	}

	private static void stand(LivingEntity e, CombatState cs) {
		cs.setState(PhysState.STANDING, 0);
		cs.balance = 0.65f;
		cs.imbX = cs.imbZ = 0;
		cs.crawling = false;
		cs.failedAttempt = false;
		cs.openingTicks = Math.max(cs.openingTicks, 12);
		e.refreshDimensions();
		applyImmobile(e, false);
		ServerNet.syncState(e, cs);
	}

	/** Called every server tick for living entities that have combat state. */
	public static void tickServer(LivingEntity e, CombatState cs) {
		CommonConfig cfg = CommonConfig.get();
		if (cs.openingTicks > 0) cs.openingTicks--;
		if (cs.kickCooldown > 0) cs.kickCooldown--;
		if (e.isDeadOrDying()) return;
		if (cs.state != PhysState.STANDING && (!participates(e) || e.isPassenger())) {
			stand(e, cs);
			return;
		}
		switch (cs.state) {
			case STANDING -> {
				cs.balance = Math.min(1f, cs.balance + 0.03f);
				cs.imbX *= 0.8;
				cs.imbZ *= 0.8;
			}
			case STAGGERED -> tickStagger(e, cs);
			case FALLING -> {
				checkSlam(e, cs);
				if ((cs.stateTicks >= 6 && (e.onGround() || e.isInWater())) || cs.stateTicks >= cs.stateDuration + 40) {
					enterDowned(e, cs, cs.force, false);
				}
			}
			case DOWNED -> {
				if (cs.stateTicks >= cs.stateDuration) decideAfterDowned(e, cs);
			}
			case RECOVERING -> {
				if (cs.failedAttempt && cs.stateTicks >= RECOVER_STAND_TICK - 1) {
					enterDowned(e, cs, 0.5f, true);
				} else if (cs.stateTicks >= cs.stateDuration) {
					stand(e, cs);
				}
			}
			case CRAWLING -> tickCrawl(e, cs, cfg);
		}
	}

	private static void tickStagger(LivingEntity e, CombatState cs) {
		cs.imbX *= 0.88;
		cs.imbZ *= 0.88;
		cs.balance = Math.min(1f, cs.balance + 0.035f);
		double imb = Math.sqrt(cs.imbX * cs.imbX + cs.imbZ * cs.imbZ);
		Vec3 dir = imb > 1e-4 ? new Vec3(cs.imbX / imb, 0, cs.imbZ / imb) : Vec3.ZERO;
		if (--cs.stepCooldown <= 0 && imb > 0.2 && e.onGround()) {
			// A catching step: the feet chase the centre of mass.
			double step = Math.min(0.17, 0.05 + 0.055 * imb);
			Vec3 v = e.getDeltaMovement();
			e.setDeltaMovement(v.x + dir.x * step, v.y, v.z + dir.z * step);
			e.hurtMarked = true;
			cs.stepCooldown = 5;
			if (nearLedge(e, dir) && imb > 0.45) {
				startFalling(e, cs, dir, (float) imb + 1f);
				return;
			}
		}
		checkSlam(e, cs);
		if (cs.state != PhysState.STAGGERED) return;
		if (cs.stateTicks >= cs.stateDuration) {
			cs.setState(PhysState.STANDING, 0);
			cs.imbX *= 0.3;
			cs.imbZ *= 0.3;
			ServerNet.syncState(e, cs);
		}
	}

	private static void checkSlam(LivingEntity e, CombatState cs) {
		if (!e.horizontalCollision || e.minorHorizontalCollision) return;
		double speed = Math.sqrt(e.getDeltaMovement().horizontalDistanceSqr());
		Vec3 last = e.getKnownMovement();
		speed = Math.max(speed, Math.sqrt(last.horizontalDistanceSqr()));
		if (speed < 0.16 || e.level().getGameTime() - cs.lastImpactTime > 30) return;
		cs.lastImpactTime = e.level().getGameTime() - 31;
		if (!(e.level() instanceof ServerLevel level)) return;
		float dmg = CommonConfig.get().wallSlamDamage * (float) Math.min(2.0, speed / 0.3);
		if (dmg > 0.2f) e.hurtServer(level, e.damageSources().source(VisceralRegistry.WALL_SLAM), dmg);
		level.playSound(null, e.getX(), e.getY(), e.getZ(), VisceralRegistry.BODY_SLAM, e.getSoundSource(), 1.0f, 0.9f + e.getRandom().nextFloat() * 0.2f);
		ServerNet.broadcast(e, new Payloads.Impact(e.getId(), -1, (float) e.getX(), (float) (e.getY() + e.getBbHeight() * 0.6), (float) e.getZ(),
			-cs.dirX, 0, -cs.dirZ, (float) speed * 4f, dmg, BodyRegion.TORSO.ordinal(), 2, Payloads.Impact.FLAG_SLAM));
		// Bounce off the wall a little; a heavy slam while staggering takes the legs out.
		Vec3 v = e.getDeltaMovement();
		e.setDeltaMovement(-v.x * 0.3 - cs.dirX * 0.05, v.y, -v.z * 0.3 - cs.dirZ * 0.05);
		e.hurtMarked = true;
		if (cs.state == PhysState.STAGGERED && speed > 0.25) {
			cs.imbX = -cs.dirX * 1.5;
			cs.imbZ = -cs.dirZ * 1.5;
			startFalling(e, cs, new Vec3(-cs.dirX, 0, -cs.dirZ), 2.5f);
		}
	}

	private static void decideAfterDowned(LivingEntity e, CombatState cs) {
		CommonConfig cfg = CommonConfig.get();
		WoundList wounds = e.getAttachedOrElse(VisceralRegistry.WOUNDS, WoundList.EMPTY);
		float legs = wounds.severity(BodyRegion.LEFT_LEG) + wounds.severity(BodyRegion.RIGHT_LEG);
		boolean severedLeg = wounds.isSevered(BodyRegion.LEFT_LEG) || wounds.isSevered(BodyRegion.RIGHT_LEG);
		float health = e.getHealth() / Math.max(1f, e.getMaxHealth());
		boolean canCrawl = cfg.crawling && e instanceof Mob && e.getType().is(VisceralTags.CAN_CRAWL);
		boolean crippled = severedLeg || legs >= 1.1f || (health < 0.3f && e.getRandom().nextFloat() < 0.45f);
		if (canCrawl && crippled) {
			cs.setState(PhysState.CRAWLING, severedLeg ? 100000 : 160 + e.getRandom().nextInt(120));
			cs.crawling = true;
			cs.crawlAttackCooldown = 20;
			ServerNet.syncState(e, cs);
			return;
		}
		float fail = 0.15f + 0.35f * (1f - health) + 0.08f * Math.min(cs.knockdowns, 4) + legs * 0.12f;
		boolean failed = cfg.failedGetUpAttempts && e instanceof Mob && e.getRandom().nextFloat() < Math.min(0.6f, fail);
		cs.setState(PhysState.RECOVERING, e instanceof Player ? 20 : RECOVER_TICKS);
		cs.failedAttempt = failed;
		ServerNet.syncState(e, cs);
	}

	private static void tickCrawl(LivingEntity e, CombatState cs, CommonConfig cfg) {
		if (!(e instanceof Mob mob)) {
			decideAfterDowned(e, cs);
			return;
		}
		LivingEntity target = mob.getTarget();
		if (target != null && target.isAlive() && target.level() == e.level()) {
			Vec3 to = target.position().subtract(e.position());
			double dist = to.horizontalDistance();
			float yaw = (float) (Mth.atan2(to.z, to.x) * Mth.RAD_TO_DEG) - 90f;
			float turned = Mth.approachDegrees(e.getYRot(), yaw, 6f);
			e.setYRot(turned);
			e.setYBodyRot(turned);
			e.setYHeadRot(turned);
			if (dist > 1.1 && e.onGround()) {
				// Arm-over-arm pulls: surges every ~12 ticks rather than a constant glide.
				double surge = (cs.stateTicks % 12) < 5 ? 0.055 : 0.012;
				Vec3 dir = to.multiply(1, 0, 1).normalize();
				Vec3 v = e.getDeltaMovement();
				e.setDeltaMovement(dir.x * surge, v.y, dir.z * surge);
			} else if (dist <= 1.4 && --cs.crawlAttackCooldown <= 0 && e.level() instanceof ServerLevel level) {
				cs.crawlAttackCooldown = 30;
				float dmg = (float) e.getAttributeValue(Attributes.ATTACK_DAMAGE) * 0.5f;
				if (dmg > 0) target.hurtServer(level, e.damageSources().mobAttack(e), dmg);
				ServerNet.broadcast(e, new Payloads.PlayAnim(e.getId(), Payloads.PlayAnim.MOB_STRIKE, 1f));
			}
		}
		if (cs.stateTicks >= cs.stateDuration) {
			WoundList wounds = e.getAttachedOrElse(VisceralRegistry.WOUNDS, WoundList.EMPTY);
			if (!wounds.isSevered(BodyRegion.LEFT_LEG) && !wounds.isSevered(BodyRegion.RIGHT_LEG)) {
				cs.setState(PhysState.RECOVERING, RECOVER_TICKS);
				cs.crawling = false;
				cs.failedAttempt = e.getRandom().nextFloat() < 0.3f;
				ServerNet.syncState(e, cs);
			}
		}
	}

	/** No ground within ~1.5 blocks below the point the body is being pushed towards. */
	static boolean nearLedge(LivingEntity e, Vec3 dir) {
		if (dir.lengthSqr() < 1e-6 || !e.onGround()) return false;
		Level level = e.level();
		double reach = e.getBbWidth() * 0.5 + 0.45;
		BlockPos ahead = BlockPos.containing(e.getX() + dir.x * reach, e.getY() - 0.2, e.getZ() + dir.z * reach);
		for (int i = 0; i < 2; i++) {
			if (!level.getBlockState(ahead.below(i)).getCollisionShape(level, ahead.below(i)).isEmpty()) return false;
		}
		return true;
	}

	/** A shin-high obstacle right behind the feet in the push direction trips the entity up. */
	static boolean trips(LivingEntity e, Vec3 dir) {
		if (dir.lengthSqr() < 1e-6 || !e.onGround()) return false;
		Level level = e.level();
		double reach = e.getBbWidth() * 0.5 + 0.3;
		BlockPos shin = BlockPos.containing(e.getX() + dir.x * reach, e.getY() + 0.3, e.getZ() + dir.z * reach);
		BlockPos chest = shin.above();
		boolean low = !level.getBlockState(shin).getCollisionShape(level, shin).isEmpty();
		boolean high = !level.getBlockState(chest).getCollisionShape(level, chest).isEmpty();
		return low && !high;
	}

	private static void stopMob(LivingEntity e) {
		if (e instanceof Mob mob) {
			mob.getNavigation().stop();
			mob.setZza(0);
			mob.setXxa(0);
			mob.setSpeed(0);
			mob.setJumping(false);
		}
	}

	/** Belt-and-braces: zero movement attributes while down so nothing (AI, other mods) walks the body around. */
	private static void applyImmobile(LivingEntity e, boolean on) {
		AttributeInstance speed = e.getAttribute(Attributes.MOVEMENT_SPEED);
		if (speed != null) {
			if (on) speed.addOrUpdateTransientModifier(new AttributeModifier(IMMOBILE_MODIFIER, -1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
			else speed.removeModifier(IMMOBILE_MODIFIER);
		}
		AttributeInstance jump = e.getAttribute(Attributes.JUMP_STRENGTH);
		if (jump != null) {
			if (on) jump.addOrUpdateTransientModifier(new AttributeModifier(IMMOBILE_MODIFIER, -1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
			else jump.removeModifier(IMMOBILE_MODIFIER);
		}
	}

	/** Debug/command entry point. */
	public static void forceKnockdown(LivingEntity e, Vec3 dir, float force) {
		CombatState cs = VisceralEntity.getOrCreate(e);
		cs.imbX = dir.x * force;
		cs.imbZ = dir.z * force;
		startFalling(e, cs, dir, force);
	}

	public static void playSound(LivingEntity e, net.minecraft.sounds.SoundEvent sound, float volume) {
		e.level().playSound(null, e.getX(), e.getY(), e.getZ(), sound, SoundSource.HOSTILE, volume, 0.9f + e.getRandom().nextFloat() * 0.2f);
	}
}
