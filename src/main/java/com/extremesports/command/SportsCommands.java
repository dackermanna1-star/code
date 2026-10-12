package com.extremesports.command;

import com.extremesports.server.ChallengeManager;
import com.extremesports.server.ParkBuilder;
import com.extremesports.server.PlayerSportData;
import com.extremesports.server.ScoreService;
import com.extremesports.server.Unlocks;
import com.extremesports.sport.PhysicsPreset;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import java.util.Arrays;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;

/**
 * /extremesports (alias /xs): stats, challenges, presets and park building.
 */
public final class SportsCommands {
	private SportsCommands() {
	}

	public static void init() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> register(dispatcher));
	}

	private static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
		LiteralArgumentBuilder<CommandSourceStack> root = Commands.literal("extremesports")
			.then(Commands.literal("stats").executes(context -> stats(context.getSource().getPlayerOrException(), context.getSource())))
			.then(Commands.literal("challenge")
				.then(Commands.literal("start").then(Commands.argument("type", StringArgumentType.word())
					.suggests((context, builder) -> SharedSuggestionProvider.suggest(
						Arrays.stream(ChallengeManager.Type.values()).map(type -> type.id), builder))
					.executes(context -> {
						ChallengeManager.Type type = ChallengeManager.Type.byId(StringArgumentType.getString(context, "type"));
						if (type == null) {
							context.getSource().sendFailure(Component.translatable("command.extremesports.unknown_challenge"));
							return 0;
						}
						ChallengeManager.start(context.getSource().getPlayerOrException(), type);
						return 1;
					})))
				.then(Commands.literal("stop").executes(context -> {
					ChallengeManager.stop(context.getSource().getPlayerOrException());
					return 1;
				})))
			.then(Commands.literal("preset").then(Commands.argument("preset", StringArgumentType.word())
				.suggests((context, builder) -> SharedSuggestionProvider.suggest(Arrays.stream(PhysicsPreset.values()).map(PhysicsPreset::id), builder))
				.executes(context -> {
					ServerPlayer player = context.getSource().getPlayerOrException();
					PhysicsPreset preset = PhysicsPreset.byId(StringArgumentType.getString(context, "preset"));
					PlayerSportData data = PlayerSportData.get(player);
					data.setSettings(preset, data.goofy(), data.autoPickup());
					PlayerSportData.save(player, data);
					context.getSource().sendSuccess(() -> Component.translatable("command.extremesports.preset", Component.translatable(preset.translationKey())), false);
					return 1;
				})))
			.then(Commands.literal("park").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.argument("prefab", StringArgumentType.word())
					.suggests((context, builder) -> SharedSuggestionProvider.suggest(
						Arrays.stream(ParkBuilder.Prefab.values()).map(prefab -> prefab.id), builder))
					.executes(context -> {
						ServerPlayer player = context.getSource().getPlayerOrException();
						ParkBuilder.Prefab prefab = ParkBuilder.Prefab.byId(StringArgumentType.getString(context, "prefab"));
						BlockPos origin = player.blockPosition().relative(player.getDirection(), 2);
						ParkBuilder.build(player.level(), origin, player.getDirection(), prefab);
						context.getSource().sendSuccess(() -> Component.translatable("message.extremesports.builder_built",
							Component.translatable("prefab.extremesports." + prefab.id)), true);
						return 1;
					})))
			.then(Commands.literal("unlockall").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS)).executes(context -> {
				ServerPlayer player = context.getSource().getPlayerOrException();
				PlayerSportData data = PlayerSportData.get(player);
				data.unlocked.addAll(Unlocks.all().keySet());
				ScoreService.saveAndAnnounce(player, data);
				context.getSource().sendSuccess(() -> Component.translatable("command.extremesports.unlocked_all"), true);
				return 1;
			}))
			.then(Commands.literal("resetstats").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS)).executes(context -> {
				ServerPlayer player = context.getSource().getPlayerOrException();
				PlayerSportData old = PlayerSportData.get(player);
				PlayerSportData fresh = new PlayerSportData();
				fresh.setSettings(old.preset(), old.goofy(), old.autoPickup());
				PlayerSportData.save(player, fresh);
				context.getSource().sendSuccess(() -> Component.translatable("command.extremesports.reset"), true);
				return 1;
			}));
		dispatcher.register(root);
		dispatcher.register(Commands.literal("xs").redirect(dispatcher.getRoot().getChild("extremesports")));
	}

	private static int stats(ServerPlayer player, CommandSourceStack source) {
		PlayerSportData data = PlayerSportData.get(player);
		source.sendSuccess(() -> Component.translatable("command.extremesports.stats_header").withStyle(ChatFormatting.GOLD), false);
		line(source, "best_combo", String.format("%,d", data.bestCombo));
		line(source, "best_trick", String.format("%,d", data.bestTrick));
		line(source, "total_score", String.format("%,d", data.totalScore));
		line(source, "tricks_landed", String.valueOf(data.tricksLanded));
		line(source, "perfect_landings", String.valueOf(data.perfectLandings));
		line(source, "longest_grind", String.format("%.1f", data.longestGrind));
		line(source, "longest_manual", String.format("%.1f s", data.longestManual / 20.0F));
		line(source, "distance", String.format("%.0f m", data.distance));
		line(source, "biggest_spin", data.biggestSpin + "°");
		line(source, "bails", String.valueOf(data.bails));
		line(source, "unique_tricks", data.landedTricks.size() + "");
		return 1;
	}

	private static void line(CommandSourceStack source, String key, String value) {
		source.sendSuccess(() -> Component.translatable("stats.extremesports." + key).append(": ")
			.append(Component.literal(value).withStyle(ChatFormatting.AQUA)), false);
	}
}
