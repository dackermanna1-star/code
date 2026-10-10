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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Headless showcase: builds a firing range in a flat world, fires every weapon and screenshots the
 * results. Run with {@code xvfb-run -a ./gradlew runClientGameTest}; screenshots land in
 * {@code build/run/clientGameTest/screenshots}.
 */
public class ArsenalShowcaseTest implements FabricClientGameTest {
	private final List<String> failures = new ArrayList<>();
	private final java.util.concurrent.atomic.AtomicBoolean orbDetonated = new java.util.concurrent.atomic.AtomicBoolean();
	private final java.util.concurrent.atomic.AtomicInteger orbTicks = new java.util.concurrent.atomic.AtomicInteger();
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

			// OVERKILL_SHOWCASE=sunline,worldbreaker runs just those sections; "particles" is only run when asked for.
			String only = System.getenv("OVERKILL_SHOWCASE");
			Set<String> wanted = only == null || only.isBlank() ? null : Set.of(only.split(","));
			Map<String, Runnable> sections = new LinkedHashMap<>();
			sections.put("particles", this::particleCalibration);
			sections.put("held", this::heldWeapons);
			sections.put("sunline", this::sunline);
			sections.put("worldbreaker", this::worldbreaker);
			sections.put("riftfang", this::riftfang);
			sections.put("stormcaller", this::stormcaller);
			sections.put("gravemaker", this::gravemaker);
			sections.forEach((name, body) -> {
				if (wanted == null ? !name.equals("particles") : wanted.contains(name)) {
					this.section(name, body);
				}
			});
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
		this.place(x, y, z, yaw, pitch, false);
	}

	/** Teleports the player; {@code hover} keeps them hanging in the air (creative flight) for overview shots. */
	private void place(double x, double y, double z, float yaw, float pitch, boolean hover) {
		this.cmd(String.format(java.util.Locale.ROOT, "tp @p %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
		this.context.waitTicks(2);
		if (hover) {
			// Vanilla switches flight off whenever you're standing on something, so this has to happen mid-air.
			this.context.runOnClient(mc -> {
				mc.player.getAbilities().flying = true;
				mc.player.onUpdateAbilities();
				mc.player.setDeltaMovement(net.minecraft.world.phys.Vec3.ZERO);
			});
			this.cmd(String.format(java.util.Locale.ROOT, "tp @p %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
			this.context.waitTicks(2);
		}
		this.look(yaw, pitch);
		if (hover) {
			// Over a burning crater the meshes never fully settle (fire keeps changing blocks): give them a moment and go.
			try {
				this.world.getClientWorld().waitForChunksRender(false, 200);
			} catch (AssertionError e) {
				this.look(yaw, pitch);
			}
			return;
		}
		try {
			this.world.getClientWorld().waitForChunksRender(true, 400);
		} catch (AssertionError e) {
			// After raising the view distance mid-game the "every chunk downloaded" check never passes;
			// settle for every chunk we do have being rendered.
			this.world.getClientWorld().waitForChunksRender(false, 1200);
		}
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
		this.cmd("fill 34 -60 -20 35 -52 20 minecraft:stone");
		double[][] targets = {{10.5, -4.5}, {16.5, 3.5}, {22.5, -8.5}, {28.5, 6.5}, {14.5, 12.5}, {20.5, -14.5}};
		for (double[] target : targets) {
			this.zombie(target[0], -60, target[1]);
		}
		this.place(0.5, -60, 0.5, -90.0F, 4.0F);
		this.hold(0, "overkill:sunline_rifle");
		this.context.waitTicks(10);
		// Hold the trigger and sweep the laser back and forth across the range in a zigzag.
		this.input.holdKey(options -> options.keyUse);
		for (int t = 0; t <= 90; t++) {
			this.look((float) (-90.0 + 38.0 * Math.sin(t * 0.075)), (float) (5.0 + 3.5 * Math.sin(t * 0.21)));
			this.context.waitTicks(1);
			if (t == 40) {
				this.shot("sunline_1_aiming");
			} else if (t == 70) {
				this.camera(CameraType.THIRD_PERSON_BACK);
				this.context.waitTicks(1);
				this.shot("sunline_2_aiming_tp");
				this.camera(CameraType.FIRST_PERSON);
			}
		}
		this.input.releaseKey(options -> options.keyUse);
		this.look(-90.0F, 8.0F);
		this.context.waitTicks(5);
		this.shot("sunline_3_fuse");
		this.context.waitTicks(10);
		this.shot("sunline_4_detonation");
		this.context.waitTicks(10);
		this.shot("sunline_5_chain");
		this.context.waitTicks(80);
		this.shot("sunline_6_aftermath");
		this.place(16.5, -38, -42.5, -15.0F, 32.0F);
		this.shot("sunline_7_scorched_field");
	}

	/** A rounded stone hill with a grassy top, centred on (cx, cz), for the Worldbreaker to dig into. */
	private void buildHill(int cx, int cz, int radius, int height) {
		this.server.runOnServer(s -> {
			net.minecraft.server.level.ServerLevel level = s.overworld();
			net.minecraft.core.BlockPos.MutableBlockPos pos = new net.minecraft.core.BlockPos.MutableBlockPos();
			net.minecraft.world.level.block.state.BlockState stone = net.minecraft.world.level.block.Blocks.STONE.defaultBlockState();
			net.minecraft.world.level.block.state.BlockState andesite = net.minecraft.world.level.block.Blocks.ANDESITE.defaultBlockState();
			net.minecraft.world.level.block.state.BlockState dirt = net.minecraft.world.level.block.Blocks.DIRT.defaultBlockState();
			net.minecraft.world.level.block.state.BlockState grass = net.minecraft.world.level.block.Blocks.GRASS_BLOCK.defaultBlockState();
			int flags = net.minecraft.world.level.block.Block.UPDATE_CLIENTS | net.minecraft.world.level.block.Block.UPDATE_KNOWN_SHAPE;
			for (int x = cx - radius; x <= cx + radius; x++) {
				for (int z = cz - radius; z <= cz + radius; z++) {
					double d2 = ((double) (x - cx) * (x - cx) + (double) (z - cz) * (z - cz)) / ((double) radius * radius);
					if (d2 >= 1.0) {
						continue;
					}
					int top = -61 + (int) (height * Math.pow(1.0 - d2, 0.8));
					for (int y = -63; y <= top; y++) {
						net.minecraft.world.level.block.state.BlockState state = y == top ? grass : y > top - 3 ? dirt
							: ((x * 7 + y * 3 + z * 5) & 15) == 0 ? andesite : stone;
						level.setBlock(pos.set(x, y, z), state, flags);
					}
				}
			}
		});
	}

	/** Solid blocks in the Worldbreaker range (hill plus the ground around it). */
	private long countSolid() {
		long[] count = {0};
		this.server.runOnServer(s -> {
			net.minecraft.server.level.ServerLevel level = s.overworld();
			net.minecraft.core.BlockPos.MutableBlockPos pos = new net.minecraft.core.BlockPos.MutableBlockPos();
			for (int x = 40; x <= 240; x++) {
				for (int z = -80; z <= 80; z++) {
					for (int y = -63; y <= 32; y++) {
						if (!level.getBlockState(pos.set(x, y, z)).isAir()) {
							count[0]++;
						}
					}
				}
			}
		});
		return count[0];
	}

	private void worldbreaker() {
		// The test client defaults to a tiny view distance; the orb (rightly) stops at the edge of the
		// simulated world, so give it the room a normal game would.
		this.context.runOnClient(mc -> mc.options.renderDistance().set(12));
		this.place(120.5, 40, 0.5, -90.0F, 30.0F);
		this.buildHill(150, 0, 64, 90);
		// A high firing platform that overlooks the hill's flank; stand at its front corner so it doesn't block the view.
		this.cmd("fill 33 19 -57 47 19 -43 minecraft:polished_blackstone");
		this.place(46.5, 20, -43.5, -59.2F, 30.3F);
		this.hold(1, "overkill:worldbreaker_cannon");
		this.input.holdKey(options -> options.keyUse);
		this.context.waitTicks(100);
		this.shot("worldbreaker_1_charging_5s");
		this.context.waitTicks(150);
		this.shot("worldbreaker_2_charging_12s");
		this.context.waitTicks(155);
		this.shot("worldbreaker_3_full_charge");
		long solidBefore = this.countSolid();
		this.trackOrb();
		this.input.releaseKey(options -> options.keyUse);
		this.context.waitFor(mc -> this.orbTicks.get() >= 2 || this.orbDetonated.get(), 400);
		this.shot("worldbreaker_4_orb");
		// The recoil slides the shooter back across the platform, which would then hide the impact.
		this.cmd("tp @p 46.50 20.00 -43.50 -59.2 30.3");
		this.look(-59.2F, 30.3F);
		// The server lags behind the client here, so wait for the detonation itself.
		this.context.waitFor(mc -> this.orbDetonated.get(), 400);
		this.context.waitTicks(3);
		this.shot("worldbreaker_5_impact");
		this.context.waitTicks(25);
		this.shot("worldbreaker_6_caving_in");
		this.context.waitTicks(140);
		this.shot("worldbreaker_7_crater");
		long removed = solidBefore - this.countSolid();
		this.server.runOnServer(s -> {
			net.minecraft.server.level.ServerLevel level = s.overworld();
			int deepest = Integer.MAX_VALUE;
			int minX = Integer.MAX_VALUE;
			int maxX = Integer.MIN_VALUE;
			int minZ = Integer.MAX_VALUE;
			int maxZ = Integer.MIN_VALUE;
			for (int x = 40; x <= 240; x++) {
				for (int z = -80; z <= 80; z++) {
					int surface = level.getHeight(net.minecraft.world.level.levelgen.Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
					double d2 = ((x - 150.0) * (x - 150.0) + z * z) / (64.0 * 64.0);
					int original = d2 < 1.0 ? -60 + (int) (90 * Math.pow(1.0 - d2, 0.8)) : -60;
					if (surface < original - 3) {
						deepest = Math.min(deepest, surface);
						minX = Math.min(minX, x);
						maxX = Math.max(maxX, x);
						minZ = Math.min(minZ, z);
						maxZ = Math.max(maxZ, z);
					}
				}
			}
			System.out.printf(java.util.Locale.ROOT,
				"[overkill-showcase] crater: %d blocks removed, floor at y=%d, spans x %d..%d and z %d..%d, avg tick %.1f ms%n",
				removed, deepest, minX, maxX, minZ, maxZ, s.getAverageTickTimeNanos() / 1.0E6);
		});
		this.place(118.5, 95, -75.5, -12.0F, 57.0F, true);
		this.shot("worldbreaker_8_crater_above");
		this.place(60.5, 0, -20.5, -80.0F, 22.0F, true);
		this.shot("worldbreaker_9_crater_mouth");
		this.context.runOnClient(mc -> {
			mc.player.getAbilities().flying = false;
			mc.player.onUpdateAbilities();
		});
		this.context.runOnClient(mc -> mc.options.renderDistance().set(5));
	}

	/** Logs the orb's position every server tick until it detonates. */
	private void trackOrb() {
		this.orbDetonated.set(false);
		this.orbTicks.set(0);
		this.server.runOnServer(s -> dev.overkill.util.ServerProcesses.add(s.overworld(), new dev.overkill.util.ServerProcesses.Process() {
			private net.minecraft.world.phys.Vec3 last;
			private int seen;
			private int idle;

			@Override
			public boolean tick(net.minecraft.server.level.ServerLevel level) {
				var orbs = level.getEntities(dev.overkill.registry.ModEntities.WORLDBREAKER_ORB, e -> true);
				if (orbs.isEmpty()) {
					if (this.seen > 0) {
						ArsenalShowcaseTest.this.orbDetonated.set(true);
						System.out.printf(java.util.Locale.ROOT, "[overkill-showcase] orb detonated near %.1f %.1f %.1f after %d ticks%n",
							this.last.x, this.last.y, this.last.z, this.seen);
						return true;
					}
					return ++this.idle > 100;
				}
				var orb = orbs.getFirst();
				this.last = orb.position();
				this.seen++;
				ArsenalShowcaseTest.this.orbTicks.set(this.seen);
				System.out.printf(java.util.Locale.ROOT, "[overkill-showcase] orb at %.1f %.1f %.1f, %.1f blocks/tick%n",
					orb.getX(), orb.getY(), orb.getZ(), orb.getDeltaMovement().length());
				return false;
			}
		}));
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
