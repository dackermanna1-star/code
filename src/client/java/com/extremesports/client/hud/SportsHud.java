package com.extremesports.client.hud;

import com.extremesports.client.ClientConfig;
import com.extremesports.client.ClientSportsState;
import com.extremesports.client.TrickNames;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.RideController;
import com.extremesports.server.ChallengeManager;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.LandingQuality;
import java.util.List;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/** The riding HUD. Everything fades in and out so it never feels noisy. */
public final class SportsHud {
	private static final int WHITE = 0xFFFFFFFF;
	private static final int GOLD = 0xFFFFC94A;
	private static final int GREY = 0xFFB8B8B8;

	private SportsHud() {
	}

	public static void render(GuiGraphics graphics, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		ClientConfig config = ClientConfig.get();
		if (mc.player == null || mc.level == null || !config.hudEnabled || mc.options.hideGui) {
			return;
		}
		float partial = delta.getGameTimeDeltaPartialTick(false);
		long now = mc.level.getGameTime();
		float scale = Mth.clamp(config.hudScale, 0.5F, 2.0F);
		int width = Mth.ceil(graphics.guiWidth() / scale);
		int height = Mth.ceil(graphics.guiHeight() / scale);
		graphics.pose().pushMatrix();
		graphics.pose().scale(scale, scale);
		Font font = mc.font;
		SportEquipmentEntity riding = mc.player.getVehicle() instanceof SportEquipmentEntity entity ? entity : null;
		if (riding != null) {
			speedPanel(graphics, font, riding, config);
			balanceMeter(graphics, font, riding, width, height);
		}
		combo(graphics, font, width, height, now, partial);
		landing(graphics, font, width, height, now, partial);
		challenge(graphics, font, width, now);
		tip(graphics, font, width, height, now);
		toasts(graphics, font, width, now);
		graphics.pose().popMatrix();
	}

	private static int alpha(int rgb, float alpha) {
		int a = Mth.clamp((int) (alpha * 255.0F), 4, 255);
		return a << 24 | rgb & 0xFFFFFF;
	}

	private static void panel(GuiGraphics graphics, int x0, int y0, int x1, int y1, float alpha) {
		graphics.fill(x0, y0, x1, y1, alpha(0x101014, 0.55F * alpha));
	}

	// ------------------------------------------------------------------ speed

	private static void speedPanel(GuiGraphics graphics, Font font, SportEquipmentEntity entity, ClientConfig config) {
		float speed = entity.ride.speed;
		String unit;
		float value;
		switch (config.speedUnit) {
			case MPH -> {
				value = speed * 20.0F * 2.23694F;
				unit = "mph";
			}
			case BLOCKS -> {
				value = speed * 20.0F;
				unit = "b/s";
			}
			default -> {
				value = speed * 20.0F * 3.6F;
				unit = "km/h";
			}
		}
		panel(graphics, 4, 4, 92, 38, 1.0F);
		graphics.pose().pushMatrix();
		graphics.pose().translate(8, 8);
		graphics.pose().scale(1.6F, 1.6F);
		graphics.drawString(font, String.format("%.0f", value), 0, 0, WHITE, true);
		graphics.pose().popMatrix();
		graphics.drawString(font, unit, 46, 13, GREY, true);
		Component sport = Component.translatable(entity.kind().translationKey());
		Component preset = Component.translatable(entity.preset().translationKey());
		graphics.drawString(font, Component.empty().append(sport).append(" · ").append(preset), 8, 26, GREY, false);
		if (ClientSportsState.sessionScore > 0) {
			panel(graphics, 4, 40, 92, 52, 1.0F);
			graphics.drawString(font, Component.translatable("hud.extremesports.session", String.format("%,d", ClientSportsState.sessionScore)), 8, 42, GOLD, false);
		}
	}

	// ------------------------------------------------------------------ balance

	private static void balanceMeter(GuiGraphics graphics, Font font, SportEquipmentEntity entity, int width, int height) {
		RideController ride = entity.ride;
		float balance;
		Component label;
		if (ride.grind != null) {
			balance = ride.grind.balance;
			label = Component.translatable("hud.extremesports.balance_grind");
		} else if (ride.manual != null) {
			balance = ride.manualBalance;
			label = Component.translatable("hud.extremesports.balance_manual");
		} else {
			return;
		}
		int cx = width / 2;
		int y = height / 2 + 22;
		int half = 50;
		panel(graphics, cx - half - 4, y - 12, cx + half + 4, y + 8, 1.0F);
		graphics.drawCenteredString(font, label, cx, y - 10, GREY);
		graphics.fill(cx - half, y, cx + half, y + 4, 0xFF333338);
		graphics.fill(cx - half / 3, y, cx + half / 3, y + 4, 0xFF2E6B3A);
		int needle = cx + Math.round(Mth.clamp(balance, -1.0F, 1.0F) * half);
		float danger = Math.abs(balance);
		int color = danger < 0.4F ? 0xFF5CFF7A : danger < 0.75F ? 0xFFFFD24A : 0xFFFF4A4A;
		graphics.fill(needle - 1, y - 2, needle + 2, y + 6, color);
		graphics.fill(cx, y - 1, cx + 1, y + 5, 0xFFFFFFFF);
	}

	// ------------------------------------------------------------------ combo

	private static void combo(GuiGraphics graphics, Font font, int width, int height, long now, float partial) {
		int baseY = height - 78;
		List<ComboEntry> live = ClientSportsState.combo;
		if (!live.isEmpty()) {
			drawCombo(graphics, font, width, baseY, live, ClientSportsState.comboPrediction.basePoints(),
				ClientSportsState.comboPrediction.multiplier(), WHITE, 1.0F);
		} else if (now - ClientSportsState.finishedTime < 60 && !ClientSportsState.finishedCombo.isEmpty()) {
			float age = now - ClientSportsState.finishedTime + partial;
			float alpha = age < 45 ? 1.0F : 1.0F - (age - 45) / 15.0F;
			if (ClientSportsState.finishedLanded) {
				drawCombo(graphics, font, width, baseY, ClientSportsState.finishedCombo, -1, ClientSportsState.finishedMultiplier, GREY, alpha);
				String total = "+" + String.format("%,d", ClientSportsState.finishedScore);
				graphics.pose().pushMatrix();
				graphics.pose().translate(width / 2.0F, baseY + 14.0F);
				float pop = 1.0F + Math.max(0.0F, 0.6F - age / 10.0F);
				graphics.pose().scale(1.5F * pop, 1.5F * pop);
				graphics.drawCenteredString(font, total, 0, 0, alpha(0xFFC94A, alpha));
				graphics.pose().popMatrix();
			} else {
				graphics.drawCenteredString(font, Component.translatable("hud.extremesports.combo_lost"), width / 2, baseY + 14, alpha(0xFF4A4A, alpha));
			}
		}
		// Current trick label pops briefly above the combo
		if (ClientSportsState.trickLabel != null && now - ClientSportsState.trickTime < 25) {
			float age = now - ClientSportsState.trickTime + partial;
			float alpha = age < 18 ? 1.0F : 1.0F - (age - 18) / 7.0F;
			graphics.drawCenteredString(font, ClientSportsState.trickLabel, width / 2, baseY - 26, alpha(0x9EE7FF, alpha));
		}
	}

	private static void drawCombo(GuiGraphics graphics, Font font, int width, int y, List<ComboEntry> entries, int base, int multiplier,
								  int color, float alpha) {
		int start = Math.max(0, entries.size() - 3);
		Component line = Component.empty();
		if (start > 0) {
			line = Component.literal("… ");
		}
		for (int i = start; i < entries.size(); i++) {
			if (i > start) {
				line = Component.empty().append(line).append(" » ");
			}
			line = Component.empty().append(line).append(TrickNames.entry(entries.get(i)));
		}
		int textWidth = font.width(line);
		panel(graphics, width / 2 - textWidth / 2 - 6, y - 14, width / 2 + textWidth / 2 + 6, y + 10, alpha);
		graphics.drawCenteredString(font, line, width / 2, y - 11, alpha(color, alpha));
		if (base >= 0) {
			String score = String.format("%,d  ×%d", base, multiplier);
			graphics.drawCenteredString(font, score, width / 2, y, alpha(0xFFC94A, alpha));
		} else {
			graphics.drawCenteredString(font, "×" + multiplier, width / 2, y, alpha(0xFFC94A, alpha));
		}
	}

	// ------------------------------------------------------------------ landing quality

	private static void landing(GuiGraphics graphics, Font font, int width, int height, long now, float partial) {
		float age = now - ClientSportsState.landingTime + partial;
		if (age > 28) {
			return;
		}
		LandingQuality quality = ClientSportsState.landing;
		float alpha = age < 20 ? 1.0F : 1.0F - (age - 20) / 8.0F;
		float pop = 1.0F + Math.max(0.0F, 0.5F - age / 8.0F);
		graphics.pose().pushMatrix();
		graphics.pose().translate(width / 2.0F, height / 2.0F - 44.0F);
		graphics.pose().scale(2.0F * pop, 2.0F * pop);
		graphics.drawCenteredString(font, Component.translatable(quality.translationKey()), 0, 0, alpha(quality.color, alpha));
		graphics.pose().popMatrix();
		if (quality == LandingQuality.BAIL && ClientSportsState.bail != null) {
			graphics.drawCenteredString(font, Component.translatable(ClientSportsState.bail.translationKey()), width / 2, height / 2 - 26,
				alpha(0xFFB0B0, alpha));
		}
	}

	// ------------------------------------------------------------------ challenge

	private static void challenge(GuiGraphics graphics, Font font, int width, long now) {
		var state = ClientSportsState.challenge;
		if (state.phase() == ChallengeManager.PHASE_NONE || state.challenge().isEmpty()) {
			return;
		}
		int cx = width / 2;
		Component name = Component.translatable("challenge.extremesports." + state.challenge());
		panel(graphics, cx - 90, 4, cx + 90, 44, 1.0F);
		graphics.drawCenteredString(font, name, cx, 8, GOLD);
		switch (state.phase()) {
			case ChallengeManager.PHASE_COUNTDOWN -> {
				int seconds = Mth.ceil(state.ticks() / 20.0F);
				graphics.pose().pushMatrix();
				graphics.pose().translate(cx, 20);
				graphics.pose().scale(2.0F, 2.0F);
				graphics.drawCenteredString(font, String.valueOf(Math.max(1, seconds)), 0, 0, WHITE);
				graphics.pose().popMatrix();
			}
			case ChallengeManager.PHASE_RUNNING -> {
				String time = formatTime(state.ticks());
				boolean race = state.challenge().equals("time_trial") || state.challenge().equals("downhill");
				if (state.challenge().equals("practice")) {
					graphics.drawCenteredString(font, Component.translatable("hud.extremesports.practice_hint"), cx, 20, GREY);
					graphics.drawCenteredString(font, Component.translatable("hud.extremesports.practice_hint2"), cx, 31, GREY);
				} else if (race) {
					graphics.drawCenteredString(font, time, cx, 20, WHITE);
					String checkpoint = detail(state.detail(), "checkpoint");
					graphics.drawCenteredString(font, Component.translatable("hud.extremesports.checkpoints", checkpoint, state.target()), cx, 31, GREY);
				} else {
					graphics.drawCenteredString(font, time, cx, 20, state.ticks() < 200 ? 0xFFFF6A6A : WHITE);
					graphics.drawCenteredString(font, progressText(state), cx, 31, GREY);
				}
			}
			case ChallengeManager.PHASE_FINISHED -> {
				boolean race = state.challenge().equals("time_trial") || state.challenge().equals("downhill");
				if (race) {
					graphics.drawCenteredString(font, Component.translatable("hud.extremesports.finished_time", formatTime(state.progress())), cx, 20, WHITE);
					String best = detail(state.detail(), "best");
					graphics.drawCenteredString(font, state.medal() > 0 ? Component.translatable("hud.extremesports.new_record")
						: Component.translatable("hud.extremesports.best_time", best.isEmpty() || best.equals("-1") ? "-" : formatTime(Integer.parseInt(best))), cx, 31, GOLD);
				} else {
					graphics.drawCenteredString(font, progressText(state), cx, 20, WHITE);
					graphics.drawCenteredString(font, Component.translatable("medal.extremesports." + state.medal()), cx, 31, medalColor(state.medal()));
				}
			}
			default -> {
			}
		}
		if (state.challenge().equals("bmx")) {
			int y = 48;
			for (String part : state.detail().split(",")) {
				if (part.isEmpty()) {
					continue;
				}
				String[] kv = part.split(":");
				boolean done = kv.length > 1 && kv[1].equals("1");
				graphics.drawString(font, (done ? "✔ " : "✘ ") + Component.translatable("objective.extremesports." + kv[0]).getString(), cx - 85, y,
					done ? 0xFF5CFF7A : 0xFFDDDDDD, true);
				y += 10;
			}
		}
	}

	private static Component progressText(com.extremesports.network.Payloads.ChallengeState state) {
		return switch (state.challenge()) {
			case "grind" -> Component.translatable("hud.extremesports.progress_grind", String.format("%.1f", state.progress() / 10.0F),
				String.format("%.0f", state.target() / 10.0F));
			case "bmx" -> Component.translatable("hud.extremesports.progress_bmx", state.progress(), state.target());
			default -> Component.translatable("hud.extremesports.progress_score", String.format("%,d", state.progress()), String.format("%,d", state.target()));
		};
	}

	private static int medalColor(int medal) {
		return switch (medal) {
			case 1 -> 0xFFCD7F32;
			case 2 -> 0xFFD8D8D8;
			case 3 -> 0xFFFFD700;
			default -> 0xFFAAAAAA;
		};
	}

	static String detail(String detail, String key) {
		for (String part : detail.split(",")) {
			String[] kv = part.split(":");
			if (kv.length == 2 && kv[0].equals(key)) {
				return kv[1];
			}
		}
		return "";
	}

	public static String formatTime(int ticks) {
		int totalMillis = ticks * 50;
		int minutes = totalMillis / 60000;
		int seconds = totalMillis / 1000 % 60;
		int hundredths = totalMillis / 10 % 100;
		return String.format("%d:%02d.%02d", minutes, seconds, hundredths);
	}

	// ------------------------------------------------------------------ tips and toasts

	private static void tip(GuiGraphics graphics, Font font, int width, int height, long now) {
		if (ClientSportsState.tip == null || now - ClientSportsState.tipTime > 90) {
			return;
		}
		float age = now - ClientSportsState.tipTime;
		float alpha = age < 75 ? 1.0F : 1.0F - (age - 75) / 15.0F;
		int textWidth = Math.min(width - 20, font.width(ClientSportsState.tip));
		int y = height / 2 + 44;
		panel(graphics, width / 2 - textWidth / 2 - 6, y - 4, width / 2 + textWidth / 2 + 6, y + 12, alpha);
		graphics.drawCenteredString(font, ClientSportsState.tip, width / 2, y, alpha(0xFFE9A0, alpha));
	}

	private static void toasts(GuiGraphics graphics, Font font, int width, long now) {
		Component toast = ClientSportsState.toasts.peekFirst();
		if (toast == null) {
			return;
		}
		if (ClientSportsState.toastTime < 0 || now < ClientSportsState.toastTime) {
			ClientSportsState.toastTime = now;
		}
		float age = now - ClientSportsState.toastTime;
		if (age > 80) {
			ClientSportsState.toasts.pollFirst();
			ClientSportsState.toastTime = now;
			return;
		}
		float slide = Math.min(1.0F, age / 6.0F) * (age > 70 ? 1.0F - (age - 70) / 10.0F : 1.0F);
		int textWidth = font.width(toast);
		int x = width - (int) ((textWidth + 16) * slide);
		panel(graphics, x, 60, x + textWidth + 12, 82, 1.0F);
		graphics.drawString(font, Component.translatable("hud.extremesports.unlocked"), x + 6, 63, GOLD, false);
		graphics.drawString(font, toast, x + 6, 72, WHITE, false);
	}
}
