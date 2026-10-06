package com.gojosatoru.test;

import com.gojosatoru.GojoRegistry;
import com.gojosatoru.client.GojoKeys;
import com.gojosatoru.power.GojoPowers;
import java.util.List;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.CameraType;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.entity.projectile.arrow.Arrow;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Drives the real game through every technique with the real key bindings, checks that each one
 * does what it should, and takes screenshots along the way.
 * Run with {@code xvfb-run ./gradlew runClientGameTest}.
 */
public class GojoVisualTest implements FabricClientGameTest {
    @Override
    public void runTest(ClientGameTestContext context) {
        context.getInput().resizeWindow(320, 240);
        context.runOnClient(minecraft -> {
            minecraft.options.renderDistance().set(5);
            minecraft.options.simulationDistance().set(5);
            minecraft.options.menuBackgroundBlurriness().set(0);
        });
        try (TestSingleplayerContext world = context.worldBuilder().create()) {
            world.getClientWorld().waitForChunksRender();
            context.getInput().resizeWindow(1280, 720);
            TestServerContext server = world.getServer();
            server.runCommand("time set 6000");
            server.runCommand("difficulty easy");
            server.runCommand("tp @a 0 -60 0 0 0");
            server.runCommand("fill -9 -60 22 9 -49 24 minecraft:stone_bricks");
            server.runCommand("fill -14 -60 34 14 -44 35 minecraft:deepslate_tiles");
            context.waitTicks(30);

            // --- transformation ---------------------------------------------------------------
            context.getInput().pressKey(GojoKeys.TRANSFORM);
            context.waitTicks(6);
            context.takeScreenshot("gojo_01_transform");
            check(server.computeOnServer(s -> GojoPowers.isGojo(player(s))), "player should be transformed");
            check(server.computeOnServer(s -> player(s).getMaxHealth()) == 40.0F, "Gojo should have 40 max health");
            context.waitTicks(20);
            clearChat(context);
            setCamera(context, CameraType.THIRD_PERSON_FRONT);
            context.waitTicks(4);
            context.takeScreenshot("gojo_02_skin_front");
            server.runOnServer(s -> GojoPowers.revealSixEyes(player(s), 60));
            context.waitTicks(3);
            context.takeScreenshot("gojo_03_six_eyes");
            setCamera(context, CameraType.THIRD_PERSON_BACK);
            context.waitTicks(4);
            context.takeScreenshot("gojo_04_skin_back");
            setCamera(context, CameraType.FIRST_PERSON);
            server.runCommand("time set 14000");

            // --- Infinity -----------------------------------------------------------------------
            float before = server.computeOnServer(s -> player(s).getHealth());
            server.runCommand("damage @p 6 minecraft:generic");
            context.waitTicks(2);
            float after = server.computeOnServer(s -> player(s).getHealth());
            check(after == before, "Infinity should block damage (health " + before + " -> " + after + ")");
            server.runCommand("summon arrow 0.5 -58.6 8.5 {Motion:[0.0,0.0,-1.6d]}");
            context.waitTicks(10);
            context.takeScreenshot("gojo_05_infinity_arrow");
            double arrowDistance = server.computeOnServer(s -> {
                ServerPlayer p = player(s);
                List<Arrow> arrows = p.level().getEntitiesOfClass(Arrow.class, p.getBoundingBox().inflate(10.0));
                return arrows.isEmpty() ? -1.0 : arrows.get(0).distanceTo(p);
            });
            check(arrowDistance > 0.8 && arrowDistance < 5.0, "arrow should hang in mid-air near the player, was " + arrowDistance);
            server.runCommand("kill @e[type=arrow]");

            // --- Blue ---------------------------------------------------------------------------
            summonZombies(server, 9, 3);
            server.runCommand("tp @a 0 -60 0 0 12");
            context.waitTicks(5);
            context.getInput().holdKey(GojoKeys.BLUE);
            context.waitTicks(16);
            context.takeScreenshot("gojo_06_blue");
            context.waitTicks(20);
            context.takeScreenshot("gojo_07_blue_pulling");
            context.getInput().releaseKey(GojoKeys.BLUE);
            context.waitTicks(9);
            context.takeScreenshot("gojo_08_blue_collapse");
            check(server.computeOnServer(s -> zombiesHurt(s) > 0), "Blue should crush the zombies");
            context.waitTicks(40);

            // --- Red ----------------------------------------------------------------------------
            server.runCommand("kill @e[type=!player]");
            summonZombies(server, 14, 3);
            server.runCommand("tp @a 0 -60 0 0 3");
            context.waitTicks(5);
            context.getInput().pressKey(GojoKeys.RED);
            context.waitTicks(6);
            context.takeScreenshot("gojo_09_red_charge");
            context.waitTicks(3);
            context.takeScreenshot("gojo_10_red_fly");
            context.waitTicks(4);
            context.takeScreenshot("gojo_11_red_impact");
            check(server.computeOnServer(s -> zombiesHurt(s) > 0), "Red should blast the zombies");
            context.waitTicks(12);
            context.takeScreenshot("gojo_12_red_after");
            context.waitTicks(80);

            // --- Hollow Purple ------------------------------------------------------------------
            server.runCommand("kill @e[type=!player]");
            server.runCommand("tp @a 0 -60 -4 0 0");
            context.waitTicks(5);
            context.getInput().pressKey(GojoKeys.PURPLE);
            context.waitTicks(14);
            context.takeScreenshot("gojo_13_purple_charge");
            context.waitTicks(16);
            context.takeScreenshot("gojo_14_purple_merge");
            context.waitTicks(12);
            context.takeScreenshot("gojo_15_purple_grow");
            context.waitTicks(4);
            context.takeScreenshot("gojo_16_purple_fire");
            setCamera(context, CameraType.THIRD_PERSON_BACK);
            context.waitTicks(10);
            context.takeScreenshot("gojo_17_purple_travel");
            context.waitTicks(14);
            context.takeScreenshot("gojo_18_purple_tunnel");
            setCamera(context, CameraType.FIRST_PERSON);
            check(server.computeOnServer(s -> player(s).level().getBlockState(new BlockPos(0, -58, 23)).isAir()),
                    "Hollow Purple should erase the wall");
            context.waitTicks(100);
            context.takeScreenshot("gojo_19_purple_aftermath");
            check(server.computeOnServer(s -> player(s).level().getEntitiesOfClass(
                    com.gojosatoru.entity.HollowPurpleEntity.class, new AABB(-300, -100, -300, 300, 100, 300)).isEmpty()),
                    "Hollow Purple should be gone after its flight");

            // --- Domain Expansion ---------------------------------------------------------------
            server.runCommand("kill @e[type=!player]");
            server.runCommand("tp @a 30 -60 -30 0 0");
            for (int i = -2; i <= 2; i++) {
                server.runCommand("summon zombie " + (30 + i * 3) + " -60 -22 {PersistenceRequired:1b}");
            }
            server.runCommand("summon skeleton 34 -60 -26 {PersistenceRequired:1b}");
            context.waitTicks(150);
            context.getInput().pressKey(GojoKeys.DOMAIN);
            context.waitTicks(3);
            context.takeScreenshot("gojo_20_domain_open");
            context.waitTicks(20);
            context.takeScreenshot("gojo_21_domain_inside");
            check(server.computeOnServer(s -> player(s).level().getBlockState(new BlockPos(30, -47, -30)).is(GojoRegistry.VOID_BARRIER)),
                    "Infinite Void should build its barrier");
            setCamera(context, CameraType.THIRD_PERSON_BACK);
            context.waitTicks(10);
            context.takeScreenshot("gojo_22_domain_3p");
            setCamera(context, CameraType.THIRD_PERSON_FRONT);
            context.waitTicks(4);
            context.takeScreenshot("gojo_22b_domain_six_eyes");
            setCamera(context, CameraType.FIRST_PERSON);
            server.runCommand("tp @a 30 -60 -60 0 -8");
            context.waitTicks(10);
            context.takeScreenshot("gojo_23_domain_outside");
            server.runCommand("tp @a 30 -60 -30 0 0");
            context.waitTicks(2);
            context.getInput().pressKey(GojoKeys.DOMAIN);
            context.waitTicks(20);
            check(server.computeOnServer(s -> !player(s).level().getBlockState(new BlockPos(30, -47, -30)).is(GojoRegistry.VOID_BARRIER)),
                    "Infinite Void should remove its barrier when it closes");
            context.takeScreenshot("gojo_24_domain_closed");

            // --- Teleport -----------------------------------------------------------------------
            server.runCommand("kill @e[type=!player]");
            Vec3 from = server.computeOnServer(s -> player(s).position());
            context.getInput().pressKey(GojoKeys.TELEPORT);
            context.waitTicks(2);
            context.takeScreenshot("gojo_25_teleport");
            Vec3 to = server.computeOnServer(s -> player(s).position());
            check(to.distanceTo(from) > 5.0, "teleport should move the player, moved " + to.distanceTo(from));

            // --- Revert -------------------------------------------------------------------------
            context.waitTicks(25);
            context.getInput().pressKey(GojoKeys.TRANSFORM);
            context.waitTicks(3);
            check(server.computeOnServer(s -> !GojoPowers.isGojo(player(s)) && player(s).getMaxHealth() == 20.0F),
                    "reverting should remove the Gojo form");
        }
    }

    private static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().get(0);
    }

    private static long zombiesHurt(MinecraftServer server) {
        ServerPlayer p = player(server);
        List<Zombie> zombies = p.level().getEntitiesOfClass(Zombie.class, p.getBoundingBox().inflate(40.0));
        return 3 - zombies.stream().filter(z -> z.getHealth() >= z.getMaxHealth()).count();
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void clearChat(ClientGameTestContext context) {
        context.runOnClient(minecraft -> minecraft.gui.getChat().clearMessages(false));
    }

    private static void setCamera(ClientGameTestContext context, CameraType type) {
        context.runOnClient(minecraft -> minecraft.options.setCameraType(type));
    }

    private static void summonZombies(TestServerContext server, int z, int count) {
        for (int i = 0; i < count; i++) {
            int x = (i - count / 2) * 2;
            server.runCommand("summon zombie " + x + " -60 " + z + " {PersistenceRequired:1b}");
        }
    }
}
