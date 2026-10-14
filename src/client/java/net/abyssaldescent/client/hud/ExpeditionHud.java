package net.abyssaldescent.client.hud;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.dungeon.run.RunHud;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.registry.ModAttachments;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

/**
 * Top-left expedition panel: floor and zone, the current objective, chamber progress, unsecured loot and party size.
 * It fades in on entering the depths, and a changed objective slides in with a brief highlight. A large countdown is
 * drawn under the crosshair while the descent rift charges.
 */
public final class ExpeditionHud {
	private static final Identifier PANEL = AbyssalDescent.id("hud/panel");
	private static final Identifier FLOOR = AbyssalDescent.id("hud/floor");
	private static final Identifier UNSECURED = AbyssalDescent.id("hud/unsecured");
	private static final Identifier PARTY = AbyssalDescent.id("hud/party");
	private static final Identifier[] OBJECTIVE_ICONS = {
		AbyssalDescent.id("hud/objective_explore"),
		AbyssalDescent.id("hud/objective_clear"),
		AbyssalDescent.id("hud/objective_descend"),
		AbyssalDescent.id("hud/objective_descend"),
		AbyssalDescent.id("hud/objective_boss"),
		AbyssalDescent.id("hud/objective_extract")
	};
	private static final int[] OBJECTIVE_COLORS = {0xFFD8D2C4, 0xFFFF6A5A, 0xFFC08CFF, 0xFFC08CFF, 0xFFFFB43A, 0xFF7FD8FF};

	private static float fade;
	private static int lastObjective = -1;
	private static int objectiveAge = 100;
	private static int lastUnsecured;
	private static int unsecuredPulse;
	/** The server refreshes the snapshot once a second; the countdown ticks down locally in between. */
	private static int syncedCountdown;
	private static int localCountdown;
	/** Smoothed vertical offset used to move the panel out of the boss bar's way. */
	private static float drop;

	private ExpeditionHud() {
	}

	public static void tick(Minecraft minecraft) {
		RunHud hud = current(minecraft.player);
		boolean show = hud.active() && AdConfig.get().client.showHud;
		fade = Mth.clamp(fade + (show ? 0.08F : -0.12F), 0.0F, 1.0F);
		if (!hud.active()) {
			lastObjective = -1;
			syncedCountdown = localCountdown = 0;
			return;
		}
		if (hud.countdown() != syncedCountdown) {
			syncedCountdown = hud.countdown();
			localCountdown = syncedCountdown;
		} else if (localCountdown > 0) {
			localCountdown--;
		}
		if (hud.objective() != lastObjective) {
			lastObjective = hud.objective();
			objectiveAge = 0;
		} else if (objectiveAge < 100) {
			objectiveAge++;
		}
		if (hud.unsecured() > lastUnsecured) {
			unsecuredPulse = 12;
		}
		lastUnsecured = hud.unsecured();
		if (unsecuredPulse > 0) {
			unsecuredPulse--;
		}
	}

	private static RunHud current(LocalPlayer player) {
		if (player == null) {
			return RunHud.NONE;
		}
		RunHud hud = player.getAttached(ModAttachments.HUD);
		return hud == null ? RunHud.NONE : hud;
	}

	public static void render(GuiGraphics graphics, DeltaTracker delta) {
		Minecraft minecraft = Minecraft.getInstance();
		if (fade <= 0.01F || minecraft.options.hideGui || minecraft.player == null || minecraft.gui.getDebugOverlay().showDebugScreen()) {
			return;
		}
		RunHud hud = current(minecraft.player);
		if (!hud.active()) {
			return;
		}
		Font font = minecraft.font;
		float partial = delta.getGameTimeDeltaPartialTick(false);
		int alpha = (int) (fade * 255);
		Zone zone = Zone.forFloor(hud.floor());
		RunHud.Objective objective = RunHud.Objective.byId(hud.objective());

		Component floorLine = Component.translatable("hud.abyssal_descent.floor", hud.floor());
		Component zoneLine = zone.displayName();
		Component objectiveLine = Component.translatable("hud.abyssal_descent.objective." + objective.name().toLowerCase());
		Component rooms = hud.roomsTotal() > 0 ? Component.translatable("hud.abyssal_descent.rooms", hud.roomsCleared(), hud.roomsTotal()) : null;

		int left = 6;
		int top = 6;
		int pad = 5;
		int lineH = 11;
		int width = Math.max(font.width(floorLine) + 6 + font.width(zoneLine), font.width(objectiveLine)) + 14 + pad * 2;
		int statsWidth = (rooms == null ? 0 : font.width(rooms) + 8) + 10 + font.width(String.valueOf(hud.unsecured())) + 8
			+ (hud.partyAlive() > 1 ? 10 + font.width(String.valueOf(hud.partyAlive())) : 0);
		width = Math.max(width, statsWidth + pad * 2 + 2);
		int height = pad * 2 + lineH * 3 - 2;
		// Slide in from the left as the panel fades in.
		int slide = (int) ((1.0F - easeOut(fade)) * -24);
		left += slide;
		// Drop below the boss bar when the two would overlap (narrow windows, large GUI scales).
		int barBottom = DungeonBossBar.bottom(minecraft, graphics.guiHeight());
		float targetDrop = barBottom > 0 && left + width > DungeonBossBar.left(graphics.guiWidth()) ? barBottom + 2 - top : 0;
		drop += (targetDrop - drop) * 0.2F;
		top += Math.round(drop);

		graphics.blitSprite(RenderPipelines.GUI_TEXTURED, PANEL, left, top, width, height, ARGB.white(fade * 0.92F));

		int x = left + pad;
		int y = top + pad;
		// Row 1: floor and zone.
		graphics.blitSprite(RenderPipelines.GUI_TEXTURED, FLOOR, x, y - 1, 9, 9, ARGB.white(fade));
		graphics.drawString(font, floorLine, x + 12, y, ARGB.color(alpha, 0xF2E6D0), true);
		graphics.drawString(font, zoneLine, x + 12 + font.width(floorLine) + 6, y, ARGB.color(alpha, zone.accentColor()), true);
		y += lineH;

		// Row 2: objective, sliding in and flashing when it changes.
		float age = Math.min(objectiveAge + partial, 20.0F) / 20.0F;
		int objectiveSlide = (int) ((1.0F - easeOut(age)) * 10);
		int color = OBJECTIVE_COLORS[objective.ordinal()];
		if (objectiveAge < 20) {
			float flash = 1.0F - age;
			color = ARGB.srgbLerp(flash * 0.7F, color, 0xFFFFFFFF);
		}
		int iconAlpha = alpha;
		if (objective == RunHud.Objective.CLEAR_ROOM || objective == RunHud.Objective.BOSS) {
			float t = (minecraft.player.tickCount + partial) * 0.25F;
			iconAlpha = (int) (alpha * (0.7F + 0.3F * Mth.sin(t)));
		}
		graphics.blitSprite(RenderPipelines.GUI_TEXTURED, OBJECTIVE_ICONS[objective.ordinal()], x + objectiveSlide, y - 1, 9, 9,
			ARGB.color(iconAlpha, 0xFFFFFF));
		graphics.drawString(font, objectiveLine, x + 12 + objectiveSlide, y, ARGB.color(Math.min(alpha, ARGB.alpha(color)), color), true);
		y += lineH;

		// Row 3: chamber progress, unsecured loot, party.
		int sx = x;
		if (rooms != null) {
			graphics.drawString(font, rooms, sx, y, ARGB.color(alpha, 0x9A9488), true);
			sx += font.width(rooms) + 8;
		}
		int unsecuredColor = hud.unsecured() > 0 ? 0xFFC75A : 0x6E6A60;
		if (unsecuredPulse > 0) {
			unsecuredColor = ARGB.srgbLerp(unsecuredPulse / 12.0F, ARGB.opaque(unsecuredColor), 0xFFFFFFFF) & 0xFFFFFF;
		}
		graphics.blitSprite(RenderPipelines.GUI_TEXTURED, UNSECURED, sx, y - 1, 9, 9, ARGB.white(hud.unsecured() > 0 ? fade : fade * 0.5F));
		graphics.drawString(font, String.valueOf(hud.unsecured()), sx + 11, y, ARGB.color(alpha, unsecuredColor), true);
		sx += 11 + font.width(String.valueOf(hud.unsecured())) + 8;
		if (hud.partyAlive() > 1) {
			graphics.blitSprite(RenderPipelines.GUI_TEXTURED, PARTY, sx, y - 1, 9, 9, ARGB.white(fade));
			graphics.drawString(font, String.valueOf(hud.partyAlive()), sx + 11, y, ARGB.color(alpha, 0xB8D8E8), true);
		}

		if (syncedCountdown > 0 && localCountdown > 0) {
			renderCountdown(graphics, font, localCountdown, partial);
		}
	}

	private static void renderCountdown(GuiGraphics graphics, Font font, int ticks, float partial) {
		int seconds = Mth.ceil(ticks / 20.0F);
		Component text = Component.translatable("hud.abyssal_descent.countdown", seconds);
		float frac = Math.max(0.0F, (ticks % 20) - partial) / 20.0F;
		float scale = 1.6F + 0.25F * frac * frac;
		int cx = graphics.guiWidth() / 2;
		int cy = (int) (graphics.guiHeight() * 0.62F);
		graphics.pose().pushMatrix();
		graphics.pose().translate(cx, cy);
		graphics.pose().scale(scale, scale);
		int w = font.width(text);
		graphics.drawString(font, text, -w / 2, -4, 0xFFC890FF, true);
		graphics.pose().popMatrix();
	}

	private static float easeOut(float t) {
		float inv = 1.0F - Mth.clamp(t, 0.0F, 1.0F);
		return 1.0F - inv * inv * inv;
	}
}
