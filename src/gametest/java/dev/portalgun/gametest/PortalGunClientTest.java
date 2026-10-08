package dev.portalgun.gametest;

import dev.portalgun.dimension.Destination;
import dev.portalgun.dimension.Destinations;
import dev.portalgun.entity.PortalEntity;
import dev.portalgun.registry.ModComponents;
import dev.portalgun.registry.ModItems;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.Minecraft;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * Visual smoke test, run with: xvfb-run ./gradlew runClientGameTest
 * Env PORTALGUN_TEST selects what to do: "portal" (default) shows off portals + dial; "tour" visits every dimension;
 * "tour:a,b,c" visits only those dimensions. Screenshots land in build/run/clientGameTest/screenshots.
 */
public class PortalGunClientTest implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		String mode = System.getenv().getOrDefault("PORTALGUN_TEST", "portal");
		if (!mode.equals("portal") && !mode.startsWith("tour")) {
			return;
		}
		try (TestSingleplayerContext sp = context.worldBuilder().create()) {
			sp.getClientWorld().waitForChunksRender();
			sp.getServer().runCommand("gamerule advance_time false");
			sp.getServer().runCommand("gamerule advance_weather false");
			sp.getServer().runCommand("gamerule spawn_mobs true");
			sp.getServer().runCommand("time set 6000");
			sp.getServer().runCommand("weather clear");
			if (mode.startsWith("tour")) {
				this.tour(context, sp, mode);
			} else {
				this.portalShowcase(context, sp);
			}
		}
	}

	private void portalShowcase(ClientGameTestContext context, TestSingleplayerContext sp) {
		sp.getServer().runOnServer(server -> {
			ServerPlayer p = server.getPlayerList().getPlayers().get(0);
			ItemStack gun = new ItemStack(ModItems.PORTAL_GUN);
			gun.set(ModComponents.DESTINATION, Identifier.withDefaultNamespace("the_nether"));
			p.setItemInHand(InteractionHand.MAIN_HAND, gun);
			p.setYRot(0);
			p.setXRot(10);
			p.connection.teleport(p.getX(), p.getY(), p.getZ(), 0.0F, 10.0F);
			ServerLevel level = p.level();
			// standing portal 5 blocks ahead (player faces +Z / south)
			Vec3 base = p.position();
			PortalEntity wall = PortalEntity.create(level, new Vec3(base.x, base.y + PortalEntity.HEIGHT / 2 + 0.02, base.z + 5), Direction.NORTH,
				Identifier.withDefaultNamespace("the_nether"), p);
			wall.setLife(20 * 120);
			level.addFreshEntity(wall);
			PortalEntity floor = PortalEntity.create(level, new Vec3(base.x + 3.5, base.y + 0.03, base.z + 3), Direction.UP,
				Identifier.fromNamespaceAndPath("portalgun", "sporewood"), p);
			floor.setLife(20 * 120);
			level.addFreshEntity(floor);
		});
		context.waitTicks(30);
		context.takeScreenshot("portal_wall_and_floor");
		context.waitTicks(7);
		context.takeScreenshot("portal_wall_and_floor_later");
		context.runOnClient(mc -> mc.options.hideGui = true);
		sp.getServer().runOnServer(server -> {
			ServerPlayer p = server.getPlayerList().getPlayers().get(0);
			p.connection.teleport(p.getX(), p.getY(), p.getZ() + 2.6, 0.0F, 0.0F);
		});
		context.waitTicks(5);
		context.takeScreenshot("portal_closeup");
		context.runOnClient(mc -> mc.options.hideGui = false);
		// open the dial
		context.runOnClient(mc -> mc.setScreen(new dev.portalgun.client.screen.DimensionDialScreen(InteractionHand.MAIN_HAND, mc.player.getMainHandItem())));
		context.waitTicks(5);
		context.takeScreenshot("dial_screen");
		context.setScreen(() -> null);
		// walk through: push the player into the portal
		sp.getServer().runOnServer(server -> {
			ServerPlayer p = server.getPlayerList().getPlayers().get(0);
			p.connection.teleport(p.getX(), p.getY(), p.getZ() + 2.2, 0.0F, 0.0F);
		});
		context.waitFor(mc -> mc.level != null && mc.level.dimension().identifier().getPath().equals("the_nether"), 200);
		sp.getClientWorld().waitForChunksRender();
		context.waitTicks(20);
		context.takeScreenshot("arrived_nether");
		// turn around to see the return portal
		sp.getServer().runOnServer(server -> {
			ServerPlayer p = server.getPlayerList().getPlayers().get(0);
			p.connection.teleport(p.getX(), p.getY(), p.getZ(), p.getYRot() + 180.0F, 5.0F);
		});
		context.waitTicks(10);
		context.takeScreenshot("nether_return_portal");
	}

	private void tour(ClientGameTestContext context, TestSingleplayerContext sp, String mode) {
		List<Destination> targets = new ArrayList<>();
		String[] only = mode.contains(":") ? mode.substring(mode.indexOf(':') + 1).split(",") : new String[0];
		for (Destination d : Destinations.all()) {
			if (d.vanilla()) {
				continue;
			}
			if (only.length > 0 && !List.of(only).contains(d.id().getPath())) {
				continue;
			}
			targets.add(d);
		}
		context.runOnClient(mc -> mc.options.hideGui = true);
		for (Destination d : targets) {
			sp.getServer().runCommand("execute as @a run portalgun goto " + d.id().getPath());
			context.waitFor(mc -> mc.level != null && mc.level.dimension().identifier().equals(d.id()), 400);
			sp.getClientWorld().waitForChunksRender();
			context.waitTicks(40);
			float[][] views = {{0, 5}, {120, -10}, {240, 25}};
			for (int v = 0; v < views.length; v++) {
				float yaw = views[v][0];
				float pitch = views[v][1];
				sp.getServer().runOnServer(server -> {
					ServerPlayer p = server.getPlayerList().getPlayers().get(0);
					p.connection.teleport(p.getX(), p.getY() + 0.0, p.getZ(), yaw, pitch);
				});
				context.waitTicks(8);
				sp.getClientWorld().waitForChunksRender();
				context.takeScreenshot("tour_" + d.id().getPath() + "_" + v);
			}
			if ("1".equals(System.getenv("PORTALGUN_TOUR_AERIAL"))) {
				// extra high vantage point to judge the terrain shape (env PORTALGUN_TOUR_AERIAL=1)
				GameType[] prev = new GameType[1];
				double[] home = new double[3];
				sp.getServer().runOnServer(server -> {
					ServerPlayer p = server.getPlayerList().getPlayers().get(0);
					prev[0] = p.gameMode();
					home[0] = p.getX();
					home[1] = p.getY();
					home[2] = p.getZ();
					p.setGameMode(GameType.SPECTATOR);
					p.connection.teleport(p.getX(), p.getY() + 40, p.getZ(), 30.0F, 38.0F);
				});
				context.waitTicks(12);
				sp.getClientWorld().waitForChunksRender();
				context.takeScreenshot("tour_" + d.id().getPath() + "_3");
				sp.getServer().runOnServer(server -> {
					ServerPlayer p = server.getPlayerList().getPlayers().get(0);
					p.connection.teleport(home[0], home[1], home[2], 0.0F, 0.0F);
					p.setGameMode(prev[0]);
				});
			}
		}
	}
}
