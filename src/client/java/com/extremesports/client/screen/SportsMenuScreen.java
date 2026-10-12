package com.extremesports.client.screen;

import com.extremesports.client.ClientConfig;
import com.extremesports.client.ClientSportsState;
import com.extremesports.client.ExtremeSportsClient;
import com.extremesports.client.input.Keybinds;
import com.extremesports.network.Payloads;
import com.extremesports.registry.ModAttachments;
import com.extremesports.registry.ModSounds;
import com.extremesports.server.ChallengeManager;
import com.extremesports.server.PlayerSportData;
import com.extremesports.server.Unlocks;
import com.extremesports.sport.PhysicsPreset;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.util.Mth;
import org.jspecify.annotations.Nullable;

/**
 * Main menu (default key J): challenges, stats, unlocks, settings and a controls guide.
 */
public class SportsMenuScreen extends Screen {
	enum Tab {
		CHALLENGES("challenges"),
		STATS("stats"),
		UNLOCKS("unlocks"),
		SETTINGS("settings"),
		CONTROLS("controls");

		final String key;

		Tab(String key) {
			this.key = key;
		}
	}

	private static Tab lastTab = Tab.CHALLENGES;
	private final @Nullable Screen parent;
	private Tab tab = lastTab;
	private int scroll;
	private int contentTop;
	private int contentBottom;
	private final List<Line> lines = new ArrayList<>();

	private record Line(Component text, int color, int indent) {
	}

	public SportsMenuScreen(@Nullable Screen parent) {
		super(Component.translatable("screen.extremesports.menu"));
		this.parent = parent;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	private int panelLeft() {
		return Math.max(10, width / 2 - 170);
	}

	private int panelRight() {
		return Math.min(width - 10, width / 2 + 170);
	}

	@Override
	protected void init() {
		int left = panelLeft();
		int tabWidth = (panelRight() - left) / Tab.values().length;
		for (int i = 0; i < Tab.values().length; i++) {
			Tab t = Tab.values()[i];
			Button button = Button.builder(Component.translatable("screen.extremesports.tab." + t.key), b -> switchTab(t))
				.bounds(left + i * tabWidth, 24, tabWidth - 2, 20).build();
			button.active = t != tab;
			addRenderableWidget(button);
		}
		contentTop = 50;
		contentBottom = height - 30;
		addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.done"), b -> onClose())
			.bounds(width / 2 - 50, height - 26, 100, 20).build());
		lines.clear();
		switch (tab) {
			case CHALLENGES -> initChallenges();
			case STATS -> initStats();
			case UNLOCKS -> initUnlocks();
			case SETTINGS -> initSettings();
			case CONTROLS -> initControls();
		}
	}

	private void switchTab(Tab newTab) {
		tab = newTab;
		lastTab = newTab;
		scroll = 0;
		click();
		rebuildWidgets();
	}

	private void click() {
		minecraft.getSoundManager().play(SimpleSoundInstance.forUI(ModSounds.UI_CLICK, 1.0F, 0.6F));
	}

	private PlayerSportData data() {
		PlayerSportData data = minecraft.player == null ? null : minecraft.player.getAttached(ModAttachments.SPORT_DATA);
		return data == null ? new PlayerSportData() : data;
	}

	// ------------------------------------------------------------------ challenges

	private void initChallenges() {
		int left = panelLeft();
		int right = panelRight();
		int y = contentTop + 4;
		var active = ClientSportsState.challenge;
		boolean running = active.phase() != ChallengeManager.PHASE_NONE && !active.challenge().isEmpty();
		if (running) {
			addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.stop"), b -> {
				ClientPlayNetworking.send(new Payloads.ChallengeAction("stop", ""));
				click();
				onClose();
			}).bounds(right - 110, y, 110, 20).build());
		}
		y += 24;
		String[] ids = {"score_attack", "best_trick", "grind", "bmx", "practice"};
		PlayerSportData data = data();
		for (String id : ids) {
			int rowY = y - scroll;
			if (rowY > contentTop - 4 && rowY < contentBottom - 20) {
				Button start = Button.builder(Component.translatable("screen.extremesports.start"), b -> {
					ClientPlayNetworking.send(new Payloads.ChallengeAction("start", id));
					click();
					onClose();
				}).bounds(right - 60, rowY, 60, 20).build();
				addRenderableWidget(start);
			}
			y += 46;
		}
		int practiceY = y - scroll;
		if (practiceY > contentTop - 4 && practiceY < contentBottom - 20) {
			addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.practice_spot"), b -> {
				ClientPlayNetworking.send(new Payloads.ChallengeAction("practice_spot", ""));
				click();
			}).bounds(left, practiceY, (right - left) / 2 - 2, 20).build());
			addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.practice_return"), b -> {
				ClientPlayNetworking.send(new Payloads.ChallengeAction("practice_return", ""));
				click();
				onClose();
			}).bounds(left + (right - left) / 2 + 2, practiceY, (right - left) / 2 - 2, 20).build());
		}
	}

	private void renderChallenges(GuiGraphics graphics) {
		int left = panelLeft();
		int right = panelRight();
		int y = contentTop + 4;
		var active = ClientSportsState.challenge;
		if (active.phase() != ChallengeManager.PHASE_NONE && !active.challenge().isEmpty()) {
			graphics.drawString(font, Component.translatable("screen.extremesports.active",
				Component.translatable("challenge.extremesports." + active.challenge())), left, y + 6, 0xFFFFC94A, true);
		} else {
			graphics.drawString(font, Component.translatable("challenge.extremesports.freestyle").withStyle(ChatFormatting.GOLD), left, y, 0xFFFFFFFF, true);
			graphics.drawString(font, Component.translatable("challenge.extremesports.freestyle.desc"), left, y + 11, 0xFFAAAAAA, false);
		}
		y += 24;
		String[] ids = {"score_attack", "best_trick", "grind", "bmx", "practice"};
		PlayerSportData data = data();
		for (String id : ids) {
			int rowY = y - scroll;
			if (rowY > contentTop - 4 && rowY < contentBottom - 30) {
				graphics.drawString(font, Component.translatable("challenge.extremesports." + id).withStyle(ChatFormatting.WHITE), left, rowY, 0xFFFFFFFF, true);
				int medal = data.medal(id);
				Integer best = data.challengeBest.get(id);
				if (!id.equals("practice")) {
					String bestText = best == null ? "-" : id.equals("grind") ? String.format("%.1f", best / 10.0F) : String.format("%,d", best);
					MutableComponent info = Component.translatable("screen.extremesports.best", bestText).append("  ")
						.append(Component.translatable("medal.extremesports." + medal));
					graphics.drawString(font, info, left + 130, rowY, medalColor(medal), false);
				}
				List<net.minecraft.util.FormattedCharSequence> wrapped = font.split(Component.translatable("challenge.extremesports." + id + ".desc"), right - left - 66);
				for (int i = 0; i < Math.min(3, wrapped.size()); i++) {
					graphics.drawString(font, wrapped.get(i), left, rowY + 11 + i * 10, 0xFFAAAAAA, false);
				}
			}
			y += 46;
		}
		int raceY = y + 26 - scroll;
		if (raceY < contentBottom - 20) {
			graphics.drawString(font, Component.translatable("challenge.extremesports.time_trial").withStyle(ChatFormatting.WHITE), left, raceY, 0xFFFFFFFF, true);
			graphics.drawString(font, Component.translatable("challenge.extremesports.time_trial.desc"), left, raceY + 11, 0xFFAAAAAA, false);
			graphics.drawString(font, Component.translatable("challenge.extremesports.downhill.desc"), left, raceY + 21, 0xFFAAAAAA, false);
			int ry = raceY + 34;
			for (var entry : data.courseTimes.entrySet()) {
				if (ry > contentBottom - 10) {
					break;
				}
				String[] parts = entry.getKey().split(":");
				graphics.drawString(font, Component.literal(parts[0].replace("course", "Course ") + " · ")
					.append(Component.translatable("challenge.extremesports." + (parts.length > 1 ? parts[1] : "time_trial")))
					.append(": " + com.extremesports.client.hud.SportsHud.formatTime(entry.getValue())), left + 6, ry, 0xFF9EE7FF, false);
				ry += 10;
			}
		}
	}

	private static int medalColor(int medal) {
		return switch (medal) {
			case 1 -> 0xFFCD7F32;
			case 2 -> 0xFFD8D8D8;
			case 3 -> 0xFFFFD700;
			default -> 0xFF888888;
		};
	}

	// ------------------------------------------------------------------ stats

	private void initStats() {
		PlayerSportData data = data();
		addLine(Component.translatable("command.extremesports.stats_header"), 0xFFFFC94A, 0);
		stat("best_combo", String.format("%,d", data.bestCombo));
		stat("best_trick", String.format("%,d", data.bestTrick));
		stat("total_score", String.format("%,d", data.totalScore));
		stat("combos_landed", String.valueOf(data.combosLanded));
		stat("tricks_landed", String.valueOf(data.tricksLanded));
		stat("unique_tricks", String.valueOf(data.landedTricks.size()));
		stat("perfect_landings", String.valueOf(data.perfectLandings));
		stat("longest_grind", String.format("%.1f", data.longestGrind));
		stat("longest_manual", String.format("%.1f s", data.longestManual / 20.0F));
		stat("biggest_spin", data.biggestSpin + "°");
		stat("distance", String.format("%,.0f m", data.distance));
		stat("bails", String.valueOf(data.bails));
		addLine(Component.empty(), 0, 0);
		addLine(Component.translatable("hud.extremesports.session", String.format("%,d", ClientSportsState.sessionScore)), 0xFF9EE7FF, 0);
	}

	private void stat(String key, String value) {
		addLine(Component.translatable("stats.extremesports." + key).append(": ").append(Component.literal(value).withStyle(ChatFormatting.AQUA)), 0xFFDDDDDD, 8);
	}

	private void addLine(Component text, int color, int indent) {
		lines.add(new Line(text, color, indent));
	}

	// ------------------------------------------------------------------ unlocks

	private void initUnlocks() {
		PlayerSportData data = data();
		boolean creative = minecraft.player != null && minecraft.player.isCreative();
		int unlocked = 0;
		for (Unlocks.Unlock unlock : Unlocks.all().values()) {
			if (Unlocks.isUnlocked(data, unlock.id(), creative)) {
				unlocked++;
			}
		}
		addLine(Component.translatable("screen.extremesports.unlocks_progress", unlocked, Unlocks.all().size()), 0xFFFFC94A, 0);
		for (Unlocks.Unlock unlock : Unlocks.all().values()) {
			boolean has = Unlocks.isUnlocked(data, unlock.id(), creative);
			MutableComponent name = Component.translatable("unlock.extremesports." + unlock.id());
			Component requirement = requirement(unlock);
			if (has) {
				addLine(Component.literal("✔ ").append(name).append(Component.literal("  ").append(requirement).withStyle(ChatFormatting.DARK_GRAY)), 0xFF5CFF7A, 4);
			} else {
				addLine(Component.literal("✘ ").append(name).append(Component.literal("  ").append(requirement).withStyle(ChatFormatting.GRAY)), 0xFFBBBBBB, 4);
			}
		}
	}

	public static Component requirement(Unlocks.Unlock unlock) {
		Object arg = unlock.requirementArg();
		if (arg instanceof String challenge) {
			return Component.translatable(unlock.requirementKey(), Component.translatable("challenge.extremesports." + challenge));
		}
		return Component.translatable(unlock.requirementKey(), String.format("%,d", (Integer) arg));
	}

	// ------------------------------------------------------------------ settings

	private Component onOff(boolean value) {
		return Component.translatable(value ? "screen.extremesports.on" : "screen.extremesports.off");
	}

	private void toggle(int column, int row, Supplier<Component> label, Runnable action) {
		int left = panelLeft();
		int columnWidth = (panelRight() - left) / 2 - 2;
		int x = left + column * (columnWidth + 4);
		int y = contentTop + 2 + row * 23;
		Button button = Button.builder(label.get(), b -> {
			action.run();
			saveSettings();
			click();
			b.setMessage(label.get());
		}).bounds(x, y, columnWidth, 20).build();
		addRenderableWidget(button);
	}

	private void slider(int column, int row, String key, double min, double max, double value, java.util.function.DoubleConsumer setter, boolean percent) {
		int left = panelLeft();
		int columnWidth = (panelRight() - left) / 2 - 2;
		int x = left + column * (columnWidth + 4);
		int y = contentTop + 2 + row * 23;
		addRenderableWidget(new ValueSlider(x, y, columnWidth, 20, min, max, value,
			v -> Component.translatable("screen.extremesports." + key).append(": " + (percent ? Math.round(v * 100) + "%" : String.format("%.2fx", v))),
			v -> {
				setter.accept(v);
				saveSettings();
			}));
	}

	private void saveSettings() {
		ClientConfig.save();
		ExtremeSportsClient.applyConfig();
		ExtremeSportsClient.sendSettings();
	}

	private void initSettings() {
		ClientConfig c = ClientConfig.get();
		toggle(0, 0, () -> Component.translatable("screen.extremesports.preset", Component.translatable(c.physicsPreset().translationKey())),
			() -> c.preset = c.physicsPreset().next().id());
		toggle(1, 0, () -> Component.translatable("screen.extremesports.stance",
			Component.translatable(c.goofy ? "screen.extremesports.stance.goofy" : "screen.extremesports.stance.regular")), () -> c.goofy = !c.goofy);
		toggle(0, 1, () -> Component.translatable("screen.extremesports.steering",
			Component.translatable(c.steering == ClientConfig.SteeringMode.KEYBOARD ? "screen.extremesports.steering.keyboard" : "screen.extremesports.steering.mouse")),
			() -> c.steering = c.steering == ClientConfig.SteeringMode.KEYBOARD ? ClientConfig.SteeringMode.MOUSE : ClientConfig.SteeringMode.KEYBOARD);
		toggle(1, 1, () -> Component.translatable("screen.extremesports.auto_pickup", onOff(c.autoPickup)), () -> c.autoPickup = !c.autoPickup);
		toggle(0, 2, () -> Component.translatable("screen.extremesports.third_person", onOff(c.autoThirdPerson)), () -> c.autoThirdPerson = !c.autoThirdPerson);
		toggle(1, 2, () -> Component.translatable("screen.extremesports.reduced_motion", onOff(c.reducedMotion)), () -> c.reducedMotion = !c.reducedMotion);
		slider(0, 3, "camera_shake", 0.0, 1.5, c.cameraShake, v -> c.cameraShake = (float) v, true);
		slider(1, 3, "camera_bob", 0.0, 1.5, c.cameraBob, v -> c.cameraBob = (float) v, true);
		slider(0, 4, "fov", 0.0, 1.5, c.fovEffect, v -> c.fovEffect = (float) v, true);
		slider(1, 4, "roll_volume", 0.0, 1.5, c.rollVolume, v -> c.rollVolume = (float) v, true);
		toggle(0, 5, () -> Component.translatable("screen.extremesports.hud", onOff(c.hudEnabled)), () -> c.hudEnabled = !c.hudEnabled);
		slider(1, 5, "hud_scale", 0.6, 1.6, c.hudScale, v -> c.hudScale = (float) v, false);
		toggle(0, 6, () -> Component.translatable("screen.extremesports.units", Component.translatable("screen.extremesports.units." + c.speedUnit.name().toLowerCase(java.util.Locale.ROOT))),
			() -> c.speedUnit = ClientConfig.SpeedUnit.values()[(c.speedUnit.ordinal() + 1) % ClientConfig.SpeedUnit.values().length]);
		toggle(1, 6, () -> Component.translatable("screen.extremesports.tips", onOff(c.showTips)), () -> c.showTips = !c.showTips);
	}

	private void renderSettings(GuiGraphics graphics) {
		PhysicsPreset preset = ClientConfig.get().physicsPreset();
		int y = contentTop + 2 + 7 * 23 + 4;
		for (var line : font.split(Component.translatable(preset.translationKey() + ".desc"), panelRight() - panelLeft())) {
			graphics.drawString(font, line, panelLeft(), y, 0xFFAAAAAA, false);
			y += 10;
		}
	}

	// ------------------------------------------------------------------ controls

	private void initControls() {
		addLine(Component.translatable("screen.extremesports.controls.title"), 0xFFFFC94A, 0);
		for (int i = 0; i < 9; i++) {
			addLine(Component.translatable("screen.extremesports.controls." + i), 0xFFDDDDDD, 6);
		}
		addLine(Component.empty(), 0, 0);
		KeyMapping[] keys = {Keybinds.FLIP, Keybinds.WHIP, Keybinds.GRAB, Keybinds.GRIND, Keybinds.MENU, Keybinds.REMOUNT, Keybinds.PRACTICE_RESET};
		for (KeyMapping key : keys) {
			addLine(Component.translatable(key.getName()).append(": ").append(key.getTranslatedKeyMessage().copy().withStyle(ChatFormatting.AQUA)), 0xFFBBBBBB, 6);
		}
	}

	// ------------------------------------------------------------------ rendering

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		graphics.fill(panelLeft() - 6, 18, panelRight() + 6, height - 32, 0xA0101014);
		graphics.drawCenteredString(font, title, width / 2, 6, 0xFFFFC94A);
		graphics.enableScissor(panelLeft() - 6, contentTop - 2, panelRight() + 6, contentBottom);
		switch (tab) {
			case CHALLENGES -> renderChallenges(graphics);
			case SETTINGS -> renderSettings(graphics);
			default -> {
				int y = contentTop + 4 - scroll;
				for (Line line : lines) {
					if (y > contentTop - 12 && y < contentBottom) {
						graphics.drawString(font, line.text(), panelLeft() + line.indent(), y, line.color() == 0 ? 0xFFFFFFFF : line.color(), true);
					}
					y += 12;
				}
			}
		}
		graphics.disableScissor();
		super.render(graphics, mouseX, mouseY, partialTick);
	}

	@Override
	public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
		int contentHeight = switch (tab) {
			case CHALLENGES -> 24 + 5 * 46 + 80 + data().courseTimes.size() * 10;
			case SETTINGS -> 0;
			default -> lines.size() * 12;
		};
		int max = Math.max(0, contentHeight - (contentBottom - contentTop) + 10);
		int newScroll = Mth.clamp(scroll - (int) (scrollY * 16), 0, max);
		if (newScroll != scroll) {
			scroll = newScroll;
			if (tab == Tab.CHALLENGES) {
				rebuildWidgets();
			}
		}
		return true;
	}

	@Override
	public void onClose() {
		minecraft.setScreen(parent);
	}
}
