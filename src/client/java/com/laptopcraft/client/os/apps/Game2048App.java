package com.laptopcraft.client.os.apps;

import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import org.lwjgl.glfw.GLFW;

/** Block 2048: merge materials from dirt all the way to a nether star. */
public class Game2048App extends KitApp {
	private static final Item[] TIERS = {Items.DIRT, Items.COBBLESTONE, Items.COAL, Items.COPPER_INGOT, Items.IRON_INGOT, Items.GOLD_INGOT, Items.REDSTONE,
			Items.LAPIS_LAZULI, Items.EMERALD, Items.DIAMOND, Items.NETHERITE_INGOT, Items.NETHER_STAR};
	private static final int[] COLORS = {0xFF8D6E63, 0xFF9E9E9E, 0xFF424242, 0xFFE0794A, 0xFFD8D8D8, 0xFFF9D648, 0xFFD32F2F, 0xFF3F51B5, 0xFF2ECC71,
			0xFF4DD0E1, 0xFF5D4E4E, 0xFFFFF59D};
	private final Random rng = new Random();
	private int[] grid = new int[16]; // exponent: 0 empty, 1 = 2, 2 = 4, ...
	private int[] undo;
	private int undoScore;
	private int score;
	private boolean won, keepGoing, over;
	private final long[] popAt = new long[16];
	private long moveAt;
	private double dragX, dragY;
	private boolean dragging;

	@Override
	public void init() {
		int[] saved = ctx.appState().getIntArray("grid").orElse(null);
		if (saved != null && saved.length == 16) {
			grid = saved;
			score = ctx.appState().getIntOr("score", 0);
		} else {
			newGame();
		}
	}

	private void newGame() {
		grid = new int[16];
		score = 0;
		won = keepGoing = over = false;
		undo = null;
		spawn();
		spawn();
		save();
	}

	private void save() {
		ctx.appState().putIntArray("grid", grid.clone());
		ctx.appState().putInt("score", score);
		int best = ctx.appState().getIntOr("best", 0);
		if (score > best) {
			ctx.appState().putInt("best", score);
		}
		ctx.saveAppState();
	}

	private void spawn() {
		List<Integer> empty = new ArrayList<>();
		for (int i = 0; i < 16; i++) {
			if (grid[i] == 0) {
				empty.add(i);
			}
		}
		if (!empty.isEmpty()) {
			int i = empty.get(rng.nextInt(empty.size()));
			grid[i] = rng.nextInt(10) == 0 ? 2 : 1;
			popAt[i] = Ease.now();
		}
	}

	/** dir: 0 left, 1 right, 2 up, 3 down. */
	private void move(int dir) {
		if (over || won && !keepGoing) {
			return;
		}
		int[] before = grid.clone();
		int beforeScore = score;
		boolean moved = false;
		for (int line = 0; line < 4; line++) {
			int[] idx = new int[4];
			for (int k = 0; k < 4; k++) {
				int p = dir == 0 || dir == 2 ? k : 3 - k;
				idx[k] = dir <= 1 ? line * 4 + p : p * 4 + line;
			}
			int[] vals = new int[4];
			int n = 0;
			for (int k = 0; k < 4; k++) {
				if (grid[idx[k]] != 0) {
					vals[n++] = grid[idx[k]];
				}
			}
			int[] out = new int[4];
			int o = 0;
			for (int k = 0; k < n; k++) {
				if (k + 1 < n && vals[k] == vals[k + 1]) {
					out[o] = vals[k] + 1;
					score += 1 << out[o];
					popAt[idx[o]] = Ease.now();
					if (out[o] >= 11 && !won) {
						won = true;
					}
					k++;
				} else {
					out[o] = vals[k];
				}
				o++;
			}
			for (int k = 0; k < 4; k++) {
				if (grid[idx[k]] != out[k]) {
					moved = true;
				}
				grid[idx[k]] = out[k];
			}
		}
		if (moved) {
			undo = before;
			undoScore = beforeScore;
			moveAt = Ease.now();
			spawn();
			ctx.playSound(SoundEvents.STONE_PLACE, 1.2f + rng.nextFloat() * 0.2f);
			over = !canMove();
			save();
			if (won && !keepGoing) {
				ctx.playSound(SoundEvents.PLAYER_LEVELUP, 1f);
			}
		}
	}

	private boolean canMove() {
		for (int i = 0; i < 16; i++) {
			if (grid[i] == 0 || i % 4 < 3 && grid[i] == grid[i + 1] || i < 12 && grid[i] == grid[i + 4]) {
				return true;
			}
		}
		return false;
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Gfx.rect(g, 0, 0, w, h, 0xFF2B2B2B);
		Gfx.textScaled(g, "2048", 8, 6, 2f, 0xFFF9D648);
		int best = Math.max(score, ctx.appState().getIntOr("best", 0));
		box(g, w - 116, 4, 54, "SCORE", score);
		box(g, w - 58, 4, 54, "BEST", best);
		button(g, 8, 26, 50, 14, "New", true, this::newGame);
		button(g, 62, 26, 50, 14, "Undo", false, () -> {
			if (undo != null) {
				grid = undo;
				score = undoScore;
				undo = null;
				over = false;
				save();
			}
		});
		int top = 46;
		int size = Math.min(w - 16, h - top - 6);
		int bx = (w - size) / 2, by = top;
		Gfx.roundRect(g, bx, by, size, size, 6, 0xFF3C3A36);
		int gap = Math.max(3, size / 50);
		int cell = (size - gap * 5) / 4;
		for (int i = 0; i < 16; i++) {
			int x = bx + gap + (i % 4) * (cell + gap), y = by + gap + (i / 4) * (cell + gap);
			int v = grid[i];
			if (v == 0) {
				Gfx.roundRect(g, x, y, cell, cell, 4, 0xFF4A4741);
				continue;
			}
			float pop = Ease.clamp01((Ease.now() - popAt[i]) / 160f);
			float s = pop < 1 ? 0.8f + 0.3f * Ease.outBack(pop) * (pop < 0.6f ? 1 : 1) : 1f;
			s = Math.min(1.1f, Math.max(0.8f, s));
			int cs = (int) (cell * s);
			int ox = x + (cell - cs) / 2, oy = y + (cell - cs) / 2;
			int tier = Math.min(TIERS.length - 1, v - 1);
			int col = COLORS[tier];
			Gfx.roundRect(g, ox, oy, cs, cs, 4, Gfx.darken(col, 0.45f));
			Gfx.roundRect(g, ox + 2, oy + 2, cs - 4, cs - 4, 3, Gfx.darken(col, 0.25f));
			float scale = Math.max(1f, (cs - 14) / 16f);
			scale = Math.min(scale, 3f);
			int is = (int) (16 * scale);
			Gfx.itemScaled(g, new ItemStack(TIERS[tier]), ox + (cs - is) / 2, oy + (cs - is) / 2 - 3, scale);
			String num = String.valueOf(1 << v);
			Gfx.textCentered(g, num, ox + cs / 2, oy + cs - 11, 0xFFFFFFFF);
		}
		if (over || won && !keepGoing) {
			Gfx.roundRect(g, bx, by, size, size, 6, 0xAA000000);
			Gfx.textCenteredScaled(g, over ? "No more moves!" : "Nether Star tier!", w / 2, by + size / 2 - 24, 2f, 0xFFFFFFFF);
			if (won && !keepGoing) {
				button(g, w / 2 - 74, by + size / 2, 70, 16, "Keep going", true, () -> keepGoing = true);
				button(g, w / 2 + 4, by + size / 2, 70, 16, "New game", false, this::newGame);
			} else {
				button(g, w / 2 - 35, by + size / 2, 70, 16, "Try again", true, this::newGame);
			}
		}
	}

	private void box(GuiGraphics g, int x, int y, int w, String label, int value) {
		Gfx.roundRect(g, x, y, w, 20, 4, 0xFF3C3A36);
		Gfx.textCentered(g, label, x + w / 2, y + 2, 0xFFBDB6A8);
		Gfx.textCentered(g, Gfx.formatNumber(value), x + w / 2, y + 11, 0xFFFFFFFF);
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		switch (key) {
			case GLFW.GLFW_KEY_LEFT, GLFW.GLFW_KEY_A -> move(0);
			case GLFW.GLFW_KEY_RIGHT, GLFW.GLFW_KEY_D -> move(1);
			case GLFW.GLFW_KEY_UP, GLFW.GLFW_KEY_W -> move(2);
			case GLFW.GLFW_KEY_DOWN, GLFW.GLFW_KEY_S -> move(3);
			default -> {
				return false;
			}
		}
		return true;
	}

	@Override
	public boolean mouseClicked(double x, double y, int button) {
		if (super.mouseClicked(x, y, button)) {
			return true;
		}
		dragging = true;
		dragX = x;
		dragY = y;
		return true;
	}

	@Override
	public boolean mouseReleased(double x, double y, int button) {
		if (dragging) {
			dragging = false;
			double ddx = x - dragX, ddy = y - dragY;
			if (Math.max(Math.abs(ddx), Math.abs(ddy)) > 12) {
				move(Math.abs(ddx) > Math.abs(ddy) ? (ddx < 0 ? 0 : 1) : (ddy < 0 ? 2 : 3));
			}
		}
		return super.mouseReleased(x, y, button);
	}
}
