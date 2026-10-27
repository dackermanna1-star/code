package com.realweather.client;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.screen.RealWeatherConfigScreen;
import com.realweather.client.weather.ClientWeather;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.network.chat.Component;

/**
 * Client-side {@code /realweather} command for the visual/audio settings (works on any server):
 * {@code config}, {@code quality <preset>}, {@code set <option> <value>}, {@code get <option>}, {@code debug},
 * {@code reload}, {@code info}.
 */
final class ClientCommands {
	private ClientCommands() {
	}

	static void register(CommandDispatcher<FabricClientCommandSource> dispatcher) {
		dispatcher.register(ClientCommandManager.literal("realweather")
			.executes(context -> help(context.getSource()))
			.then(ClientCommandManager.literal("config").executes(context -> {
				Minecraft client = context.getSource().getClient();
				client.schedule(() -> client.setScreen(new RealWeatherConfigScreen(null)));
				return 1;
			}))
			.then(ClientCommandManager.literal("quality")
				.then(ClientCommandManager.argument("preset", StringArgumentType.word())
					.suggests((context, builder) -> SharedSuggestionProvider.suggest(List.of("low", "medium", "high", "ultra"), builder))
					.executes(context -> setOption(context, "quality", StringArgumentType.getString(context, "preset")))))
			.then(ClientCommandManager.literal("set")
				.then(ClientCommandManager.argument("option", StringArgumentType.word())
					.suggests((context, builder) -> SharedSuggestionProvider.suggest(optionNames(), builder))
					.then(ClientCommandManager.argument("value", StringArgumentType.greedyString())
						.executes(context -> setOption(context, StringArgumentType.getString(context, "option"), StringArgumentType.getString(context, "value"))))))
			.then(ClientCommandManager.literal("get")
				.then(ClientCommandManager.argument("option", StringArgumentType.word())
					.suggests((context, builder) -> SharedSuggestionProvider.suggest(optionNames(), builder))
					.executes(context -> getOption(context.getSource(), StringArgumentType.getString(context, "option")))))
			.then(ClientCommandManager.literal("debug").executes(context -> {
				ClientConfig.get().debugOverlay = !ClientConfig.get().debugOverlay;
				ClientConfig.save();
				context.getSource().sendFeedback(Component.translatable(ClientConfig.get().debugOverlay ? "realweather.client.debug.on" : "realweather.client.debug.off"));
				return 1;
			}))
			.then(ClientCommandManager.literal("reload").executes(context -> {
				ClientConfig.load();
				context.getSource().sendFeedback(Component.translatable("realweather.client.reloaded"));
				return 1;
			}))
			.then(ClientCommandManager.literal("info").executes(context -> info(context.getSource()))));
	}

	private static int help(FabricClientCommandSource source) {
		source.sendFeedback(Component.translatable("realweather.client.help").withStyle(ChatFormatting.GRAY));
		return 1;
	}

	private static int info(FabricClientCommandSource source) {
		ClientWeather weather = ClientWeather.get();
		source.sendFeedback(Component.literal(String.format(Locale.ROOT, "%s · precipitation %.0f%% · wind %.1f m/s · %s",
			weather.state().type.id(), weather.precipitation(1.0F) * 100.0F, weather.windSpeed(1.0F),
			weather.isServerSynced() ? "synced with server" : "derived from vanilla weather")));
		return 1;
	}

	static List<String> optionNames() {
		List<String> names = new ArrayList<>();
		for (Field field : ClientConfig.class.getFields()) {
			if (!Modifier.isStatic(field.getModifiers()) && !field.getName().startsWith("_")) {
				names.add(field.getName());
			}
		}
		return names;
	}

	private static Field field(String name) {
		for (Field field : ClientConfig.class.getFields()) {
			if (!Modifier.isStatic(field.getModifiers()) && field.getName().equalsIgnoreCase(name)) {
				return field;
			}
		}
		return null;
	}

	private static int getOption(FabricClientCommandSource source, String name) {
		Field field = field(name);
		if (field == null) {
			source.sendError(Component.translatable("realweather.client.unknown_option", name));
			return 0;
		}
		try {
			source.sendFeedback(Component.literal(field.getName() + " = " + field.get(ClientConfig.get())));
		} catch (IllegalAccessException e) {
			return 0;
		}
		return 1;
	}

	private static int setOption(CommandContext<FabricClientCommandSource> context, String name, String value) {
		FabricClientCommandSource source = context.getSource();
		Field field = field(name);
		if (field == null) {
			source.sendError(Component.translatable("realweather.client.unknown_option", name));
			return 0;
		}
		ClientConfig config = ClientConfig.get();
		try {
			Class<?> type = field.getType();
			String trimmed = value.trim();
			if (type == boolean.class) {
				boolean parsed = switch (trimmed.toLowerCase(Locale.ROOT)) {
					case "true", "on", "yes", "1" -> true;
					case "false", "off", "no", "0" -> false;
					default -> throw new IllegalArgumentException(trimmed);
				};
				field.setBoolean(config, parsed);
			} else if (type == float.class) {
				field.setFloat(config, Float.parseFloat(trimmed));
			} else if (type == int.class) {
				field.setInt(config, Integer.parseInt(trimmed));
			} else if (type == String.class) {
				if (field.getName().equals("quality") && ClientConfig.parseQuality(trimmed) == null) {
					throw new IllegalArgumentException(trimmed);
				}
				field.set(config, trimmed.toLowerCase(Locale.ROOT));
			} else {
				return 0;
			}
		} catch (IllegalArgumentException | IllegalAccessException e) {
			source.sendError(Component.translatable("realweather.client.bad_value", value, field.getName()));
			return 0;
		}
		ClientConfig.save();
		try {
			source.sendFeedback(Component.translatable("realweather.client.set", field.getName(), String.valueOf(field.get(config))));
		} catch (IllegalAccessException ignored) {
			// Unreachable for public fields.
		}
		return 1;
	}
}
