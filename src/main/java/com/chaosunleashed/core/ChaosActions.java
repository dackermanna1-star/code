package com.chaosunleashed.core;

import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import org.jetbrains.annotations.Nullable;

/**
 * The single implementation of every settings change. Chat commands, the clickable chat menu and the Chaos
 * Control Panel all call these methods, so they always change exactly the same data and give the same feedback.
 */
public final class ChaosActions {
	private ChaosActions() {
	}

	public static MutableText prefix() {
		return Text.literal("[Chaos] ").formatted(Formatting.GOLD);
	}

	public static Text setEnabled(ChaosEventManager manager, ChaosEventType type, boolean enabled) {
		manager.setEnabled(type, enabled);
		return prefix().append(type.coloredName())
			.append(enabled ? Text.literal(" enabled").formatted(Formatting.GREEN) : Text.literal(" disabled").formatted(Formatting.RED))
			.append(Text.literal(" for random triggering").formatted(Formatting.GRAY));
	}

	public static Text toggle(ChaosEventManager manager, ChaosEventType type) {
		return setEnabled(manager, type, !manager.data().isEnabled(type));
	}

	public static Text setAll(ChaosEventManager manager, boolean enabled) {
		for (ChaosEventType type : ChaosEventType.values()) {
			manager.setEnabled(type, enabled);
		}
		return prefix().append(Text.literal("All events ").formatted(Formatting.WHITE))
			.append(enabled ? Text.literal("enabled").formatted(Formatting.GREEN) : Text.literal("disabled").formatted(Formatting.RED));
	}

	public static Text setRandom(ChaosEventManager manager, boolean enabled) {
		manager.setRandomEnabled(enabled);
		return prefix().append(Text.literal("Random events ").formatted(Formatting.WHITE))
			.append(enabled ? Text.literal("ON").formatted(Formatting.GREEN, Formatting.BOLD) : Text.literal("OFF").formatted(Formatting.RED, Formatting.BOLD));
	}

	public static ChaosEventManager.StartResult start(ChaosEventManager manager, ChaosEventType type, ServerWorld world, BlockPos pos,
													  @Nullable ServerPlayerEntity target, int intensity) {
		return manager.start(type, world, pos, target, intensity, true);
	}

	public static Text stopAll(ChaosEventManager manager) {
		int count = manager.stopAll();
		if (count == 0) {
			return prefix().append(Text.literal("No event is running.").formatted(Formatting.GRAY));
		}
		return prefix().append(Text.literal("Stopped " + count + (count == 1 ? " event" : " events") + " and cleaned up.").formatted(Formatting.YELLOW));
	}

	public static Text stop(ChaosEventManager manager, ChaosEventType type) {
		if (manager.stop(type)) {
			return prefix().append(type.coloredName()).append(Text.literal(" stopped and cleaned up.").formatted(Formatting.YELLOW));
		}
		return prefix().append(type.coloredName()).append(Text.literal(" is not running.").formatted(Formatting.GRAY));
	}
}
