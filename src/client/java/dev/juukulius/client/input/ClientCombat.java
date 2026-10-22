package dev.juukulius.client.input;

import dev.juukulius.animation.JuliusAnim;
import dev.juukulius.character.JuliusAppearance;
import dev.juukulius.client.ClientJulius;
import dev.juukulius.client.anim.AnimatorManager;
import dev.juukulius.client.anim.ClientClock;
import dev.juukulius.client.config.JuliusConfigScreen;
import dev.juukulius.client.fx.FxHandler;
import dev.juukulius.client.hud.SpiritWheelScreen;
import dev.juukulius.combat.Ability;
import dev.juukulius.combat.ArtFeedback;
import dev.juukulius.combat.CombatRules;
import dev.juukulius.combat.CombatRules.ComboStep;
import dev.juukulius.network.ActionRequestPayload;
import dev.juukulius.network.ActionRequestPayload.Action;
import dev.juukulius.network.ActionResultPayload.DenyReason;
import dev.juukulius.registry.JuliusItems;
import dev.juukulius.registry.JuliusSounds;
import dev.juukulius.spirit.Spirit;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Turns input into requests and predicts the result locally so controls feel instant: the animation, cast sound and
 * cast effect start on the key press; the server validates and only answers when it disagrees. Uses the same timing
 * rules as the server ({@link CombatRules}).
 */
public final class ClientCombat {
	private static final int WHEEL_HOLD_TICKS = 6;
	private static final int SWING_BUFFER_TICKS = 6;

	private static int comboStep;
	private static long lastSwingTick = -1000L;
	private static int lockTicks;
	private static boolean lockFromCombo;
	private static int swingBuffer;
	private static int dashTicks;
	private static Vec3 dashDirection = Vec3.ZERO;
	private static boolean wasCharging;
	private static int chargeTicks;
	private static int selectHold;
	private static boolean selectWasDown;
	private static boolean wheelOpened;
	private static @Nullable Ability lastPredicted;
	private static float lastPredictedCost;

	private ClientCombat() {
	}

	// ------------------------------------------------------------------------------------------------ hooks

	/** Called when the attack key is pressed. Returns true when Julius's combo handled it (vanilla attack skipped). */
	public static boolean onAttackKey(Minecraft minecraft) {
		LocalPlayer player = minecraft.player;
		if (player == null || !swordCombatActive(player)) {
			return false;
		}

		trySwing(minecraft, player);
		return true;
	}

	/** While Julius fights with the sword, holding attack does not mine blocks. */
	public static boolean blocksContinuousAttack(Minecraft minecraft) {
		return minecraft.player != null && swordCombatActive(minecraft.player);
	}

	public static boolean swordCombatActive(LocalPlayer player) {
		return ClientJulius.transformed() && player.getMainHandItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD) && !player.isSpectator();
	}

	// ------------------------------------------------------------------------------------------------ tick

	public static void tick(Minecraft minecraft) {
		LocalPlayer player = minecraft.player;
		if (player == null) {
			return;
		}

		if (lockTicks > 0 && --lockTicks == 0) {
			lockFromCombo = false;
		}

		handleKeys(minecraft, player);

		if (swingBuffer > 0) {
			swingBuffer--;
			if (minecraft.screen == null && swordCombatActive(player)) {
				trySwing(minecraft, player);
			} else {
				swingBuffer = 0;
			}
		}

		tickDash(player);
		tickCharge(minecraft, player);
	}

	private static void handleKeys(Minecraft minecraft, LocalPlayer player) {
		boolean sneaking = minecraft.options.keyShift.isDown();
		while (JuliusKeys.TRANSFORM.consumeClick()) {
			send(Action.TRANSFORM, 0);
		}

		while (JuliusKeys.DISMISS.consumeClick()) {
			send(Action.TOGGLE_SPIRITS, 0);
		}

		while (JuliusKeys.SPIRIT_ART.consumeClick()) {
			useSpiritArt(minecraft, player, sneaking);
		}

		while (JuliusKeys.SWORD_SPECIAL.consumeClick()) {
			useSwordSpecial(minecraft, player, sneaking);
		}

		while (JuliusKeys.ULTIMATE.consumeClick()) {
			useUltimate(minecraft, player);
		}

		while (JuliusKeys.SETTINGS.consumeClick()) {
			minecraft.setScreen(new JuliusConfigScreen(null));
		}

		// Spirit select: tap cycles (sneak cycles backwards), hold opens the radial wheel.
		int taps = 0;
		while (JuliusKeys.SPIRIT_SELECT.consumeClick()) {
			taps++;
		}

		boolean down = JuliusKeys.SPIRIT_SELECT.isDown() && minecraft.screen == null;
		if (down) {
			selectHold++;
			if (selectHold == WHEEL_HOLD_TICKS && !wheelOpened) {
				wheelOpened = true;
				minecraft.setScreen(new SpiritWheelScreen());
			}
		} else if (selectWasDown) {
			if (!wheelOpened) {
				selectSpirit(minecraft, player, ClientJulius.selectedSpirit().next(sneaking ? -1 : 1));
			}

			selectHold = 0;
			wheelOpened = false;
		} else if (minecraft.screen == null) {
			// Taps pressed and released between two ticks never show up as held; count their clicks instead.
			if (taps > 0) {
				Spirit target = ClientJulius.selectedSpirit();
				for (int i = 0; i < taps; i++) {
					target = target.next(sneaking ? -1 : 1);
				}

				selectSpirit(minecraft, player, target);
			}

			selectHold = 0;
			wheelOpened = false;
		}

		selectWasDown = down;
	}

	public static void selectSpirit(Minecraft minecraft, LocalPlayer player, Spirit spirit) {
		if (spirit == ClientJulius.selectedSpirit()) {
			return;
		}

		ClientJulius.predictSpirit(spirit.ordinal());
		send(Action.SELECT_SPIRIT, spirit.ordinal());
		JuliusAppearance appearance = ClientJulius.appearance();
		if (appearance.transformed() && appearance.spiritsOut()) {
			AnimatorManager.get(player.getId()).play(JuliusAnim.SPIRIT_SELECT, 1.0F, ClientClock.seconds(0.0F));
			playLocal(minecraft, JuliusSounds.SPIRIT_SELECT, 0.5F, 0.8F + spirit.ordinal() * 0.09F);
		}
	}

	/** The wheel calls this when its key is released (the key state is consumed by the screen). */
	public static void onWheelClosed() {
		selectHold = 0;
		wheelOpened = true;
		selectWasDown = false;
	}

	// ------------------------------------------------------------------------------------------------ sword

	private static void trySwing(Minecraft minecraft, LocalPlayer player) {
		if (player.isUsingItem()) {
			return;
		}

		if (lockTicks > CombatRules.INPUT_TOLERANCE && !lockFromCombo) {
			swingBuffer = SWING_BUFFER_TICKS;
			return;
		}

		float speed = ClientJulius.ultimateActive() ? CombatRules.ULTIMATE_SPEED : 1.0F;
		long now = ClientClock.ticks();
		long since = now - lastSwingTick;
		int step;
		if (comboStep <= 0 || comboStep > CombatRules.COMBO.length) {
			step = 1;
		} else {
			ComboStep previous = CombatRules.COMBO[comboStep - 1];
			if (previous.step() == CombatRules.COMBO.length) {
				if (since < CombatRules.scaled(previous.totalTicks() + CombatRules.FINISHER_RECOVERY, speed)) {
					swingBuffer = SWING_BUFFER_TICKS;
					return;
				}

				step = 1;
			} else {
				if (since < CombatRules.scaled(previous.chainFrom(), speed)) {
					swingBuffer = SWING_BUFFER_TICKS;
					return;
				}

				step = since <= CombatRules.scaled(previous.chainUntil(), speed) ? previous.step() + 1 : 1;
			}
		}

		swingBuffer = 0;
		ComboStep combo = CombatRules.COMBO[step - 1];
		comboStep = step;
		lastSwingTick = now;
		lockTicks = CombatRules.scaled(combo.totalTicks(), speed);
		lockFromCombo = true;
		JuliusAnim animation = step == 1 ? JuliusAnim.SLASH_1 : step == 2 ? JuliusAnim.SLASH_2 : JuliusAnim.SLASH_3;
		AnimatorManager.get(player.getId()).play(animation, speed, ClientClock.seconds(0.0F));
		SoundEvent sound = step == 1 ? JuliusSounds.SWORD_SWING_1 : step == 2 ? JuliusSounds.SWORD_SWING_2 : JuliusSounds.SWORD_SWING_3;
		playLocal(minecraft, sound, 0.8F, 0.95F + player.getRandom().nextFloat() * 0.1F);
		if (step == CombatRules.COMBO.length && player.onGround()) {
			Vec3 look = flatLook(player);
			player.push(look.x * ArtFeedback.FINISHER_LUNGE, 0.0, look.z * ArtFeedback.FINISHER_LUNGE);
		}

		player.resetAttackStrengthTicker();
		send(Action.SWING, step);
	}

	private static void useSwordSpecial(Minecraft minecraft, LocalPlayer player, boolean clauzeria) {
		if (!checkTransformed()) {
			return;
		}

		if (!player.getMainHandItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD)) {
			deny(DenyReason.NO_SWORD);
			return;
		}

		Ability ability = clauzeria ? Ability.AL_CLAUZERIA : Ability.HEAVY_STRIKE;
		if (beginPredicted(minecraft, player, ability)) {
			send(Action.SWORD_SPECIAL, clauzeria ? 1 : 0);
		}
	}

	private static void useUltimate(Minecraft minecraft, LocalPlayer player) {
		if (!checkTransformed()) {
			return;
		}

		if (ClientJulius.ultimateActive()) {
			deny(DenyReason.ULTIMATE_ACTIVE);
			return;
		}

		if (ClientJulius.cooldown(Ability.AL_CRANVEL) <= 0 && ClientJulius.mana() + 0.01F < CombatRules.ULTIMATE_MIN_MANA) {
			deny(DenyReason.NO_MANA);
			return;
		}

		if (beginPredicted(minecraft, player, Ability.AL_CRANVEL)) {
			send(Action.ULTIMATE, 0);
		}
	}

	private static void useSpiritArt(Minecraft minecraft, LocalPlayer player, boolean combination) {
		if (!checkTransformed()) {
			return;
		}

		if (!ClientJulius.appearance().spiritsOut()) {
			// The server summons the spirits back instead of casting.
			send(Action.SPIRIT_ART, combination ? 1 : 0);
			return;
		}

		Ability ability = ClientJulius.selectedSpirit().art(combination);
		if (ability == Ability.NES_YIN_SEAL && findSealTarget(player) == null) {
			deny(DenyReason.NO_TARGET);
			return;
		}

		if (beginPredicted(minecraft, player, ability)) {
			if (ability == Ability.ARO_GALE_STEP) {
				startDash(player);
			}

			send(Action.SPIRIT_ART, combination ? 1 : 0);
		}
	}

	/** Checks lock, cooldown and mana; on success starts the animation, cast sound and cast effect locally. */
	private static boolean beginPredicted(Minecraft minecraft, LocalPlayer player, Ability ability) {
		if (player.isUsingItem()) {
			deny(DenyReason.BUSY);
			return false;
		}

		if (lockTicks > CombatRules.INPUT_TOLERANCE && !(lockFromCombo && lockTicks <= 4)) {
			deny(DenyReason.BUSY);
			return false;
		}

		if (ClientJulius.cooldown(ability) > 0) {
			deny(DenyReason.COOLDOWN);
			return false;
		}

		float cost = CombatRules.cost(ability, ClientJulius.ultimateActive());
		if (ClientJulius.mana() + 0.01F < cost) {
			deny(DenyReason.NO_MANA);
			return false;
		}

		lockTicks = ability.lockTicks;
		lockFromCombo = false;
		comboStep = 0;
		swingBuffer = 0;
		lastPredicted = ability;
		lastPredictedCost = cost;
		ClientJulius.predictUse(ability, cost);
		AnimatorManager.get(player.getId()).play(ability.animation, 1.0F, ClientClock.seconds(0.0F));
		SoundEvent sound = ArtFeedback.castSound(ability);
		if (sound != null) {
			playLocal(minecraft, sound, ability == Ability.AL_CRANVEL ? 1.2F : 0.9F, 1.0F);
		}

		FxHandler.castFeedback(player, ability);
		return true;
	}

	// ------------------------------------------------------------------------------------------------ movement

	private static void startDash(LocalPlayer player) {
		dashTicks = ArtFeedback.GALE_STEP_TICKS;
		dashDirection = flatLook(player);
	}

	private static void tickDash(LocalPlayer player) {
		if (dashTicks <= 0) {
			return;
		}

		Vec3 motion = player.getDeltaMovement();
		double lift = player.onGround() ? 0.08 : Math.max(motion.y, -0.05);
		player.setDeltaMovement(dashDirection.x * ArtFeedback.GALE_STEP_SPEED, lift, dashDirection.z * ArtFeedback.GALE_STEP_SPEED);
		player.resetFallDistance();
		if (--dashTicks == 0) {
			player.setDeltaMovement(player.getDeltaMovement().multiply(0.3, 1.0, 0.3));
		}
	}

	/** Detects the release of a charged swing and predicts the Al Clarista release animation. */
	private static void tickCharge(Minecraft minecraft, LocalPlayer player) {
		boolean charging = player.isUsingItem() && player.getUseItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD);
		if (charging) {
			chargeTicks = player.getTicksUsingItem();
		} else if (wasCharging) {
			if (chargeTicks >= CombatRules.CHARGE_MIN_TICKS && ClientJulius.transformed()) {
				float progress = CombatRules.chargeProgress(chargeTicks);
				float cost = CombatRules.cost(Ability.AL_CLARISTA, ClientJulius.ultimateActive())
					+ CombatRules.WAVE_EXTRA_COST * progress * (ClientJulius.ultimateActive() ? CombatRules.ULTIMATE_COST_MULTIPLIER : 1.0F);
				if (ClientJulius.cooldown(Ability.AL_CLARISTA) <= 0 && ClientJulius.mana() + 0.01F >= cost) {
					AnimatorManager.get(player.getId()).play(JuliusAnim.CHARGE_RELEASE, 1.0F, ClientClock.seconds(0.0F));
					playLocal(minecraft, JuliusSounds.SWORD_WAVE_RELEASE, 1.0F, 1.0F);
					ClientJulius.predictUse(Ability.AL_CLARISTA, cost);
					lastPredicted = Ability.AL_CLARISTA;
					lastPredictedCost = cost;
					lockTicks = Ability.AL_CLARISTA.lockTicks;
					lockFromCombo = false;
				} else {
					deny(ClientJulius.cooldown(Ability.AL_CLARISTA) > 0 ? DenyReason.COOLDOWN : DenyReason.NO_MANA);
				}
			}

			chargeTicks = 0;
		}

		wasCharging = charging;
	}

	// ------------------------------------------------------------------------------------------------ server answers

	public static void onDenied(Action action, DenyReason reason) {
		Minecraft minecraft = Minecraft.getInstance();
		LocalPlayer player = minecraft.player;
		if (player == null) {
			return;
		}

		if (action == Action.SWING || action == Action.SPIRIT_ART || action == Action.SWORD_SPECIAL || action == Action.ULTIMATE) {
			AnimatorManager.get(player.getId()).cancel(ClientClock.seconds(0.0F));
			lockTicks = 0;
			lockFromCombo = false;
			comboStep = 0;
			dashTicks = 0;
			if (lastPredicted != null) {
				ClientJulius.undoPrediction(lastPredicted, lastPredictedCost);
				lastPredicted = null;
			}
		}

		if (reason != DenyReason.SPIRITS_RESTING && reason != DenyReason.TOO_FAST) {
			ClientJulius.showMessage(Component.translatable(reason.translationKey()), true);
			playLocal(minecraft, JuliusSounds.DENIED, 0.6F, 1.0F);
		}
	}

	/** The server picked a different combo step than predicted. */
	public static void onCorrection(JuliusAnim animation) {
		comboStep = animation == JuliusAnim.SLASH_1 ? 1 : animation == JuliusAnim.SLASH_2 ? 2 : animation == JuliusAnim.SLASH_3 ? 3 : comboStep;
	}

	public static void reset() {
		comboStep = 0;
		lockTicks = 0;
		lockFromCombo = false;
		swingBuffer = 0;
		dashTicks = 0;
		wasCharging = false;
		chargeTicks = 0;
		selectHold = 0;
		wheelOpened = false;
		lastPredicted = null;
	}

	// ------------------------------------------------------------------------------------------------ helpers

	private static boolean checkTransformed() {
		if (!ClientJulius.transformed()) {
			deny(DenyReason.NOT_TRANSFORMED);
			return false;
		}

		return true;
	}

	private static void deny(DenyReason reason) {
		Minecraft minecraft = Minecraft.getInstance();
		ClientJulius.showMessage(Component.translatable(reason.translationKey()), true);
		playLocal(minecraft, JuliusSounds.DENIED, 0.6F, 1.0F);
	}

	private static @Nullable Entity findSealTarget(LocalPlayer player) {
		Vec3 eye = player.getEyePosition();
		Vec3 look = player.getLookAngle();
		Vec3 end = eye.add(look.scale(14.0));
		AABB area = player.getBoundingBox().expandTowards(look.scale(14.0)).inflate(1.5);
		EntityHitResult hit = ProjectileUtil.getEntityHitResult(player.level(), player, eye, end, area,
			entity -> entity instanceof LivingEntity && entity != player && !entity.isSpectator() && entity.isAlive(), 0.9F);
		return hit != null ? hit.getEntity() : null;
	}

	private static Vec3 flatLook(LocalPlayer player) {
		Vec3 look = player.getLookAngle();
		Vec3 flat = new Vec3(look.x, 0.0, look.z);
		return flat.lengthSqr() < 1.0E-6 ? Vec3.directionFromRotation(0.0F, player.getYRot()) : flat.normalize();
	}

	public static void playLocal(Minecraft minecraft, SoundEvent sound, float volume, float pitch) {
		LocalPlayer player = minecraft.player;
		if (player != null && minecraft.level != null) {
			minecraft.level.playLocalSound(player.getX(), player.getY() + 1.0, player.getZ(), sound, SoundSource.PLAYERS, volume, pitch, false);
		}
	}

	private static void send(Action action, int argument) {
		if (ClientPlayNetworking.canSend(ActionRequestPayload.TYPE)) {
			ClientPlayNetworking.send(new ActionRequestPayload(action, argument));
		}
	}
}
