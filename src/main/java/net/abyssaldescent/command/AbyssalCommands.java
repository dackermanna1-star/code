package net.abyssaldescent.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import java.util.List;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.FloorLayouts;
import net.abyssaldescent.dungeon.layout.LayoutGenerator;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.dungeon.loot.LootDrops;
import net.abyssaldescent.dungeon.loot.LootRoller;
import net.abyssaldescent.dungeon.loot.LootTier;
import net.abyssaldescent.dungeon.run.DungeonRun;
import net.abyssaldescent.dungeon.run.PlayerProgress;
import net.abyssaldescent.dungeon.run.RunManager;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.registry.ModAttachments;
import net.abyssaldescent.world.DungeonCoords;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;

/**
 * {@code /abyssal}: player statistics, plus operator tools for testing and administration.
 */
public final class AbyssalCommands {
	private AbyssalCommands() {
	}

	public static void init() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> register(dispatcher));
	}

	private static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
		dispatcher.register(Commands.literal("abyssal")
			.then(Commands.literal("stats").executes(ctx -> stats(ctx.getSource().getPlayerOrException())))
			.then(Commands.literal("rules").executes(ctx -> rules(ctx.getSource())))
			.then(Commands.literal("start").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.executes(ctx -> start(ctx.getSource().getPlayerOrException(), 1))
				.then(Commands.argument("floor", IntegerArgumentType.integer(1, Zone.MAX_FLOOR))
					.executes(ctx -> start(ctx.getSource().getPlayerOrException(), IntegerArgumentType.getInteger(ctx, "floor")))))
			.then(Commands.literal("floor").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.argument("floor", IntegerArgumentType.integer(1, Zone.MAX_FLOOR))
					.executes(ctx -> floor(ctx.getSource().getPlayerOrException(), IntegerArgumentType.getInteger(ctx, "floor")))))
			.then(Commands.literal("extract").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.executes(ctx -> extract(ctx.getSource().getPlayerOrException())))
			.then(Commands.literal("loot").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.argument("tier", StringArgumentType.word())
					.executes(ctx -> loot(ctx.getSource().getPlayerOrException(), StringArgumentType.getString(ctx, "tier")))))
			.then(Commands.literal("map").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.executes(ctx -> map(ctx.getSource().getPlayerOrException())))
			.then(Commands.literal("reload").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.executes(ctx -> {
					AdConfig.load();
					ctx.getSource().sendSuccess(() -> Component.literal("Abyssal Descent config reloaded."), true);
					return 1;
				})));
	}

	private static int stats(ServerPlayer player) {
		PlayerProgress p = player.getAttachedOrCreate(ModAttachments.PROGRESS);
		player.sendSystemMessage(Component.translatable("command.abyssal_descent.stats.header").withStyle(ChatFormatting.DARK_AQUA, ChatFormatting.BOLD));
		player.sendSystemMessage(Component.translatable("command.abyssal_descent.stats.line", p.expeditions(), p.deepestFloor(), p.bossesSlain(),
			p.extractions(), p.defeats()).withStyle(ChatFormatting.GRAY));
		player.sendSystemMessage(Component.translatable("command.abyssal_descent.stats.checkpoints", p.usableCheckpoints().toString())
			.withStyle(ChatFormatting.GRAY));
		return 1;
	}

	private static int rules(CommandSourceStack source) {
		for (int i = 1; i <= 5; i++) {
			int line = i;
			source.sendSuccess(() -> Component.translatable("command.abyssal_descent.rules." + line).withStyle(ChatFormatting.GRAY), false);
		}
		return 1;
	}

	private static int start(ServerPlayer player, int floor) {
		RunManager manager = RunManager.get(player.level().getServer());
		if (manager.runOf(player) != null) {
			player.sendSystemMessage(Component.translatable("message.abyssal_descent.gate.already_in_run"));
			return 0;
		}
		if (floor > Zone.deepestImplementedFloor()) {
			player.sendSystemMessage(Component.translatable("message.abyssal_descent.sealed_below", Zone.forFloor(floor).displayName()));
			return 0;
		}
		manager.startRun(player.level(), player.blockPosition(), List.of(player), floor);
		return 1;
	}

	private static int floor(ServerPlayer player, int floor) {
		RunManager manager = RunManager.get(player.level().getServer());
		DungeonRun run = manager.runOf(player);
		if (run == null || floor > Zone.deepestImplementedFloor()) {
			return 0;
		}
		manager.enterFloor(run, floor);
		return 1;
	}

	private static int extract(ServerPlayer player) {
		RunManager manager = RunManager.get(player.level().getServer());
		DungeonRun run = manager.runOf(player);
		if (run == null) {
			return 0;
		}
		manager.extract(player, run);
		return 1;
	}

	private static int loot(ServerPlayer player, String tierName) {
		LootTier tier;
		try {
			tier = LootTier.valueOf(tierName.toUpperCase());
		} catch (IllegalArgumentException e) {
			player.sendSystemMessage(Component.literal("Tiers: chest, treasure, secret, elite, boss"));
			return 0;
		}
		RunManager manager = RunManager.get(player.level().getServer());
		DungeonRun run = manager.runOf(player);
		int floor = run == null ? 5 : run.floor();
		LootDrops.fountain(player.level(), player.position().add(player.getLookAngle().scale(2)).add(0, 1, 0),
			LootRoller.rollReliquary(player, tier, floor), player);
		return 1;
	}

	/** ASCII map of the current floor's room graph (debugging generation). */
	private static int map(ServerPlayer player) {
		int slot = DungeonCoords.slotOf(player.getBlockX());
		int floor = Math.max(1, DungeonCoords.floorOf(player.getBlockZ()));
		if (!FloorLayouts.isGeneratedFloor(slot, floor)) {
			floor = 1;
			slot = 0;
		}
		FloorLayout layout = FloorLayouts.get(player.level().getSeed(), slot, floor);
		char[][] grid = new char[8][8];
		for (char[] row : grid) {
			java.util.Arrays.fill(row, '.');
		}
		StringBuilder legend = new StringBuilder();
		for (Room room : layout.rooms()) {
			if (room.cellX() >= 0 && room.cellZ() >= 0 && room.cellX() < 8 && room.cellZ() < 8) {
				grid[room.cellZ()][room.cellX()] = room.type().name().charAt(0);
			}
			legend.append(room.id()).append('=').append(room.type()).append(' ');
		}
		player.sendSystemMessage(Component.literal("Floor " + floor + " (slot " + slot + "), cell " + LayoutGenerator.CELL));
		for (char[] row : grid) {
			player.sendSystemMessage(Component.literal(new String(row)).withStyle(ChatFormatting.AQUA));
		}
		player.sendSystemMessage(Component.literal(legend.toString()).withStyle(ChatFormatting.GRAY));
		return 1;
	}
}
