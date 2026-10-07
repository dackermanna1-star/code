package com.laptopcraft.client.os.apps;

import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Gfx;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Random;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import org.lwjgl.glfw.GLFW;

/** Snake, eating apples on a grass field. Golden apples are worth 5. */
public class SnakeApp extends KitApp {
	private static final int GW = 20, GH = 16;
	private final List<int[]> body = new ArrayList<>();
	private final Deque<int[]> inputs = new ArrayDeque<>();
	private final Random rng = new Random();
	private int dx = 1, dy;
	private int[] apple = {10, 8};
	private boolean golden;
	private int score;
	private boolean running, over, paused;
	private int tickCounter;

	@Override
	public void init() {
		restart();
		running = false;
	}

	private void restart() {
		body.clear();
		for (int i = 0; i < 4; i++) {
			body.add(new int[] {6 - i, GH / 2});
		}
		dx = 1;
		dy = 0;
		inputs.clear();
		score = 0;
		over = false;
		paused = false;
		running = true;
		spawnApple();
	}

	private void spawnApple() {
		for (int tries = 0; tries < 500; tries++) {
			int x = rng.nextInt(GW), y = rng.nextInt(GH);
			boolean free = body.stream().noneMatch(b -> b[0] == x && b[1] == y);
			if (free) {
				apple = new int[] {x, y};
				golden = rng.nextInt(8) == 0;
				return;
			}
		}
	}

	private int speedTicks() {
		return Math.max(2, 5 - score / 10);
	}

	@Override
	public void tick() {
		super.tick();
		if (!running || over || paused) {
			return;
		}
		if (++tickCounter < speedTicks()) {
			return;
		}
		tickCounter = 0;
		if (!inputs.isEmpty()) {
			int[] d = inputs.poll();
			dx = d[0];
			dy = d[1];
		}
		int[] head = body.get(0);
		int nx = head[0] + dx, ny = head[1] + dy;
		if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || body.stream().limit(body.size() - 1).anyMatch(b -> b[0] == nx && b[1] == ny)) {
			over = true;
			ctx.playSound(SoundEvents.PLAYER_HURT, 1f);
			int best = ctx.appState().getIntOr("best", 0);
			if (score > best) {
				ctx.appState().putInt("best", score);
				ctx.saveAppState();
			}
			return;
		}
		body.add(0, new int[] {nx, ny});
		if (nx == apple[0] && ny == apple[1]) {
			score += golden ? 5 : 1;
			ctx.playSound(golden ? SoundEvents.PLAYER_LEVELUP : SoundEvents.GENERIC_EAT.value(), 1.4f);
			if (golden) {
				for (int i = 0; i < 2; i++) {
					body.add(body.get(body.size() - 1).clone());
				}
			}
			spawnApple();
		} else {
			body.remove(body.size() - 1);
		}
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Gfx.rect(g, 0, 0, w, h, 0xFF2D3B22);
		int top = 16;
		Gfx.text(g, "Score " + score, 6, 4, 0xFFFFFFFF);
		Gfx.textRight(g, "Best " + Math.max(score, ctx.appState().getIntOr("best", 0)), w - 6, 4, 0xFFC5E1A5);
		int cell = Math.max(4, Math.min((w - 8) / GW, (h - top - 4) / GH));
		int bx = (w - cell * GW) / 2, by = top + (h - top - 4 - cell * GH) / 2;
		for (int y = 0; y < GH; y++) {
			for (int x = 0; x < GW; x++) {
				Gfx.rect(g, bx + x * cell, by + y * cell, cell, cell, (x + y) % 2 == 0 ? 0xFF7CB342 : 0xFF74A93E);
			}
		}
		Gfx.itemScaled(g, new ItemStack(golden ? Items.GOLDEN_APPLE : Items.APPLE), bx + apple[0] * cell, by + apple[1] * cell, cell / 16f);
		for (int i = body.size() - 1; i >= 0; i--) {
			int[] b = body.get(i);
			int c = i == 0 ? 0xFF1E88E5 : (i % 2 == 0 ? 0xFF42A5F5 : 0xFF2196F3);
			Gfx.roundRect(g, bx + b[0] * cell, by + b[1] * cell, cell, cell, Math.max(1, cell / 4), c);
			if (i == 0) {
				int ex = bx + b[0] * cell, ey = by + b[1] * cell;
				int e = Math.max(1, cell / 5);
				Gfx.rect(g, ex + cell / 4, ey + cell / 4, e, e, 0xFFFFFFFF);
				Gfx.rect(g, ex + cell * 3 / 4 - e, ey + cell / 4, e, e, 0xFFFFFFFF);
			}
		}
		if (!running || over || paused) {
			Gfx.rect(g, bx, by, cell * GW, cell * GH, 0x99000000);
			String title = over ? "Game over!" : paused ? "Paused" : "SNAKE";
			Gfx.textCenteredScaled(g, title, w / 2, by + cell * GH / 2 - 22, 2f, 0xFFFFFFFF);
			String sub = over ? "Score " + score + " — click or press Space" : paused ? "Press P to resume" : "Arrows / WASD to move — click to start";
			Gfx.textCentered(g, sub, w / 2, by + cell * GH / 2 + 2, 0xFFE0E0E0);
			region(g, bx, by, cell * GW, cell * GH, this::restart);
		}
	}

	private void turn(int ndx, int ndy) {
		int[] last = inputs.isEmpty() ? new int[] {dx, dy} : inputs.peekLast();
		if (last[0] == -ndx && last[1] == -ndy || last[0] == ndx && last[1] == ndy || inputs.size() > 2) {
			return;
		}
		inputs.add(new int[] {ndx, ndy});
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		switch (key) {
			case GLFW.GLFW_KEY_UP, GLFW.GLFW_KEY_W -> turn(0, -1);
			case GLFW.GLFW_KEY_DOWN, GLFW.GLFW_KEY_S -> turn(0, 1);
			case GLFW.GLFW_KEY_LEFT, GLFW.GLFW_KEY_A -> turn(-1, 0);
			case GLFW.GLFW_KEY_RIGHT, GLFW.GLFW_KEY_D -> turn(1, 0);
			case GLFW.GLFW_KEY_P -> paused = !paused && running && !over;
			case GLFW.GLFW_KEY_SPACE, GLFW.GLFW_KEY_ENTER -> {
				if (!running || over) {
					restart();
				} else {
					paused = !paused;
				}
			}
			default -> {
				return false;
			}
		}
		if (!running && !over) {
			running = true;
		}
		return true;
	}

	@Override
	public void onClose() {
		running = false;
	}
}
