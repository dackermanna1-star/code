package dev.visceral.test;

import dev.visceral.client.fx.BloodDecals;
import dev.visceral.client.fx.BloodParticles;
import dev.visceral.client.ragdoll.RagdollManager;
import dev.visceral.registry.VisceralAttachments;
import dev.visceral.wound.WoundData;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Scripted scenario: an arena with a line of creatures, sword cuts, punches, kills and the aftermath,
 * with screenshots of each stage. Run with {@code ./gradlew runClientGameTest} (needs a display; on a
 * headless machine use {@code xvfb-run}).
 */
public class VisceralClientGameTest implements FabricClientGameTest {
	private static final Logger LOGGER = LoggerFactory.getLogger("VisceralGameTest");
	private static final String[] MOBS = {"minecraft:husk", "minecraft:pillager", "minecraft:cow", "minecraft:spider", "minecraft:skeleton"};

	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			world.getClientWorld().waitForChunksRender();
			TestServerContext server = world.getServer();
			buildArena(server);
			context.runOnClient(minecraft -> minecraft.options.hideGui = true);
			context.waitTicks(40);
			world.getClientWorld().waitForChunksRender();
			context.takeScreenshot("visceral_00_arena");

			// Blades: cuts, sprays and wall spatter.
			server.runCommand("item replace entity @p weapon.mainhand with minecraft:diamond_sword");
			for (String mob : MOBS) {
				server.runCommand("damage @e[type=" + mob + ",limit=1] 5 minecraft:player_attack by @p");
			}
			context.waitTicks(2);
			context.takeScreenshot("visceral_01_spray");
			context.waitTicks(25);
			for (String mob : MOBS) {
				server.runCommand("damage @e[type=" + mob + ",limit=1] 7 minecraft:player_attack by @p");
			}
			context.waitTicks(30);
			context.takeScreenshot("visceral_02_cuts");
			logState(context, server, "after cuts");

			// Fists: bruises.
			server.runCommand("item replace entity @p weapon.mainhand with minecraft:air");
			for (int i = 0; i < 3; i++) {
				server.runCommand("damage @e[type=minecraft:pillager,limit=1] 2 minecraft:player_attack by @p");
				server.runCommand("damage @e[type=minecraft:cow,limit=1] 2 minecraft:player_attack by @p");
				context.waitTicks(22);
			}
			context.takeScreenshot("visceral_03_bruises");
			logState(context, server, "after punches");

			// An axe and an arrow for good measure.
			server.runCommand("item replace entity @p weapon.mainhand with minecraft:iron_axe");
			server.runCommand("damage @e[type=minecraft:husk,limit=1] 6 minecraft:player_attack by @p");
			server.runCommand("summon minecraft:arrow 0 101.2 -1 {Motion:[0.0,0.0,1.6d]}");
			context.waitTicks(30);
			context.takeScreenshot("visceral_04_axe_arrow");

			// Close-ups of the wounds.
			server.runCommand("tp @p 1.0 100 1.2 15 12");
			context.waitTicks(5);
			context.takeScreenshot("visceral_04b_closeup_pillager");
			server.runCommand("tp @p -0.6 100 1.0 -20 25");
			context.waitTicks(5);
			context.takeScreenshot("visceral_04c_closeup_cow_spider");
			server.runCommand("tp @p 0 100 -2.5 0 18");
			context.waitTicks(2);

			// Kills: ragdolls.
			server.runCommand("item replace entity @p weapon.mainhand with minecraft:diamond_sword");
			for (String mob : MOBS) {
				server.runCommand("damage @e[type=" + mob + ",limit=1] 100 minecraft:player_attack by @p");
			}
			context.waitTicks(3);
			context.takeScreenshot("visceral_05_death");
			context.waitTicks(15);
			context.takeScreenshot("visceral_06_falling");
			logState(context, server, "just after deaths");
			context.waitTicks(40);
			context.takeScreenshot("visceral_07_corpses");
			logState(context, server, "corpses");
			for (int i = 0; i < 8; i++) {
				context.waitTicks(20);
				logRagdolls(context, "t+" + (58 + i * 20));
			}
			context.takeScreenshot("visceral_08_pools");
			logState(context, server, "pools");

			// Walk through the blood: footprints.
			// Walk straight through the pool under the cow.
			double[] pool = context.computeOnClient(minecraft -> {
				for (var ragdoll : RagdollManager.get().all()) {
					if (ragdoll.entity.getType() == net.minecraft.world.entity.EntityType.COW) {
						var torso = ragdoll.torsoPosition();
						return new double[] {torso.x, torso.z};
					}
				}
				return new double[] {0.0, 3.0};
			});
			// Item and XP pickups during scripted teleports upset the test harness's packet synchronizer.
			server.runCommand("kill @e[type=minecraft:item]");
			server.runCommand("kill @e[type=minecraft:experience_orb]");
			context.waitTicks(2);
			for (int step = 0; step < 18; step++) {
				server.runCommand(String.format(java.util.Locale.ROOT, "tp @p %.2f 100 %.2f -90 30", pool[0] - 0.8 + step * 0.4, pool[1] - 0.25));
				context.waitTicks(3);
			}
			server.runCommand(String.format(java.util.Locale.ROOT, "tp @p %.2f 102.6 %.2f 25 42", pool[0] + 4.0, pool[1] - 3.2));
			context.waitTicks(5);
			context.takeScreenshot("visceral_08b_footprints");
			logState(context, server, "footprints");

			// Close-up from above.
			server.runCommand("tp @p 0 104.5 -1.5 0 60");
			context.waitTicks(10);
			context.takeScreenshot("visceral_09_overhead");

			// Explosion launching the corpses.
			server.runCommand("summon minecraft:tnt 0 100 4 {fuse:1}");
			context.waitTicks(4);
			server.runCommand("tp @p 0 102 -4 0 15");
			context.waitTicks(6);
			context.takeScreenshot("visceral_10_explosion");
			context.waitTicks(30);
			context.takeScreenshot("visceral_11_after_explosion");
			logState(context, server, "after explosion");
		}
	}

	private static void buildArena(TestServerContext server) {
		server.runCommand("gamerule minecraft:advance_time false");
		server.runCommand("gamerule minecraft:advance_weather false");
		server.runCommand("gamerule minecraft:spawn_mobs false");
		server.runCommand("time set 6000");
		server.runCommand("weather clear");
		server.runCommand("fill -12 98 -12 12 98 12 minecraft:stone");
		server.runCommand("fill -12 99 -12 12 99 12 minecraft:light_gray_concrete");
		server.runCommand("fill -12 100 -12 12 112 12 minecraft:air");
		server.runCommand("fill -12 100 6 12 105 6 minecraft:white_concrete");
		server.runCommand("fill -12 100 -12 -12 105 12 minecraft:white_concrete");
		server.runCommand("fill 12 100 -12 12 105 12 minecraft:white_concrete");
		server.runCommand("kill @e[type=!minecraft:player]");
		server.runCommand("tp @p 0 100 -2.5 0 18");
		int x = -4;
		for (String mob : MOBS) {
			server.runCommand("summon " + mob + " " + x + " 100 3 {NoAI:1b,Rotation:[180f,0f],PersistenceRequired:1b}");
			x += 2;
		}
		server.runCommand("effect give @e[type=!minecraft:player] minecraft:fire_resistance infinite 0 true");
	}

	private static void logRagdolls(ClientGameTestContext context, String stage) {
		context.runOnClient(minecraft -> {
			for (var ragdoll : RagdollManager.get().all()) {
				LOGGER.info("[{}] {}", stage, ragdoll.debugSummary());
				if (stage.equals("t+198") && !ragdoll.isSleeping()) {
					LOGGER.info("[{}] bodies:{}", stage, ragdoll.debugBodies());
				}
			}
		});
	}

	private static void logState(ClientGameTestContext context, TestServerContext server, String stage) {
		int woundCount = server.computeOnServer(minecraftServer -> {
			int count = 0;
			for (Entity entity : minecraftServer.overworld().getAllEntities()) {
				if (entity instanceof LivingEntity living) {
					WoundData data = living.getAttached(VisceralAttachments.WOUNDS);
					count += data == null ? 0 : data.wounds().size();
				}
			}
			return count;
		});
		context.runOnClient(minecraft -> LOGGER.info(
			"[{}] server wounds={} decals={} (pools={} footprints={}) particles={} ragdolls={} simulating={}",
			stage, woundCount, BloodDecals.count(), BloodDecals.count(BloodDecals.POOL), BloodDecals.count(BloodDecals.FOOTPRINT), BloodParticles.count(), RagdollManager.get().count(), RagdollManager.get().simulatingCount()
		));
	}
}
