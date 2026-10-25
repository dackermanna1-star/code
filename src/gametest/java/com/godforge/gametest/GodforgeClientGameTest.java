package com.godforge.gametest;

import com.godforge.destruction.DestructionManager;
import com.godforge.entity.MiniSunEntity;
import com.godforge.network.SettingsPayload;
import com.godforge.registry.ModItems;
import com.godforge.util.EffectEntity;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.WeaponSettings;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.CameraType;
import net.minecraft.client.gui.screens.worldselection.PresetEditor;
import net.minecraft.client.gui.screens.worldselection.WorldCreationUiState;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.player.ChatVisiblity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.flat.FlatLayerInfo;
import net.minecraft.world.level.levelgen.flat.FlatLevelGeneratorSettings;
import net.minecraft.world.phys.AABB;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Boots a real client in a deep superflat world, shows every weapon model, then fires every mode of every
 * weapon through real key input. Screenshots land in {@code build/run/clientGameTest/screenshots}; the test
 * fails if a terrain-shaping ability leaves the terrain untouched or if anything throws.
 */
public class GodforgeClientGameTest implements FabricClientGameTest {
	private static final Logger LOGGER = LoggerFactory.getLogger("godforge-gametest");
	private static final int GROUND = 1;
	private static final int SITE_SPACING = 320;
	/** Software rendering builds chunk meshes slowly; allow three minutes per fresh site. */
	private static final int CHUNK_TIMEOUT = 20 * 180;

	/**
	 * @param tap   ticks of a short tap before charging (the Asteroid Gun designates its target this way)
	 * @param hold  ticks the use key is held; the charge screenshot is taken shortly before release
	 * @param shots screenshot times in ticks after release, ascending
	 */
	private record Scenario(String name, Item item, int mode, float pitch, int tap, int hold, boolean reshapes, float view, int... shots) {
	}

	private static final List<Scenario> SCENARIOS = List.of(
		new Scenario("worldcutter_rift_slash", ModItems.WORLDCUTTER, 0, 4, 0, 2, true, 1.0F, 3, 12, 30),
		new Scenario("worldcutter_sever_reality", ModItems.WORLDCUTTER, 1, 18, 0, 46, true, 1.7F, 6, 20, 60, 140, 240),
		new Scenario("laser_annihilation_beam", ModItems.LASER_BEAM, 0, 10, 0, 70, true, 1.0F, 2, 30),
		new Scenario("laser_overload", ModItems.LASER_BEAM, 1, 10, 0, 140, true, 1.0F, 2, 30),
		new Scenario("orb_eraser_orb", ModItems.ORB_ERASER, 0, 2, 0, 56, true, 1.0F, 2, 6, 30),
		new Scenario("orb_prismatic_annihilation", ModItems.ORB_ERASER, 1, 2, 0, 86, true, 1.7F, 2, 6, 30, 80),
		new Scenario("asteroid_summon", ModItems.ASTEROID_GUN, 0, 5, 3, 66, true, 1.0F, 10, 30, 50, 70, 110),
		new Scenario("asteroid_planetfall", ModItems.ASTEROID_GUN, 1, 3, 3, 96, true, 1.7F, 10, 40, 70, 100, 160),
		new Scenario("black_hole_singularity", ModItems.BLACK_HOLE, 0, 6, 0, 56, true, 1.0F, 10, 50, 120, 200, 280),
		new Scenario("black_hole_event_horizon", ModItems.BLACK_HOLE, 1, 6, 0, 76, true, 1.7F, 10, 60, 140, 240, 340),
		new Scenario("reality_fracture", ModItems.REALITY_BREAKER, 0, 9, 0, 36, true, 1.0F, 4, 20, 50, 120),
		new Scenario("reality_dimensional_collapse", ModItems.REALITY_BREAKER, 1, 8, 0, 66, true, 1.7F, 10, 40, 90, 160),
		new Scenario("starfall_star_shot", ModItems.STARFALL_BOW, 0, 6, 0, 26, true, 1.0F, 3, 10, 30),
		new Scenario("starfall_meteor_shower", ModItems.STARFALL_BOW, 1, 6, 0, 50, true, 1.0F, 10, 30, 60, 110),
		new Scenario("starfall_celestial_judgment", ModItems.STARFALL_BOW, 2, 4, 0, 76, true, 1.7F, 20, 60, 100, 160),
		new Scenario("godfist_kinetic_shockwave", ModItems.GODFIST, 0, 8, 0, 36, true, 1.0F, 3, 12, 40),
		new Scenario("godfist_worldbreaker", ModItems.GODFIST, 1, 12, 0, 56, true, 1.0F, 4, 16, 40, 100),
		new Scenario("sunforge_solar_bolt", ModItems.SUNFORGE, 0, 6, 0, 2, true, 1.0F, 3, 8, 30),
		new Scenario("sunforge_orbiting_suns", ModItems.SUNFORGE, 1, 6, 0, 2, false, 1.0F, 10, 40),
		new Scenario("sunforge_stellar_core", ModItems.SUNFORGE, 2, 6, 0, 90, true, 1.0F, 3, 20, 60),
		new Scenario("sunforge_artificial_sun", ModItems.SUNFORGE, 3, -10, 0, 66, true, 1.7F, 20, 80, 160, 260, 380),
		new Scenario("planet_cracker_shell", ModItems.PLANET_CRACKER, 0, 10, 0, 46, true, 1.0F, 6, 20, 50),
		new Scenario("planet_cracker_orbital_bombardment", ModItems.PLANET_CRACKER, 1, 4, 0, 66, true, 1.7F, 20, 60, 100, 160, 260)
	);

	@Override
	public void runTest(ClientGameTestContext context) {
		// the menu blur is by far the most expensive thing to draw with software rendering
		context.runOnClient(mc -> {
			mc.options.menuBackgroundBlurriness().set(0);
			mc.options.chatVisibility().set(ChatVisiblity.HIDDEN);
		});
		List<String> failures = new ArrayList<>();
		try (TestSingleplayerContext world = context.worldBuilder().adjustSettings(GodforgeClientGameTest::deepFlatWorld).create()) {
			// keep the test's default render distance: the integrated server ignores later changes, and the chunk
			// wait would then expect corner chunks the server never sends
			context.getInput().resizeWindow(1280, 720);
			TestServerContext server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamerule show_death_messages false");
			world.getClientWorld().waitForChunksRender(true, CHUNK_TIMEOUT);

			showcaseModels(context, world, server);
			showcaseConfigScreen(context, server);
			if (Boolean.getBoolean("godforge.gametest.showcaseOnly")) {
				return;
			}

			for (int i = 0; i < SCENARIOS.size(); i++) {
				Scenario scenario = SCENARIOS.get(i);
				try {
					String failure = run(context, world, server, scenario, 4000 + i * SITE_SPACING);
					if (failure != null) {
						failures.add(failure);
					}
				} catch (RuntimeException | AssertionError e) {
					LOGGER.error("Scenario {} threw", scenario.name(), e);
					failures.add(scenario.name() + " threw " + e);
				}
			}
		}
		multiplayerSmokeTest(context, failures);
		if (!failures.isEmpty()) {
			throw new AssertionError("Godforge scenarios failed:\n  " + String.join("\n  ", failures));
		}
		LOGGER.info("All {} Godforge scenarios and the multiplayer smoke test passed", SCENARIOS.size());
	}

	/**
	 * Connects to a real dedicated server (packets are serialized over TCP, unlike singleplayer) and drives the
	 * settings, mode-cycle and firing packets plus the effect packets coming back, checking the connection survives.
	 */
	private static void multiplayerSmokeTest(ClientGameTestContext context, List<String> failures) {
		LOGGER.info("=== multiplayer smoke test ===");
		try (TestDedicatedServerContext server = context.worldBuilder().adjustSettings(GodforgeClientGameTest::deepFlatWorld).createServer();
			 TestServerConnection connection = server.connect()) {
			connection.getClientWorld().waitForChunksRender(true, CHUNK_TIMEOUT);
			server.runCommand("time set 6000");
			server.runCommand("tp @a 600.5 1 0.5 0 8");
			context.waitTicks(5);
			connection.getClientWorld().waitForChunksRender(true, CHUNK_TIMEOUT);
			equip(server, 0, weapon(ModItems.LASER_BEAM, 0));
			context.waitTicks(10);

			// client -> server: settings and mode cycling
			WeaponSettings wanted = GodWeaponItem.settings(new ItemStack(ModItems.LASER_BEAM))
				.with(WeaponSettings.Field.POWER, 9).with(WeaponSettings.Field.COLOR, 3).with(WeaponSettings.Field.RANGE, 96);
			context.runOnClient(mc -> ClientPlayNetworking.send(new SettingsPayload(0, wanted)));
			context.getInput().pressKey(GLFW.GLFW_KEY_R);
			context.waitTicks(10);
			WeaponSettings stored = server.computeOnServer(s -> GodWeaponItem.settings(player(s).getMainHandItem()));
			if (stored.power() != 9 || stored.color() != 3 || stored.range() != 96 || stored.mode() != 1) {
				failures.add("multiplayer: settings/mode packets not applied, server has " + stored);
			}

			// fire the overload and an asteroid so entity data and effect packets stream back to the client
			context.getInput().holdKeyFor(options -> options.keyUse, 60);
			context.waitTicks(20);
			screenshot(context, "multiplayer_laser_overload");
			server.runCommand("godforge resetcooldowns @a");
			equip(server, 0, weapon(ModItems.ASTEROID_GUN, 0));
			context.waitTicks(10);
			context.getInput().holdKeyFor(options -> options.keyUse, 70);
			context.waitTicks(80);
			screenshot(context, "multiplayer_asteroid");
			boolean connected = context.computeOnClient(mc -> mc.level != null && mc.getConnection() != null);
			if (!connected) {
				failures.add("multiplayer: client was disconnected");
			}
			LOGGER.info("multiplayer smoke test: settings {}, still connected {}", stored, connected);
		} catch (RuntimeException | AssertionError e) {
			LOGGER.error("Multiplayer smoke test threw", e);
			failures.add("multiplayer smoke test threw " + e);
		}
	}

	// ------------------------------------------------------------------ world

	/** Superflat with 64 blocks of stone under the grass so craters, cuts and chasms have something to bite into. */
	private static void deepFlatWorld(WorldCreationUiState creator) {
		creator.setGameMode(WorldCreationUiState.SelectedGameMode.CREATIVE);
		creator.updateDimensions((registries, dimensions) -> {
			FlatLevelGeneratorSettings flat = new FlatLevelGeneratorSettings(
				Optional.empty(), registries.lookupOrThrow(Registries.BIOME).getOrThrow(Biomes.PLAINS), List.of()
			);
			flat.getLayersInfo().add(new FlatLayerInfo(1, Blocks.BEDROCK));
			flat.getLayersInfo().add(new FlatLayerInfo(60, Blocks.STONE));
			flat.getLayersInfo().add(new FlatLayerInfo(3, Blocks.DIRT));
			flat.getLayersInfo().add(new FlatLayerInfo(1, Blocks.GRASS_BLOCK));
			flat.updateLayers();
			return PresetEditor.flatWorldConfigurator(flat).apply(registries, dimensions);
		});
	}

	private static ServerPlayer player(MinecraftServer server) {
		return server.getPlayerList().getPlayers().getFirst();
	}

	private static void equip(TestServerContext server, int slot, ItemStack stack) {
		server.runOnServer(s -> player(s).getInventory().setItem(slot, stack));
	}

	private static ItemStack weapon(Item item, int mode) {
		ItemStack stack = new ItemStack(item);
		if (item instanceof GodWeaponItem) {
			GodWeaponItem.applySettings(stack, GodWeaponItem.settings(stack).with(WeaponSettings.Field.MODE, mode));
		}
		return stack;
	}

	private static void moveTo(ClientGameTestContext context, TestSingleplayerContext world, TestServerContext server,
							   double x, double y, double z, float yaw, float pitch, boolean flying) {
		server.runOnServer(s -> {
			ServerPlayer player = player(s);
			player.getAbilities().flying = flying;
			player.onUpdateAbilities();
		});
		server.runCommand(String.format(Locale.ROOT, "tp @a %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
		context.waitTicks(3);
		world.getClientWorld().waitForChunksRender(true, CHUNK_TIMEOUT);
	}

	private static void camera(ClientGameTestContext context, CameraType type) {
		context.runOnClient(mc -> mc.options.setCameraType(type));
	}

	private static void screenshot(ClientGameTestContext context, String name) {
		context.runOnClient(mc -> mc.getToastManager().clear());
		context.takeScreenshot(TestScreenshotOptions.of(name));
	}

	/** Watches from an invisible marker armor stand at (x, y, z) looking at (tx, ty, tz). */
	private static void cinematicCamera(ClientGameTestContext context, TestServerContext server, double x, double y, double z, double tx, double ty, double tz) {
		double dx = tx - x;
		double dy = ty - y;
		double dz = tz - z;
		float yaw = (float) Math.toDegrees(Math.atan2(-dx, dz));
		float pitch = (float) Math.toDegrees(-Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)));
		server.runCommand(String.format(Locale.ROOT, "summon armor_stand %.2f %.2f %.2f {Marker:1b,Invisible:1b,NoGravity:1b,Tags:[\"gf_cam\"],Rotation:[%.1ff,%.1ff]}",
			x, y, z, yaw, pitch));
		context.waitTicks(3);
		context.runOnClient(mc -> {
			for (Entity entity : mc.level.entitiesForRendering()) {
				if (entity instanceof ArmorStand && entity.distanceToSqr(x, y, z) < 1.0) {
					mc.setCameraEntity(entity);
					return;
				}
			}
		});
	}

	private static void playerCamera(ClientGameTestContext context, TestServerContext server) {
		context.runOnClient(mc -> mc.setCameraEntity(mc.player));
		server.runCommand("kill @e[tag=gf_cam]");
	}

	// ------------------------------------------------------------------ showcases

	private static void showcaseModels(ClientGameTestContext context, TestSingleplayerContext world, TestServerContext server) {
		moveTo(context, world, server, 0.5, 40, 0.5, 30, 0, true);
		List<Item> items = new ArrayList<>(ModItems.WEAPONS);
		items.add(ModItems.DIVINE_CORE);
		// vanilla items as a reference for how big and where held items normally sit
		List<Item> shown = new ArrayList<>(items);
		shown.addAll(List.of(Items.IRON_SWORD, Items.CROSSBOW, Items.MACE));
		for (Item item : shown) {
			String id = BuiltInRegistries.ITEM.getKey(item).getPath();
			equip(server, 0, weapon(item, 0));
			// melee weapons are drawn lowered until the attack cooldown recharges after a swap
			context.waitTicks(30);
			camera(context, CameraType.FIRST_PERSON);
			context.waitTicks(2);
			screenshot(context, "model_" + id + "_first_person");
			camera(context, CameraType.THIRD_PERSON_FRONT);
			context.waitTicks(2);
			screenshot(context, "model_" + id + "_third_person");
		}
		camera(context, CameraType.FIRST_PERSON);
		for (int slot = 0; slot < 9; slot++) {
			equip(server, slot, weapon(items.get(slot), 0));
		}
		context.waitTicks(4);
		screenshot(context, "hotbar_icons_1");
		equip(server, 0, weapon(items.get(9), 0));
		equip(server, 1, weapon(items.get(10), 0));
		context.waitTicks(4);
		screenshot(context, "hotbar_icons_2");
		for (int slot = 0; slot < 9; slot++) {
			equip(server, slot, ItemStack.EMPTY);
		}
	}

	private static void showcaseConfigScreen(ClientGameTestContext context, TestServerContext server) {
		equip(server, 0, weapon(ModItems.LASER_BEAM, 0));
		context.waitTicks(4);
		context.getInput().pressKey(GLFW.GLFW_KEY_G);
		context.waitFor(mc -> mc.screen != null);
		context.waitTicks(2);
		screenshot(context, "config_screen_laser");
		context.setScreen(() -> null);
		context.waitTicks(2);
	}

	// ------------------------------------------------------------------ scenarios

	private static String run(ClientGameTestContext context, TestSingleplayerContext world, TestServerContext server, Scenario scenario, int siteX) {
		LOGGER.info("=== {} at x={} ===", scenario.name(), siteX);
		double x = siteX + 0.5;
		moveTo(context, world, server, x, GROUND, 0.5, 0, scenario.pitch(), false);
		server.runCommand("godforge resetcooldowns @a");
		for (int i = 0; i < 4; i++) {
			server.runCommand(String.format(Locale.ROOT, "summon husk %.1f %d %.1f {NoAI:1b,PersistenceRequired:1b,Tags:[\"gf_target\"]}",
				x - 6 + i * 4, GROUND, 14.5 + i * 6));
		}
		server.runCommand(String.format(Locale.ROOT, "summon cow %.1f %d 24.5 {NoAI:1b,Tags:[\"gf_target\"]}", x + 9, GROUND));
		equip(server, 0, weapon(scenario.item(), scenario.mode()));
		camera(context, CameraType.THIRD_PERSON_BACK);
		context.waitTicks(10);
		int[] before = server.computeOnServer(s -> heights(s.overworld(), siteX));

		if (scenario.tap() > 0) {
			context.getInput().holdKeyFor(options -> options.keyUse, scenario.tap());
			context.waitTicks(8);
		}
		float v = scenario.view();
		if (scenario.hold() > 16) {
			context.getInput().holdKey(options -> options.keyUse);
			context.waitTicks(scenario.hold() - 12);
			screenshot(context, scenario.name() + "_charging");
			// the same moment from the side: beams and held cores are hidden behind the player from the back
			cinematicCamera(context, server, x + 26 * v, 4 + 12 * v, -14 * v, x, 2 + 2 * v, 18 + 8 * v);
			screenshot(context, scenario.name() + "_charging_side");
			context.waitTicks(9);
			context.getInput().releaseKey(options -> options.keyUse);
		} else {
			context.getInput().holdKeyFor(options -> options.keyUse, scenario.hold());
			cinematicCamera(context, server, x + 26 * v, 4 + 12 * v, -14 * v, x, 2 + 2 * v, 18 + 8 * v);
		}
		// shot times count from release; summoning the camera after a tap-fire already took three ticks
		int elapsed = scenario.hold() > 16 ? 0 : 3;
		for (int i = 0; i < scenario.shots().length; i++) {
			context.waitTicks(Math.max(1, scenario.shots()[i] - elapsed));
			elapsed = scenario.shots()[i];
			screenshot(context, scenario.name() + "_" + (i + 1));
		}
		int settle = 0;
		while (settle < 20 * 60 && server.computeOnServer(s -> DestructionManager.activeJobs() > 0 || activeEffects(s.overworld()) > 0)) {
			context.waitTicks(10);
			settle += 10;
		}
		if (settle >= 20 * 60) {
			String lingering = server.computeOnServer(s -> {
				StringBuilder out = new StringBuilder(DestructionManager.describe().toString());
				for (Entity entity : s.overworld().getAllEntities()) {
					if (entity instanceof EffectEntity && !(entity instanceof MiniSunEntity)) {
						out.append(String.format(Locale.ROOT, " %s@(%.0f %.0f %.0f)", BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).getPath(),
							entity.getX(), entity.getY(), entity.getZ()));
					}
				}
				return out.toString();
			});
			LOGGER.warn("{}: still active after a minute: {}", scenario.name(), lingering);
		}
		playerCamera(context, server);
		camera(context, CameraType.FIRST_PERSON);

		int changed = server.computeOnServer(s -> {
			int[] after = heights(s.overworld(), siteX);
			int count = 0;
			for (int i = 0; i < after.length; i++) {
				if (after[i] != before[i]) {
					count++;
				}
			}
			return count;
		});
		String targets = server.computeOnServer(s -> {
			ServerLevel level = s.overworld();
			List<LivingEntity> alive = level.getEntitiesOfClass(LivingEntity.class, new AABB(siteX - 200, -64, -200, siteX + 200, 320, 300),
				e -> e.getTags().contains("gf_target"));
			long hurt = alive.stream().filter(e -> e.getHealth() < e.getMaxHealth()).count();
			return (5 - alive.size()) + " killed, " + hurt + " hurt";
		});
		LOGGER.info("{}: {} terrain columns changed, targets {}, effects settled after {} ticks", scenario.name(), changed, targets, settle);

		server.runCommand("godforge stop");
		server.runCommand("kill @e[tag=gf_target]");
		server.runCommand("kill @e[type=item]");
		server.runOnServer(s -> {
			Player player = player(s);
			player.setHealth(player.getMaxHealth());
			player.clearFire();
		});
		context.waitTicks(5);
		if (scenario.reshapes() && changed == 0) {
			return scenario.name() + ": terrain was not reshaped";
		}
		return null;
	}

	/** Weapon effects still playing out (orbiting suns are excluded: they deliberately stay for minutes). */
	private static int activeEffects(ServerLevel level) {
		int count = 0;
		for (Entity entity : level.getAllEntities()) {
			if (entity instanceof EffectEntity && !(entity instanceof MiniSunEntity)) {
				count++;
			}
		}
		return count;
	}

	/** Surface heights sampled every second block over the area in front of the test site. */
	private static int[] heights(ServerLevel level, int siteX) {
		int[] heights = new int[49 * 97];
		int i = 0;
		for (int dx = -48; dx <= 48; dx += 2) {
			for (int dz = -32; dz <= 160; dz += 2) {
				heights[i++] = level.getHeight(Heightmap.Types.WORLD_SURFACE, siteX + dx, dz);
			}
		}
		return heights;
	}
}
