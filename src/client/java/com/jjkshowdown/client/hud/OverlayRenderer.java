package com.jjkshowdown.client.hud;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.ScreenFx;
import com.jjkshowdown.client.cinematic.CameraDirector;
import com.jjkshowdown.client.cinematic.Shots;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.input.Keybinds;
import com.jjkshowdown.client.qte.QteClient;
import com.jjkshowdown.client.render.DomainClientState;
import com.jjkshowdown.domain.DomainType;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.qte.QteManager;
import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

import static com.jjkshowdown.client.hud.JjkHud.argb;

/** Full-screen overlays drawn above the HUD. */
public final class OverlayRenderer {
	private static final Identifier VIGNETTE_VOID = JjkShowdown.id("textures/gui/vignette_void.png");
	private static final Identifier VIGNETTE_RED = JjkShowdown.id("textures/gui/vignette_red.png");
	private static final Identifier INFO = JjkShowdown.id("textures/gui/info_overload.png");
	private static final Identifier QTE_RING = JjkShowdown.id("textures/gui/qte_ring.png");
	private static final Identifier QTE_KEY = JjkShowdown.id("textures/gui/qte_key.png");
	private static float letterbox;

	private OverlayRenderer() {
	}

	public static void render(GuiGraphics g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null) return;
		float partial = delta.getGameTimeDeltaPartialTick(false);
		int w = g.guiWidth(), h = g.guiHeight();
		long now = mc.level.getGameTime();
		ClientConfig cfg = ClientConfig.get();
		Font font = mc.font;

		// domain atmosphere
		DomainType inside = DomainClientState.insideType(mc.player.position());
		if (inside != null && cfg.domainAtmosphere) {
			g.blit(RenderPipelines.GUI_TEXTURED, inside == DomainType.UNLIMITED_VOID ? VIGNETTE_VOID : VIGNETTE_RED, 0, 0, 0, 0, w, h, 256, 256, 256, 256,
					argb(0.75f, 0xFFFFFF));
		}
		// Unlimited Void victim: infinite information
		if (ClientState.isOverloaded()) {
			float flicker = 0.55f + 0.35f * Mth.sin((now + partial) * 1.7f);
			int scroll = (int) ((now + partial) * 6) % 256;
			g.blit(RenderPipelines.GUI_TEXTURED, INFO, 0, 0, scroll, scroll / 2f, w, h, w, h, 256, 256, argb(flicker, 0xFFFFFF));
			g.fill(0, 0, w, h, argb(0.12f + 0.1f * Mth.sin((now + partial) * 3.1f), 0xDFF8FF));
		}
		// slow-mo vignette
		float slow = ScreenFx.slowMo(partial);
		if (slow > 0) {
			g.blit(RenderPipelines.GUI_TEXTURED, VIGNETTE_VOID, 0, 0, 0, 0, w, h, 256, 256, 256, 256, argb(0.6f * slow, 0xFFFFFF));
		}

		renderCinematic(g, font, w, h, partial, now);
		if (!CameraDirector.isActive()) {
			renderClash(g, font, w, h, partial, now);
			renderCallouts(g, font, w, h, partial, now);
			renderNotes(g, font, w, h, now, partial);
		}
		renderQte(g, font, w, h, partial, now);
		renderSubtitle(g, font, w, h, now, partial);

		// Black Flash: black/red sparks frame
		if (ScreenFx.running(ScreenFx.blackFlashStart, ScreenFx.blackFlashDuration, now) && cfg.screenFlashes) {
			float p = (now - ScreenFx.blackFlashStart + partial) / ScreenFx.blackFlashDuration;
			if (p < 0.15f) g.fill(0, 0, w, h, 0xE0000000);
			else if (p < 0.3f) g.fill(0, 0, w, h, argb(0.75f, 0xB00010));
			else g.fill(0, 0, w, h, argb(0.35f * (1 - p), 0x400008));
		}
		// impact frame
		if (ScreenFx.running(ScreenFx.impactStart, ScreenFx.impactDuration, now)) {
			float p = (now - ScreenFx.impactStart + partial) / ScreenFx.impactDuration;
			g.fill(0, 0, w, h, p < 0.5f ? argb(0.85f, ScreenFx.impactColor) : argb(0.85f * (1 - p) * 2, 0x000000));
		}
		// colour flashes
		for (ScreenFx.Flash f : ScreenFx.FLASHES) {
			float p = (now - f.start() + partial) / f.duration();
			float a = f.intensity() * (1 - Mth.clamp(p, 0, 1));
			if (a > 0.01f) g.fill(0, 0, w, h, argb(Math.min(0.92f, a), f.color()));
		}
	}

	// ------------------------------------------------------------------------------------------------ cinematic

	private static void renderCinematic(GuiGraphics g, Font font, int w, int h, float partial, long now) {
		CameraDirector.Active a = CameraDirector.active();
		float target = a != null && ClientConfig.get().letterbox ? 1f : 0f;
		letterbox = Mth.lerp(0.18f, letterbox, target);
		int bar = (int) (h * 0.12f * letterbox);
		if (bar > 0) {
			g.fill(0, 0, w, bar, 0xFF000000);
			g.fill(0, h - bar, w, h, 0xFF000000);
		}
		if (a == null) return;
		float t = CameraDirector.progress(partial);
		CharacterType c = a.character;
		for (Shots.Title title : a.seq.titles()) {
			if (t < title.start() || t > title.end()) continue;
			float local = (t - title.start()) / Math.max(0.001f, title.end() - title.start());
			float in = Mth.clamp(local * 6f, 0f, 1f);
			float out = Mth.clamp((1 - local) * 8f, 0f, 1f);
			float alpha = Math.min(in, out);
			Component top = Shots.resolve(title.top(), c);
			Component main = Shots.resolve(title.main(), c);
			Component sub = Shots.resolve(title.sub(), c);
			int col = c.isSorcerer() ? c.accentColor : 0xFFFFFF;
			switch (title.style()) {
				case DOMAIN -> {
					float zoom = 1.0f + (1 - in) * 0.6f;
					centered(g, font, top, w / 2, (int) (h * 0.30f), 1.2f, argb(alpha, 0xDDDDDD));
					centered(g, font, main, w / 2, (int) (h * 0.38f), 3.2f * zoom, argb(alpha, col));
					centered(g, font, sub, w / 2, (int) (h * 0.52f), 2.0f, argb(alpha * 0.9f, 0xFFFFFF));
					int lw = (int) (w * 0.35f * in);
					g.fill(w / 2 - lw, (int) (h * 0.495f), w / 2 + lw, (int) (h * 0.495f) + 1, argb(alpha, col));
				}
				case NAME_CARD -> {
					int x = (int) (w * 0.08f) + (int) ((1 - in) * -60);
					g.fill(x - 8, (int) (h * 0.62f), x - 5, (int) (h * 0.62f) + 44, argb(alpha, col));
					if (!top.getString().isEmpty()) drawScaled(g, font, top, x, (int) (h * 0.60f) - 8, 1.0f, argb(alpha, 0xFF6060));
					drawScaled(g, font, main, x, (int) (h * 0.62f), 2.8f, argb(alpha, 0xFFFFFF));
					drawScaled(g, font, sub, x + 2, (int) (h * 0.62f) + 30, 1.2f, argb(alpha, col));
				}
				case TECHNIQUE -> {
					centered(g, font, top, w / 2, (int) (h * 0.66f), 1.2f, argb(alpha, 0xDDDDDD));
					centered(g, font, main, w / 2, (int) (h * 0.71f), 2.6f, argb(alpha, col));
					centered(g, font, sub, w / 2, (int) (h * 0.80f), 1.6f, argb(alpha * 0.9f, 0xFFFFFF));
				}
				case INCANTATION -> centered(g, font, main, w / 2, (int) (h * 0.76f), 1.8f, argb(alpha, 0xE8E8FF));
				case CLASH -> {
					float shake = (1 - in) * 6;
					centered(g, font, main, w / 2 + (int) (Math.sin(now * 3.0) * shake), (int) (h * 0.30f), 3.0f, argb(alpha, 0xFFFFFF));
					centered(g, font, sub, w / 2, (int) (h * 0.42f), 1.6f, argb(alpha, 0xFFD040));
				}
			}
		}
		if (ClientState.serverConfig.cinematics.allowSkip) {
			Component skip = Component.translatable("hud.jjkshowdown.skip", Minecraft.getInstance().options.keyJump.getTranslatedKeyMessage());
			g.drawString(font, skip, w - font.width(skip) - 8, h - 14, 0xA0FFFFFF, true);
		}
	}

	// ------------------------------------------------------------------------------------------------ clash

	private static void renderClash(GuiGraphics g, Font font, int w, int h, float partial, long now) {
		Payloads.Clash c = ClientState.clash;
		if (c == null) return;
		if (!c.active() && now - ClientState.clashTick > 40) {
			ClientState.clash = null;
			return;
		}
		int bw = Math.min(280, w - 40), bh = 10;
		int x = w / 2 - bw / 2, y = 42;
		CharacterType ca = CharacterType.byOrdinal(c.charA()), cb = CharacterType.byOrdinal(c.charB());
		float bal = Mth.clamp((c.balance() + 1) / 2f, 0, 1);
		int split = x + (int) (bw * bal);
		g.fill(x - 2, y - 2, x + bw + 2, y + bh + 2, 0xE0000000);
		g.fillGradient(x, y, split, y + bh, argb(1f, ca.accentColor), argb(1f, ca.energyColor));
		g.fillGradient(split, y, x + bw, y + bh, argb(1f, cb.energyColor), argb(1f, cb.accentColor));
		float pulse = 0.6f + 0.4f * Mth.sin((now + partial) * 1.5f);
		g.fill(split - 2, y - 4, split + 2, y + bh + 4, argb(pulse, 0xFFFFFF));
		centered(g, font, Component.translatable("hud.jjkshowdown.clash"), w / 2, y - 14, 1.2f, 0xFFFFFFFF);
		g.drawString(font, ca.displayName(), x, y + bh + 4, argb(1f, ca.accentColor), true);
		Component nb = cb.displayName();
		g.drawString(font, nb, x + bw - font.width(nb), y + bh + 4, argb(1f, cb.accentColor), true);
		if (c.integrity() < 0.999f) {
			int iw = (int) (bw * 0.5f);
			g.fill(w / 2 - iw / 2, y + bh + 16, w / 2 + iw / 2, y + bh + 19, 0xFF202030);
			g.fill(w / 2 - iw / 2, y + bh + 16, w / 2 - iw / 2 + (int) (iw * c.integrity()), y + bh + 19, 0xFF8FE6FF);
			centered(g, font, Component.translatable("hud.jjkshowdown.barrier", Math.round(c.integrity() * 100)), w / 2, y + bh + 22, 0.8f, 0xFFB0F0FF);
		}
		if (c.active() && involved(c)) {
			KeyMapping key = Keybinds.ABILITY.get(AbilitySlot.DOMAIN);
			float s = 1.3f + 0.15f * Mth.sin((now + partial) * 2.4f);
			centered(g, font, Component.translatable("hud.jjkshowdown.mash", key.getTranslatedKeyMessage()), w / 2, (int) (h * 0.68f), s, 0xFFFFD040);
		}
	}

	private static boolean involved(Payloads.Clash c) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null || mc.player == null) return false;
		for (int id : new int[]{c.domainA(), c.domainB()}) {
			if (mc.level.getEntity(id) instanceof com.jjkshowdown.domain.DomainEntity d && d.ownerId() == mc.player.getId()) return true;
		}
		return false;
	}

	// ------------------------------------------------------------------------------------------------ QTE

	private static void renderQte(GuiGraphics g, Font font, int w, int h, float partial, long now) {
		QteClient.Active q = QteClient.active;
		int cx = w / 2, cy = (int) (h * 0.62f);
		if (q != null) {
			float el = now - q.start + partial;
			float p = Mth.clamp(el / q.duration, 0, 1);
			Component label = Component.translatable(q.label);
			float pulse = 1.0f + 0.08f * Mth.sin(el * 1.2f);
			centered(g, font, label, cx, cy - 42, 1.6f * pulse, 0xFFFFFFFF);
			KeyMapping km = switch (q.key) {
				case DODGE -> Keybinds.DODGE;
				case ATTACK -> Minecraft.getInstance().options.keyAttack;
				case DOMAIN -> Keybinds.ABILITY.get(AbilitySlot.DOMAIN);
				case ULTIMATE -> Keybinds.ABILITY.get(AbilitySlot.ULTIMATE);
				case JUMP -> Minecraft.getInstance().options.keyJump;
			};
			g.blit(RenderPipelines.GUI_TEXTURED, QTE_KEY, cx - 16, cy - 16, 0, 0, 32, 32, 32, 32, 32, 32, 0xFFFFFFFF);
			String keyName = km.getTranslatedKeyMessage().getString();
			centered(g, font, Component.literal(keyName.length() > 6 ? keyName.substring(0, 6) : keyName), cx, cy - 4, keyName.length() > 3 ? 0.8f : 1.4f, 0xFF101010);
			switch (q.kind) {
				case PRESS -> {
					int size = (int) (96 - 56 * p);
					g.blit(RenderPipelines.GUI_TEXTURED, QTE_RING, cx - size / 2, cy - size / 2, 0, 0, size, size, 64, 64, 64, 64, argb(0.4f + 0.6f * p, p > 0.75f ? 0xFF4040 : 0xFFFFFF));
				}
				case TIMING -> {
					float sweetP = (q.sweetStart + q.sweetEnd) / 2f / q.duration;
					float d = Math.abs(p - sweetP);
					int size = (int) (40 + (1 - p / Math.max(0.01f, sweetP)) * 70);
					size = Math.max(24, size);
					g.blit(RenderPipelines.GUI_TEXTURED, QTE_RING, cx - 20, cy - 20, 0, 0, 40, 40, 64, 64, 64, 64, 0xFFFFD040);
					g.blit(RenderPipelines.GUI_TEXTURED, QTE_RING, cx - size / 2, cy - size / 2, 0, 0, size, size, 64, 64, 64, 64,
							argb(0.9f, d < 0.06f ? 0x40FF40 : 0xFFFFFF));
				}
				case MASH -> {
					int bw = 120;
					float f = Mth.clamp(q.count / (float) Math.max(1, q.presses), 0, 1);
					g.fill(cx - bw / 2 - 1, cy + 22, cx + bw / 2 + 1, cy + 29, 0xE0000000);
					g.fill(cx - bw / 2, cy + 23, cx - bw / 2 + (int) (bw * f), cy + 28, 0xFFFFD040);
					g.fill(cx - bw / 2, cy + 31, cx - bw / 2 + (int) (bw * (1 - p)), cy + 32, 0xA0FFFFFF);
				}
			}
		} else if (QteClient.lastResult != null && now - QteClient.lastResult.tick() < 24) {
			float a = 1 - (now - QteClient.lastResult.tick() + partial) / 24f;
			int o = QteClient.lastResult.outcome();
			Component text = Component.translatable(o == 0 ? "hud.jjkshowdown.qte_success" : o == 1 ? "hud.jjkshowdown.qte_partial" : "hud.jjkshowdown.qte_fail");
			centered(g, font, text, cx, cy - 6, 2.2f, argb(a, o == 0 ? 0x60FF60 : o == 1 ? 0xFFD040 : 0xFF4040));
		}
	}

	// ------------------------------------------------------------------------------------------------ callouts, notes, subtitles

	private static void renderCallouts(GuiGraphics g, Font font, int w, int h, float partial, long now) {
		ClientState.Note c = ClientState.callout;
		if (c == null || !ClientConfig.get().callouts) return;
		float age = now - c.tick() + partial;
		if (age > 36) {
			ClientState.callout = null;
			return;
		}
		float in = Mth.clamp(age / 4f, 0, 1);
		float out = Mth.clamp((36 - age) / 8f, 0, 1);
		float scale = 2.4f + (1 - in) * 1.6f;
		centered(g, font, c.text(), w / 2, (int) (h * 0.28f), scale, argb(Math.min(in, out), c.color()));
	}

	private static void renderNotes(GuiGraphics g, Font font, int w, int h, long now, float partial) {
		int y = 8;
		var it = ClientState.NOTES.iterator();
		while (it.hasNext()) {
			ClientState.Note n = it.next();
			float age = now - n.tick() + partial;
			float life = n.kind() == Payloads.Notify.LEVEL_UP || n.kind() == Payloads.Notify.UNLOCK ? 100 : 60;
			if (age > life) {
				it.remove();
				continue;
			}
			float a = Mth.clamp((life - age) / 10f, 0, 1) * Mth.clamp(age / 3f, 0, 1);
			int tw = font.width(n.text());
			int x = w - tw - 10;
			g.fill(x - 4, y - 3, w - 6, y + 11, argb(0.55f * a, 0x000000));
			g.fill(x - 4, y - 3, x - 3, y + 11, argb(a, n.color()));
			g.drawString(font, n.text(), x, y, argb(a, n.kind() == Payloads.Notify.WARN ? 0xFF8080 : n.color()), true);
			y += 16;
		}
	}

	private static void renderSubtitle(GuiGraphics g, Font font, int w, int h, long now, float partial) {
		ClientState.Subtitle s = ClientState.subtitle;
		if (s == null || !ClientConfig.get().subtitles) return;
		float age = now - s.tick() + partial;
		if (age > s.duration()) {
			ClientState.subtitle = null;
			return;
		}
		float a = Mth.clamp((s.duration() - age) / 10f, 0, 1) * Mth.clamp(age / 3f, 0, 1);
		Component line = Component.empty().append(s.speaker().copy().withColor(s.color())).append(Component.literal(": ")).append(s.line());
		int tw = font.width(line);
		int y = CameraDirector.isActive() ? h - (int) (h * 0.12f) + 4 : h - 150;
		g.fill(w / 2 - tw / 2 - 6, y - 4, w / 2 + tw / 2 + 6, y + 12, argb(0.6f * a, 0x000000));
		g.drawCenteredString(font, line, w / 2, y, argb(a, 0xFFFFFF));
	}

	// ------------------------------------------------------------------------------------------------ text helpers

	static void centered(GuiGraphics g, Font font, Component text, int x, int y, float scale, int color) {
		if (text.getString().isEmpty() || (color >>> 24) < 4) return;
		g.pose().pushMatrix();
		g.pose().translate(x, y);
		g.pose().scale(scale, scale);
		g.drawString(font, text, -font.width(text) / 2, 0, color, true);
		g.pose().popMatrix();
	}

	static void drawScaled(GuiGraphics g, Font font, Component text, int x, int y, float scale, int color) {
		if (text.getString().isEmpty() || (color >>> 24) < 4) return;
		g.pose().pushMatrix();
		g.pose().translate(x, y);
		g.pose().scale(scale, scale);
		g.drawString(font, text, 0, 0, color, true);
		g.pose().popMatrix();
	}
}
