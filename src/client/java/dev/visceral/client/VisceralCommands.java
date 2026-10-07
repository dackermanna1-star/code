package dev.visceral.client;

import com.mojang.brigadier.CommandDispatcher;
import dev.visceral.VisceralConfig;
import dev.visceral.client.fx.BloodDecals;
import dev.visceral.client.fx.BloodParticles;
import dev.visceral.client.ragdoll.RagdollManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.minecraft.network.chat.Component;

/** {@code /visceral clear|reload|stats} - client side housekeeping. */
final class VisceralCommands {
	private VisceralCommands() {
	}

	static void register(CommandDispatcher<FabricClientCommandSource> dispatcher) {
		dispatcher.register(ClientCommandManager.literal("visceral")
			.then(ClientCommandManager.literal("clear").executes(context -> {
				int decals = BloodDecals.count();
				int ragdolls = RagdollManager.get().count();
				VisceralClient.clearAll();
				context.getSource().sendFeedback(Component.translatable("commands.visceral.clear", decals, ragdolls));
				return 1;
			}))
			.then(ClientCommandManager.literal("reload").executes(context -> {
				VisceralConfig.load();
				context.getSource().sendFeedback(Component.translatable("commands.visceral.reload"));
				return 1;
			}))
			.then(ClientCommandManager.literal("stats").executes(context -> {
				RagdollManager ragdolls = RagdollManager.get();
				context.getSource().sendFeedback(Component.translatable(
					"commands.visceral.stats", BloodDecals.count(), BloodParticles.count(), ragdolls.count(), ragdolls.simulatingCount()
				));
				return 1;
			}))
		);
	}
}
