package dev.visceral.client.config;

import dev.visceral.client.input.ControlPreset;
import dev.visceral.config.CommonConfig;
import java.util.function.Consumer;
import java.util.function.IntFunction;
import net.minecraft.client.Minecraft;
import net.minecraft.client.OptionInstance;
import net.minecraft.client.Options;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.options.OptionsSubScreen;
import net.minecraft.network.chat.Component;

/**
 * In-game settings for both config files. Gameplay (server) settings are only editable in
 * single-player, where the integrated server reads the same file.
 */
public final class ConfigScreen extends OptionsSubScreen {
	public ConfigScreen(Screen parent) {
		super(parent, Minecraft.getInstance().options, Component.translatable("visceral.config.title"));
	}

	@Override
	protected void addOptions() {
		ClientConfig c = ClientConfig.get();
		list.addHeader(Component.translatable("visceral.config.section.camera"));
		list.addSmall(
			bool("shoulder_camera", c.shoulderCamera, v -> c.shoulderCamera = v),
			bool("decoupled_camera", c.decoupledCamera, v -> c.decoupledCamera = v),
			slider("camera_distance", 12, 60, Math.round(c.cameraDistance * 10), v -> c.cameraDistance = v / 10f, v -> fmt(v / 10f, " m")),
			slider("shoulder_offset", 0, 15, Math.round(c.shoulderOffset * 10), v -> c.shoulderOffset = v / 10f, v -> fmt(v / 10f, " m")),
			slider("camera_height", -5, 10, Math.round(c.cameraHeight * 10), v -> c.cameraHeight = v / 10f, v -> fmt(v / 10f, " m")),
			slider("camera_smoothing", 0, 100, Math.round(c.cameraSmoothing * 100), v -> c.cameraSmoothing = v / 100f, ConfigScreen::pct),
			slider("camera_sensitivity", 10, 300, Math.round(c.cameraSensitivity * 100), v -> c.cameraSensitivity = v / 100f, ConfigScreen::pct),
			slider("camera_shake", 0, 100, Math.round(c.cameraShake * 100), v -> c.cameraShake = v / 100f, ConfigScreen::pct),
			slider("sprint_pullback", 0, 20, Math.round(c.sprintPullback * 10), v -> c.sprintPullback = v / 10f, v -> fmt(v / 10f, " m")),
			bool("aim_convergence", c.aimConvergence, v -> c.aimConvergence = v),
			bool("auto_shoulder_swap", c.autoShoulderSwap, v -> c.autoShoulderSwap = v),
			slider("movement_inertia", 0, 100, Math.round(c.movementInertia * 100), v -> c.movementInertia = v / 100f, ConfigScreen::pct),
			slider("turn_speed", 90, 1500, Math.round(c.turnSpeed), v -> c.turnSpeed = v, v -> fmt(v, "°/s")),
			slider("lock_on_range", 6, 40, Math.round(c.lockOnRange), v -> c.lockOnRange = v, v -> fmt(v, " m")));
		list.addSmall(
			Button.builder(Component.translatable("visceral.config.controls.apply"), b -> ControlPreset.apply(minecraft, true)).width(150).build(),
			Button.builder(Component.translatable("visceral.config.controls.revert"), b -> ControlPreset.revert(minecraft)).width(150).build());

		list.addHeader(Component.translatable("visceral.config.section.animation"));
		list.addSmall(
			bool("animation_overhaul", c.animationOverhaul, v -> c.animationOverhaul = v),
			bool("animate_players", c.animatePlayers, v -> c.animatePlayers = v),
			bool("animate_mobs", c.animateMobs, v -> c.animateMobs = v),
			slider("animation_intensity", 0, 200, Math.round(c.animationIntensity * 100), v -> c.animationIntensity = v / 100f, ConfigScreen::pct),
			bool("hit_reactions", c.hitReactions, v -> c.hitReactions = v),
			bool("hit_stop", c.hitStop, v -> c.hitStop = v));

		list.addHeader(Component.translatable("visceral.config.section.ragdoll"));
		list.addSmall(
			bool("ragdolls", c.ragdolls, v -> c.ragdolls = v),
			bool("death_ragdolls", c.deathRagdolls, v -> c.deathRagdolls = v),
			bool("active_behaviours", c.activeRagdollBehaviours, v -> c.activeRagdollBehaviours = v),
			slider("muscle_strength", 0, 200, Math.round(c.muscleStrength * 100), v -> c.muscleStrength = v / 100f, ConfigScreen::pct),
			slider("ragdoll_gravity", 5, 40, Math.round(c.ragdollGravity), v -> c.ragdollGravity = v, v -> fmt(v, " m/s²")),
			slider("corpse_seconds", 0, 120, Math.round(c.corpseSeconds), v -> c.corpseSeconds = v, v -> fmt(v, " s")));

		list.addHeader(Component.translatable("visceral.config.section.gore"));
		list.addSmall(
			bool("blood", c.blood, v -> c.blood = v),
			slider("blood_amount", 0, 300, Math.round(c.bloodAmount * 100), v -> c.bloodAmount = v / 100f, ConfigScreen::pct),
			bool("blood_decals", c.bloodDecals, v -> c.bloodDecals = v),
			bool("wound_overlays", c.woundOverlays, v -> c.woundOverlays = v),
			slider("gore_level", 0, 2, c.goreLevel, v -> c.goreLevel = v, v -> Component.translatable("visceral.option.gore_level." + v)),
			slider("decal_seconds", 5, 600, Math.round(c.decalSeconds), v -> c.decalSeconds = v, v -> fmt(v, " s")));

		list.addHeader(Component.translatable("visceral.config.section.performance"));
		list.addSmall(
			slider("max_ragdolls", 0, 64, c.maxActiveRagdolls, v -> c.maxActiveRagdolls = v, v -> Component.literal(String.valueOf(v))),
			slider("ragdoll_substeps", 2, 24, c.ragdollSubsteps, v -> c.ragdollSubsteps = v, v -> Component.literal(String.valueOf(v))),
			slider("max_corpses", 0, 100, c.maxCorpses, v -> c.maxCorpses = v, v -> Component.literal(String.valueOf(v))),
			slider("max_decals", 0, 1000, c.maxDecals, v -> c.maxDecals = v, v -> Component.literal(String.valueOf(v))),
			slider("animation_distance", 8, 128, Math.round(c.animationDistance), v -> c.animationDistance = v, v -> fmt(v, " m")),
			slider("ragdoll_distance", 8, 128, Math.round(c.ragdollDistance), v -> c.ragdollDistance = v, v -> fmt(v, " m")));

		if (minecraft.hasSingleplayerServer() || minecraft.level == null) {
			CommonConfig g = CommonConfig.get();
			list.addHeader(Component.translatable("visceral.config.section.gameplay"));
			list.addSmall(
				bool("melee_overhaul", g.meleeOverhaul, v -> g.meleeOverhaul = v),
				bool("physical_reactions", g.physicalReactions, v -> g.physicalReactions = v),
				bool("mob_windups", g.mobWindups, v -> g.mobWindups = v),
				bool("knockdowns_players", g.knockdownsAffectPlayers, v -> g.knockdownsAffectPlayers = v),
				bool("finishers", g.finishers, v -> g.finishers = v),
				bool("crawling", g.crawling, v -> g.crawling = v),
				bool("bleeding", g.bleeding, v -> g.bleeding = v),
				bool("wound_effects", g.woundEffects, v -> g.woundEffects = v),
				slider("kick_force", 5, 60, Math.round(g.kickForce * 10), v -> g.kickForce = v / 10f, v -> fmt(v / 10f, "")),
				slider("knockdown_threshold", 10, 60, Math.round(g.knockdownThreshold * 10), v -> g.knockdownThreshold = v / 10f, v -> fmt(v / 10f, "")),
				slider("attack_time_scale", 50, 200, Math.round(g.attackTimeScale * 100), v -> g.attackTimeScale = v / 100f, ConfigScreen::pct),
				slider("max_gore_server", 0, 2, g.maxGoreLevel, v -> g.maxGoreLevel = v, v -> Component.translatable("visceral.option.gore_level." + v)));
		}
	}

	@Override
	public void removed() {
		super.removed();
		ClientConfig.save();
		if (minecraft.hasSingleplayerServer() || minecraft.level == null) CommonConfig.save();
	}

	private static OptionInstance<Boolean> bool(String key, boolean value, Consumer<Boolean> set) {
		return OptionInstance.createBoolean("visceral.option." + key, OptionInstance.cachedConstantTooltip(Component.translatable("visceral.option." + key + ".tooltip")),
			value, set);
	}

	private static OptionInstance<Integer> slider(String key, int min, int max, int value, Consumer<Integer> set, IntFunction<Component> label) {
		return new OptionInstance<>("visceral.option." + key, OptionInstance.cachedConstantTooltip(Component.translatable("visceral.option." + key + ".tooltip")),
			(caption, v) -> Options.genericValueLabel(caption, label.apply(v)), new OptionInstance.IntRange(min, max), Math.max(min, Math.min(max, value)), set);
	}

	private static Component pct(int v) {
		return Component.literal(v + "%");
	}

	private static Component fmt(float v, String unit) {
		return Component.literal((v == Math.round(v) ? String.valueOf(Math.round(v)) : String.format("%.1f", v)) + unit);
	}
}
