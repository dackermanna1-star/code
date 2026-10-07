package com.laptopcraft.client.os.apps;

import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Random;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.sounds.SoundEvents;

/** Creeper Sweeper — minesweeper where the mines hiss. */
public class CreeperSweeperApp extends KitApp {
	private static final String[] LEVELS = {"Beginner", "Intermediate", "Expert"};
	private static final int[][] SIZES = {{9, 9, 10}, {16, 16, 40}, {30, 16, 99}};
	private static final int[] NUM_COLORS = {0, 0xFF1976D2, 0xFF388E3C, 0xFFD32F2F, 0xFF7B1FA2, 0xFFFF8F00, 0xFF0097A7, 0xFF212121, 0xFF757575};
	private int level;
	private int cols, rows, mines;
	private boolean[] mine, open, flag;
	private int[] count;
	private boolean started, lost, won;
	private long startMs, endMs, lostAt;
	private int explodedIdx = -1;

	@Override
	public void init() {
		level = Math.min(2, ctx.appState().getIntOr("level", 0));
		reset();
	}

	private void reset() {
		cols = SIZES[level][0];
		rows = SIZES[level][1];
		mines = SIZES[level][2];
		int n = cols * rows;
		mine = new boolean[n];
		open = new boolean[n];
		flag = new boolean[n];
		count = new int[n];
		started = lost = won = false;
		explodedIdx = -1;
	}

	private void place(int safe) {
		Random r = new Random();
		int sx = safe % cols, sy = safe / cols;
		int placed = 0;
		while (placed < mines) {
			int i = r.nextInt(cols * rows);
			int x = i % cols, y = i / cols;
			if (mine[i] || Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) {
				continue;
			}
			mine[i] = true;
			placed++;
		}
		for (int i = 0; i < cols * rows; i++) {
			int x = i % cols, y = i / cols, c = 0;
			for (int dy = -1; dy <= 1; dy++) {
				for (int dx = -1; dx <= 1; dx++) {
					int nx = x + dx, ny = y + dy;
					if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && mine[ny * cols + nx]) {
						c++;
					}
				}
			}
			count[i] = c;
		}
		started = true;
		startMs = Ease.now();
	}

	private void reveal(int i) {
		if (lost || won || flag[i] || open[i] && count[i] == 0) {
			return;
		}
		if (!started) {
			place(i);
		}
		if (open[i]) {
			chord(i);
			return;
		}
		if (mine[i]) {
			boom(i);
			return;
		}
		Deque<Integer> q = new ArrayDeque<>();
		q.add(i);
		while (!q.isEmpty()) {
			int c = q.poll();
			if (open[c] || flag[c]) {
				continue;
			}
			open[c] = true;
			if (count[c] == 0) {
				int x = c % cols, y = c / cols;
				for (int dy = -1; dy <= 1; dy++) {
					for (int dx = -1; dx <= 1; dx++) {
						int nx = x + dx, ny = y + dy;
						if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) {
							q.add(ny * cols + nx);
						}
					}
				}
			}
		}
		checkWin();
	}

	private void chord(int i) {
		int x = i % cols, y = i / cols, flags = 0;
		for (int dy = -1; dy <= 1; dy++) {
			for (int dx = -1; dx <= 1; dx++) {
				int nx = x + dx, ny = y + dy;
				if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && flag[ny * cols + nx]) {
					flags++;
				}
			}
		}
		if (flags != count[i]) {
			return;
		}
		for (int dy = -1; dy <= 1; dy++) {
			for (int dx = -1; dx <= 1; dx++) {
				int nx = x + dx, ny = y + dy;
				if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !open[ny * cols + nx] && !flag[ny * cols + nx]) {
					reveal(ny * cols + nx);
				}
			}
		}
	}

	private void boom(int i) {
		lost = true;
		explodedIdx = i;
		lostAt = Ease.now();
		endMs = Ease.now();
		for (int k = 0; k < mine.length; k++) {
			if (mine[k]) {
				open[k] = true;
			}
		}
		ctx.playSound(SoundEvents.CREEPER_PRIMED, 1f);
		ctx.playSound(SoundEvents.GENERIC_EXPLODE.value(), 1.2f);
	}

	private void checkWin() {
		for (int k = 0; k < mine.length; k++) {
			if (!mine[k] && !open[k]) {
				return;
			}
		}
		won = true;
		endMs = Ease.now();
		long secs = (endMs - startMs) / 1000;
		String key = "best" + level;
		int best = ctx.appState().getIntOr(key, 0);
		if (best == 0 || secs < best) {
			ctx.appState().putInt(key, (int) Math.max(1, secs));
			ctx.saveAppState();
		}
		ctx.notify("success", "You cleared the field!", LEVELS[level] + " in " + secs + "s" + (best == 0 || secs < best ? " — new record!" : ""));
		ctx.playSound(SoundEvents.PLAYER_LEVELUP, 1f);
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Gfx.rect(g, 0, 0, w, h, 0xFF3B4A33);
		// top bar
		int flags = 0;
		for (boolean f : flag) {
			if (f) {
				flags++;
			}
		}
		Gfx.roundRect(g, 4, 4, 40, 16, 3, 0xFF111111);
		Gfx.text(g, String.format("%03d", Math.max(-99, mines - flags)), 10, 8, 0xFFFF3B30);
		long secs = !started ? 0 : ((lost || won ? endMs : Ease.now()) - startMs) / 1000;
		Gfx.roundRect(g, w - 44, 4, 40, 16, 3, 0xFF111111);
		Gfx.text(g, String.format("%03d", Math.min(999, secs)), w - 38, 8, 0xFFFF3B30);
		// face button
		int fx = w / 2 - 9;
		boolean fh = region(g, fx, 3, 18, 18, this::reset);
		Gfx.roundRect(g, fx, 3, 18, 18, 3, fh ? 0xFF66BB6A : 0xFF4CAF50);
		face(g, fx + 3, 6, lost ? 2 : won ? 3 : 0);
		String lvl = LEVELS[level] + " ▾";
		boolean lh = region(g, 50, 6, Gfx.width(lvl) + 4, 12, () -> {
			level = (level + 1) % 3;
			ctx.appState().putInt("level", level);
			ctx.saveAppState();
			reset();
		});
		if (fx > 50 + Gfx.width(lvl) + 6) {
			Gfx.text(g, lvl, 52, 8, lh ? 0xFFFFFFFF : 0xFFC8E6C9);
		}
		// board
		int top = 26;
		int cell = Math.max(6, Math.min((w - 8) / cols, (h - top - 4) / rows));
		int bw = cell * cols, bh = cell * rows;
		int bx = (w - bw) / 2, by = top + Math.max(0, (h - top - 4 - bh) / 2);
		float shake = lost ? Math.max(0, 1 - (Ease.now() - lostAt) / 500f) : 0;
		bx += (int) (Math.sin(Ease.now() / 20.0) * 3 * shake);
		for (int i = 0; i < cols * rows; i++) {
			int x = bx + (i % cols) * cell, y = by + (i / cols) * cell;
			int idx = i;
			boolean hov = region(g, x, y, cell, cell, () -> reveal(idx));
			rightRegion(x, y, cell, cell, () -> {
				if (!open[idx] && !lost && !won) {
					flag[idx] = !flag[idx];
				}
			});
			if (open[i]) {
				Gfx.rect(g, x, y, cell, cell, i == explodedIdx ? 0xFFE53935 : ((i % cols + i / cols) % 2 == 0 ? 0xFFD7C9A7 : 0xFFCDBF9C));
				if (mine[i]) {
					creeperFace(g, x + 1, y + 1, cell - 2);
				} else if (count[i] > 0) {
					Gfx.textCentered(g, String.valueOf(count[i]), x + cell / 2 + 1, y + (cell - 8) / 2 + 1, NUM_COLORS[count[i]]);
				}
			} else {
				int base = (i % cols + i / cols) % 2 == 0 ? 0xFF7CB342 : 0xFF6FA23A;
				Gfx.rect(g, x, y, cell, cell, hov && !lost && !won ? Gfx.lighten(base, 0.15f) : base);
				Gfx.rect(g, x, y, cell, 1, Gfx.lighten(base, 0.2f));
				if (flag[i]) {
					Gfx.rect(g, x + cell / 2 - 1, y + 2, 1, cell - 4, 0xFF5D4037);
					Gfx.rect(g, x + cell / 2, y + 2, Math.max(2, cell / 3), Math.max(2, cell / 4), 0xFFE53935);
				}
			}
		}
		if (lost && Ease.now() - lostAt < 700) {
			float p = (Ease.now() - lostAt) / 700f;
			int ex = bx + (explodedIdx % cols) * cell + cell / 2, ey = by + (explodedIdx / cols) * cell + cell / 2;
			int r = (int) (p * 60);
			Gfx.roundRect(g, ex - r, ey - r, r * 2, r * 2, r, Gfx.withAlpha(0xFFFFFFFF, (int) (200 * (1 - p))));
		}
		if (won || lost) {
			String msg = won ? "Field cleared!" : "Ssss… BOOM! Click the creeper to retry";
			int mw = Gfx.width(msg) + 16;
			Gfx.roundRect(g, (w - mw) / 2, h - 20, mw, 16, 4, 0xCC000000);
			Gfx.textCentered(g, msg, w / 2, h - 16, won ? 0xFF81C784 : 0xFFFF8A80);
		}
		int best = ctx.appState().getIntOr("best" + level, 0);
		if (best > 0 && w > 220) {
			Gfx.textRight(g, "Best " + best + "s", w - 50, 8, 0xFFC8E6C9);
		}
	}

	private void face(GuiGraphics g, int x, int y, int mood) {
		Gfx.rect(g, x, y, 12, 12, 0xFF2E7D32);
		if (mood == 3) {
			Gfx.rect(g, x + 1, y + 3, 10, 2, 0xFF111111);
		} else {
			Gfx.rect(g, x + 2, y + 2, 3, 3, 0xFF111111);
			Gfx.rect(g, x + 7, y + 2, 3, 3, 0xFF111111);
		}
		if (mood == 2) {
			Gfx.rect(g, x + 4, y + 6, 4, 5, 0xFF111111);
		} else {
			Gfx.rect(g, x + 5, y + 5, 2, 3, 0xFF111111);
			Gfx.rect(g, x + 3, y + 7, 2, 4, 0xFF111111);
			Gfx.rect(g, x + 7, y + 7, 2, 4, 0xFF111111);
		}
	}

	private static void creeperFace(GuiGraphics g, int x, int y, int s) {
		int u = Math.max(1, s / 8);
		Gfx.rect(g, x, y, s, s, 0xFF4CAF50);
		Gfx.rect(g, x + u, y + u * 2, u * 2, u * 2, 0xFF111111);
		Gfx.rect(g, x + u * 5, y + u * 2, u * 2, u * 2, 0xFF111111);
		Gfx.rect(g, x + u * 3, y + u * 4, u * 2, u * 3, 0xFF111111);
		Gfx.rect(g, x + u * 2, y + u * 5, u, u * 2, 0xFF111111);
		Gfx.rect(g, x + u * 5, y + u * 5, u, u * 2, 0xFF111111);
	}
}
