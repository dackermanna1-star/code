package dev.overkill.gametest;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.TestInput;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.CameraType;
import net.minecraft.client.gui.screens.worldselection.WorldCreationUiState;
import net.minecraft.world.level.gamerules.GameRules;

import java.util.ArrayList;
import java.util.List;

/**
 * Headless showcase: builds a firing range in a flat world, fires every weapon and screenshots the
 * results. Run with {@code xvfb-run -a ./gradlew runClientGameTest}; screenshots land in
 * {@code build/run/clientGameTest/screenshots}.
 */
public class ArsenalShowcaseTest implements FabricClientGameTest {
	private final List<String> failures = new ArrayList<>();
	private ClientGameTestContext context;
	private TestSingleplayerContext world;
	private TestServerContext server;
	private TestInput input;

	@Override
	public void runTest(ClientGameTestContext context) {
		this.context = context;
		this.input = context.getInput();
		try (TestSingleplayerContext singleplayer = context.worldBuilder()
			.adjustSettings(settings -> settings.setGameMode(WorldCreationUiState.SelectedGameMode.CREATIVE))
			.create()) {
			this.world = singleplayer;
			this.server = singleplayer.getServer();
			this.input.resizeWindow(1280, 720);
			this.setUpWorld();

			String only = System.getenv("OVERKILL_SHOWCASE");
			if ("particles".equals(only)) {
				this.section("particles", this::particleCalibration);
				return;
			}
			this.section("held", this::heldWeapons);
			this.section("sunline", this::sunline);
			this.section("worldbreaker", this::worldbreaker);
			this.section("riftfang", this::riftfang);
			this.section("stormcaller", this::stormcaller);
			this.section("gravemaker", this::gravemaker);
		}
		if (!this.failures.isEmpty()) {
			throw new AssertionError("Showcase sections failed: " + this.failures);
		}
	}

	private void section(String name, Runnable body) {
		try {
			body.run();
		} catch (Throwable t) {
			System.err.println("[overkill-showcase] Section " + name + " failed: " + t);
			t.printStackTrace();
			this.failures.add(name + ": " + t);
		}
	}

	// ------------------------------------------------------------------------------------------
	// Helpers
	// ------------------------------------------------------------------------------------------

	private void setUpWorld() {
		this.server.runOnServer(s -> {
			GameRules rules = s.overworld().getGameRules();
			rules.set(GameRules.ADVANCE_TIME, false, s);
			rules.set(GameRules.ADVANCE_WEATHER, false, s);
			rules.set(GameRules.SPAWN_MOBS, false, s);
			rules.set(GameRules.SPAWN_MONSTERS, false, s);
			rules.set(GameRules.SEND_COMMAND_FEEDBACK, false, s);
			rules.set(GameRules.SHOW_ADVANCEMENT_MESSAGES, false, s);
		});
		this.cmd("time set 6000");
		this.cmd("weather clear");
		this.world.getClientWorld().waitForChunksRender();
		this.context.runOnClient(mc -> mc.options.hideGui = false);
	}

	private void cmd(String command) {
		this.server.runCommand(command);
	}

	private void place(double x, double y, double z, float yaw, float pitch) {
		this.cmd(String.format(java.util.Locale.ROOT, "tp @p %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
		this.context.waitTicks(2);
		this.look(yaw, pitch);
		this.world.getClientWorld().waitForChunksRender();
	}

	private void look(float yaw, float pitch) {
		this.context.runOnClient(mc -> {
			mc.player.setYRot(yaw);
			mc.player.setXRot(pitch);
			mc.player.yRotO = yaw;
			mc.player.xRotO = pitch;
			mc.player.setYHeadRot(yaw);
		});
	}

	private void hold(int slot, String item) {
		this.cmd("item replace entity @p hotbar." + slot + " with " + item);
		this.context.runOnClient(mc -> mc.player.getInventory().setSelectedSlot(slot));
		this.context.waitTicks(2);
	}

	private void camera(CameraType type) {
		this.context.runOnClient(mc -> mc.options.setCameraType(type));
	}

	private void shot(String name) {
		this.context.runOnClient(mc -> {
			mc.gui.getChat().clearMessages(false);
			mc.getToastManager().clear();
		});
		this.context.takeScreenshot("overkill_" + name);
	}

	private void zombie(double x, double y, double z) {
		this.cmd(String.format(java.util.Locale.ROOT, "summon husk %.1f %.1f %.1f {PersistenceRequired:1b,Silent:1b}", x, y, z));
	}

	private void use() {
		this.input.pressKey(options -> options.keyUse);
	}

	// ------------------------------------------------------------------------------------------
	// Sections
	// ------------------------------------------------------------------------------------------

	/** Effect calibration: a server-sent arc (top) next to a client-spawned arc (bottom). */
	private void particleCalibration() {
		this.place(0.5, -60, 200.5, 0.0F, 0.0F);
		this.server.runOnServer(s -> dev.overkill.weapon.StormcallerLogic.arc(s.overworld(),
			new net.minecraft.world.phys.Vec3(-3.0, -56.5, 206.0), new net.minecraft.world.phys.Vec3(4.0, -56.5, 206.0), 1.2F));
		this.context.runOnClient(mc -> dev.overkill.client.fx.FxClient.handle(new dev.overkill.network.FxPayload(dev.overkill.network.FxKind.ARC,
			new net.minecraft.world.phys.Vec3(-3.0, -59.0, 206.0), new net.minecraft.world.phys.Vec3(4.0, -59.0, 206.0), 1.2F, 7)));
		this.context.waitTicks(1);
		this.shot("calibration_arc_t1");
		this.context.waitTicks(1);
		this.shot("calibration_arc_t2");
	}

	private void heldWeapons() {
		this.place(0.5, -60, -40.5, -90.0F, 0.0F);
		String[] items = {"overkill:sunline_rifle", "overkill:worldbreaker_cannon", "overkill:riftfang_scythe",
			"overkill:stormcaller_gauntlet[overkill:storm_charge=10,custom_model_data={floats:[10.0f]}]", "overkill:gravemaker"};
		String[] names = {"sunline", "worldbreaker", "riftfang", "stormcaller", "gravemaker"};
		for (int i = 0; i < items.length; i++) {
			this.cmd("item replace entity @p hotbar." + i + " with " + items[i]);
		}
		for (int i = 0; i < items.length; i++) {
			int slot = i;
			this.context.runOnClient(mc -> mc.player.getInventory().setSelectedSlot(slot));
			this.camera(CameraType.FIRST_PERSON);
			this.context.waitTicks(12);
			this.shot("held_" + names[i] + "_fp");
			this.camera(CameraType.THIRD_PERSON_FRONT);
			this.context.waitTicks(2);
			this.shot("held_" + names[i] + "_tp");
		}
		this.camera(CameraType.FIRST_PERSON);
	}

	private void sunline() {
		this.cmd("fill 34 -60 -6 35 -52 6 minecraft:stone");
		for (int x = 10; x <= 28; x += 6) {
			this.zombie(x + 0.5, -60, 0.5);
		}
		this.place(0.5, -60, 0.5, -90.0F, 4.0F);
		this.hold(0, "overkill:sunline_rifle");
		this.context.waitTicks(10);
		this.use();
		this.context.waitTicks(4);
		this.shot("sunline_1_trace");
		this.context.waitTicks(10);
		this.shot("sunline_2_detonation");
		this.context.waitTicks(6);
		this.shot("sunline_3_chain");
		this.context.waitTicks(50);
		this.shot("sunline_4_aftermath");
		this.place(14.5, -52, -14.5, -30.0F, 32.0F);
		this.shot("sunline_5_trench");
	}

	private void worldbreaker() {
		// A stone mesa to blow a crater into.
		this.cmd("fill 60 -63 -20 100 -35 0 minecraft:stone");
		this.cmd("fill 60 -63 1 100 -35 20 minecraft:stone");
		this.cmd("fill 40 -64 -3 46 -12 3 minecraft:polished_blackstone");
		this.place(45.6, -11, 0.5, -90.0F, 45.0F);
		this.hold(1, "overkill:worldbreaker_cannon");
		this.input.holdKey(options -> options.keyUse);
		this.context.waitTicks(40);
		this.shot("worldbreaker_1_charging");
		this.context.waitTicks(85);
		this.shot("worldbreaker_2_full_charge");
		this.input.releaseKey(options -> options.keyUse);
		this.context.waitTicks(12);
		this.shot("worldbreaker_3_orb");
		this.context.waitTicks(22);
		this.shot("worldbreaker_4_impact");
		this.context.waitTicks(10);
		this.shot("worldbreaker_5_blast");
		this.context.waitTicks(60);
		this.shot("worldbreaker_6_crater");
		this.place(80.5, 10, -30.5, 0.0F, 45.0F);
		this.shot("worldbreaker_7_crater_above");
		this.place(52.5, -22, -24.5, -50.0F, 28.0F);
		this.shot("worldbreaker_8_crater_side");
	}

	private void riftfang() {
		this.place(0.5, -60, 40.5, -90.0F, 0.0F);
		this.hold(2, "overkill:riftfang_scythe");
		this.zombie(3.0, -60, 40.5);
		this.context.waitTicks(5);
		this.look(-90.0F, 10.0F);
		this.input.pressKey(options -> options.keyAttack);
		this.context.waitTicks(3);
		this.shot("riftfang_1_slash");
		this.context.waitTicks(20);
		this.shot("riftfang_2_swallowed");
		for (int x = 8; x <= 16; x += 4) {
			this.zombie(x + 0.5, -60, 40.5);
		}
		this.context.waitTicks(5);
		this.look(-90.0F, 0.0F);
		this.use();
		this.context.waitTicks(5);
		this.shot("riftfang_3_wave");
		this.context.waitTicks(60);
		for (int i = 0; i < 8; i++) {
			double angle = i * Math.PI / 4.0;
			this.zombie(0.5 + Math.cos(angle) * 7.0, -60, 40.5 + Math.sin(angle) * 7.0);
		}
		this.context.waitTicks(5);
		this.look(-90.0F, 30.0F);
		this.input.holdKey(options -> options.keyShift);
		this.context.waitTicks(2);
		this.use();
		this.context.waitTicks(10);
		this.input.releaseKey(options -> options.keyShift);
		this.shot("riftfang_4_void_harvest");
		this.context.waitTicks(20);
		this.look(-90.0F, -45.0F);
		this.context.waitTicks(4);
		this.shot("riftfang_5_sky_exits");
	}

	private void stormcaller() {
		this.place(0.5, -60, 80.5, -90.0F, 5.0F);
		this.hold(3, "overkill:stormcaller_gauntlet[overkill:storm_charge=5,custom_model_data={floats:[5.0f]}]");
		this.zombie(3.2, -60, 80.5);
		this.zombie(6.5, -60, 83.0);
		this.zombie(7.5, -60, 78.0);
		this.context.waitTicks(5);
		this.input.pressKey(options -> options.keyAttack);
		this.camera(CameraType.THIRD_PERSON_BACK);
		this.context.waitTicks(3);
		this.shot("stormcaller_1_chain");
		this.camera(CameraType.FIRST_PERSON);
		this.context.waitTicks(30);

		this.hold(3, "overkill:stormcaller_gauntlet[overkill:storm_charge=10,custom_model_data={floats:[10.0f]}]");
		for (int i = 0; i < 10; i++) {
			double angle = i * Math.PI / 5.0;
			double r = 5.0 + (i % 3) * 2.5;
			this.zombie(0.5 + Math.cos(angle) * r, -60, 80.5 + Math.sin(angle) * r);
		}
		this.context.waitTicks(5);
		this.camera(CameraType.THIRD_PERSON_BACK);
		this.look(-90.0F, 20.0F);
		this.use();
		this.context.waitTicks(9);
		this.shot("stormcaller_2_leap");
		this.context.waitFor(mc -> mc.player.onGround(), 80);
		this.context.waitTicks(3);
		this.shot("stormcaller_3_slam");
		this.context.waitTicks(6);
		this.shot("stormcaller_4_shockwave");
		this.camera(CameraType.FIRST_PERSON);
		this.context.waitTicks(40);

		this.cmd("kill @e[type=husk]");
		for (int i = 0; i < 5; i++) {
			this.zombie(10.5 + i * 3, -60, 76.5 + (i % 2) * 8);
		}
		this.hold(3, "overkill:stormcaller_gauntlet[overkill:storm_charge=8,custom_model_data={floats:[8.0f]}]");
		this.look(-90.0F, -60.0F);
		this.context.waitTicks(3);
		this.use();
		this.context.waitTicks(4);
		this.look(-90.0F, 10.0F);
		this.context.waitTicks(4);
		this.shot("stormcaller_5_thunder_call");
		this.context.waitTicks(30);
	}

	private void gravemaker() {
		this.cmd("kill @e[type=husk]");
		this.cmd("fill 8 -63 122 20 -61 138 minecraft:stone");
		this.place(0.5, -60, 130.5, -90.0F, 12.0F);
		this.hold(4, "overkill:gravemaker");
		for (int i = 0; i < 8; i++) {
			double angle = i * Math.PI / 4.0;
			this.zombie(14.5 + Math.cos(angle) * 6.0, -60, 130.5 + Math.sin(angle) * 6.0);
		}
		this.context.waitTicks(5);
		this.use();
		this.context.waitTicks(30);
		this.shot("gravemaker_1_black_hole");
		this.context.waitTicks(30);
		this.shot("gravemaker_2_debris");
		this.context.waitTicks(28);
		this.shot("gravemaker_3_collapse");
		this.context.waitTicks(7);
		this.shot("gravemaker_4_detonation");
		this.context.waitTicks(40);
		this.shot("gravemaker_5_aftermath");

		this.cmd("kill @e[type=husk]");
		for (int i = 0; i < 6; i++) {
			this.zombie(6.5 + (i % 3), -60, 128.5 + i);
		}
		this.cmd("item replace entity @p hotbar.4 with overkill:gravemaker");
		this.context.waitTicks(3);
		this.look(-90.0F, 35.0F);
		this.input.holdKey(options -> options.keyShift);
		this.context.waitTicks(2);
		this.use();
		this.context.waitTicks(6);
		this.input.releaseKey(options -> options.keyShift);
		this.shot("gravemaker_6_white_hole");
		this.context.waitTicks(40);
	}
}
