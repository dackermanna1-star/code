package dev.visceral.client.input;

import dev.visceral.client.anim.EntityAnimator;
import dev.visceral.client.camera.ShoulderCamera;
import dev.visceral.client.config.ClientConfig;
import dev.visceral.client.net.ClientNet;
import dev.visceral.combat.AttackDef;
import dev.visceral.combat.Attacks;
import dev.visceral.combat.PlayerCombat;
import dev.visceral.combat.WeaponClass;
import dev.visceral.config.CommonConfig;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.net.Payloads;
import dev.visceral.state.PhysState;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Client side of the melee system: decides which attack a click becomes (combo position,
 * movement direction, sprinting, target state), starts its animation immediately for
 * responsiveness and asks the server to perform it. Clicks during an attack are buffered into
 * the next combo step at the cancel point.
 */
public final class CombatInput {
	private static @Nullable AttackDef current;
	private static float currentScale = 1f;
	private static int tick;
	private static int startTick;
	private static int lastEndTick = -100;
	private static int comboStep;
	private static int bufferedAttackTick = -100;
	private static int bufferedKickTick = -100;
	private static int kickCooldown;
	private static boolean combatClickHeld;

	private CombatInput() {
	}

	public static boolean attacking() {
		return current != null;
	}

	public static @Nullable AttackDef currentAttack() {
		return current;
	}

	/** Movement multiplier while committed to an attack (weight and commitment). */
	public static float moveFactor() {
		if (current == null) return 1f;
		int t = tick - startTick;
		int w = current.windup(currentScale), a = current.active(currentScale);
		if (t < w + a) return current.heavy ? 0.2f : 0.4f;
		return 0.65f;
	}

	/** Holding the attack button after a combat click must not start mining. */
	public static boolean suppressContinueAttack() {
		return combatClickHeld;
	}

	/**
	 * Called instead of vanilla's startAttack. Returns true if the click was consumed by the
	 * melee system.
	 */
	public static boolean onAttackKey() {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (player == null || !ClientNet.meleeEnabled() || player.isSpectator() || player.isPassenger() || player.isUsingItem()) return false;
		if (VisceralEntity.state(player) != PhysState.STANDING) return true;
		WeaponClass weapon = WeaponClass.of(player.getMainHandItem());
		HitResult hit = mc.hitResult;
		LivingEntity target = target(player, 4.5);
		if (hit != null && hit.getType() == HitResult.Type.BLOCK && !LockOn.active()) {
			boolean weaponReady = weapon != WeaponClass.FIST && weapon != WeaponClass.TOOL && target != null;
			if (!weaponReady) return false;
		}
		if (hit instanceof EntityHitResult ehr && !(ehr.getEntity() instanceof LivingEntity)) return false;
		combatClickHeld = true;
		requestAttack(player, weapon);
		return true;
	}

	public static void onKickKey() {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (player == null || !ClientNet.meleeEnabled() || player.isSpectator() || player.isPassenger()) return;
		if (VisceralEntity.state(player) != PhysState.STANDING) return;
		if (current != null && tick - startTick < current.cancelPoint(currentScale) - 1) {
			bufferedKickTick = tick;
			return;
		}
		if (kickCooldown > 0) return;
		LivingEntity target = target(player, 2.8);
		PhysState ts = target != null ? VisceralEntity.state(target) : null;
		AttackDef def = Attacks.selectKick(player.isSprinting() || !player.onGround(), ts);
		start(player, def, target, CommonConfig.get().attackTimeScale);
		kickCooldown = CommonConfig.get().kickCooldownTicks;
	}

	private static void requestAttack(LocalPlayer player, WeaponClass weapon) {
		if (current != null && tick - startTick < current.cancelPoint(currentScale)) {
			bufferedAttackTick = tick;
			return;
		}
		if (tick - lastEndTick > 10 && current == null) comboStep = 0;
		LivingEntity target = target(player, 4.5);
		PhysState ts = null;
		float hp = 1f;
		if (target != null && target.distanceTo(player) < 3.4) {
			ts = VisceralEntity.state(target);
			hp = target.getHealth() / Math.max(1f, target.getMaxHealth());
		}
		var mv = player.input.getMoveVector();
		AttackDef def = Attacks.select(weapon, comboStep, mv.y, mv.x, player.isSprinting(), ts, hp, ClientNet.serverFinishers && CommonConfig.get().finishers);
		float scale = Attacks.timeScale(player, def.weapon);
		start(player, def, target, scale);
		if (def.isFinisher() || def == Attacks.SWORD_RUNNING || def == Attacks.FIST_RUNNING || def == Attacks.AXE_RUNNING) comboStep = 0;
		else comboStep++;
	}

	private static void start(LocalPlayer player, AttackDef def, @Nullable LivingEntity target, float scale) {
		current = def;
		currentScale = scale;
		startTick = tick;
		bufferedAttackTick = -100;
		if (target != null) faceTowards(player, target, 75f);
		EntityAnimator.getOrCreate(player).playAttack(def, scale);
		ClientNet.sendAttack(def.id, target != null ? target.getId() : -1, comboStep);
		player.resetAttackStrengthTicker();
		ShoulderCamera.onAttackStart(def);
	}

	/** Soft target: lock-on target, else the best candidate in front within {@code range}. */
	public static @Nullable LivingEntity target(LocalPlayer player, double range) {
		LivingEntity locked = LockOn.target();
		if (locked != null && locked.distanceTo(player) <= range + 1.5) return locked;
		Minecraft mc = Minecraft.getInstance();
		if (mc.hitResult instanceof EntityHitResult ehr && ehr.getEntity() instanceof LivingEntity le && PlayerCombat.isValidTarget(player, le)
			&& le.distanceTo(player) <= range) {
			return le;
		}
		Vec3 eye = player.getEyePosition();
		float yaw = ShoulderCamera.decoupled() ? ShoulderCamera.viewYaw() : player.getYRot();
		Vec3 look = Vec3.directionFromRotation(0, yaw);
		LivingEntity best = null;
		double bestScore = Double.MAX_VALUE;
		for (Entity e : player.level().getEntities(player, player.getBoundingBox().inflate(range))) {
			if (!(e instanceof LivingEntity le) || !PlayerCombat.isValidTarget(player, le)) continue;
			Vec3 to = le.position().subtract(player.position());
			double dist = to.horizontalDistance();
			if (dist > range || Math.abs(le.getY() - player.getY()) > 2.5) continue;
			Vec3 flat = new Vec3(to.x, 0, to.z).normalize();
			double angle = Math.acos(Mth.clamp(flat.dot(look), -1, 1));
			if (angle > Math.toRadians(70)) continue;
			if (!LockOn.canSee(player, le)) continue;
			double score = angle * 2.5 + dist * 0.5;
			if (score < bestScore) {
				bestScore = score;
				best = le;
			}
		}
		return best;
	}

	static void faceTowards(LocalPlayer player, Entity target, float maxTurn) {
		Vec3 to = target.position().subtract(player.position());
		float yaw = (float) (Mth.atan2(to.z, to.x) * Mth.RAD_TO_DEG) - 90f;
		float diff = Mth.wrapDegrees(yaw - player.getYRot());
		diff = Mth.clamp(diff, -maxTurn, maxTurn);
		player.setYRot(player.getYRot() + diff);
		player.setYBodyRot(player.getYRot());
		player.setYHeadRot(player.getYRot());
	}

	public static void onHitConfirmed(Payloads.Impact p) {
		ShoulderCamera.addTrauma(p.has(Payloads.Impact.FLAG_HEAVY) ? 0.35f : 0.18f);
	}

	/** End of client tick. */
	public static void tick() {
		tick++;
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (kickCooldown > 0) kickCooldown--;
		if (player == null) {
			current = null;
			return;
		}
		if (!mc.options.keyAttack.isDown()) combatClickHeld = false;
		while (Keybinds.kick.consumeClick()) onKickKey();
		while (Keybinds.lockOn.consumeClick()) LockOn.toggle();
		LockOn.tick();
		if (current == null) {
			if (tick - bufferedKickTick < 6) {
				bufferedKickTick = -100;
				onKickKey();
			}
			return;
		}
		if (VisceralEntity.state(player) != PhysState.STANDING || !player.isAlive()) {
			EntityAnimator.getOrCreate(player).stopAction();
			current = null;
			return;
		}
		int t = tick - startTick;
		int windup = current.windup(currentScale);
		if (t == windup) {
			// Commit the body into the blow.
			if (current.lunge > 0 && player.onGround()) {
				Vec3 look = Vec3.directionFromRotation(0, player.getYRot());
				player.push(look.x * current.lunge, 0, look.z * current.lunge);
			}
			if (ClientConfig.get().shoulderCamera && mc.options.getCameraType().isFirstPerson()) player.swing(InteractionHand.MAIN_HAND);
			LivingEntity target = target(player, current.reach + 1);
			if (target != null && current.kind != AttackDef.Kind.KICK) faceTowards(player, target, 25f);
		}
		if (t >= current.cancelPoint(currentScale)) {
			if (tick - bufferedKickTick < 8) {
				bufferedKickTick = -100;
				AttackDef prev = current;
				current = null;
				lastEndTick = tick;
				onKickKey();
				if (current == null) current = prev;
				else return;
			} else if (tick - bufferedAttackTick < 8) {
				bufferedAttackTick = -100;
				current = null;
				requestAttack(player, WeaponClass.of(player.getMainHandItem()));
				return;
			}
		}
		if (t >= current.total(currentScale)) {
			current = null;
			lastEndTick = tick;
		}
	}

	public static void reset() {
		current = null;
		comboStep = 0;
		LockOn.clear();
	}
}
