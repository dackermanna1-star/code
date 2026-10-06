package com.laptopcraft.gametest;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.Minecraft;
import net.minecraft.world.level.GameType;
import org.lwjgl.glfw.GLFW;

/**
 * Dev-only screenshot harness built on Fabric's client game tests. It launches the real client,
 * creates a creative flat world with a laptop in front of the player and then runs a script.
 *
 * <p>The script is read from the file named by the {@code laptopcraft.scriptFile} system property
 * (default {@code build/lc-script.txt}). One step per line (or separated by ';'). Coordinates are
 * GUI coordinates (the harness uses a 1600x900 window with GUI scale 2, i.e. an 800x450 GUI).
 * <pre>
 *   use                      right-click the laptop the player is looking at (opens CubeOS)
 *   wait:20                  wait N client ticks
 *   shot:name                screenshot, copied to build/lc-shots/name.png
 *   click:x,y[,button]       move + click (button 0=left, 1=right)
 *   dclick:x,y               double click
 *   move:x,y                 move the cursor (hover)
 *   drag:x1,y1,x2,y2         left-drag
 *   scroll:x,y,amount        mouse wheel at a position
 *   type:text                type characters
 *   key:enter                press a key (enter, escape, backspace, delete, tab, up, down, left, right, home, end, f1..f12, a..z)
 *   ctrl:c                   press ctrl + key
 *   cmd:time set noon        run a server command (no leading slash)
 *   dev:open notepad         call com.laptopcraft.client.os.DevHooks.run("open notepad") on the client thread
 *   gui:3                    change GUI scale (1-4); default 2
 * </pre>
 */
public class ScreenshotHarness implements FabricClientGameTest {
	private int guiScale = 2;

	@Override
	public void runTest(ClientGameTestContext context) {
		Path scriptFile = Path.of(System.getProperty("laptopcraft.scriptFile", "build/lc-script.txt"));
		Path shotDir = scriptFile.toAbsolutePath().getParent().resolve("lc-shots");
		List<String> steps = readScript(scriptFile);

		context.getInput().resizeWindow(1600, 900);
		context.runOnClient(mc -> mc.options.guiScale().set(guiScale));

		try (TestSingleplayerContext world = context.worldBuilder()
				.adjustSettings(s -> s.setGameMode(net.minecraft.client.gui.screens.worldselection.WorldCreationUiState.SelectedGameMode.CREATIVE))
				.create()) {
			world.getClientWorld().waitForChunksRender();
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("gamerule advance_time false");
			world.getServer().runCommand("weather clear");
			// Player stands at the world spawn of the flat test world; put a laptop on a table in front.
			world.getServer().runCommand("tp @p 0.5 -60 0.5 180 35");
			world.getServer().runCommand("setblock 0 -60 -1 minecraft:oak_planks");
			world.getServer().runCommand("setblock 0 -59 -1 laptopcraft:laptop[facing=south]");
			context.waitTicks(10);
			world.getClientWorld().waitForChunksRender();

			for (String raw : steps) {
				String step = raw.trim();
				if (step.isEmpty() || step.startsWith("#")) {
					continue;
				}
				System.out.println("[LC-HARNESS] step: " + step);
				try {
					runStep(context, world, step, shotDir);
				} catch (Throwable t) {
					System.out.println("[LC-HARNESS] step failed: " + step + " -> " + t);
					t.printStackTrace(System.out);
				}
			}
		}
	}

	private void runStep(ClientGameTestContext context, TestSingleplayerContext world, String step, Path shotDir) throws Exception {
		int colon = step.indexOf(':');
		String op = (colon < 0 ? step : step.substring(0, colon)).toLowerCase(Locale.ROOT);
		String arg = colon < 0 ? "" : step.substring(colon + 1);
		switch (op) {
			case "use" -> {
				context.getInput().pressMouse(GLFW.GLFW_MOUSE_BUTTON_RIGHT);
				context.waitTicks(5);
			}
			case "wait" -> context.waitTicks(Integer.parseInt(arg.trim()));
			case "shot" -> {
				Path p = context.takeScreenshot(arg.trim());
				Files.createDirectories(shotDir);
				Path dst = shotDir.resolve(arg.trim() + ".png");
				Files.copy(p, dst, StandardCopyOption.REPLACE_EXISTING);
				System.out.println("[LC-HARNESS] screenshot: " + dst.toAbsolutePath());
			}
			case "click" -> {
				int[] v = ints(arg);
				cursor(context, v[0], v[1]);
				context.getInput().pressMouse(v.length > 2 ? v[2] : 0);
				context.waitTicks(2);
			}
			case "dclick" -> {
				int[] v = ints(arg);
				cursor(context, v[0], v[1]);
				context.getInput().pressMouse(0);
				context.getInput().pressMouse(0);
				context.waitTicks(2);
			}
			case "move" -> {
				int[] v = ints(arg);
				cursor(context, v[0], v[1]);
				context.waitTicks(1);
			}
			case "drag" -> {
				int[] v = ints(arg);
				cursor(context, v[0], v[1]);
				context.getInput().holdMouse(0);
				context.waitTick();
				for (int i = 1; i <= 8; i++) {
					cursor(context, v[0] + (v[2] - v[0]) * i / 8.0, v[1] + (v[3] - v[1]) * i / 8.0);
					context.waitTick();
				}
				context.getInput().releaseMouse(0);
				context.waitTicks(2);
			}
			case "scroll" -> {
				int[] v = ints(arg);
				cursor(context, v[0], v[1]);
				context.getInput().scroll(v[2]);
				context.waitTicks(2);
			}
			case "type" -> {
				context.getInput().typeChars(arg);
				context.waitTicks(2);
			}
			case "key" -> {
				context.getInput().pressKey(keyCode(arg));
				context.waitTicks(2);
			}
			case "ctrl" -> {
				context.getInput().holdControl();
				context.getInput().pressKey(keyCode(arg));
				context.getInput().releaseControl();
				context.waitTicks(2);
			}
			case "cmd" -> {
				world.getServer().runCommand(arg);
				context.waitTicks(2);
			}
			case "dev" -> {
				context.runOnClient(mc -> {
					Class<?> hooks = Class.forName("com.laptopcraft.client.os.DevHooks");
					Method run = hooks.getMethod("run", String.class);
					run.invoke(null, arg);
				});
				context.waitTicks(2);
			}
			case "gui" -> {
				guiScale = Integer.parseInt(arg.trim());
				context.runOnClient(mc -> {
					mc.options.guiScale().set(guiScale);
					mc.resizeDisplay();
				});
				context.waitTicks(2);
			}
			default -> System.out.println("[LC-HARNESS] unknown step: " + step);
		}
	}

	private void cursor(ClientGameTestContext context, double guiX, double guiY) {
		double scale = context.computeOnClient(mc -> mc.getWindow().getGuiScale());
		context.getInput().setCursorPos(guiX * scale, guiY * scale);
	}

	private static int[] ints(String s) {
		String[] parts = s.split(",");
		int[] out = new int[parts.length];
		for (int i = 0; i < parts.length; i++) {
			out[i] = Integer.parseInt(parts[i].trim());
		}
		return out;
	}

	private static int keyCode(String name) {
		String n = name.trim().toLowerCase(Locale.ROOT);
		return switch (n) {
			case "enter", "return" -> GLFW.GLFW_KEY_ENTER;
			case "escape", "esc" -> GLFW.GLFW_KEY_ESCAPE;
			case "backspace" -> GLFW.GLFW_KEY_BACKSPACE;
			case "delete" -> GLFW.GLFW_KEY_DELETE;
			case "tab" -> GLFW.GLFW_KEY_TAB;
			case "up" -> GLFW.GLFW_KEY_UP;
			case "down" -> GLFW.GLFW_KEY_DOWN;
			case "left" -> GLFW.GLFW_KEY_LEFT;
			case "right" -> GLFW.GLFW_KEY_RIGHT;
			case "home" -> GLFW.GLFW_KEY_HOME;
			case "end" -> GLFW.GLFW_KEY_END;
			case "space" -> GLFW.GLFW_KEY_SPACE;
			default -> {
				if (n.length() == 1 && n.charAt(0) >= 'a' && n.charAt(0) <= 'z') {
					yield GLFW.GLFW_KEY_A + (n.charAt(0) - 'a');
				}
				if (n.length() == 1 && n.charAt(0) >= '0' && n.charAt(0) <= '9') {
					yield GLFW.GLFW_KEY_0 + (n.charAt(0) - '0');
				}
				if (n.startsWith("f") && n.length() <= 3) {
					yield GLFW.GLFW_KEY_F1 + Integer.parseInt(n.substring(1)) - 1;
				}
				throw new IllegalArgumentException("Unknown key: " + name);
			}
		};
	}

	private static List<String> readScript(Path file) {
		List<String> out = new ArrayList<>();
		try {
			if (Files.exists(file)) {
				for (String line : Files.readAllLines(file)) {
					for (String part : line.split(";")) {
						out.add(part);
					}
				}
			}
		} catch (IOException e) {
			System.out.println("[LC-HARNESS] could not read script " + file + ": " + e);
		}
		if (out.isEmpty()) {
			out.add("wait:20");
			out.add("shot:world");
			out.add("use");
			out.add("wait:100");
			out.add("shot:laptop");
		}
		return out;
	}
}
