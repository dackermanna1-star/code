package com.jjkshowdown.client.hud;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.ability.Abilities;
import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.cinematic.CameraDirector;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.input.Keybinds;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

/** The sorcerer HUD: cursed energy, mastery, techniques, status, combo counter, Black Flash timing, callouts. */
public final class JjkHud {
	private static final Identifier LOCKED = JjkShowdown.id("textures/gui/icons/locked.png");
	private static final AbilitySlot[] ORDER = {AbilitySlot.PRIMARY, AbilitySlot.SECONDARY, AbilitySlot.TERTIARY, AbilitySlot.ULTIMATE,
			AbilitySlot.TOGGLE, AbilitySlot.DOMAIN, AbilitySlot.HEAL};
	private static float shownEnergy = -1;
	private static final int SLOT = 20;
	private static final int SLOT_GAP = 3;
	private static final int PANEL_W = 7 * SLOT + 6 * SLOT_GAP;
	/** Height from the panel origin to the bottom of the technique row. */
	private static final int PANEL_H = 44;

	private JjkHud() {
	}

	public static int alpha(float a) {
		return Mth.clamp((int) (a * 255), 0, 255);
	}

	public static int argb(float a, int rgb) {
		return (alpha(a) << 24) | (rgb & 0xFFFFFF);
	}

	public static void render(GuiGraphics g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.options.hideGui || CameraDirector.isActive()) return;
		Payloads.SorcererSync s = ClientState.self;
		if (s == null) return;
		CharacterType c = CharacterType.byOrdinal(s.character());
		if (!c.isSorcerer()) return;
		float partial = delta.getGameTimeDeltaPartialTick(false);
		ClientConfig cfg = ClientConfig.get();
		float scale = cfg.hudScale;
		int sw = g.guiWidth(), sh = g.guiHeight();

		g.pose().pushMatrix();
		int panelW = PANEL_W;
		float vw = sw / scale, vh = sh / scale;
		float baseX, baseY;
		switch (cfg.hudLayout) {
			case "LEFT", "RIGHT" -> {
				baseX = cfg.hudLayout.equals("LEFT") ? 6 : vw - panelW - 6;
				baseY = vh - PANEL_H;
				// the vanilla hotbar sits bottom-centre: rise above its status rows when we would overlap it
				float hotbarL = (sw / 2f - 95) / scale, hotbarR = (sw / 2f + 95) / scale;
				boolean overlaps = cfg.hudLayout.equals("LEFT") ? baseX + panelW > hotbarL : baseX < hotbarR;
				if (overlaps) baseY -= 66;
			}
			default -> {
				// centred action bar stacked above the hearts / armour rows (two heart rows for sorcerers)
				baseX = vw / 2f - panelW / 2f;
				baseY = (sh - 64) / scale - PANEL_H + 2;
			}
		}
		g.pose().scale(scale, scale);
		g.pose().translate(baseX, baseY);
		renderPanel(g, mc.font, s, c, panelW, partial);
		g.pose().popMatrix();

		renderCombo(g, mc.font, sw, sh, partial);
	}

	private static void renderPanel(GuiGraphics g, Font font, Payloads.SorcererSync s, CharacterType c, int w, float partial) {
		int col = c.energyColor;
		// backdrop
		g.fillGradient(-4, -4, w + 4, PANEL_H + 2, 0x70000000, 0xB0000000);
		g.fill(-4, -4, w + 4, -3, argb(0.9f, col));
		// emblem + name
		Identifier emblem = JjkShowdown.id("textures/gui/emblem_" + c.id() + ".png");
		g.pose().pushMatrix();
		g.pose().translate(0, -2);
		g.pose().scale(10 / 32f, 10 / 32f);
		g.blit(RenderPipelines.GUI_TEXTURED, emblem, 0, 0, 0, 0, 32, 32, 32, 32, 32, 32);
		g.pose().popMatrix();
		g.drawString(font, c.displayName(), 12, -1, 0xFFFFFFFF, true);
		Component lvl = Component.translatable("hud.jjkshowdown.mastery", s.mastery());
		g.drawString(font, lvl, w - font.width(lvl) - 2, -1, argb(1f, c.accentColor), true);
		if (c == CharacterType.SUKUNA && s.fingers() > 0) {
			Component fingers = Component.translatable("hud.jjkshowdown.fingers", s.fingers());
			g.drawString(font, fingers, w - font.width(lvl) - font.width(fingers) - 8, -1, 0xFFE07070, true);
		}
		// cursed energy bar
		float target = s.maxEnergy() <= 0 ? 0 : s.energy() / s.maxEnergy();
		if (shownEnergy < 0) shownEnergy = target;
		shownEnergy = Mth.lerp(0.25f, shownEnergy, target);
		int bx = 0, by = 10, bw = w, bh = 6;
		g.fill(bx - 1, by - 1, bx + bw + 1, by + bh + 1, 0xFF0A0A12);
		g.fill(bx, by, bx + bw, by + bh, 0xFF1C1C28);
		int fillW = (int) (bw * Mth.clamp(shownEnergy, 0, 1));
		int dark = ARGB.color(255, (col >> 16 & 0xFF) / 3, (col >> 8 & 0xFF) / 3, (col & 0xFF) / 3);
		g.fillGradient(bx, by, bx + fillW, by + bh, argb(1f, c.accentColor), argb(1f, dark));
		g.fill(bx, by, bx + fillW, by + 1, 0x80FFFFFF);
		// shimmer sweep
		long t = Minecraft.getInstance().level == null ? 0 : Minecraft.getInstance().level.getGameTime();
		int sweep = (int) ((t % 60 + partial) / 60f * (bw + 30)) - 15;
		if (sweep > 0 && sweep < fillW) g.fill(Math.max(bx, sweep - 3), by, Math.min(bx + fillW, sweep + 3), by + bh, 0x40FFFFFF);
		String ce = Math.round(s.energy()) + " / " + Math.round(s.maxEnergy());
		g.pose().pushMatrix();
		g.pose().translate(bx + 2, by + 0.5f);
		g.pose().scale(0.75f, 0.75f);
		g.drawString(font, Component.translatable("hud.jjkshowdown.ce").getString() + " " + ce, 0, 0, 0xFFFFFFFF, true);
		g.pose().popMatrix();
		// mastery XP
		int xpY = by + bh + 2;
		g.fill(bx, xpY, bx + bw, xpY + 2, 0xFF101018);
		if (s.xpNext() > 0) g.fill(bx, xpY, bx + (int) (bw * Mth.clamp(s.xp() / s.xpNext(), 0, 1)), xpY + 2, 0xFFE8C860);
		else g.fill(bx, xpY, bx + bw, xpY + 2, 0xFFFFD700);

		// abilities
		int iy = xpY + 4;
		for (int i = 0; i < ORDER.length; i++) {
			renderSlot(g, font, s, c, ORDER[i], i * (SLOT + SLOT_GAP), iy, t, partial);
		}
		// status line (above the panel)
		int sy = -15;
		StringBuilder status = new StringBuilder();
		int statusColor = 0xFFFFFFFF;
		if (s.burnout() > 0) {
			status.append(Component.translatable("hud.jjkshowdown.burnout", (s.burnout() + 19) / 20).getString());
			statusColor = 0xFFFF5050;
		} else if ((s.flags() & Payloads.SorcererSync.F_OVERLOADED) != 0) {
			status.append(Component.translatable("hud.jjkshowdown.overloaded").getString());
			statusColor = 0xFFB0F0FF;
		} else if (s.stagger() > 0) {
			status.append(Component.translatable("hud.jjkshowdown.staggered").getString());
			statusColor = 0xFFFFA040;
		} else if (s.zoneTicks() > 0) {
			status.append(Component.translatable("hud.jjkshowdown.zone").getString());
			statusColor = 0xFFFF3040;
		} else if (s.counterTicks() > 0) {
			status.append(Component.translatable("hud.jjkshowdown.counter_ready").getString());
			statusColor = 0xFFFFD040;
		}
		if (!status.isEmpty()) {
			float pulse = 0.7f + 0.3f * Mth.sin((t + partial) * 0.4f);
			g.drawString(font, status.toString(), 0, sy, argb(pulse, statusColor), true);
		}
	}

	private static void renderSlot(GuiGraphics g, Font font, Payloads.SorcererSync s, CharacterType c, AbilitySlot slot, int x, int y, long t, float partial) {
		Ability a = Abilities.get(c, slot);
		if (a == null) return;
		boolean unlocked = ClientState.unlocked(slot);
		int size = SLOT;
		boolean toggledOn = (slot == AbilitySlot.TOGGLE && ((s.flags() & (Payloads.SorcererSync.F_INFINITY | Payloads.SorcererSync.F_AMPLIFICATION)) != 0))
				|| (slot == AbilitySlot.HEAL && (s.flags() & Payloads.SorcererSync.F_RCT) != 0);
		boolean charging = s.chargeSlot() == slot.ordinal();
		int border = toggledOn ? argb(0.6f + 0.4f * Mth.sin((t + partial) * 0.3f), c.accentColor) : charging ? 0xFFFFFFFF : 0xFF3A3A4A;
		g.fill(x - 1, y - 1, x + size + 1, y + size + 1, border);
		g.fill(x, y, x + size, y + size, 0xFF101018);
		g.pose().pushMatrix();
		g.pose().translate(x + 1, y + 1);
		g.pose().scale((size - 2) / 32f, (size - 2) / 32f);
		g.blit(RenderPipelines.GUI_TEXTURED, unlocked ? a.icon() : LOCKED, 0, 0, 0, 0, 32, 32, 32, 32, unlocked ? 0xFFFFFFFF : 0xFF808080);
		g.pose().popMatrix();
		int idx = slot.ordinal();
		int cd = idx < s.cooldowns().length ? s.cooldowns()[idx] : 0;
		int total = idx < s.cooldownTotals().length ? Math.max(1, s.cooldownTotals()[idx]) : 1;
		boolean burnt = s.burnout() > 0 && a.technique;
		if (!unlocked) {
			g.fill(x, y, x + size, y + size, 0x90000000);
			String lv = "Lv" + a.unlockLevel;
			g.pose().pushMatrix();
			g.pose().translate(x + size / 2f - font.width(lv) * 0.35f, y + size / 2f - 3);
			g.pose().scale(0.7f, 0.7f);
			g.drawString(font, lv, 0, 0, 0xFFFFC040, true);
			g.pose().popMatrix();
		} else if (burnt) {
			g.fill(x, y, x + size, y + size, 0xA0400000);
		} else if (cd > 0) {
			int h = (int) (size * Math.min(1f, cd / (float) total));
			g.fill(x, y + size - h, x + size, y + size, 0xB0000000);
			String sec = cd >= 200 ? String.valueOf((cd + 19) / 20) : String.format("%.1f", cd / 20f);
			g.drawCenteredString(font, sec, x + size / 2, y + size / 2 - 4, 0xFFFFFFFF);
		}
		if (charging && s.maxCharge() > 0) {
			float f = Math.min(1f, s.chargeTicks() / (float) s.maxCharge());
			g.fill(x, y + size + 2, x + (int) (size * f), y + size + 4, f >= 1 ? 0xFFFFFFFF : argb(1f, c.accentColor));
		}
		// key label
		String key = Keybinds.ABILITY.get(slot).getTranslatedKeyMessage().getString();
		if (key.length() > 3) key = key.substring(0, 3);
		g.pose().pushMatrix();
		g.pose().translate(x + size - font.width(key) * 0.6f - 1, y + size - 6);
		g.pose().scale(0.6f, 0.6f);
		g.drawString(font, key, 0, 0, 0xFFDDDDDD, true);
		g.pose().popMatrix();
	}

	private static void renderCombo(GuiGraphics g, Font font, int sw, int sh, float partial) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return;
		long now = mc.level.getGameTime();
		Payloads.SorcererSync s = ClientState.self;
		int cx = sw / 2, cy = sh / 2;
		// Black Flash timing ring: closes onto the crosshair as the window approaches
		if (s != null && s.combo() > 0 && now <= ClientState.bfCloseTick + 2) {
			float toOpen = ClientState.bfOpenTick - (now + partial);
			boolean open = now >= ClientState.bfOpenTick && now <= ClientState.bfCloseTick;
			if (open) {
				float p = 0.6f + 0.4f * Mth.sin((now + partial) * 2.0f);
				ring(g, cx, cy, 9, argb(p, 0xFF1020));
				ring(g, cx, cy, 10, argb(p * 0.8f, 0x000000));
			} else if (toOpen > 0 && toOpen < 10) {
				int r = (int) (9 + toOpen * 2.2f);
				ring(g, cx, cy, r, argb(0.35f + 0.4f * (1 - toOpen / 10f), 0xFFFFFF));
				ring(g, cx, cy, 9, 0x50FF2030);
			}
		}
		// combo counter
		if (ClientState.combo >= 2 && s != null && s.combo() > 0) {
			float age = now - ClientState.comboTick + partial;
			float pop = 1.0f + Math.max(0, 0.6f - age * 0.12f);
			String n = String.valueOf(ClientState.combo);
			g.pose().pushMatrix();
			g.pose().translate(cx + 28, cy - 18);
			g.pose().scale(1.6f * pop, 1.6f * pop);
			g.drawString(font, n, 0, 0, 0xFFFFFFFF, true);
			g.pose().popMatrix();
			g.pose().pushMatrix();
			g.pose().translate(cx + 28 + font.width(n) * 1.6f * pop + 3, cy - 14);
			g.pose().scale(0.9f, 0.9f);
			g.drawString(font, Component.translatable("hud.jjkshowdown.hits"), 0, 0, 0xFFFFD060, true);
			g.pose().popMatrix();
			int left = s.comboTicks();
			g.fill(cx + 28, cy - 4, cx + 28 + (int) (40 * Mth.clamp(left / 25f, 0, 1)), cy - 3, 0xC0FFFFFF);
		}
	}

	/** Square-ish ring drawn with fills (crisp at GUI scale). */
	static void ring(GuiGraphics g, int cx, int cy, int r, int color) {
		int segs = 32;
		for (int i = 0; i < segs; i++) {
			double a = i * Math.PI * 2 / segs;
			int x = cx + (int) Math.round(Math.cos(a) * r);
			int y = cy + (int) Math.round(Math.sin(a) * r);
			g.fill(x, y, x + 1, y + 1, color);
		}
	}
}
