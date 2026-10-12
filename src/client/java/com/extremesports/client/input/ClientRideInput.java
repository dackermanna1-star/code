package com.extremesports.client.input;

import com.extremesports.client.ClientConfig;
import com.extremesports.client.anim.BailAnimations;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.RideInput;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.player.Input;

/** Reads the local player's keys into a {@link RideInput} for the ride simulation. */
public final class ClientRideInput {
	private ClientRideInput() {
	}

	public static RideInput poll(SportEquipmentEntity entity) {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (player == null || mc.screen != null || BailAnimations.localLocked()) {
			return RideInput.NONE;
		}
		Input keys = player.input.keyPresses;
		boolean mouse = ClientConfig.get().steering == ClientConfig.SteeringMode.MOUSE;
		return new RideInput(
			keys.forward(),
			keys.backward(),
			keys.left(),
			keys.right(),
			keys.jump(),
			Keybinds.FLIP.isDown(),
			Keybinds.GRAB.isDown(),
			Keybinds.GRIND.isDown(),
			Keybinds.WHIP.isDown(),
			player.getYRot(),
			mouse
		);
	}
}
