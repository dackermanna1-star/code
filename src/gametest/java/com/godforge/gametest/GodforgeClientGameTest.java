package com.godforge.gametest;

import com.godforge.destruction.DestructionManager;
import com.godforge.entity.MiniSunEntity;
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
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
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
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
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

	/**
	 * @param tap   ticks of a short tap before charging (the Asteroid Gun designates its target this way)
	 * @param hold  ticks the use key is held; the charge screenshot is taken shortly before release
	 * @param shots screenshot times in ticks after release, ascending
	 */
	private record Scenario(String name, Item item, int mode, float pitch, int tap, int hold, boolean reshapes, int... shots) {
	}

	private static final List<Scenario> SCENARIOS = List.of(
		new Scenario("worldcutter_rift_slash", ModItems.WORLDCUTTER, 0, 4, 0, 2, true, 3, 12, 30),
		new Scenario("worldcutter_sever_reality", ModItems.WORLDCUTTER, 1, 18, 0, 46, true, 6, 20, 60, 140, 240),
		new Scenario("laser_annihilation_beam", ModItems.LASER_BEAM, 0, 10, 0, 70, true, 2, 30),
		new Scenario("laser_overload", ModItems.LASER_BEAM, 1, 10, 0, 140, true, 2, 30),
		new Scenario("orb_eraser_orb", ModItems.ORB_ERASER, 0, 2, 0, 56, true, 2, 6, 30),
		new Scenario("orb_prismatic_annihilation", ModItems.ORB_ERASER, 1, 2, 0, 86, true, 2, 6, 30, 80),
		new Scenario("asteroid_summon", ModItems.ASTEROID_GUN, 0, 5, 3, 66, true, 10, 30, 50, 70, 110),
		new Scenario("asteroid_planetfall", ModItems.ASTEROID_GUN, 1, 3, 3, 96, true, 10, 40, 70, 100, 160),
		new Scenario("black_hole_singularity", ModItems.BLACK_HOLE, 0, 6, 0, 56, true, 10, 50, 120, 200, 280),
		new Scenario("black_hole_event_horizon", ModItems.BLACK_HOLE, 1, 6, 0, 76, true, 10, 60, 140, 240, 340),
		new Scenario("reality_fracture", ModItems.REALITY_BREAKER, 0, 9, 0, 36, true, 4, 20, 50, 120),
		new Scenario("reality_dimensional_collapse", ModItems.REALITY_BREAKER, 1, 8, 0, 66, true, 10, 40, 90, 160),
		new Scenario("starfall_star_shot", ModItems.STARFALL_BOW, 0, 6, 0, 26, true, 3, 10, 30),
		new Scenario("starfall_meteor_shower", ModItems.STARFALL_BOW, 1, 6, 0, 50, true, 10, 30, 60, 110),
		new Scenario("starfall_celestial_judgment", ModItems.STARFALL_BOW, 2, 4, 0, 76, true, 20, 60, 100, 160),
		new Scenario("godfist_kinetic_shockwave", ModItems.GODFIST, 0, 8, 0, 36, true, 3, 12, 40),
		new Scenario("godfist_worldbreaker", ModItems.GODFIST, 1, 12, 0, 56, true, 4, 16, 40, 100),
		new Scenario("sunforge_solar_bolt", ModItems.SUNFORGE, 0, 6, 0, 2, true, 3, 8, 30),
		new Scenario("sunforge_orbiting_suns", ModItems.SUNFORGE, 1, 6, 0, 2, false, 10, 40),
		new Scenario("sunforge_stellar_core", ModItems.SUNFORGE, 2, 6, 0, 90, true, 3, 20, 60),
		new Scenario("sunforge_artificial_sun", ModItems.SUNFORGE, 3, -10, 0, 66, true, 20, 80, 160, 260, 380),
		new Scenario("planet_cracker_shell", ModItems.PLANET_CRACKER, 0, 10, 0, 46, true, 6, 20, 50),
		new Scenario("planet_cracker_orbital_bombardment", ModItems.PLANET_CRACKER, 1, 4, 0, 66, true, 20, 60, 100, 160, 260)
	);

	@Override
	public void runTest(ClientGameTestContext context) {
		// the menu blur is by far the most expensive thing to draw with software rendering
		context.runOnClient(mc -> mc.options.menuBackgroundBlurriness().set(0));
		try (TestSingleplayerContext world = context.worldBuilder().adjustSettings(GodforgeClientGameTest::deepFlatWorld).create()) {
			context.getInput().resizeWindow(1280, 720);
			context.runOnClient(mc -> mc.options.renderDistance().set(8));
			TestServerContext server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamerule show_death_messages false");
			world.getClientWorld().waitForChunksRender();

			showcaseModels(context, world, server);
			showcaseConfigScreen(context, server);

			List<String> failures = new ArrayList<>();
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
			if (!failures.isEmpty()) {
				throw new AssertionError("Godforge scenarios failed:\n  " + String.join("\n  ", failures));
			}
			LOGGER.info("All {} Godforge scenarios passed", SCENARIOS.size());
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
		world.getClientWorld().waitForChunksRender();
	}

	private static void camera(ClientGameTestContext context, CameraType type) {
		context.runOnClient(mc -> mc.options.setCameraType(type));
	}

	private static void screenshot(ClientGameTestContext context, String name) {
		context.takeScreenshot(TestScreenshotOptions.of(name));
	}

	// ------------------------------------------------------------------ showcases

	private static void showcaseModels(ClientGameTestContext context, TestSingleplayerContext world, TestServerContext server) {
		moveTo(context, world, server, 0.5, 40, 0.5, 30, 0, true);
		List<Item> items = new ArrayList<>(ModItems.WEAPONS);
		items.add(ModItems.DIVINE_CORE);
		for (Item item : items) {
			String id = BuiltInRegistries.ITEM.getKey(item).getPath();
			equip(server, 0, weapon(item, 0));
			context.waitTicks(4);
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
		if (scenario.hold() > 16) {
			context.getInput().holdKey(options -> options.keyUse);
			context.waitTicks(scenario.hold() - 8);
			screenshot(context, scenario.name() + "_charging");
			context.waitTicks(8);
			context.getInput().releaseKey(options -> options.keyUse);
		} else {
			context.getInput().holdKeyFor(options -> options.keyUse, scenario.hold());
		}

		int elapsed = 0;
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
