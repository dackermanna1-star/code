package com.chaosunleashed.client.dev;

import com.chaosunleashed.ChaosUnleashed;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.Element;
import net.minecraft.client.gui.screen.ChatScreen;
import net.minecraft.client.gui.widget.ClickableWidget;
import net.minecraft.client.input.MouseInput;
import net.minecraft.client.util.ScreenshotRecorder;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * DEVELOPMENT ONLY: scripted client actions for automated visual testing (screenshots of events, the Control
 * Panel GUI and the chat menu). Inactive unless the JVM is started with
 * {@code -Dchaosunleashed.autotest=<script file>}. Script commands, one per line:
 * <pre>
 * wait &lt;ticks&gt;  waitidle  waitphase &lt;WARNING|ACTIVE|AFTERMATH&gt;  cmd &lt;command&gt;        screenshot &lt;name&gt;      use &lt;x&gt; &lt;y&gt; &lt;z&gt;
 * sneak on|off          click &lt;button text&gt;  chat                    close
 * quit                   # comment
 * </pre>
 */
public final class AutoTest {
	private static final Deque<String> LINES = new ArrayDeque<>();
	private static int waitTicks;
	/** Non-null while waiting for a condition ("idle" or a phase name); with a timeout in {@link #waitTicks}. */
	private static String waitFor;
	private static int worldTicks;

	private AutoTest() {
	}

	public static void init() {
		String script = System.getProperty("chaosunleashed.autotest");
		if (script == null || script.isBlank()) {
			return;
		}
		try {
			for (String line : Files.readAllLines(Path.of(script))) {
				String trimmed = line.strip();
				if (!trimmed.isEmpty() && !trimmed.startsWith("#")) {
					LINES.add(trimmed);
				}
			}
		} catch (IOException e) {
			ChaosUnleashed.LOGGER.error("AutoTest: cannot read {}", script, e);
			return;
		}
		ChaosUnleashed.LOGGER.info("AutoTest: loaded {} steps from {}", LINES.size(), script);
		ClientTickEvents.END_CLIENT_TICK.register(AutoTest::tick);
	}

	private static void tick(MinecraftClient client) {
		if (client.player == null || client.world == null) {
			return;
		}
		// Give the world a few seconds to load chunks before starting.
		if (worldTicks++ < 100) {
			return;
		}
		if (waitFor != null) {
			if (conditionMet(waitFor) || --waitTicks <= 0) {
				waitFor = null;
				waitTicks = 0;
			} else {
				return;
			}
		}
		if (waitTicks > 0) {
			waitTicks--;
			return;
		}
		while (!LINES.isEmpty() && waitTicks == 0 && waitFor == null) {
			String line = LINES.poll();
			ChaosUnleashed.LOGGER.info("AutoTest> {}", line);
			try {
				run(client, line);
			} catch (RuntimeException e) {
				ChaosUnleashed.LOGGER.error("AutoTest: step failed: {}", line, e);
			}
			if (line.startsWith("screenshot")) {
				break;
			}
		}
	}

	private static boolean conditionMet(String condition) {
		java.util.List<com.chaosunleashed.network.ChaosStatusPayload.EventInfo> events = com.chaosunleashed.client.ClientChaosState.events();
		if (condition.equals("idle")) {
			return events.isEmpty();
		}
		for (com.chaosunleashed.network.ChaosStatusPayload.EventInfo info : events) {
			if (com.chaosunleashed.core.EventPhase.byOrdinal(info.phase()).name().equals(condition)) {
				return true;
			}
		}
		return false;
	}

	private static int coord(String token, int base) {
		if (token.startsWith("~")) {
			return base + (token.length() > 1 ? Integer.parseInt(token.substring(1)) : 0);
		}
		return Integer.parseInt(token);
	}

	private static void run(MinecraftClient client, String line) {
		String[] parts = line.split(" ", 2);
		String arg = parts.length > 1 ? parts[1] : "";
		switch (parts[0]) {
			case "wait" -> waitTicks = Integer.parseInt(arg);
			case "waitidle" -> {
				waitFor = "idle";
				waitTicks = 6000;
			}
			case "waitphase" -> {
				waitFor = arg.toUpperCase(java.util.Locale.ROOT);
				waitTicks = 6000;
			}
			case "cmd" -> client.player.networkHandler.sendChatCommand(arg);
			case "screenshot" -> ScreenshotRecorder.saveScreenshot(client.runDirectory, "autotest_" + arg + ".png",
				client.getFramebuffer(), 1, text -> ChaosUnleashed.LOGGER.info("AutoTest: {}", text.getString()));
			case "use", "sneakuse" -> {
				String[] xyz = arg.split(" ");
				BlockPos origin = client.player.getBlockPos();
				BlockPos pos = new BlockPos(coord(xyz[0], origin.getX()), coord(xyz[1], origin.getY()), coord(xyz[2], origin.getZ()));
				client.interactionManager.interactBlock(client.player, Hand.MAIN_HAND,
					new BlockHitResult(Vec3d.ofCenter(pos), Direction.UP, pos, false));
			}
			case "click" -> {
				if (client.currentScreen != null) {
					for (Element element : client.currentScreen.children()) {
						if (element instanceof ClickableWidget widget && widget.getMessage().getString().contains(arg)) {
							client.currentScreen.mouseClicked(new Click(widget.getX() + widget.getWidth() / 2.0,
								widget.getY() + widget.getHeight() / 2.0, new MouseInput(0, 0)), false);
							break;
						}
					}
				}
			}
			case "sneak" -> client.options.sneakKey.setPressed(arg.equals("on"));
			case "chat" -> client.setScreen(new ChatScreen("", false));
			case "close" -> client.setScreen(null);
			case "quit" -> client.scheduleStop();
			default -> ChaosUnleashed.LOGGER.warn("AutoTest: unknown step {}", line);
		}
	}
}
