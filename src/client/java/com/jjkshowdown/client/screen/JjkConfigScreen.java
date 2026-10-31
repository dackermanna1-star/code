package com.jjkshowdown.client.screen;

import com.google.gson.Gson;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.config.Difficulty;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.network.Payloads;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.CycleButton;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.Function;

/**
 * Settings: "Client" (visuals, audio, HUD, cinematics, QTE preference) and "Gameplay" (difficulty, damage, cooldowns,
 * energy, domains, destruction, AI, QTE/cinematic rules), the latter editable by the single-player host or an operator.
 */
public class JjkConfigScreen extends Screen {
	private static final int PER_PAGE = 10;
	@Nullable
	private final Screen parent;
	private final ClientConfig client;
	private final JjkConfig common;
	private boolean gameplayTab;
	private int page;
	private final List<AbstractWidget> optionWidgets = new ArrayList<>();
	private final List<Component> optionLabels = new ArrayList<>();

	public JjkConfigScreen(@Nullable Screen parent) {
		super(Component.translatable("screen.jjkshowdown.config"));
		this.parent = parent;
		this.client = ClientConfig.get().copy();
		this.common = ClientState.serverConfig.copy();
	}

	private enum HudLayout {CENTER, LEFT, RIGHT}

	private interface OptionFactory {
		AbstractWidget create(int x, int y, int w);
	}

	private record Opt(Component label, OptionFactory factory) {
	}

	private static Component t(String key) {
		return Component.translatable("option.jjkshowdown." + key);
	}

	private Opt toggle(String key, boolean value, Consumer<Boolean> set) {
		return new Opt(t(key), (x, y, w) -> CycleButton.onOffBuilder(value).create(x, y, w, 20, t(key), (b, v) -> set.accept(v)));
	}

	private <E extends Enum<E>> Opt cycle(String key, E value, E[] values, Function<E, Component> name, Consumer<E> set) {
		return new Opt(t(key), (x, y, w) -> CycleButton.builder(name, value).withValues(values).create(x, y, w, 20, t(key), (b, v) -> set.accept(v)));
	}

	private Opt slider(String key, double value, double min, double max, double step, String fmt, DoubleConsumer set) {
		return new Opt(t(key), (x, y, w) -> new Slider(x, y, w, t(key), value, min, max, step, fmt, set));
	}

	private List<Opt> clientOptions() {
		ClientConfig c = client;
		List<Opt> o = new ArrayList<>();
		o.add(cycle("particles", c.quality(), ClientConfig.ParticleQuality.values(), q -> Component.translatable("option.jjkshowdown.quality." + q.name().toLowerCase()),
				v -> c.particleQuality = v.name()));
		o.add(slider("shake", c.screenShake, 0, 2, 0.05, "%.0f%%", v -> c.screenShake = (float) v));
		o.add(toggle("flashes", c.screenFlashes, v -> c.screenFlashes = v));
		o.add(toggle("cinematics", c.cinematics, v -> c.cinematics = v));
		o.add(toggle("auto_skip", c.autoSkipCinematics, v -> c.autoSkipCinematics = v));
		o.add(toggle("letterbox", c.letterbox, v -> c.letterbox = v));
		o.add(toggle("qte", c.quickTimeEvents, v -> c.quickTimeEvents = v));
		o.add(toggle("voice", c.voiceLines, v -> c.voiceLines = v));
		o.add(toggle("subtitles", c.subtitles, v -> c.subtitles = v));
		o.add(toggle("music", c.music, v -> c.music = v));
		o.add(toggle("skins", c.characterSkins, v -> c.characterSkins = v));
		o.add(toggle("six_eyes", c.sixEyesOutlines, v -> c.sixEyesOutlines = v));
		o.add(toggle("atmosphere", c.domainAtmosphere, v -> c.domainAtmosphere = v));
		o.add(toggle("callouts", c.callouts, v -> c.callouts = v));
		o.add(slider("hud_scale", c.hudScale, 0.5, 2, 0.05, "%.0f%%", v -> c.hudScale = (float) v));
		o.add(cycle("hud_layout", HudLayout.valueOf(c.hudLayout), HudLayout.values(),
				l -> Component.translatable("option.jjkshowdown.hud_layout." + l.name().toLowerCase()), v -> c.hudLayout = v.name()));
		o.add(toggle("double_tap", c.doubleTapDodge, v -> c.doubleTapDodge = v));
		return o;
	}

	private List<Opt> gameplayOptions() {
		JjkConfig c = common;
		List<Opt> o = new ArrayList<>();
		o.add(cycle("difficulty", c.difficultyPreset(), Difficulty.values(), d -> Component.translatable("option.jjkshowdown.difficulty." + d.name().toLowerCase()),
				v -> c.difficulty = v.name()));
		o.add(toggle("progression", !c.progressionUnlocked(), v -> c.progression.mode = v ? "PROGRESSIVE" : "UNLOCKED"));
		o.add(slider("xp", c.progression.xpMultiplier, 0, 10, 0.1, "x%.1f", v -> c.progression.xpMultiplier = (float) v));
		o.add(slider("damage", c.abilities.damageMultiplier, 0, 5, 0.05, "x%.2f", v -> c.abilities.damageMultiplier = (float) v));
		o.add(slider("cooldowns", c.abilities.cooldownMultiplier, 0, 3, 0.05, "x%.2f", v -> c.abilities.cooldownMultiplier = (float) v));
		o.add(slider("regen", c.energy.regenMultiplier, 0, 5, 0.05, "x%.2f", v -> c.energy.regenMultiplier = (float) v));
		o.add(slider("cost", c.energy.costMultiplier, 0, 3, 0.05, "x%.2f", v -> c.energy.costMultiplier = (float) v));
		o.add(slider("max_energy", c.energy.maxMultiplier, 0.25, 5, 0.05, "x%.2f", v -> c.energy.maxMultiplier = (float) v));
		o.add(slider("domain_strength", c.domains.strengthMultiplier, 0.1, 5, 0.05, "x%.2f", v -> c.domains.strengthMultiplier = (float) v));
		o.add(slider("domain_duration", c.domains.durationTicks / 20.0, 3, 120, 1, "%.0fs", v -> c.domains.durationTicks = (int) (v * 20)));
		o.add(slider("burnout", c.domains.burnoutTicks / 20.0, 0, 120, 1, "%.0fs", v -> c.domains.burnoutTicks = (int) (v * 20)));
		o.add(slider("void_radius", c.domains.unlimitedVoidRadius, 6, 40, 1, "%.0f", v -> c.domains.unlimitedVoidRadius = (int) v));
		o.add(slider("shrine_radius", c.domains.malevolentShrineRadius, 8, 64, 1, "%.0f", v -> c.domains.malevolentShrineRadius = (int) v));
		o.add(slider("sure_hit", c.domains.sureHitDamageMultiplier, 0, 5, 0.05, "x%.2f", v -> c.domains.sureHitDamageMultiplier = (float) v));
		o.add(toggle("transform", c.domains.transformTerrain, v -> c.domains.transformTerrain = v));
		o.add(toggle("clashes", c.domains.clashes, v -> c.domains.clashes = v));
		o.add(toggle("destruction", c.destruction.enabled, v -> c.destruction.enabled = v));
		o.add(toggle("restore", c.destruction.restoreTerrain, v -> c.destruction.restoreTerrain = v));
		o.add(slider("restore_delay", c.destruction.restoreDelayTicks / 20.0, 0, 600, 5, "%.0fs", v -> c.destruction.restoreDelayTicks = (int) (v * 20)));
		o.add(toggle("debris", c.destruction.flyingDebris, v -> c.destruction.flyingDebris = v));
		o.add(slider("aggression", c.ai.aggressionMultiplier, 0, 3, 0.05, "x%.2f", v -> c.ai.aggressionMultiplier = (float) v));
		o.add(slider("reaction", c.ai.reactionMultiplier, 0.25, 3, 0.05, "x%.2f", v -> c.ai.reactionMultiplier = (float) v));
		o.add(slider("boss_health", c.ai.bossHealthMultiplier, 0.1, 5, 0.05, "x%.2f", v -> c.ai.bossHealthMultiplier = (float) v));
		o.add(slider("boss_damage", c.ai.bossDamageMultiplier, 0, 5, 0.05, "x%.2f", v -> c.ai.bossDamageMultiplier = (float) v));
		o.add(toggle("boss_domains", c.ai.bossDomains, v -> c.ai.bossDomains = v));
		o.add(toggle("boss_ultimates", c.ai.bossUltimates, v -> c.ai.bossUltimates = v));
		o.add(toggle("phase_two", c.ai.bossPhaseTwo, v -> c.ai.bossPhaseTwo = v));
		o.add(toggle("server_qte", c.qte.enabled, v -> c.qte.enabled = v));
		o.add(slider("qte_timing", c.qte.timingMultiplier, 0.25, 3, 0.05, "x%.2f", v -> c.qte.timingMultiplier = (float) v));
		o.add(toggle("server_cinematics", c.cinematics.enabled, v -> c.cinematics.enabled = v));
		o.add(toggle("allow_skip", c.cinematics.allowSkip, v -> c.cinematics.allowSkip = v));
		o.add(toggle("freeze", c.cinematics.freezeParticipants, v -> c.cinematics.freezeParticipants = v));
		o.add(slider("parry_window", c.combat.parryWindowTicks, 0, 15, 1, "%.0f", v -> c.combat.parryWindowTicks = (int) v));
		o.add(slider("black_flash", c.combat.blackFlashWindowChance, 0, 1, 0.01, "%.0f%%", v -> c.combat.blackFlashWindowChance = (float) v));
		o.add(toggle("finishers", c.combat.finishers, v -> c.combat.finishers = v));
		o.add(toggle("double_jump", c.combat.doubleJump, v -> c.combat.doubleJump = v));
		return o;
	}

	@Override
	protected void init() {
		optionWidgets.clear();
		optionLabels.clear();
		List<Opt> opts = gameplayTab ? gameplayOptions() : clientOptions();
		int pages = Math.max(1, (opts.size() + PER_PAGE - 1) / PER_PAGE);
		page = Mth.clamp(page, 0, pages - 1);
		int colW = Math.min(180, width / 2 - 20);
		int x0 = width / 2 - colW - 5, x1 = width / 2 + 5;
		int y = 44;
		boolean editable = !gameplayTab || ClientState.canEditServerConfig;
		for (int i = page * PER_PAGE; i < Math.min(opts.size(), (page + 1) * PER_PAGE); i++) {
			int local = i - page * PER_PAGE;
			int x = local % 2 == 0 ? x0 : x1;
			int yy = y + (local / 2) * 24;
			AbstractWidget w = opts.get(i).factory().create(x, yy, colW);
			w.active = editable;
			optionWidgets.add(addRenderableWidget(w));
		}
		addRenderableWidget(Button.builder(Component.translatable("screen.jjkshowdown.tab_client"), b -> switchTab(false))
				.bounds(width / 2 - 155, 18, 150, 20).build()).active = gameplayTab;
		addRenderableWidget(Button.builder(Component.translatable("screen.jjkshowdown.tab_gameplay"), b -> switchTab(true))
				.bounds(width / 2 + 5, 18, 150, 20).build()).active = !gameplayTab;
		int by = height - 28;
		addRenderableWidget(Button.builder(Component.literal("<"), b -> {
			page--;
			rebuildWidgets();
		}).bounds(width / 2 - 155, by, 20, 20).build()).active = page > 0;
		addRenderableWidget(Button.builder(Component.literal(">"), b -> {
			page++;
			rebuildWidgets();
		}).bounds(width / 2 - 132, by, 20, 20).build()).active = page < pages - 1;
		addRenderableWidget(Button.builder(Component.translatable("gui.done"), b -> save()).bounds(width / 2 - 100, by, 98, 20).build());
		addRenderableWidget(Button.builder(Component.translatable("gui.cancel"), b -> onClose()).bounds(width / 2 + 2, by, 98, 20).build());
		addRenderableWidget(Button.builder(Component.translatable("screen.jjkshowdown.defaults"), b -> resetDefaults()).bounds(width / 2 + 104, by, 52, 20).build())
				.active = editable;
	}

	private void switchTab(boolean gameplay) {
		gameplayTab = gameplay;
		page = 0;
		rebuildWidgets();
	}

	private void resetDefaults() {
		if (gameplayTab) {
			JjkConfig d = new JjkConfig();
			d.validate();
			copyInto(d, common);
		} else {
			ClientConfig d = new ClientConfig();
			copyInto(d, client);
		}
		rebuildWidgets();
	}

	private static <T> void copyInto(T from, T to) {
		for (var f : from.getClass().getFields()) {
			if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
			try {
				f.set(to, f.get(from));
			} catch (IllegalAccessException ignored) {
			}
		}
	}

	private void save() {
		ClientConfig.apply(client);
		Minecraft mc = Minecraft.getInstance();
		if (mc.getConnection() != null) {
			ClientPlayNetworking.send(new Payloads.ClientSettings(client.quickTimeEvents, client.cinematics, client.autoSkipCinematics));
			if (ClientState.canEditServerConfig) {
				ClientPlayNetworking.send(new Payloads.ApplyConfig(new Gson().toJson(common)));
			}
		}
		onClose();
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
		g.drawCenteredString(font, title, width / 2, 5, 0xFFFFFFFF);
		if (gameplayTab && !ClientState.canEditServerConfig) {
			g.drawCenteredString(font, Component.translatable("screen.jjkshowdown.readonly"), width / 2, height - 42, 0xFFFF8080);
		}
		super.render(g, mouseX, mouseY, partial);
	}

	@Override
	public void onClose() {
		Minecraft.getInstance().setScreen(parent);
	}

	/** Slider with an arbitrary range and step. */
	private static final class Slider extends AbstractSliderButton {
		private final Component label;
		private final double min, max, step;
		private final String fmt;
		private final DoubleConsumer set;

		Slider(int x, int y, int w, Component label, double value, double min, double max, double step, String fmt, DoubleConsumer set) {
			super(x, y, w, 20, Component.empty(), (Mth.clamp(value, min, max) - min) / (max - min));
			this.label = label;
			this.min = min;
			this.max = max;
			this.step = step;
			this.fmt = fmt;
			this.set = set;
			updateMessage();
		}

		private double real() {
			double v = min + (max - min) * value;
			return Math.round(v / step) * step;
		}

		@Override
		protected void updateMessage() {
			double v = real();
			String shown = fmt.contains("%%") ? String.format(fmt, v * 100) : String.format(fmt, v);
			setMessage(Component.empty().append(label).append(": ").append(shown));
		}

		@Override
		protected void applyValue() {
			set.accept(real());
		}
	}
}
