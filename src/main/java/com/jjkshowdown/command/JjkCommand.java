package com.jjkshowdown.command;

import com.jjkshowdown.config.Difficulty;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.domain.DomainManager;
import com.jjkshowdown.entity.boss.BossSpawner;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.Characters;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererData;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.SorcererStats;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.world.TerrainJournal;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.FloatArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/** {@code /jjk} administration and convenience commands. */
public final class JjkCommand {
	private JjkCommand() {
	}

	public static void register(CommandDispatcher<CommandSourceStack> d) {
		LiteralArgumentBuilder<CommandSourceStack> root = Commands.literal("jjk");

		root.then(Commands.literal("select").executes(ctx -> {
			ServerPlayer p = ctx.getSource().getPlayerOrException();
			JjkNetwork.send(p, new Payloads.OpenSelection(false));
			return 1;
		}));

		LiteralArgumentBuilder<CommandSourceStack> character = Commands.literal("character").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS));
		for (CharacterType t : CharacterType.values()) {
			character.then(Commands.literal(t.id())
					.executes(ctx -> setCharacter(ctx, List.of(ctx.getSource().getPlayerOrException()), t))
					.then(Commands.argument("targets", EntityArgument.players())
							.executes(ctx -> setCharacter(ctx, EntityArgument.getPlayers(ctx, "targets"), t))));
		}
		root.then(character);

		root.then(Commands.literal("mastery").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.literal("set").then(Commands.argument("level", IntegerArgumentType.integer(1, SorcererData.MAX_MASTERY))
						.executes(ctx -> setMastery(ctx, self(ctx), IntegerArgumentType.getInteger(ctx, "level")))
						.then(Commands.argument("targets", EntityArgument.players())
								.executes(ctx -> setMastery(ctx, EntityArgument.getPlayers(ctx, "targets"), IntegerArgumentType.getInteger(ctx, "level"))))))
				.then(Commands.literal("add").then(Commands.argument("xp", FloatArgumentType.floatArg(0))
						.executes(ctx -> addXp(ctx, self(ctx), FloatArgumentType.getFloat(ctx, "xp")))
						.then(Commands.argument("targets", EntityArgument.players())
								.executes(ctx -> addXp(ctx, EntityArgument.getPlayers(ctx, "targets"), FloatArgumentType.getFloat(ctx, "xp"))))))
				.then(Commands.literal("get").executes(ctx -> {
					ServerPlayer p = ctx.getSource().getPlayerOrException();
					SorcererData data = Sorcerers.data(p);
					ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.mastery_get", data.character().displayName(),
							data.mastery(), String.format("%.0f", data.xp()), String.format("%.0f", Mastery.xpToNext(data.mastery()))), false);
					return data.mastery();
				})));

		root.then(Commands.literal("fingers").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.argument("count", IntegerArgumentType.integer(0, SorcererData.MAX_FINGERS))
						.executes(ctx -> setFingers(ctx, self(ctx), IntegerArgumentType.getInteger(ctx, "count")))
						.then(Commands.argument("targets", EntityArgument.players())
								.executes(ctx -> setFingers(ctx, EntityArgument.getPlayers(ctx, "targets"), IntegerArgumentType.getInteger(ctx, "count"))))));

		root.then(Commands.literal("energy").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.literal("fill").executes(ctx -> fill(ctx, self(ctx)))
						.then(Commands.argument("targets", EntityArgument.players()).executes(ctx -> fill(ctx, EntityArgument.getPlayers(ctx, "targets"))))));

		root.then(Commands.literal("cooldowns").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.literal("reset").executes(ctx -> resetCooldowns(ctx, self(ctx)))
						.then(Commands.argument("targets", EntityArgument.players()).executes(ctx -> resetCooldowns(ctx, EntityArgument.getPlayers(ctx, "targets"))))));

		LiteralArgumentBuilder<CommandSourceStack> duel = Commands.literal("duel").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS));
		for (CharacterType t : new CharacterType[]{CharacterType.GOJO, CharacterType.SUKUNA}) {
			duel.then(Commands.literal(t.id()).executes(ctx -> {
				ServerPlayer p = ctx.getSource().getPlayerOrException();
				boolean ok = BossSpawner.summonRival(p, t) != null;
				if (ok) ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.duel", t.displayName()), true);
				return ok ? 1 : 0;
			}));
		}
		root.then(duel);

		root.then(Commands.literal("restore").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS)).executes(ctx -> {
			int n = 0;
			for (ServerLevel level : ctx.getSource().getServer().getAllLevels()) n += TerrainJournal.get(level).restoreAll(level);
			int total = n;
			ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.restored", total), true);
			return n;
		}));

		root.then(Commands.literal("domain").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.literal("end").executes(ctx -> {
					List<DomainEntity> all = new ArrayList<>(DomainManager.active());
					all.forEach(DomainEntity::collapse);
					ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.domains_ended", all.size()), true);
					return all.size();
				})));

		root.then(Commands.literal("config").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.literal("reload").executes(ctx -> {
					JjkConfig.load();
					JjkNetwork.broadcastConfig(ctx.getSource().getServer());
					ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.config_reloaded"), true);
					return 1;
				})));

		LiteralArgumentBuilder<CommandSourceStack> difficulty = Commands.literal("difficulty").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS));
		for (Difficulty df : Difficulty.values()) {
			difficulty.then(Commands.literal(df.name().toLowerCase()).executes(ctx -> {
				JjkConfig cfg = JjkConfig.get().copy();
				cfg.difficulty = df.name();
				JjkConfig.apply(cfg);
				JjkNetwork.broadcastConfig(ctx.getSource().getServer());
				ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.difficulty", df.name()), true);
				return 1;
			}));
		}
		root.then(difficulty);

		d.register(root);
	}

	private static Collection<ServerPlayer> self(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
		return List.of(ctx.getSource().getPlayerOrException());
	}

	private static int setCharacter(CommandContext<CommandSourceStack> ctx, Collection<ServerPlayer> targets, CharacterType t) {
		for (ServerPlayer p : targets) Characters.set(p, t, true);
		ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.character", targets.size(), t.displayName()), true);
		return targets.size();
	}

	private static int setMastery(CommandContext<CommandSourceStack> ctx, Collection<ServerPlayer> targets, int level) {
		for (ServerPlayer p : targets) {
			SorcererData d = Sorcerers.data(p);
			if (!d.character().isSorcerer()) continue;
			d.setMastery(d.character(), level);
			d.setXp(d.character(), 0);
			SorcererStats.apply(p);
			Sorcerers.state(p).dirty = true;
		}
		ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.mastery_set", targets.size(), level), true);
		return targets.size();
	}

	private static int addXp(CommandContext<CommandSourceStack> ctx, Collection<ServerPlayer> targets, float xp) {
		for (ServerPlayer p : targets) Mastery.addXp(p, xp / Math.max(0.0001f, JjkConfig.get().progression.xpMultiplier));
		ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.xp_added", String.format("%.0f", xp), targets.size()), true);
		return targets.size();
	}

	private static int setFingers(CommandContext<CommandSourceStack> ctx, Collection<ServerPlayer> targets, int count) {
		for (ServerPlayer p : targets) {
			Sorcerers.data(p).setFingers(count);
			SorcererStats.apply(p);
			Sorcerers.state(p).dirty = true;
		}
		ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.fingers", targets.size(), count), true);
		return targets.size();
	}

	private static int fill(CommandContext<CommandSourceStack> ctx, Collection<ServerPlayer> targets) {
		for (ServerPlayer p : targets) CursedEnergy.fill(p);
		ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.energy_filled", targets.size()), true);
		return targets.size();
	}

	private static int resetCooldowns(CommandContext<CommandSourceStack> ctx, Collection<ServerPlayer> targets) {
		for (ServerPlayer p : targets) {
			SorcererState s = Sorcerers.state(p);
			java.util.Arrays.fill(s.cooldowns, 0);
			s.burnoutTicks = 0;
			s.dirty = true;
		}
		ctx.getSource().sendSuccess(() -> Component.translatable("command.jjkshowdown.cooldowns_reset", targets.size()), true);
		return targets.size();
	}
}
