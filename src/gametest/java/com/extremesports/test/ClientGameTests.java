package com.extremesports.test;

import com.extremesports.client.input.Keybinds;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.registry.ModEntities;
import com.extremesports.registry.ModItems;
import com.extremesports.sport.EquipmentKind;
import java.util.List;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.CameraType;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;

/**
 * Drives the real client: builds a park, rides each piece of equipment with real key presses and takes
 * screenshots of the animations, HUD and screens for visual review.
 */
public class ClientGameTests implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			world.getClientWorld().waitForChunksRender();
			for (String command : List.of("gamemode creative @a", "time set 6000", "weather clear", "gamerule advance_time false",
				"gamerule advance_weather false", "fill -40 -61 -40 60 -61 60 minecraft:smooth_stone", "tp @a 0 -60 0 0 0")) {
				world.getServer().runCommand(command);
			}
			context.waitTicks(10);
			world.getClientWorld().waitForChunksRender();

			// Skateboard: stance, push, crouch, ollie, kickflip, grab
			mount(context, world, EquipmentKind.STREET_BOARD, 0, 0, 0.0F);
			sideView(context, 0.0F);
			context.waitTicks(15);
			context.takeScreenshot("skateboard_idle");
			context.getInput().holdKey(options -> options.keyUp);
			context.waitTicks(4);
			context.takeScreenshot("skateboard_push_1");
			context.waitTicks(3);
			context.takeScreenshot("skateboard_push_2");
			context.waitTicks(30);
			context.getInput().releaseKey(options -> options.keyUp);
			context.getInput().holdKey(options -> options.keyJump);
			context.waitTicks(6);
			context.takeScreenshot("skateboard_crouch");
			context.getInput().releaseKey(options -> options.keyJump);
			context.waitTicks(4);
			context.takeScreenshot("skateboard_ollie");
			context.waitTicks(25);
			context.getInput().holdKey(options -> options.keyJump);
			context.waitTicks(4);
			context.getInput().releaseKey(options -> options.keyJump);
			context.waitTicks(1);
			context.getInput().pressKey(Keybinds.FLIP);
			context.waitTicks(3);
			context.takeScreenshot("skateboard_kickflip");
			context.waitTicks(25);
			context.getInput().holdKey(options -> options.keyJump);
			context.waitTicks(4);
			context.getInput().releaseKey(options -> options.keyJump);
			context.waitTicks(1);
			context.getInput().holdKeyFor(Keybinds.GRAB, 8);
			context.waitTicks(4);
			context.takeScreenshot("skateboard_grab");
			context.waitTicks(30);
			context.takeScreenshot("skateboard_hud_after_combo");
			dismount(context, world);

			// BMX
			mount(context, world, EquipmentKind.BMX, 0, 20, 0.0F);
			sideView(context, 0.0F);
			context.waitTicks(15);
			context.takeScreenshot("bmx_idle");
			context.getInput().holdKey(options -> options.keyUp);
			context.waitTicks(20);
			context.takeScreenshot("bmx_pedal");
			context.getInput().releaseKey(options -> options.keyUp);
			context.getInput().holdKey(options -> options.keyJump);
			context.waitTicks(5);
			context.getInput().releaseKey(options -> options.keyJump);
			context.waitTicks(1);
			context.getInput().pressKey(Keybinds.WHIP);
			context.waitTicks(4);
			context.takeScreenshot("bmx_tailwhip");
			context.waitTicks(30);
			dismount(context, world);

			// Scooter
			mount(context, world, EquipmentKind.SCOOTER, 0, 40, 0.0F);
			sideView(context, 0.0F);
			context.waitTicks(15);
			context.takeScreenshot("scooter_idle");
			context.getInput().holdKey(options -> options.keyUp);
			context.waitTicks(5);
			context.takeScreenshot("scooter_kick");
			context.waitTicks(10);
			context.getInput().releaseKey(options -> options.keyUp);
			dismount(context, world);

			// Skates
			mount(context, world, EquipmentKind.SKATES, 20, 0, 0.0F);
			sideView(context, 0.0F);
			context.waitTicks(15);
			context.takeScreenshot("skates_idle");
			context.getInput().holdKey(options -> options.keyUp);
			context.waitTicks(6);
			context.takeScreenshot("skates_stride");
			context.waitTicks(10);
			context.getInput().releaseKey(options -> options.keyUp);
			dismount(context, world);

			// The demo park
			world.getServer().runCommand("tp @a 30 -60 30 0 0");
			context.waitTicks(5);
			world.getServer().runCommand("execute as @p at @p run extremesports park full_park");
			context.waitTicks(20);
			world.getServer().runCommand("tp @a 30 -48 22 0 45");
			context.waitTicks(20);
			world.getClientWorld().waitForChunksRender();
			context.runOnClient(client -> client.options.setCameraType(CameraType.FIRST_PERSON));
			context.waitTicks(5);
			context.takeScreenshot("park_overview");
			world.getServer().runCommand("tp @a 18 -56 32 -90 30");
			context.waitTicks(10);
			world.getClientWorld().waitForChunksRender();
			context.takeScreenshot("park_halfpipe");
			world.getServer().runCommand("tp @a 43 -55 30 90 35");
			context.waitTicks(10);
			world.getClientWorld().waitForChunksRender();
			context.takeScreenshot("park_bowl");
			world.getServer().runCommand("tp @a 30 -57 42 180 25");
			context.waitTicks(10);
			world.getClientWorld().waitForChunksRender();
			context.takeScreenshot("park_street");
		}
	}

	private static void mount(ClientGameTestContext context, TestSingleplayerContext world, EquipmentKind kind, double x, double z, float yaw) {
		world.getServer().runOnServer(server -> {
			ServerPlayer player = server.getPlayerList().getPlayers().getFirst();
			player.teleportTo(player.level(), x, -60.0, z, java.util.Set.of(), yaw, 10.0F, false);
			SportEquipmentEntity entity = ModEntities.forSport(kind.sport()).create(player.level(), EntitySpawnReason.COMMAND);
			entity.setItem(new ItemStack(ModItems.forKind(kind)));
			entity.snapTo(x, -60.0, z, yaw, 0.0F);
			player.level().addFreshEntity(entity);
			player.startRiding(entity);
		});
		context.waitTicks(5);
	}

	private static void dismount(ClientGameTestContext context, TestSingleplayerContext world) {
		world.getServer().runOnServer(server -> {
			ServerPlayer player = server.getPlayerList().getPlayers().getFirst();
			if (player.getVehicle() instanceof SportEquipmentEntity entity) {
				player.stopRiding();
				entity.discard();
			}
		});
		context.waitTicks(5);
	}

	/** Looks 90 degrees to the side of travel so the third-person camera shows the rider in profile. */
	private static void sideView(ClientGameTestContext context, float boardYaw) {
		context.runOnClient(client -> {
			client.options.setCameraType(CameraType.THIRD_PERSON_BACK);
			if (client.player != null) {
				client.player.setYRot(boardYaw + 90.0F);
				client.player.setYHeadRot(boardYaw + 90.0F);
				client.player.setXRot(12.0F);
			}
		});
	}
}
