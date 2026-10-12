package com.extremesports.client.input;

import com.extremesports.client.ClientConfig;
import com.extremesports.client.anim.BailAnimations;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.RideInput;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.client.player.LocalPlayer;

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
		// Read the key mappings directly: the player's own input is only refreshed after the vehicle has ticked,
		// which would add a tick of latency to every push, pop and turn.
		Options options = mc.options;
		boolean mouse = ClientConfig.get().steering == ClientConfig.SteeringMode.MOUSE;
		return new RideInput(
			options.keyUp.isDown(),
			options.keyDown.isDown(),
			options.keyLeft.isDown(),
			options.keyRight.isDown(),
			held(options.keyJump),
			held(Keybinds.FLIP),
			held(Keybinds.GRAB),
			held(Keybinds.GRIND),
			held(Keybinds.WHIP),
			player.getYRot(),
			mouse
		);
	}

	/** Drops taps made while not riding so they don't fire a trick on the next mount. */
	public static void discardTaps() {
		for (KeyMapping key : new KeyMapping[]{Keybinds.FLIP, Keybinds.GRAB, Keybinds.GRIND, Keybinds.WHIP, Minecraft.getInstance().options.keyJump}) {
			while (key.consumeClick()) {
				// discard
			}
		}
	}

	/** Held now, or tapped since the last tick (a tap shorter than one tick would otherwise be missed). */
	private static boolean held(KeyMapping key) {
		boolean tapped = false;
		while (key.consumeClick()) {
			tapped = true;
		}
		return key.isDown() || tapped;
	}
}
