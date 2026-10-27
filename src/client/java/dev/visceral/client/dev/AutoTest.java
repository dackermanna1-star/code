package dev.visceral.client.dev;

import dev.visceral.Visceral;
import dev.visceral.client.anim.EntityAnimator;
import dev.visceral.client.camera.ShoulderCamera;
import dev.visceral.client.input.CombatInput;
import dev.visceral.client.physics.RagdollManager;
import dev.visceral.client.render.CorpseManager;
import dev.visceral.combat.AttackDef;
import dev.visceral.combat.Attacks;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

/**
 * Developer harness for headless visual testing. Enabled only when the environment variable
 * {@code VISCERAL_AUTOTEST} points to a script; does nothing in normal play.
 *
 * <p>Script lines: {@code wait N}, {@code cmd <server command>}, {@code shot <name>},
 * {@code camera first|back|front}, {@code look <yaw> <pitch>}, {@code orbit <yaw> <pitch>},
 * {@code anim <attack>}, {@code attack}, {@code kick}, {@code lockon}, {@code hold <key> <ticks>},
 * {@code log <text>}, {@code quit}.
 */
public final class AutoTest {
	private static final List<String> LINES = new ArrayList<>();
	private static int index;
	private static int waitTicks;
	private static boolean started;
	private static int holdTicks;
	private static KeyMapping heldKey;
	private static int menuTicks;
	private static int frames;
	private static int waitFrames;
	private static boolean worldRequested;

	private AutoTest() {
	}

	public static void init() {
		String script = System.getenv("VISCERAL_AUTOTEST");
		if (script == null || script.isBlank()) return;
		try {
			for (String line : Files.readAllLines(Path.of(script))) {
				line = line.strip();
				if (!line.isEmpty() && !line.startsWith("#")) LINES.add(line);
			}
		} catch (IOException e) {
			Visceral.LOGGER.error("AutoTest: cannot read {}", script, e);
			return;
		}
		Visceral.LOGGER.info("AutoTest: loaded {} steps from {}", LINES.size(), script);
		ClientTickEvents.END_CLIENT_TICK.register(AutoTest::tick);
		net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents.END_MAIN.register(ctx -> frames++);
	}

	private static void tick(Minecraft mc) {
		if (heldKey != null) {
			if (--holdTicks <= 0) {
				heldKey.setDown(false);
				heldKey = null;
			} else {
				heldKey.setDown(true);
			}
		}
		if (mc.player == null || mc.level == null) {
			if (!worldRequested && ++menuTicks > 60 && mc.getOverlay() == null) {
				worldRequested = true;
				openTestWorld(mc);
			}
			return;
		}
		if (!started) {
			started = true;
			waitTicks = 40;
			Visceral.LOGGER.info("AutoTest: world ready");
		}
		if (waitTicks > 0) {
			waitTicks--;
			return;
		}
		// Software rendering runs several ticks per frame: also wait for fresh frames.
		if (frames < waitFrames) return;
		while (index < LINES.size() && waitTicks == 0 && frames >= waitFrames) {
			String line = LINES.get(index++);
			try {
				run(mc, line);
			} catch (Exception e) {
				Visceral.LOGGER.error("AutoTest: step '{}' failed", line, e);
			}
		}
	}

	/** Opens (creating if needed) a superflat creative test world with cheats. */
	private static void openTestWorld(Minecraft mc) {
		String name = "visceral_test";
		if (mc.getLevelSource().levelExists(name)) {
			mc.createWorldOpenFlows().openWorld(name, () -> mc.setScreen(new TitleScreen()));
			return;
		}
		LevelSettings settings = new LevelSettings(name, GameType.CREATIVE, false, Difficulty.NORMAL, true,
			new GameRules(WorldDataConfiguration.DEFAULT.enabledFeatures()), WorldDataConfiguration.DEFAULT);
		mc.createWorldOpenFlows().createFreshLevel(name, settings, new WorldOptions(20251027L, false, false),
			WorldPresets::createFlatWorldDimensions, new TitleScreen());
	}

	private static void run(Minecraft mc, String line) {
		String[] p = line.split("\\s+", 2);
		String arg = p.length > 1 ? p[1] : "";
		Visceral.LOGGER.info("AutoTest> {}", line);
		switch (p[0]) {
			case "wait" -> {
				waitTicks = Integer.parseInt(arg);
				waitFrames = frames + 3;
			}
			case "cmd" -> {
				MinecraftServer server = mc.getSingleplayerServer();
				if (server != null) server.execute(() -> server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), arg));
			}
			case "shot" -> {
				File dir = mc.gameDirectory;
				Screenshot.grab(dir, arg + ".png", mc.getMainRenderTarget(), 1, msg -> Visceral.LOGGER.info("AutoTest: {}", msg.getString()));
			}
			case "camera" -> mc.options.setCameraType(switch (arg) {
				case "first" -> CameraType.FIRST_PERSON;
				case "front" -> CameraType.THIRD_PERSON_FRONT;
				default -> CameraType.THIRD_PERSON_BACK;
			});
			case "look" -> {
				String[] a = arg.split("\\s+");
				mc.player.setYRot(Float.parseFloat(a[0]));
				mc.player.setXRot(Float.parseFloat(a[1]));
				mc.player.setYBodyRot(Float.parseFloat(a[0]));
				mc.player.setYHeadRot(Float.parseFloat(a[0]));
			}
			case "orbit" -> {
				String[] a = arg.split("\\s+");
				ShoulderCamera.setView(Float.parseFloat(a[0]), Float.parseFloat(a[1]));
			}
			case "hud" -> mc.options.hideGui = arg.strip().equals("off");
			case "view" -> {
				if (arg.strip().equals("off")) {
					ShoulderCamera.setObserver(null, 1f);
				} else {
					String[] a = arg.split("\\s+");
					ShoulderCamera.setObserver(new net.minecraft.world.phys.Vec3(Float.parseFloat(a[0]), Float.parseFloat(a[1]), Float.parseFloat(a[2])),
						a.length > 3 ? Float.parseFloat(a[3]) : 1f);
				}
			}
			case "viewabs" -> {
				String[] a = arg.split("\\s+");
				ShoulderCamera.setObserverAbsolute(new net.minecraft.world.phys.Vec3(Double.parseDouble(a[0]), Double.parseDouble(a[1]), Double.parseDouble(a[2])),
					new net.minecraft.world.phys.Vec3(Double.parseDouble(a[3]), Double.parseDouble(a[4]), Double.parseDouble(a[5])));
			}
			case "pose" -> {
				String[] a = arg.split("\\s+");
				EntityAnimator.getOrCreate(mc.player).freezeAction(a[0], Float.parseFloat(a[1]));
			}
			case "clearchat" -> mc.gui.getChat().clearMessages(false);
			case "anim" -> {
				AttackDef def = Attacks.byName(arg.strip());
				if (def != null) EntityAnimator.getOrCreate(mc.player).playAttack(def, 1f);
				else EntityAnimator.getOrCreate(mc.player).playAction(arg.strip(), 1f);
			}
			case "attack" -> CombatInput.onAttackKey();
			case "kick" -> CombatInput.onKickKey();
			case "lockon" -> dev.visceral.client.input.LockOn.toggle();
			case "hold" -> {
				String[] a = arg.split("\\s+");
				KeyMapping key = switch (a[0]) {
					case "forward" -> mc.options.keyUp;
					case "back" -> mc.options.keyDown;
					case "left" -> mc.options.keyLeft;
					case "right" -> mc.options.keyRight;
					case "sprint" -> mc.options.keySprint;
					case "jump" -> mc.options.keyJump;
					default -> mc.options.keyShift;
				};
				heldKey = key;
				holdTicks = Integer.parseInt(a[1]);
				key.setDown(true);
			}
			case "stats" -> Visceral.LOGGER.info("AutoTest: ragdolls={} stepped={} corpses={} fps={}", RagdollManager.count(), RagdollManager.steppedLastFrame,
				CorpseManager.count(), mc.getFps());
			case "log" -> Visceral.LOGGER.info("AutoTest: {}", arg);
			case "quit" -> mc.stop();
			default -> Visceral.LOGGER.warn("AutoTest: unknown step {}", line);
		}
	}

}
