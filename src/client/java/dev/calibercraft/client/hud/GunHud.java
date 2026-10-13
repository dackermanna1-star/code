package dev.calibercraft.client.hud;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.client.ClientGunData;
import dev.calibercraft.client.GunController;
import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.core.FireMode;
import dev.calibercraft.core.GunState;
import dev.calibercraft.core.ReloadRunner;
import dev.calibercraft.core.Stat;
import dev.calibercraft.core.WeaponCategory;
import dev.calibercraft.data.AttachmentDefinition;
import dev.calibercraft.item.WeaponStacks;
import dev.calibercraft.network.HitConfirmPayload;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

/** Weapon HUD elements (registered with Fabric's HUD element registry in the client initialiser). */
public final class GunHud {
	private static final Identifier SCOPE_SNIPER = CaliberCraft.id("textures/misc/scope_sniper.png");
	private static final Identifier SCOPE_ACOG = CaliberCraft.id("textures/misc/scope_acog.png");
	private static final Identifier HIT = CaliberCraft.id("hud/hitmarker");
	private static final Identifier HIT_HEAD = CaliberCraft.id("hud/hitmarker_head");
	private static final Identifier HIT_KILL = CaliberCraft.id("hud/hitmarker_kill");
	private static final Identifier RETICLE_DOT = CaliberCraft.id("hud/reticle_red_dot");
	private static final Identifier RETICLE_HOLO = CaliberCraft.id("hud/reticle_holo");
	private static final Identifier HEAT_BG = CaliberCraft.id("hud/heat_bar_background");
	private static final Identifier HEAT_FILL = CaliberCraft.id("hud/heat_bar_fill");

	private static final Deque<Hit> HITS = new ArrayDeque<>();

	private record Hit(int kind, float damage, float time) {
	}

	private GunHud() {
	}

	public static void onHit(HitConfirmPayload p) {
		if (HITS.size() > 16) {
			HITS.pollFirst();
		}
		HITS.addLast(new Hit(p.kind(), p.damage(), GunController.INSTANCE.clock));
	}

	private static boolean visible() {
		Minecraft mc = Minecraft.getInstance();
		return mc.player != null && !mc.player.isSpectator() && GunController.INSTANCE.active();
	}

	// ------------------------------------------------------------------------------------------------ scope

	/** Full-screen scope picture for overlay optics. Drawn first so the rest of the HUD sits on top. */
	public static final HudElement SCOPE = (g, delta) -> {
		GunController c = GunController.INSTANCE;
		if (!visible() || c.ads < 0.92f || !Minecraft.getInstance().options.getCameraType().isFirstPerson()) {
			return;
		}
		var optic = c.optic().flatMap(AttachmentDefinition::optic).orElse(null);
		if (optic == null || !optic.overlay()) {
			return;
		}
		int w = g.guiWidth();
		int h = g.guiHeight();
		int size = Math.min(w, h);
		float sway = ClientConfig.get().reducedMotion ? 0 : 1;
		int ox = (int) (Mth.sin(c.clock * 0.045f) * 2 * sway);
		int oy = (int) (Mth.sin(c.clock * 0.09f + 1.3f) * 1.5f * sway);
		int x = (w - size) / 2 + ox;
		int y = (h - size) / 2 + oy;
		Identifier tex = optic.reticle() == AttachmentDefinition.Reticle.ACOG ? SCOPE_ACOG : SCOPE_SNIPER;
		g.blit(tex, x, y, x + size, y + size, 0, 1, 0, 1);
		int black = 0xFF000000;
		g.fill(0, 0, w, Math.max(0, y), black);
		g.fill(0, y + size, w, h, black);
		g.fill(0, y, Math.max(0, x), y + size, black);
		g.fill(x + size, y, w, y + size, black);
	};

	// ------------------------------------------------------------------------------------------------ crosshair

	/** Replaces the vanilla crosshair while a weapon is held. Returns true if it drew (or deliberately hid) one. */
	public static boolean crosshair(GuiGraphics g, DeltaTracker delta) {
		if (!visible()) {
			return false;
		}
		Minecraft mc = Minecraft.getInstance();
		if (!mc.options.getCameraType().isFirstPerson()) {
			return false;
		}
		GunController c = GunController.INSTANCE;
		ClientConfig cfg = ClientConfig.get();
		int cx = g.guiWidth() / 2;
		int cy = g.guiHeight() / 2;
		drawHitMarkers(g, cx, cy, c);
		var optic = c.optic().flatMap(AttachmentDefinition::optic).orElse(null);
		if (c.ads > 0.85f && optic != null && !optic.overlay()) {
			Identifier reticle = optic.reticle() == AttachmentDefinition.Reticle.HOLO ? RETICLE_HOLO : RETICLE_DOT;
			int s = reticle == RETICLE_HOLO ? 31 : 15;
			int a = (int) (255 * Mth.clamp((c.ads - 0.85f) / 0.15f, 0, 1));
			g.blitSprite(RenderPipelines.GUI_TEXTURED, reticle, cx - s / 2, cy - s / 2, s, s, ARGB.color(a, 255, 255, 255));
		}
		if (c.ads > 0.5f || cfg.crosshairStyle == 2 || c.sprint > 0.5f || c.runner() != null && c.reloading()) {
			return true;
		}
		int alpha = (int) (220 * (1 - c.ads * 2));
		int color = ARGB.color(Math.max(0, alpha), 235, 235, 235);
		int shadow = ARGB.color(Math.max(0, alpha / 2), 0, 0, 0);
		if (cfg.crosshairStyle == 1) {
			g.fill(cx - 1, cy - 1, cx + 1, cy + 1, color);
			return true;
		}
		double fov = mc.options.fov().get();
		float spread = c.currentSpread();
		int gap = (int) Math.round(Math.tan(Math.toRadians(spread)) / Math.tan(Math.toRadians(fov / 2)) * (g.guiHeight() / 2.0)) + 2;
		gap = Mth.clamp(gap, 2, 60);
		int len = 4;
		boolean shotgun = c.definition().category() == WeaponCategory.SHOTGUN;
		if (shotgun) {
			// Shotguns get a circle-ish bracket showing the pellet cone.
			for (int i = 0; i < 16; i++) {
				double ang = i * Math.PI / 8;
				int px = cx + (int) Math.round(Math.cos(ang) * gap);
				int py = cy + (int) Math.round(Math.sin(ang) * gap);
				g.fill(px, py, px + 1, py + 1, color);
			}
			g.fill(cx, cy, cx + 1, cy + 1, color);
			return true;
		}
		line(g, cx - gap - len, cy, cx - gap, cy + 1, color, shadow);
		line(g, cx + gap + 1, cy, cx + gap + 1 + len, cy + 1, color, shadow);
		line(g, cx, cy - gap - len, cx + 1, cy - gap, color, shadow);
		line(g, cx, cy + gap + 1, cx + 1, cy + gap + 1 + len, color, shadow);
		g.fill(cx, cy, cx + 1, cy + 1, color);
		return true;
	}

	private static void line(GuiGraphics g, int x0, int y0, int x1, int y1, int color, int shadow) {
		g.fill(x0 + 1, y0 + 1, x1 + 1, y1 + 1, shadow);
		g.fill(x0, y0, x1, y1, color);
	}

	private static void drawHitMarkers(GuiGraphics g, int cx, int cy, GunController c) {
		ClientConfig cfg = ClientConfig.get();
		Iterator<Hit> it = HITS.iterator();
		Font font = Minecraft.getInstance().font;
		int numberRow = 0;
		while (it.hasNext()) {
			Hit h = it.next();
			float age = c.clock - h.time;
			float life = h.kind == HitConfirmPayload.KILL ? 14 : 7;
			if (age > Math.max(life, cfg.damageNumbers ? 20 : 0)) {
				it.remove();
				continue;
			}
			if (cfg.hitMarkers && age <= life) {
				int a = (int) (255 * (1 - age / life));
				Identifier sprite = h.kind == HitConfirmPayload.KILL ? HIT_KILL : h.kind == HitConfirmPayload.HEADSHOT ? HIT_HEAD : HIT;
				int grow = h.kind == HitConfirmPayload.KILL ? (int) (age * 0.4f) : 0;
				g.blitSprite(RenderPipelines.GUI_TEXTURED, sprite, cx - 7 - grow, cy - 7 - grow, 15 + grow * 2, 15 + grow * 2,
					ARGB.color(a, 255, 255, 255));
			}
			if (cfg.damageNumbers && age <= 20) {
				int a = (int) (255 * (1 - age / 20));
				String txt = String.format("%.1f", h.damage);
				int col = h.kind == HitConfirmPayload.HEADSHOT ? 0xFFAA33 : h.kind == HitConfirmPayload.KILL ? 0xFF4444 : 0xFFFFFF;
				g.drawString(font, txt, cx + 10, cy - 12 - (int) (age * 0.8f) - numberRow * 9, ARGB.color(a, (col >> 16) & 255, (col >> 8) & 255,
					col & 255), true);
				numberRow++;
			}
		}
	}

	// ------------------------------------------------------------------------------------------------ ammo panel

	public static final HudElement AMMO = (g, delta) -> {
		ClientConfig cfg = ClientConfig.get();
		if (!visible() || !cfg.hudEnabled) {
			return;
		}
		GunController c = GunController.INSTANCE;
		Minecraft mc = Minecraft.getInstance();
		Font font = mc.font;
		GunState s = c.predicted();
		int cap = c.stats().i(Stat.MAGAZINE);
		int rounds = s.rounds();
		boolean chamber = s.chambered() && c.definition().action().usesChamber();
		int reserve = c.reserve();
		String reserveText = reserve >= 9999 ? "∞" : Integer.toString(reserve);
		String ammoName = WeaponStacks.activeAmmo(s, c.definition(), ClientGunData.data())
			.map(id -> Component.translatable("calibercraft.ammo." + id.getPath()).getString()).orElse("");
		String selectedName = WeaponStacks.selectedAmmo(s, c.definition(), ClientGunData.data())
			.map(id -> Component.translatable("calibercraft.ammo." + id.getPath()).getString()).orElse("");

		float scale = cfg.hudScale;
		int panelW = 128;
		int panelH = 44;
		int w = (int) (g.guiWidth() / scale);
		int h = (int) (g.guiHeight() / scale);
		int x = (cfg.hudCorner == 1 || cfg.hudCorner == 3) ? 6 : w - panelW - 6;
		int y = (cfg.hudCorner >= 2) ? 6 : h - panelH - 6;
		x += cfg.hudOffsetX;
		y += cfg.hudOffsetY;
		g.pose().pushMatrix();
		g.pose().scale(scale, scale);

		boolean low = rounds + (chamber ? 1 : 0) <= Math.max(1, cap / 4);
		int bg = cfg.simplifiedHud ? 0xE0000000 : 0x90101418;
		g.fill(x, y, x + panelW, y + panelH, bg);
		if (!cfg.simplifiedHud) {
			g.fill(x, y, x + 2, y + panelH, low ? 0xFFE04040 : 0xFFE8B040);
			g.fill(x + 2, y, x + panelW, y + 1, 0x40FFFFFF);
		}
		String name = c.stack().getHoverName().getString();
		g.drawString(font, ellipsize(font, name, panelW - 32), x + 6, y + 4, 0xFFB8C0C8, false);
		FireMode mode = c.fireMode();
		String modeKey = c.definition().action().manualCycle()
			? (c.definition().action() == dev.calibercraft.core.ActionType.BOLT ? "bolt" : "pump")
			: mode.getSerializedName();
		if (cfg.simplifiedHud) {
			g.drawString(font, Component.translatable("calibercraft.fire_mode." + modeKey), x + panelW - 34, y + 4, 0xFFFFFFFF, false);
		} else {
			g.blitSprite(RenderPipelines.GUI_TEXTURED, CaliberCraft.id("hud/mode_" + modeKey), x + panelW - 22, y + 4, 16, 8);
		}

		// Big magazine count (+1 chambered) and reserve
		String main = Integer.toString(rounds);
		g.pose().pushMatrix();
		g.pose().translate(x + 6, y + 15);
		g.pose().scale(2, 2);
		int mainColor = rounds + (chamber ? 1 : 0) == 0 ? 0xFFFF5050 : low ? 0xFFFFB040 : 0xFFFFFFFF;
		g.drawString(font, main, 0, 0, mainColor, true);
		g.pose().popMatrix();
		int mx = x + 6 + font.width(main) * 2 + 2;
		if (chamber) {
			g.drawString(font, "+1", mx, y + 15, 0xFFE8C060, true);
			mx += font.width("+1") + 2;
		}
		g.drawString(font, "/ " + reserveText, mx, y + 24, 0xFFA0A8B0, true);
		g.drawString(font, font.plainSubstrByWidth(ammoName, 52), x + panelW - 6 - Math.min(52, font.width(ammoName)), y + 24, 0xFFE0C080,
			false);
		if (!selectedName.equals(ammoName)) {
			g.drawString(font, "→ " + font.plainSubstrByWidth(selectedName, 44), x + panelW - 58, y + 15, 0xFF80C0FF, false);
		}

		// Status line: reload progress / heat / empty hint
		int barY = y + panelH - 7;
		ReloadRunner r = c.runner();
		if (r != null) {
			float progress = r.kind() == ReloadRunner.Kind.SINGLE ? Math.min(1, (rounds) / (float) Math.max(1, cap))
				: Mth.clamp(r.totalElapsed() / Math.max(1, r.currentTimeline().length()), 0, 1);
			String label = r.kind() == ReloadRunner.Kind.CYCLE ? "calibercraft.hud.cycling" : "calibercraft.hud.reloading";
			Component text = Component.translatable(label);
			// Label and bar share the bottom row so they never overlap the round counter above.
			int bx = x + 6 + font.width(text) + 4;
			int bw = x + panelW - 6 - bx;
			g.drawString(font, text, x + 6, barY - 3, 0xFFE8B040, false);
			g.fill(bx, barY, bx + bw, barY + 3, 0x80000000);
			g.fill(bx, barY, bx + (int) (bw * progress), barY + 3, 0xFFE8B040);
		} else if (c.heat() > 0.02f) {
			float heat = Mth.clamp(c.heat(), 0, 1);
			g.blitSprite(RenderPipelines.GUI_TEXTURED, HEAT_BG, x + 6, barY, 64, 4);
			g.enableScissor((int) ((x + 6) * scale), 0, (int) ((x + 6 + 64 * heat) * scale), g.guiHeight());
			g.blitSprite(RenderPipelines.GUI_TEXTURED, HEAT_FILL, x + 6, barY, 64, 4);
			g.disableScissor();
			if (s.overheated()) {
				g.drawString(font, Component.translatable("calibercraft.hud.overheated"), x + 74, barY - 3, 0xFFFF6040, false);
			}
		} else if (rounds == 0 && !chamber) {
			Component hint = reserve > 0 ? Component.translatable("calibercraft.hud.reload_hint") : Component.translatable("calibercraft.hud.no_ammo");
			g.drawString(font, hint, x + 6, barY - 3, (int) (c.clock * 2) % 20 < 12 ? 0xFFFF5050 : 0xFFAA3030, false);
		} else if (!cfg.simplifiedHud) {
			drawBullets(g, x + 6, barY, panelW - 12, rounds, cap, c.definition().category());
		}
		g.pose().popMatrix();
	};

	private static String ellipsize(Font font, String text, int width) {
		if (font.width(text) <= width) {
			return text;
		}
		return font.plainSubstrByWidth(text, width - font.width("…")) + "…";
	}

	private static void drawBullets(GuiGraphics g, int x, int y, int width, int rounds, int cap, WeaponCategory category) {
		Identifier sprite = switch (category) {
			case SHOTGUN -> CaliberCraft.id("hud/bullet_shell");
			case PISTOL, REVOLVER, SMG -> CaliberCraft.id("hud/bullet_pistol");
			default -> CaliberCraft.id("hud/bullet_rifle");
		};
		int sw = category == WeaponCategory.SHOTGUN ? 4 : 3;
		int sh = category == WeaponCategory.SHOTGUN ? 7 : category == WeaponCategory.PISTOL || category == WeaponCategory.REVOLVER
			|| category == WeaponCategory.SMG ? 7 : 9;
		int perIcon = Math.max(1, (int) Math.ceil(cap / (width / (sw + 1.0))));
		int icons = (int) Math.ceil(cap / (double) perIcon);
		int filled = (int) Math.ceil(rounds / (double) perIcon);
		for (int i = 0; i < icons; i++) {
			int px = x + width - (i + 1) * (sw + 1);
			int color = i < filled ? 0xFFFFFFFF : 0x40FFFFFF;
			g.blitSprite(RenderPipelines.GUI_TEXTURED, sprite, px, y + 4 - sh, sw, sh, color);
		}
	}
}
