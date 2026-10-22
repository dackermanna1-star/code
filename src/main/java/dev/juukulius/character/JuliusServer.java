package dev.juukulius.character;

import dev.juukulius.JuliusMod;
import dev.juukulius.animation.JuliusAnim;
import dev.juukulius.combat.Ability;
import dev.juukulius.combat.CombatRules;
import dev.juukulius.combat.SpiritArts;
import dev.juukulius.combat.SwordArts;
import dev.juukulius.config.JuliusServerConfig;
import dev.juukulius.network.ActionRequestPayload;
import dev.juukulius.network.ActionRequestPayload.Action;
import dev.juukulius.network.ActionResultPayload.DenyReason;
import dev.juukulius.network.FxType;
import dev.juukulius.network.JuliusNetworking;
import dev.juukulius.registry.JuliusItems;
import dev.juukulius.registry.JuliusSounds;
import dev.juukulius.spirit.Spirit;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * The authoritative Julius controller. Every request from a client is validated here (transformation, sword in hand,
 * action lock, cooldown, mana, timing) and every tick updates mana, cooldowns, Al Cranvel and scheduled impact frames.
 */
public final class JuliusServer {
	private static final Map<UUID, ActionState> STATES = new HashMap<>();

	private static final AttributeModifier TRANSFORM_SPEED = new AttributeModifier(JuliusMod.id("knight_poise"), 0.1, AttributeModifier.Operation.ADD_MULTIPLIED_BASE);
	private static final AttributeModifier CRANVEL_SPEED = new AttributeModifier(JuliusMod.id("al_cranvel_speed"), 0.3, AttributeModifier.Operation.ADD_MULTIPLIED_BASE);
	private static final AttributeModifier CRANVEL_JUMP = new AttributeModifier(JuliusMod.id("al_cranvel_jump"), 0.12, AttributeModifier.Operation.ADD_VALUE);
	private static final AttributeModifier CRANVEL_KNOCKBACK = new AttributeModifier(JuliusMod.id("al_cranvel_poise"), 0.4, AttributeModifier.Operation.ADD_VALUE);
	private static final AttributeModifier CRANVEL_SAFE_FALL = new AttributeModifier(JuliusMod.id("al_cranvel_fall"), 6.0, AttributeModifier.Operation.ADD_VALUE);

	private JuliusServer() {
	}

	public static ActionState state(ServerPlayer player) {
		return STATES.computeIfAbsent(player.getUUID(), uuid -> new ActionState());
	}

	public static void forget(ServerPlayer player) {
		STATES.remove(player.getUUID());
	}

	public static void clearAll() {
		STATES.clear();
	}

	// ------------------------------------------------------------------------------------------------ requests

	public static void handleRequest(ServerPlayer player, ActionRequestPayload request) {
		if (!player.isAlive() || player.isSpectator()) {
			return;
		}

		JuliusData data = JuliusAttachments.data(player);
		ActionState state = state(player);
		switch (request.action()) {
			case TRANSFORM -> toggleTransformation(player, data, state);
			case SELECT_SPIRIT -> selectSpirit(player, data, state, request.argument());
			case TOGGLE_SPIRITS -> toggleSpirits(player, data, state, request.action());
			case SPIRIT_ART -> castSpiritArt(player, data, state, request.argument() == 1);
			case SWING -> SwordArts.swing(player, data, state, request.argument());
			case SWORD_SPECIAL -> SwordArts.special(player, data, state, request.argument() == 1);
			case ULTIMATE -> SwordArts.alCranvel(player, data, state);
		}
	}

	private static void toggleTransformation(ServerPlayer player, JuliusData data, ActionState state) {
		if (state.transformCooldown > 0 || state.invulnerableTicks > 0) {
			JuliusNetworking.deny(player, Action.TRANSFORM, DenyReason.TOO_FAST);
			return;
		}

		if (data.transformed) {
			revert(player, data, state, false);
		} else {
			transform(player, data, state);
		}
	}

	public static void transform(ServerPlayer player, JuliusData data, ActionState state) {
		ServerLevel level = player.level();
		data.transformed = true;
		data.spiritsOut = true;
		state.cancelAll();
		state.lockTicks = CombatRules.TRANSFORM_LOCK;
		state.transformCooldown = CombatRules.TRANSFORM_COOLDOWN;
		state.changeTime = level.getGameTime();
		state.spiritsTime = level.getGameTime();
		grantSwordIfNeeded(player, data);
		updateModifiers(player, data);
		JuliusNetworking.sendAnimation(player, JuliusAnim.TRANSFORM, 1.0F, true);
		JuliusNetworking.sendFx(level, FxType.TRANSFORM, player, player.position(), player.getLookAngle(), 0xFFFFFF, 1.0F);
		playSound(player, JuliusSounds.TRANSFORM, 1.0F, 1.0F, null);
		updateAppearance(player);
		markStats(state);
	}

	public static void revert(ServerPlayer player, JuliusData data, ActionState state, boolean silent) {
		ServerLevel level = player.level();
		if (data.ultimateActive()) {
			endUltimate(player, data, state, true);
		}

		data.transformed = false;
		state.cancelAll();
		state.barrierEnd = 0L;
		state.invulnerableTicks = 0;
		state.lockTicks = silent ? 0 : CombatRules.REVERT_LOCK;
		state.transformCooldown = silent ? 0 : CombatRules.TRANSFORM_COOLDOWN / 2;
		state.changeTime = level.getGameTime();
		if (player.isUsingItem() && player.getUseItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD)) {
			player.stopUsingItem();
		}

		if (!silent) {
			JuliusNetworking.sendAnimation(player, JuliusAnim.REVERT, 1.0F, true);
			JuliusNetworking.sendFx(level, FxType.REVERT, player, player.position(), player.getLookAngle(), 0xFFFFFF, 1.0F);
			playSound(player, JuliusSounds.REVERT, 0.9F, 1.0F, null);
		}

		updateModifiers(player, data);
		updateAppearance(player);
		markStats(state);
	}

	private static void grantSwordIfNeeded(ServerPlayer player, JuliusData data) {
		if (data.swordGranted || !JuliusServerConfig.get().grantSwordOnFirstTransform) {
			return;
		}

		data.swordGranted = true;
		if (player.getInventory().contains(stack -> stack.is(JuliusItems.HOUSE_JUUKULIUS_SWORD))) {
			return;
		}

		ItemStack sword = new ItemStack(JuliusItems.HOUSE_JUUKULIUS_SWORD);
		if (player.getMainHandItem().isEmpty()) {
			player.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, sword);
		} else if (!player.getInventory().add(sword)) {
			player.drop(sword, false);
		}
	}

	private static void selectSpirit(ServerPlayer player, JuliusData data, ActionState state, int index) {
		if (state.selectCooldown > 0) {
			state.pendingSelect = Spirit.byIndex(index).ordinal();
			return;
		}

		state.pendingSelect = -1;

		Spirit spirit = Spirit.byIndex(index);
		if (spirit.ordinal() == data.selectedSpirit) {
			return;
		}

		state.selectCooldown = 2;
		data.selectedSpirit = spirit.ordinal();
		if (data.transformed && data.spiritsOut) {
			JuliusNetworking.sendAnimation(player, JuliusAnim.SPIRIT_SELECT, 1.0F, false);
			playSound(player, JuliusSounds.SPIRIT_SELECT, 0.5F, spiritPitch(spirit), player);
		}

		updateAppearance(player);
	}

	public static float spiritPitch(Spirit spirit) {
		return 0.8F + spirit.ordinal() * 0.09F;
	}

	private static void toggleSpirits(ServerPlayer player, JuliusData data, ActionState state, Action action) {
		if (!data.transformed) {
			JuliusNetworking.deny(player, action, DenyReason.NOT_TRANSFORMED);
			return;
		}

		if (data.ultimateActive()) {
			JuliusNetworking.deny(player, action, DenyReason.ULTIMATE_ACTIVE);
			return;
		}

		if (state.spiritToggleCooldown > 0 || state.lockTicks > CombatRules.INPUT_TOLERANCE) {
			JuliusNetworking.deny(player, action, DenyReason.BUSY);
			return;
		}

		setSpiritsOut(player, data, state, !data.spiritsOut);
	}

	public static void setSpiritsOut(ServerPlayer player, JuliusData data, ActionState state, boolean out) {
		ServerLevel level = player.level();
		data.spiritsOut = out;
		state.spiritToggleCooldown = CombatRules.SPIRIT_TOGGLE_COOLDOWN;
		state.lockTicks = Math.max(state.lockTicks, CombatRules.SPIRIT_TOGGLE_LOCK);
		state.lockFromCombo = false;
		state.spiritsTime = level.getGameTime();
		JuliusNetworking.sendAnimation(player, out ? JuliusAnim.SPIRITS_SUMMON : JuliusAnim.SPIRITS_DISMISS, 1.0F, true);
		JuliusNetworking.sendFx(level, out ? FxType.SPIRITS_SUMMON : FxType.SPIRITS_DISMISS, player, player.position(), player.getLookAngle(), 0xFFFFFF, 1.0F);
		playSound(player, out ? JuliusSounds.SPIRIT_SUMMON : JuliusSounds.SPIRIT_DISMISS, 0.9F, 1.0F, null);
		updateAppearance(player);
		markStats(state);
	}

	private static void castSpiritArt(ServerPlayer player, JuliusData data, ActionState state, boolean combination) {
		Action action = Action.SPIRIT_ART;
		if (!data.transformed) {
			JuliusNetworking.deny(player, action, DenyReason.NOT_TRANSFORMED);
			return;
		}

		if (!data.spiritsOut) {
			// Pressing an art while the spirits rest calls them back instead of casting.
			JuliusNetworking.deny(player, action, DenyReason.SPIRITS_RESTING);
			if (state.spiritToggleCooldown <= 0 && state.lockTicks <= CombatRules.INPUT_TOLERANCE) {
				setSpiritsOut(player, data, state, true);
			}

			return;
		}

		Ability ability = data.spirit().art(combination);
		if (!beginAbility(player, data, state, ability, action)) {
			return;
		}

		boolean cast = SpiritArts.cast(player, data, state, ability);
		if (!cast) {
			refundAbility(data, state, ability);
			JuliusNetworking.deny(player, action, DenyReason.NO_TARGET);
		}
	}

	// ------------------------------------------------------------------------------------------------ resources

	/**
	 * Validates and pays for an ability: action lock, cooldown and mana. On success the cooldown starts, mana is spent,
	 * the lock is set and the animation is broadcast to everyone but the caster (who already predicted it).
	 */
	public static boolean beginAbility(ServerPlayer player, JuliusData data, ActionState state, Ability ability, Action action) {
		if (state.lockTicks > CombatRules.INPUT_TOLERANCE && !(state.lockFromCombo && state.lockTicks <= 4)) {
			JuliusNetworking.deny(player, action, DenyReason.BUSY);
			return false;
		}

		if (data.cooldown(ability) > 0) {
			JuliusNetworking.deny(player, action, DenyReason.COOLDOWN);
			return false;
		}

		float cost = CombatRules.cost(ability, data.ultimateActive());
		if (data.mana + 0.01F < cost) {
			JuliusNetworking.deny(player, action, DenyReason.NO_MANA);
			return false;
		}

		spendMana(data, state, cost);
		data.cooldowns[ability.ordinal()] = CombatRules.cooldown(ability);
		state.lockTicks = ability.lockTicks;
		state.lockFromCombo = false;
		state.comboStep = 0;
		JuliusNetworking.sendAnimation(player, ability.animation, 1.0F, false);
		markStats(state);
		return true;
	}

	public static void refundAbility(JuliusData data, ActionState state, Ability ability) {
		data.mana = Math.min(CombatRules.MAX_MANA, data.mana + CombatRules.cost(ability, data.ultimateActive()));
		data.cooldowns[ability.ordinal()] = 0;
		state.lockTicks = 0;
		markStats(state);
	}

	public static void spendMana(JuliusData data, ActionState state, float amount) {
		if (amount <= 0.0F) {
			return;
		}

		data.mana = Math.max(0.0F, data.mana - amount);
		state.regenDelay = CombatRules.REGEN_DELAY_TICKS;
		markStats(state);
	}

	public static void restoreMana(ServerPlayer player, float amount) {
		JuliusData data = JuliusAttachments.data(player);
		if (data.transformed && amount > 0.0F) {
			data.mana = Math.min(CombatRules.MAX_MANA, data.mana + amount);
			markStats(state(player));
		}
	}

	public static void markStats(ActionState state) {
		state.statsDirty = true;
	}

	// ------------------------------------------------------------------------------------------------ tick

	public static void tickServer(MinecraftServer server) {
		for (ServerPlayer player : server.getPlayerList().getPlayers()) {
			tickPlayer(player);
		}

		STATES.keySet().removeIf(uuid -> server.getPlayerList().getPlayer(uuid) == null);
	}

	private static void tickPlayer(ServerPlayer player) {
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = state(player);
		if (state.lockTicks > 0 && --state.lockTicks == 0) {
			state.lockFromCombo = false;
		}

		if (state.transformCooldown > 0) {
			state.transformCooldown--;
		}

		if (state.spiritToggleCooldown > 0) {
			state.spiritToggleCooldown--;
		}

		if (state.selectCooldown > 0 && --state.selectCooldown == 0 && state.pendingSelect >= 0) {
			selectSpirit(player, data, state, state.pendingSelect);
		}

		if (state.invulnerableTicks > 0) {
			state.invulnerableTicks--;
		}

		tickMana(data, state);
		tickCooldowns(data, state);
		runTasks(player, state);

		if (data.transformed && player.isAlive()) {
			if (state.dashTicks > 0) {
				SpiritArts.tickGaleStep(player, data, state);
			}

			if (data.ultimateTicks > 0) {
				data.ultimateTicks--;
				if (data.ultimateTicks == 0) {
					endUltimate(player, data, state, false);
				}

				if (data.ultimateTicks % 20 == 0) {
					markStats(state);
				}
			}

			if (player.isUsingItem() && player.getUseItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD) && state.lockTicks > CombatRules.INPUT_TOLERANCE
				&& !state.lockFromCombo) {
				player.stopUsingItem();
			}
		}

		updateModifiers(player, data);
		syncStats(player, data, state);
	}

	private static void tickMana(JuliusData data, ActionState state) {
		float regen;
		if (!data.transformed) {
			regen = CombatRules.REGEN_UNTRANSFORMED;
		} else if (data.spiritsOut) {
			regen = CombatRules.REGEN_TRANSFORMED;
		} else {
			regen = CombatRules.REGEN_SPIRITS_RESTING;
		}

		if (state.regenDelay > 0) {
			state.regenDelay--;
			regen = 0.0F;
		}

		float before = data.mana;
		data.mana = Math.min(CombatRules.MAX_MANA, data.mana + regen * (float) JuliusServerConfig.get().manaRegenMultiplier);
		if (data.mana != before) {
			state.statsDirty = true;
		}
	}

	private static void tickCooldowns(JuliusData data, ActionState state) {
		state.cooldownAccumulator += data.ultimateActive() ? CombatRules.ULTIMATE_COOLDOWN_RATE : 1.0F;
		while (state.cooldownAccumulator >= 1.0F) {
			state.cooldownAccumulator -= 1.0F;
			for (int i = 0; i < data.cooldowns.length; i++) {
				if (data.cooldowns[i] > 0 && !(i == Ability.AL_CRANVEL.ordinal() && data.ultimateActive())) {
					data.cooldowns[i]--;
					state.statsDirty = true;
				}
			}
		}
	}

	private static void runTasks(ServerPlayer player, ActionState state) {
		if (state.tasks.isEmpty()) {
			return;
		}

		Iterator<ActionState.ScheduledTask> iterator = state.tasks.iterator();
		java.util.List<Runnable> due = new java.util.ArrayList<>();
		while (iterator.hasNext()) {
			ActionState.ScheduledTask task = iterator.next();
			if (--task.remaining <= 0) {
				iterator.remove();
				due.add(task.action);
			}
		}

		for (Runnable runnable : due) {
			if (player.isAlive() && JuliusAttachments.data(player).transformed) {
				runnable.run();
			}
		}
	}

	private static void syncStats(ServerPlayer player, JuliusData data, ActionState state) {
		if (state.statsSyncCooldown > 0) {
			state.statsSyncCooldown--;
		}

		if (!state.statsDirty || state.statsSyncCooldown > 0) {
			return;
		}

		state.statsDirty = false;
		state.statsSyncCooldown = 2;
		player.setAttached(JuliusAttachments.STATS, new JuliusStats(data.mana, data.cooldowns.clone(), data.ultimateTicks, state.lockTicks));
	}

	public static void forceSync(ServerPlayer player) {
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = state(player);
		state.statsSyncCooldown = 0;
		state.statsDirty = true;
		syncStats(player, data, state);
		updateAppearance(player);
	}

	public static void updateAppearance(ServerPlayer player) {
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = state(player);
		long gameTime = player.level().getGameTime();
		long ultimateEnd = data.ultimateTicks > 0 ? gameTime + data.ultimateTicks : 0L;
		player.setAttached(JuliusAttachments.APPEARANCE, new JuliusAppearance(
			data.transformed,
			data.spiritsOut,
			data.selectedSpirit,
			state.changeTime,
			state.spiritsTime,
			ultimateEnd,
			state.barrierEnd,
			++state.appearanceVersion
		));
	}

	// ------------------------------------------------------------------------------------------------ ultimate

	public static void startUltimate(ServerPlayer player, JuliusData data, ActionState state) {
		data.ultimateTicks = CombatRules.ULTIMATE_DURATION + CombatRules.TRANSFORM_LOCK + 6;
		data.spiritsOut = true;
		updateModifiers(player, data);
		updateAppearance(player);
		markStats(state);
	}

	public static void endUltimate(ServerPlayer player, JuliusData data, ActionState state, boolean silent) {
		data.ultimateTicks = 0;
		data.cooldowns[Ability.AL_CRANVEL.ordinal()] = CombatRules.cooldown(Ability.AL_CRANVEL);
		if (!silent) {
			ServerLevel level = player.level();
			state.lockTicks = Math.max(state.lockTicks, CombatRules.ULTIMATE_END_LOCK);
			state.lockFromCombo = false;
			JuliusNetworking.sendAnimation(player, JuliusAnim.CRANVEL_END, 1.0F, true);
			JuliusNetworking.sendFx(level, FxType.CRANVEL_END, player, player.position(), player.getLookAngle(), 0xFFFFFF, 1.0F);
			playSound(player, JuliusSounds.ULTIMATE_END, 1.0F, 1.0F, null);
		}

		updateModifiers(player, data);
		updateAppearance(player);
		markStats(state);
	}

	private static void updateModifiers(ServerPlayer player, JuliusData data) {
		boolean transformed = data.transformed && player.isAlive();
		boolean ultimate = transformed && data.ultimateActive();
		apply(player.getAttribute(Attributes.MOVEMENT_SPEED), TRANSFORM_SPEED, transformed);
		apply(player.getAttribute(Attributes.MOVEMENT_SPEED), CRANVEL_SPEED, ultimate);
		apply(player.getAttribute(Attributes.JUMP_STRENGTH), CRANVEL_JUMP, ultimate);
		apply(player.getAttribute(Attributes.KNOCKBACK_RESISTANCE), CRANVEL_KNOCKBACK, ultimate);
		apply(player.getAttribute(Attributes.SAFE_FALL_DISTANCE), CRANVEL_SAFE_FALL, ultimate);
	}

	private static void apply(@Nullable AttributeInstance instance, AttributeModifier modifier, boolean active) {
		if (instance == null) {
			return;
		}

		boolean present = instance.hasModifier(modifier.id());
		if (active && !present) {
			instance.addTransientModifier(modifier);
		} else if (!active && present) {
			instance.removeModifier(modifier.id());
		}
	}

	// ------------------------------------------------------------------------------------------------ helpers

	/** Plays a positional sound for everyone nearby except {@code except} (who predicted it locally). */
	public static void playSound(ServerPlayer player, SoundEvent sound, float volume, float pitch, @Nullable Player except) {
		player.level().playSound(except, player.getX(), player.getY() + 1.0, player.getZ(), sound, SoundSource.PLAYERS, volume, pitch);
	}

	public static void playSoundAt(ServerLevel level, Vec3 pos, SoundEvent sound, float volume, float pitch) {
		level.playSound(null, pos.x, pos.y, pos.z, sound, SoundSource.PLAYERS, volume, pitch);
	}

	public static boolean holdsSword(Player player) {
		return player.getMainHandItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD);
	}

	public static float actionSpeed(JuliusData data) {
		return data.ultimateActive() ? CombatRules.ULTIMATE_SPEED : 1.0F;
	}
}
