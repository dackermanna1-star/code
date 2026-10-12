package com.chaosunleashed.command;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.core.ChaosActions;
import com.chaosunleashed.core.ChaosConfig;
import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.ChaosEventManager;
import com.chaosunleashed.core.ChaosEventType;
import com.chaosunleashed.core.ChaosPermissions;
import com.chaosunleashed.core.ChaosWorldData;
import com.chaosunleashed.core.EventPhase;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.DynamicCommandExceptionType;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.command.CommandSource;
import net.minecraft.command.argument.BlockPosArgumentType;
import net.minecraft.command.argument.EntityArgumentType;
import net.minecraft.nbt.NbtString;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.ClickEvent;
import net.minecraft.text.HoverEvent;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * {@code /chaos} — menu, toggle, enable, disable, start, stop, random, list, reload.
 * <p>
 * Buttons in {@code /chaos menu} use a custom click action (see {@code ServerCommonNetworkHandlerMixin}) that runs
 * the matching {@code /chaos ...} command for the clicking player, with the normal permission checks, without the
 * vanilla "this command requires elevated permissions" confirmation screen.
 */
public final class ChaosCommand {
	/** Click action id used by the chat menu buttons. Payload: the command to run, without the slash. */
	public static final Identifier MENU_CLICK_ID = ChaosUnleashed.id("run");

	private static final DynamicCommandExceptionType UNKNOWN_EVENT = new DynamicCommandExceptionType(
		id -> Text.literal("Unknown event '" + id + "'. Try: " + String.join(", ", eventIds())));

	private static final SuggestionProvider<ServerCommandSource> EVENT_SUGGESTIONS =
		(context, builder) -> CommandSource.suggestMatching(eventIds(), builder);
	private static final SuggestionProvider<ServerCommandSource> EVENT_OR_ALL_SUGGESTIONS = (context, builder) -> {
		List<String> ids = new ArrayList<>(eventIds());
		ids.add("all");
		return CommandSource.suggestMatching(ids, builder);
	};

	private ChaosCommand() {
	}

	public static void init() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> register(dispatcher));
	}

	private static List<String> eventIds() {
		List<String> ids = new ArrayList<>();
		for (ChaosEventType type : ChaosEventType.values()) {
			ids.add(type.id());
		}
		return ids;
	}

	private static void register(CommandDispatcher<ServerCommandSource> dispatcher) {
		dispatcher.register(CommandManager.literal("chaos")
			.executes(context -> list(context.getSource()))
			.then(CommandManager.literal("list").executes(context -> list(context.getSource())))
			.then(CommandManager.literal("menu")
				.requires(ChaosPermissions::canUseCommands)
				.executes(context -> menu(context.getSource())))
			.then(CommandManager.literal("toggle")
				.requires(ChaosPermissions::canUseCommands)
				.then(CommandManager.argument("event", StringArgumentType.word()).suggests(EVENT_SUGGESTIONS)
					.executes(context -> toggle(context.getSource(), event(context)))))
			.then(CommandManager.literal("enable")
				.requires(ChaosPermissions::canUseCommands)
				.then(CommandManager.argument("event", StringArgumentType.word()).suggests(EVENT_OR_ALL_SUGGESTIONS)
					.executes(context -> setEnabled(context, true))))
			.then(CommandManager.literal("disable")
				.requires(ChaosPermissions::canUseCommands)
				.then(CommandManager.argument("event", StringArgumentType.word()).suggests(EVENT_OR_ALL_SUGGESTIONS)
					.executes(context -> setEnabled(context, false))))
			.then(CommandManager.literal("start")
				.requires(ChaosPermissions::canUseCommands)
				.then(CommandManager.argument("event", StringArgumentType.word()).suggests(EVENT_SUGGESTIONS)
					.executes(context -> start(context, null, null, null))
					.then(CommandManager.argument("intensity", IntegerArgumentType.integer(1, 5))
						.executes(context -> start(context, IntegerArgumentType.getInteger(context, "intensity"), null, null))
						.then(CommandManager.argument("player", EntityArgumentType.player())
							.executes(context -> start(context, IntegerArgumentType.getInteger(context, "intensity"),
								EntityArgumentType.getPlayer(context, "player"), null)))
						.then(CommandManager.literal("at")
							.then(CommandManager.argument("pos", BlockPosArgumentType.blockPos())
								.executes(context -> start(context, IntegerArgumentType.getInteger(context, "intensity"), null,
									BlockPosArgumentType.getLoadedBlockPos(context, "pos"))))))))
			.then(CommandManager.literal("stop")
				.requires(ChaosPermissions::canUseCommands)
				.executes(context -> stopAll(context.getSource()))
				.then(CommandManager.argument("event", StringArgumentType.word()).suggests(EVENT_OR_ALL_SUGGESTIONS)
					.executes(context -> {
						String id = StringArgumentType.getString(context, "event");
						if (id.equalsIgnoreCase("all")) {
							return stopAll(context.getSource());
						}
						return stop(context.getSource(), event(context));
					})))
			.then(CommandManager.literal("random")
				.requires(ChaosPermissions::canUseCommands)
				.executes(context -> randomStatus(context.getSource()))
				.then(CommandManager.literal("on").executes(context -> setRandom(context.getSource(), true)))
				.then(CommandManager.literal("off").executes(context -> setRandom(context.getSource(), false))))
			.then(CommandManager.literal("reload")
				.requires(ChaosPermissions::canUseCommands)
				.executes(context -> reload(context.getSource()))));
	}

	// ------------------------------------------------------------------------------------------ helpers

	private static ChaosEventType event(CommandContext<ServerCommandSource> context) throws CommandSyntaxException {
		String id = StringArgumentType.getString(context, "event");
		ChaosEventType type = ChaosEventType.byId(id);
		if (type == null) {
			throw UNKNOWN_EVENT.create(id);
		}
		return type;
	}

	private static ChaosEventManager manager(ServerCommandSource source) throws CommandSyntaxException {
		ChaosEventManager manager = ChaosEventManager.get();
		if (manager == null) {
			throw new DynamicCommandExceptionType(o -> Text.literal("Chaos is not running")).create(null);
		}
		return manager;
	}

	private static void feedback(ServerCommandSource source, Text text) {
		source.sendFeedback(() -> text, true);
	}

	// ------------------------------------------------------------------------------------------ commands

	private static int toggle(ServerCommandSource source, ChaosEventType type) throws CommandSyntaxException {
		ChaosEventManager manager = manager(source);
		feedback(source, ChaosActions.toggle(manager, type));
		return 1;
	}

	private static int setEnabled(CommandContext<ServerCommandSource> context, boolean enabled) throws CommandSyntaxException {
		ServerCommandSource source = context.getSource();
		ChaosEventManager manager = manager(source);
		String id = StringArgumentType.getString(context, "event");
		if (id.equalsIgnoreCase("all")) {
			feedback(source, ChaosActions.setAll(manager, enabled));
			return ChaosEventType.values().length;
		}
		feedback(source, ChaosActions.setEnabled(manager, event(context), enabled));
		return 1;
	}

	private static int start(CommandContext<ServerCommandSource> context, @Nullable Integer intensity,
							 @Nullable ServerPlayerEntity targetPlayer, @Nullable BlockPos pos) throws CommandSyntaxException {
		ServerCommandSource source = context.getSource();
		ChaosEventManager manager = manager(source);
		ChaosEventType type = event(context);
		int level = intensity != null ? intensity : ChaosConfig.get().event(type).defaultIntensity;

		ServerWorld world = source.getWorld();
		ServerPlayerEntity target = targetPlayer;
		BlockPos origin;
		if (pos != null) {
			origin = pos;
			target = null;
		} else {
			if (target == null) {
				target = source.getPlayer();
			}
			if (target != null) {
				world = target.getEntityWorld();
				origin = target.getBlockPos();
			} else {
				origin = BlockPos.ofFloored(source.getPosition());
			}
		}
		ChaosEventManager.StartResult result = ChaosActions.start(manager, type, world, origin, target, level);
		if (result.success()) {
			feedback(source, ChaosActions.prefix().append(result.message()));
			return 1;
		}
		source.sendError(result.message());
		return 0;
	}

	private static int stopAll(ServerCommandSource source) throws CommandSyntaxException {
		feedback(source, ChaosActions.stopAll(manager(source)));
		return 1;
	}

	private static int stop(ServerCommandSource source, ChaosEventType type) throws CommandSyntaxException {
		feedback(source, ChaosActions.stop(manager(source), type));
		return 1;
	}

	private static int setRandom(ServerCommandSource source, boolean enabled) throws CommandSyntaxException {
		feedback(source, ChaosActions.setRandom(manager(source), enabled));
		return 1;
	}

	private static int randomStatus(ServerCommandSource source) throws CommandSyntaxException {
		boolean on = manager(source).data().isRandomEnabled();
		source.sendFeedback(() -> ChaosActions.prefix().append("Random events are ")
			.append(on ? Text.literal("ON").formatted(Formatting.GREEN) : Text.literal("OFF").formatted(Formatting.RED)), false);
		return on ? 1 : 0;
	}

	private static int reload(ServerCommandSource source) throws CommandSyntaxException {
		ChaosConfig.load();
		ChaosEventManager manager = manager(source);
		manager.markDirty();
		feedback(source, ChaosActions.prefix().append(Text.literal("Config reloaded from " + ChaosConfig.path().getFileName())
			.formatted(Formatting.GREEN)));
		return 1;
	}

	private static int list(ServerCommandSource source) throws CommandSyntaxException {
		ChaosEventManager manager = manager(source);
		ChaosWorldData data = manager.data();
		source.sendFeedback(() -> header("Chaos Events"), false);
		for (ChaosEventType type : ChaosEventType.values()) {
			boolean enabled = data.isEnabled(type);
			MutableText line = Text.literal(enabled ? " ● " : " ○ ").formatted(enabled ? Formatting.GREEN : Formatting.RED)
				.append(type.coloredName())
				.append(padTo(NAME_COLUMN, textWidth(type.symbol() + " " + type.displayName())))
				.append(Text.literal(enabled ? "ON" : "OFF").formatted(enabled ? Formatting.GREEN : Formatting.RED));
			ChaosEvent running = manager.getActive(type);
			if (running != null) {
				line.append(runningText(running));
			}
			source.sendFeedback(() -> line, false);
		}
		source.sendFeedback(() -> footerStatus(manager, data), false);
		return 1;
	}

	private static int menu(ServerCommandSource source) throws CommandSyntaxException {
		ChaosEventManager manager = manager(source);
		ChaosWorldData data = manager.data();
		source.sendFeedback(() -> header("Chaos Control Menu"), false);
		for (ChaosEventType type : ChaosEventType.values()) {
			boolean enabled = data.isEnabled(type);
			MutableText line = Text.literal(" ").append(type.coloredName()
				.styled(s -> s.withHoverEvent(new HoverEvent.ShowText(Text.literal(type.description()).formatted(Formatting.GRAY)))));
			// Chat uses a proportional font: pad with pixel precision so the button columns line up.
			line.append(padTo(NAME_COLUMN, textWidth(type.symbol() + " " + type.displayName())));
			line.append(button("ON", enabled ? Formatting.GREEN : Formatting.DARK_GREEN, enabled,
				"Turn " + type.displayName() + " ON for random triggering", "chaos enable " + type.id()));
			line.append(padTo(ON_WIDTH + 4, buttonWidth("ON", enabled)));
			line.append(button("OFF", enabled ? Formatting.DARK_RED : Formatting.RED, !enabled,
				"Turn " + type.displayName() + " OFF for random triggering", "chaos disable " + type.id()));
			line.append(padTo(OFF_WIDTH + 4, buttonWidth("OFF", !enabled)));
			line.append(button("START", Formatting.AQUA, false,
				"Start " + type.displayName() + " now (intensity " + ChaosConfig.get().event(type).defaultIntensity
					+ ")\nWorks even if the event is OFF for random triggering.", "chaos start " + type.id()));
			line.append(" ");
			line.append(button("STOP", Formatting.GOLD, false, "Stop " + type.displayName() + " if it is running", "chaos stop " + type.id()));
			ChaosEvent running = manager.getActive(type);
			if (running != null) {
				line.append(runningText(running));
			}
			source.sendFeedback(() -> line, false);
		}
		boolean random = data.isRandomEnabled();
		MutableText footer = Text.literal(" Random events: ").formatted(Formatting.WHITE)
			.append(button("ON", random ? Formatting.GREEN : Formatting.DARK_GREEN, random, "Master switch: allow random events", "chaos random on"))
			.append(" ")
			.append(button("OFF", random ? Formatting.DARK_RED : Formatting.RED, !random, "Master switch: no random events at all", "chaos random off"))
			.append("   ")
			.append(button("STOP ALL", Formatting.RED, false, "Immediately end every running event and clean up", "chaos stop"))
			.append(" ")
			.append(button("↻", Formatting.GRAY, false, "Refresh this menu", "chaos menu"));
		source.sendFeedback(() -> footer, false);
		return 1;
	}

	// ------------------------------------------------------------------------------------------ chat layout
	// Advances (in GUI pixels) of the default Minecraft font. Used only to line up the menu columns.

	/** Width reserved for "icon name" before the first button column. */
	private static final int NAME_COLUMN = 104;
	private static final int ON_WIDTH = buttonWidth("ON", true);
	private static final int OFF_WIDTH = buttonWidth("OFF", true);

	private static int charWidth(char c) {
		return switch (c) {
			case ' ', 'I', 't', '[', ']', '☾', '♜', '◉', '◐', '♞' -> 4;
			case 'i', '.', ',', ':', ';', '!', '|', '\'' -> 2;
			case 'l' -> 3;
			case 'f', 'k', '(', ')', '<', '>', '*', '⇅' -> 5;
			case '☄', '✦' -> 8;
			case '☀' -> 9;
			default -> 6;
		};
	}

	private static int textWidth(String text) {
		int width = 0;
		for (int i = 0; i < text.length(); i++) {
			width += charWidth(text.charAt(i));
		}
		return width;
	}

	private static int buttonWidth(String label, boolean bold) {
		String text = "[" + label + "]";
		return textWidth(text) + (bold ? text.length() : 0);
	}

	/**
	 * Spaces that advance from {@code width} to {@code column} pixels. A space is 4 pixels wide and a bold space
	 * 5, so any gap of 12+ pixels can be filled exactly.
	 */
	private static MutableText padTo(int column, int width) {
		int gap = Math.max(4, column - width);
		int bold = 0;
		while (bold < 4 && (gap - bold * 5) % 4 != 0) {
			bold++;
		}
		if ((gap - bold * 5) % 4 != 0 || gap - bold * 5 < 0) {
			bold = 0;
		}
		int normal = Math.max(0, Math.round((gap - bold * 5) / 4.0F));
		MutableText text = Text.literal(" ".repeat(normal));
		if (bold > 0) {
			text.append(Text.literal(" ".repeat(bold)).formatted(Formatting.BOLD));
		}
		return text;
	}

	private static MutableText header(String title) {
		return Text.literal("━━━━━━ ").formatted(Formatting.DARK_GRAY)
			.append(Text.literal(title).formatted(Formatting.GOLD, Formatting.BOLD))
			.append(Text.literal(" ━━━━━━").formatted(Formatting.DARK_GRAY));
	}

	private static MutableText footerStatus(ChaosEventManager manager, ChaosWorldData data) {
		MutableText text = Text.literal(" Random events: ").formatted(Formatting.GRAY)
			.append(data.isRandomEnabled() ? Text.literal("ON").formatted(Formatting.GREEN) : Text.literal("OFF").formatted(Formatting.RED));
		int cooldown = manager.cooldownRemainingTicks();
		if (cooldown > 0) {
			int seconds = cooldown / 20;
			text.append(Text.literal("  (cooldown " + seconds / 60 + "m " + seconds % 60 + "s)").formatted(Formatting.DARK_GRAY));
		}
		if (manager.activeEvents().isEmpty()) {
			text.append(Text.literal("  No event running").formatted(Formatting.GRAY));
		}
		return text;
	}

	private static MutableText runningText(ChaosEvent event) {
		int seconds = MathHelper.ceil(event.remainingTicks() / 20.0F);
		Formatting color = event.phase() == EventPhase.ACTIVE ? Formatting.RED : Formatting.YELLOW;
		return Text.literal("  ▶ " + event.phase().label() + " " + seconds / 60 + ":" + String.format("%02d", seconds % 60)).formatted(color);
	}

	private static MutableText button(String label, Formatting color, boolean selected, String hover, String command) {
		MutableText hoverText = Text.literal(hover).formatted(Formatting.WHITE)
			.append(Text.literal("\n/" + command).formatted(Formatting.DARK_GRAY));
		return Text.literal("[" + label + "]").styled(style -> style
			.withColor(color)
			.withBold(selected)
			.withUnderline(selected)
			.withClickEvent(new ClickEvent.Custom(MENU_CLICK_ID, Optional.of(NbtString.of(command))))
			.withHoverEvent(new HoverEvent.ShowText(hoverText)));
	}
}
