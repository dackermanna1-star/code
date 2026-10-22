package dev.juukulius.command;

import com.mojang.brigadier.arguments.FloatArgumentType;
import dev.juukulius.character.ActionState;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.character.JuliusData;
import dev.juukulius.character.JuliusServer;
import dev.juukulius.combat.Ability;
import dev.juukulius.combat.CombatRules;
import java.util.Arrays;
import java.util.Collection;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;

/**
 * {@code /julius} (operators only): inspect and adjust Julius state, mainly for testing and map-making.
 * <ul>
 *     <li>{@code /julius transform <targets>}: toggle the transformation</li>
 *     <li>{@code /julius mana <targets> <amount>}: set mana</li>
 *     <li>{@code /julius reset <targets>}: clear cooldowns and refill mana</li>
 *     <li>{@code /julius info <target>}: print the current state</li>
 * </ul>
 */
public final class JuliusCommands {
	private JuliusCommands() {
	}

	public static void init() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(
			Commands.literal("julius")
				.requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.literal("transform").then(Commands.argument("targets", EntityArgument.players())
					.executes(context -> transform(context.getSource(), EntityArgument.getPlayers(context, "targets")))))
				.then(Commands.literal("mana").then(Commands.argument("targets", EntityArgument.players())
					.then(Commands.argument("amount", FloatArgumentType.floatArg(0.0F, CombatRules.MAX_MANA))
						.executes(context -> mana(context.getSource(), EntityArgument.getPlayers(context, "targets"),
							FloatArgumentType.getFloat(context, "amount"))))))
				.then(Commands.literal("reset").then(Commands.argument("targets", EntityArgument.players())
					.executes(context -> reset(context.getSource(), EntityArgument.getPlayers(context, "targets")))))
				.then(Commands.literal("info").then(Commands.argument("target", EntityArgument.player())
					.executes(context -> info(context.getSource(), EntityArgument.getPlayer(context, "target")))))
		));
	}

	private static int transform(CommandSourceStack source, Collection<ServerPlayer> players) {
		for (ServerPlayer player : players) {
			JuliusData data = JuliusAttachments.data(player);
			ActionState state = JuliusServer.state(player);
			if (data.transformed) {
				JuliusServer.revert(player, data, state, false);
			} else {
				JuliusServer.transform(player, data, state);
			}
		}

		source.sendSuccess(() -> Component.translatable("commands.julius_juukulius.transform", players.size()), true);
		return players.size();
	}

	private static int mana(CommandSourceStack source, Collection<ServerPlayer> players, float amount) {
		for (ServerPlayer player : players) {
			JuliusAttachments.data(player).mana = amount;
			JuliusServer.forceSync(player);
		}

		source.sendSuccess(() -> Component.translatable("commands.julius_juukulius.mana", amount, players.size()), true);
		return players.size();
	}

	private static int reset(CommandSourceStack source, Collection<ServerPlayer> players) {
		for (ServerPlayer player : players) {
			JuliusData data = JuliusAttachments.data(player);
			Arrays.fill(data.cooldowns, 0);
			data.mana = CombatRules.MAX_MANA;
			JuliusServer.forceSync(player);
		}

		source.sendSuccess(() -> Component.translatable("commands.julius_juukulius.reset", players.size()), true);
		return players.size();
	}

	private static int info(CommandSourceStack source, ServerPlayer player) {
		JuliusData data = JuliusAttachments.data(player);
		StringBuilder cooldowns = new StringBuilder();
		for (Ability ability : Ability.values()) {
			int ticks = data.cooldown(ability);
			if (ticks > 0) {
				cooldowns.append(ability.id).append('=').append(ticks).append(' ');
			}
		}

		source.sendSuccess(() -> Component.literal(String.format(
			"%s: transformed=%s spirits=%s spirit=%s mana=%.1f ultimate=%d cooldowns=[%s]",
			player.getName().getString(), data.transformed, data.spiritsOut, data.spirit().id, data.mana, data.ultimateTicks,
			cooldowns.toString().trim()
		)), false);
		return 1;
	}
}
