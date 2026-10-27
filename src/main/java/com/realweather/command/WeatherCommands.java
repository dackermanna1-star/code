package com.realweather.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.BoolArgumentType;
import com.mojang.brigadier.arguments.FloatArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.DynamicCommandExceptionType;
import com.mojang.brigadier.exceptions.SimpleCommandExceptionType;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import com.realweather.config.RealWeatherConfig;
import com.realweather.weather.Climate;
import com.realweather.weather.WeatherSimulator;
import com.realweather.weather.WeatherState;
import com.realweather.weather.WeatherType;
import java.util.List;
import java.util.Locale;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.commands.arguments.TimeArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.biome.Biome;

/**
 * Extends the vanilla {@code /weather} command. Brigadier merges these nodes into the vanilla tree, so the
 * vanilla syntax ({@code /weather rain 6000}, {@code /weather clear 1d}) keeps working while gaining smooth
 * transitions, and new sub-commands become available with tab completion.
 *
 * <p>All feedback uses translatable components with an English fallback so players without the mod see readable
 * text too.
 */
public final class WeatherCommands {
	private static final SimpleCommandExceptionType NOT_RUNNING = new SimpleCommandExceptionType(
		Component.translatableWithFallback("realweather.command.not_running", "The weather simulation is not running"));
	private static final DynamicCommandExceptionType BAD_DIRECTION = new DynamicCommandExceptionType(value -> Component.translatableWithFallback(
		"realweather.command.bad_direction", "Unknown wind direction '%s' (use N, NE, E, ... or degrees 0-360)", value));

	private static final List<String> COMPASS = List.of("n", "nne", "ne", "ene", "e", "ese", "se", "sse", "s", "ssw", "sw", "wsw", "w", "wnw", "nw", "nnw");
	private static final SuggestionProvider<CommandSourceStack> DIRECTION_SUGGESTIONS = (context, builder) -> SharedSuggestionProvider.suggest(
		List.of("n", "ne", "e", "se", "s", "sw", "w", "nw", "0", "90", "180", "270"), builder);
	private static final SuggestionProvider<CommandSourceStack> SPEED_SUGGESTIONS = (context, builder) -> SharedSuggestionProvider.suggest(
		List.of("0", "3", "6", "10", "15", "20", "30"), builder);
	private static final SuggestionProvider<CommandSourceStack> INTENSITY_SUGGESTIONS = (context, builder) -> SharedSuggestionProvider.suggest(
		List.of("0.1", "0.25", "0.5", "0.75", "1.0"), builder);
	private static final SuggestionProvider<CommandSourceStack> SECONDS_SUGGESTIONS = (context, builder) -> SharedSuggestionProvider.suggest(
		List.of("60", "300", "600", "1200"), builder);

	private WeatherCommands() {
	}

	public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
		LiteralArgumentBuilder<CommandSourceStack> root = Commands.literal("weather")
			.requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
			.executes(context -> status(context.getSource()));

		root.then(Commands.literal("status").executes(context -> status(context.getSource())));

		for (WeatherType type : WeatherType.values()) {
			root.then(Commands.literal(type.id())
				.executes(context -> setWeather(context.getSource(), type, -1, -1.0F))
				.then(Commands.argument("duration", TimeArgument.time(1))
					.executes(context -> setWeather(context.getSource(), type, IntegerArgumentType.getInteger(context, "duration"), -1.0F))
					.then(Commands.argument("intensity", FloatArgumentType.floatArg(0.0F, 1.0F))
						.suggests(INTENSITY_SUGGESTIONS)
						.executes(context -> setWeather(context.getSource(), type, IntegerArgumentType.getInteger(context, "duration"),
							FloatArgumentType.getFloat(context, "intensity"))))));
		}

		root.then(Commands.literal("wind")
			.executes(context -> windInfo(context.getSource()))
			.then(Commands.literal("auto").executes(context -> setWind(context.getSource(), -1.0F, null)))
			.then(Commands.argument("speed", FloatArgumentType.floatArg(0.0F, 120.0F))
				.suggests(SPEED_SUGGESTIONS)
				.executes(context -> setWind(context.getSource(), FloatArgumentType.getFloat(context, "speed"), null))
				.then(Commands.argument("direction", StringArgumentType.word())
					.suggests(DIRECTION_SUGGESTIONS)
					.executes(context -> setWind(context.getSource(), FloatArgumentType.getFloat(context, "speed"),
						StringArgumentType.getString(context, "direction"))))));

		root.then(Commands.literal("intensity")
			.then(Commands.literal("auto").executes(context -> setIntensity(context.getSource(), -1.0F)))
			.then(Commands.argument("value", FloatArgumentType.floatArg(0.0F, 1.0F))
				.suggests(INTENSITY_SUGGESTIONS)
				.executes(context -> setIntensity(context.getSource(), FloatArgumentType.getFloat(context, "value")))));

		root.then(Commands.literal("duration")
			.then(Commands.argument("seconds", IntegerArgumentType.integer(1, 10_000_000))
				.suggests(SECONDS_SUGGESTIONS)
				.executes(context -> setDuration(context.getSource(), IntegerArgumentType.getInteger(context, "seconds")))));

		root.then(Commands.literal("dynamic")
			.executes(context -> dynamicInfo(context.getSource()))
			.then(Commands.argument("enabled", BoolArgumentType.bool())
				.executes(context -> setDynamic(context.getSource(), BoolArgumentType.getBool(context, "enabled")))));

		root.then(Commands.literal("reset").executes(context -> reset(context.getSource())));

		dispatcher.register(root);
	}

	private static WeatherSimulator simulator() throws CommandSyntaxException {
		WeatherSimulator simulator = WeatherSimulator.get();
		if (simulator == null) {
			throw NOT_RUNNING.create();
		}
		return simulator;
	}

	private static int setWeather(CommandSourceStack source, WeatherType type, int durationTicks, float intensity) throws CommandSyntaxException {
		WeatherSimulator simulator = simulator();
		simulator.beginRegime(type, durationTicks, intensity, true);
		WeatherState state = simulator.state();
		int ticks = state.remainingTicks;
		MutableComponent message = Component.translatableWithFallback("realweather.command.set", "Weather set to %s for %s (intensity %s)",
			typeName(type).withStyle(ChatFormatting.AQUA), formatDuration(ticks), percent(state.effectiveIntensity()));
		source.sendSuccess(() -> message, true);
		if (type.coldSnap > 0.0F) {
			source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.cold_snap",
				"Cold snap: temperate biomes turn snowy, warm biomes get cold rain, arid biomes stay dry.").withStyle(ChatFormatting.GRAY), false);
		}
		return ticks;
	}

	private static int setIntensity(CommandSourceStack source, float intensity) throws CommandSyntaxException {
		WeatherSimulator simulator = simulator();
		simulator.setIntensityOverride(intensity);
		if (intensity < 0.0F) {
			source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.intensity.auto",
				"Intensity returns to natural variation (%s)", percent(simulator.state().effectiveIntensity())), true);
		} else {
			source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.intensity",
				"Intensity of the current %s set to %s", typeName(simulator.state().type), percent(intensity)), true);
		}
		return Math.round(simulator.state().effectiveIntensity() * 100.0F);
	}

	private static int setDuration(CommandSourceStack source, int seconds) throws CommandSyntaxException {
		WeatherSimulator simulator = simulator();
		simulator.setRemainingTicks(seconds * 20);
		WeatherState state = simulator.state();
		source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.duration", "The current %s will last %s",
			typeName(state.type), formatDuration(state.remainingTicks)), true);
		if (!state.dynamic || !RealWeatherConfig.get().dynamicWeather) {
			source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.duration.locked",
				"Dynamic weather is off, so the weather will stay like this afterwards.").withStyle(ChatFormatting.GRAY), false);
		}
		return seconds;
	}

	private static int setWind(CommandSourceStack source, float speed, String direction) throws CommandSyntaxException {
		WeatherSimulator simulator = simulator();
		float maxWind = RealWeatherConfig.get().maxWindSpeed;
		if (speed < 0.0F) {
			simulator.setWindOverride(-1.0F, Float.NaN);
			source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.wind.auto", "Wind returns to natural conditions"), true);
			return 1;
		}
		float clamped = Math.min(speed, maxWind);
		float degrees = direction == null ? Float.NaN : parseDirection(direction);
		simulator.setWindOverride(clamped, degrees);
		float shownDirection = Float.isNaN(degrees) ? (float) Math.toDegrees(simulator.state().windDirection) : degrees;
		source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.wind", "Wind set to %s from the %s",
			describeWind(clamped), compass(shownDirection)), true);
		if (clamped < speed) {
			source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.wind.capped",
				"Limited to the configured maximum of %s m/s", String.format(Locale.ROOT, "%.0f", maxWind)).withStyle(ChatFormatting.GRAY), false);
		}
		return Math.round(clamped);
	}

	private static int windInfo(CommandSourceStack source) throws CommandSyntaxException {
		WeatherState state = simulator().state();
		float gust = WeatherState.gustFactor(state.seed, state.simTicks, state.gustiness);
		source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.wind.info", "Wind: %s from the %s, gusting to %s",
			describeWind(state.windSpeed), compass((float) Math.toDegrees(state.windDirection)),
			String.format(Locale.ROOT, "%.1f m/s", state.windSpeed * Math.max(gust, 1.0F))), false);
		return Math.round(state.windSpeed);
	}

	private static int setDynamic(CommandSourceStack source, boolean enabled) throws CommandSyntaxException {
		WeatherSimulator simulator = simulator();
		simulator.setDynamic(enabled);
		source.sendSuccess(() -> enabled
			? Component.translatableWithFallback("realweather.command.dynamic.on", "Dynamic weather enabled")
			: Component.translatableWithFallback("realweather.command.dynamic.off", "Dynamic weather disabled; the current weather will persist"), true);
		if (enabled && !RealWeatherConfig.get().dynamicWeather) {
			source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.dynamic.config",
				"Note: dynamicWeather is disabled in realweather-common.json").withStyle(ChatFormatting.GRAY), false);
		}
		return enabled ? 1 : 0;
	}

	private static int dynamicInfo(CommandSourceStack source) throws CommandSyntaxException {
		boolean enabled = simulator().state().dynamic && RealWeatherConfig.get().dynamicWeather;
		source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.dynamic.info", "Dynamic weather: %s",
			enabled ? Component.literal("on").withStyle(ChatFormatting.GREEN) : Component.literal("off").withStyle(ChatFormatting.RED)), false);
		return enabled ? 1 : 0;
	}

	private static int reset(CommandSourceStack source) throws CommandSyntaxException {
		WeatherSimulator simulator = simulator();
		simulator.resetOverrides();
		source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.reset",
			"Weather overrides cleared; natural, dynamic weather resumes"), true);
		return 1;
	}

	private static int status(CommandSourceStack source) throws CommandSyntaxException {
		WeatherState state = simulator().state();
		boolean dynamic = state.dynamic && RealWeatherConfig.get().dynamicWeather;
		source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.status.header", "Weather: %s%s",
			typeName(state.type).withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD),
			dynamic ? Component.literal("") : Component.translatableWithFallback("realweather.command.status.locked", " (locked)").withStyle(ChatFormatting.GRAY)), false);
		source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.status.time", " Remaining %s · intensity %s",
			formatDuration(state.remainingTicks), percent(state.effectiveIntensity())).withStyle(ChatFormatting.GRAY), false);
		source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.status.values",
			" Clouds %s · precipitation %s · storm %s · fog %s · cold snap %s",
			percent(state.cloudCover), percent(state.precipitation), percent(state.storm), percent(state.fog), percent(state.coldSnap))
			.withStyle(ChatFormatting.GRAY), false);
		source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.status.wind", " Wind %s from the %s",
			describeWind(state.windSpeed), compass((float) Math.toDegrees(state.windDirection))).withStyle(ChatFormatting.GRAY), false);

		ServerLevel level = source.getLevel();
		if (level.canHaveWeather()) {
			BlockPos pos = BlockPos.containing(source.getPosition());
			Biome biome = level.getBiome(pos).value();
			Climate.Precipitation here = Climate.precipitationFor(level, biome, pos, state.coldSnap);
			float temperature = Climate.effectiveTemperature(level, biome, pos, state.coldSnap);
			source.sendSuccess(() -> Component.translatableWithFallback("realweather.command.status.local",
				" Here: %s · temperature %s · humidity %s",
				Component.translatableWithFallback("realweather.zone." + here.name().toLowerCase(Locale.ROOT), switch (here) {
					case NONE -> "dry zone";
					case RAIN -> "rain zone";
					case SLEET -> "sleet zone";
					case SNOW -> "snow zone";
				}),
				String.format(Locale.ROOT, "%.2f", temperature), percent(Climate.humidity(biome))).withStyle(ChatFormatting.GRAY), false);
		}
		return state.type.ordinal();
	}

	// -----------------------------------------------------------------------------------------------------------

	static float parseDirection(String input) throws CommandSyntaxException {
		String value = input.toLowerCase(Locale.ROOT);
		value = switch (value) {
			case "north" -> "n";
			case "east" -> "e";
			case "south" -> "s";
			case "west" -> "w";
			case "northeast" -> "ne";
			case "northwest" -> "nw";
			case "southeast" -> "se";
			case "southwest" -> "sw";
			default -> value;
		};
		int index = COMPASS.indexOf(value);
		if (index >= 0) {
			return index * 22.5F;
		}
		try {
			float degrees = Float.parseFloat(value);
			if (Float.isFinite(degrees)) {
				return ((degrees % 360.0F) + 360.0F) % 360.0F;
			}
		} catch (NumberFormatException ignored) {
			// Reported below.
		}
		throw BAD_DIRECTION.create(input);
	}

	static MutableComponent typeName(WeatherType type) {
		String fallback = switch (type) {
			case CLEAR -> "Clear";
			case OVERCAST -> "Overcast";
			case FOG -> "Fog";
			case RAIN -> "Rain";
			case THUNDER -> "Thunderstorm";
			case SNOW -> "Snow";
			case BLIZZARD -> "Blizzard";
		};
		return Component.translatableWithFallback(type.translationKey(), fallback);
	}

	static String percent(float value) {
		return Math.round(value * 100.0F) + "%";
	}

	static String formatDuration(int ticks) {
		int seconds = Math.max(0, ticks / 20);
		if (seconds >= 3600) {
			return String.format(Locale.ROOT, "%dh %02dm", seconds / 3600, (seconds / 60) % 60);
		}
		if (seconds >= 60) {
			return String.format(Locale.ROOT, "%dm %02ds", seconds / 60, seconds % 60);
		}
		return seconds + "s";
	}

	static String compass(float degrees) {
		float normalized = ((degrees % 360.0F) + 360.0F) % 360.0F;
		int index = Math.round(normalized / 22.5F) % 16;
		return COMPASS.get(index).toUpperCase(Locale.ROOT);
	}

	static MutableComponent describeWind(float metersPerSecond) {
		int beaufort = beaufort(metersPerSecond);
		return Component.translatableWithFallback("realweather.command.wind.describe", "%s m/s (%s km/h, %s)",
			String.format(Locale.ROOT, "%.1f", metersPerSecond), String.format(Locale.ROOT, "%.0f", metersPerSecond * 3.6F),
			Component.translatableWithFallback("realweather.beaufort." + beaufort, BEAUFORT_NAMES[beaufort]));
	}

	private static final String[] BEAUFORT_NAMES = {
		"calm", "light air", "light breeze", "gentle breeze", "moderate breeze", "fresh breeze", "strong breeze",
		"near gale", "gale", "strong gale", "storm", "violent storm", "hurricane force"
	};
	private static final float[] BEAUFORT_LIMITS = {0.5F, 1.6F, 3.4F, 5.5F, 8.0F, 10.8F, 13.9F, 17.2F, 20.8F, 24.5F, 28.5F, 32.7F};

	static int beaufort(float metersPerSecond) {
		for (int i = 0; i < BEAUFORT_LIMITS.length; i++) {
			if (metersPerSecond < BEAUFORT_LIMITS[i]) {
				return i;
			}
		}
		return 12;
	}
}
