package net.abyssaldescent.client.hud;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.abyssaldescent.client.mixin.BossHealthOverlayAccessor;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.entity.boss.DungeonBossEntity;
import net.abyssaldescent.world.DungeonDimension;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.LerpingBossEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import org.jetbrains.annotations.Nullable;

/**
 * Replaces the vanilla boss bar inside the depths: a framed bar in the zone's accent colour with a lagging damage
 * trail, notches at the boss's phase thresholds, a phase numeral and a hit flash. Outside the dungeon the vanilla bar
 * renders unchanged.
 */
public final class DungeonBossBar {
	private static final int WIDTH = 204;
	private static final int BAR_HEIGHT = 6;
	private static final String[] NUMERALS = {"I", "II", "III", "IV", "V"};
	/** Bar fill per zone: saturated versions of the zone accents, so the bar reads as the fight's focal colour. */
	private static final int[] ZONE_FILL = {0x5FD3FF, 0xFF6A1F, 0xB07CFF, 0x2FD6C2, 0xE0213F, 0x8B5CFF};
	/** Per boss event: the slowly-following "damage taken" value and the last flash time. */
	private static final Map<UUID, Trail> TRAILS = new HashMap<>();

	private DungeonBossBar() {
	}

	private static final class Trail {
		float shown = 1.0F;
		float last = 1.0F;
		int flash;
	}

	/** Called once per client tick to advance trails and drop state for bars that have gone. */
	public static void tick(Minecraft minecraft) {
		Map<UUID, LerpingBossEvent> events = ((BossHealthOverlayAccessor) minecraft.gui.getBossOverlay()).abyssal_descent$events();
		TRAILS.keySet().retainAll(events.keySet());
		for (LerpingBossEvent event : events.values()) {
			Trail trail = TRAILS.computeIfAbsent(event.getId(), id -> new Trail());
			float progress = event.getProgress();
			if (progress < trail.last - 0.001F) {
				trail.flash = 6;
			}
			trail.last = progress;
			if (trail.shown > progress) {
				// Hold briefly, then drain toward the real value.
				trail.shown = trail.flash > 0 ? trail.shown : Math.max(progress, trail.shown - 0.012F - (trail.shown - progress) * 0.08F);
			} else {
				trail.shown = progress;
			}
			if (trail.flash > 0) {
				trail.flash--;
			}
		}
	}

	/** @return true when the dungeon bar was drawn (the vanilla element is then skipped). */
	public static boolean render(GuiGraphics graphics, DeltaTracker delta) {
		Minecraft minecraft = Minecraft.getInstance();
		if (minecraft.player == null || !DungeonDimension.isDungeon(minecraft.player.level())) {
			return false;
		}
		Map<UUID, LerpingBossEvent> events = ((BossHealthOverlayAccessor) minecraft.gui.getBossOverlay()).abyssal_descent$events();
		if (events.isEmpty()) {
			return true;
		}
		graphics.nextStratum();
		Font font = minecraft.font;
		int floor = DungeonDimension.floorAt(minecraft.player.level(), minecraft.player.blockPosition());
		int accent = ZONE_FILL[Zone.forFloor(floor).ordinal() % ZONE_FILL.length];
		float partial = delta.getGameTimeDeltaPartialTick(false);
		int y = 16;
		for (LerpingBossEvent event : events.values()) {
			DungeonBossEntity boss = findBoss(minecraft, event.getName());
			drawBar(graphics, font, event, boss, accent, graphics.guiWidth() / 2 - WIDTH / 2, y, partial);
			y += 26;
			if (y >= graphics.guiHeight() / 3) {
				break;
			}
		}
		return true;
	}

	private static void drawBar(GuiGraphics graphics, Font font, LerpingBossEvent event, @Nullable DungeonBossEntity boss, int accent, int x, int y,
		float partial) {
		Trail trail = TRAILS.computeIfAbsent(event.getId(), id -> new Trail());
		float progress = Mth.clamp(event.getProgress(), 0.0F, 1.0F);
		float shown = Mth.clamp(trail.shown, progress, 1.0F);
		int dark = ARGB.scaleRGB(ARGB.opaque(accent), 0.35F);

		// Frame: outer shadow, accent border, inner well.
		graphics.fill(x - 3, y - 3, x + WIDTH + 3, y + BAR_HEIGHT + 3, 0xB0000000);
		graphics.fill(x - 2, y - 2, x + WIDTH + 2, y + BAR_HEIGHT + 2, ARGB.color(230, ARGB.scaleRGB(accent, 0.75F)));
		graphics.fill(x - 1, y - 1, x + WIDTH + 1, y + BAR_HEIGHT + 1, 0xFF0B0D12);
		// Corner studs.
		int stud = 0xFFD9B45A;
		graphics.fill(x - 4, y + BAR_HEIGHT / 2 - 1, x - 2, y + BAR_HEIGHT / 2 + 1, stud);
		graphics.fill(x + WIDTH + 2, y + BAR_HEIGHT / 2 - 1, x + WIDTH + 4, y + BAR_HEIGHT / 2 + 1, stud);

		int fillEnd = x + Math.round(WIDTH * progress);
		int trailEnd = x + Math.round(WIDTH * shown);
		if (trailEnd > fillEnd) {
			graphics.fill(fillEnd, y, trailEnd, y + BAR_HEIGHT, 0xFFE8D9C8);
		}
		if (fillEnd > x) {
			graphics.fillGradient(x, y, fillEnd, y + BAR_HEIGHT, ARGB.opaque(accent), dark);
			// Highlight line along the top edge.
			graphics.fill(x, y, fillEnd, y + 1, ARGB.color(150, 0xFFFFFF));
		}
		if (trail.flash > 0) {
			int alpha = (int) (trail.flash / 6.0F * 120);
			graphics.fill(x, y, fillEnd, y + BAR_HEIGHT, ARGB.color(alpha, 0xFFFFFF));
		}

		int phase = 1;
		if (boss != null) {
			phase = boss.phase();
			for (float mark : boss.phaseMarks()) {
				int nx = x + Math.round(WIDTH * mark);
				int color = progress <= mark ? 0xFF6B5A3A : 0xFFE9C46A;
				graphics.fill(nx, y - 2, nx + 1, y + BAR_HEIGHT + 2, color);
			}
		}

		Component name = event.getName();
		int nameWidth = font.width(name);
		int nameX = x + WIDTH / 2 - nameWidth / 2;
		graphics.drawString(font, name, nameX, y - 12, 0xFFF2E6D0, true);
		if (boss != null) {
			String numeral = NUMERALS[Mth.clamp(phase - 1, 0, NUMERALS.length - 1)];
			int pulse = phase > 1 ? (int) (200 + 55 * Mth.sin((boss.tickCount + partial) * 0.2F)) : 160;
			graphics.drawString(font, numeral, x + WIDTH - font.width(numeral), y - 12, ARGB.color(pulse, 0xE9C46A), true);
		}
		int percent = Math.round(progress * 100);
		String pct = percent + "%";
		graphics.drawString(font, pct, x, y - 12, 0xA0C8C8C8, true);
	}

	/** Lowest GUI y used by the dungeon boss bars this frame, or 0 when none are shown. */
	public static int bottom(Minecraft minecraft, int guiHeight) {
		if (minecraft.player == null || !DungeonDimension.isDungeon(minecraft.player.level())) {
			return 0;
		}
		int count = ((BossHealthOverlayAccessor) minecraft.gui.getBossOverlay()).abyssal_descent$events().size();
		if (count == 0) {
			return 0;
		}
		int y = 16;
		int shown = 0;
		while (shown < count && y < guiHeight / 3) {
			shown++;
			y += 26;
		}
		return 16 + (shown - 1) * 26 + BAR_HEIGHT + 4;
	}

	/** Left edge of the bars in GUI coordinates. */
	public static int left(int guiWidth) {
		return guiWidth / 2 - WIDTH / 2 - 4;
	}

	@Nullable
	private static DungeonBossEntity findBoss(Minecraft minecraft, Component name) {
		if (minecraft.level == null || minecraft.player == null) {
			return null;
		}
		String wanted = name.getString();
		DungeonBossEntity best = null;
		double bestDist = Double.MAX_VALUE;
		for (var entity : minecraft.level.entitiesForRendering()) {
			if (entity instanceof DungeonBossEntity boss && boss.getDisplayName().getString().equals(wanted)) {
				double d = boss.distanceToSqr(minecraft.player);
				if (d < bestDist) {
					bestDist = d;
					best = boss;
				}
			}
		}
		return best;
	}
}
