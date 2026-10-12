package com.extremesports.client;

import com.extremesports.physics.RideController;
import com.extremesports.trick.BailReason;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.LandingQuality;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

/**
 * Coaching feedback shown in Practice mode (and for bails whenever tips are enabled): explains why a landing
 * was sketchy or why you bailed, and what to do next time.
 */
public final class PracticeTips {
	private PracticeTips() {
	}

	private static boolean practicing() {
		return "practice".equals(ClientSportsState.challenge.challenge());
	}

	private static void show(Component tip) {
		Minecraft mc = Minecraft.getInstance();
		ClientSportsState.tip = tip;
		ClientSportsState.tipTime = mc.level == null ? 0 : mc.level.getGameTime();
	}

	public static void onLand(RideController ride, LandingQuality quality, ComboEntry entry) {
		if (!ClientConfig.get().showTips || !practicing()) {
			return;
		}
		switch (quality) {
			case PERFECT -> show(Component.translatable("tip.extremesports.perfect"));
			case CLEAN -> {
				if (ride.entityPreset().perfectNeedsPrep) {
					show(Component.translatable("tip.extremesports.clean_prep"));
				} else {
					show(Component.translatable("tip.extremesports.clean_align"));
				}
			}
			case SKETCHY -> {
				if (ride.lastLandingHadGrab) {
					show(Component.translatable("tip.extremesports.sketchy_grab"));
				} else if (ride.lastLandingIncomplete) {
					show(Component.translatable("tip.extremesports.sketchy_trick"));
				} else {
					show(Component.translatable("tip.extremesports.sketchy_angle", Math.round(ride.lastLandingError)));
				}
			}
			default -> {
			}
		}
	}

	public static void onBail(BailReason reason) {
		if (!ClientConfig.get().showTips) {
			return;
		}
		show(Component.translatable("tip.extremesports.bail." + reason.name().toLowerCase(java.util.Locale.ROOT)));
	}
}
