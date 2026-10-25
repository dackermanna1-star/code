package com.godforge.command;

import com.godforge.Godforge;
import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.DestructionManager;
import com.godforge.entity.FlyingDebrisEntity;
import com.godforge.entity.SingularityEntity;
import com.godforge.registry.ModItems;
import com.godforge.util.EffectEntity;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.UltimateCooldowns;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.BoolArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

/**
 * {@code /godforge} — information for everyone, administration for operators:
 * reload, stop (emergency halt of all destruction), give, resetcooldowns, destruction on/off, selftest.
 */
public final class GodforgeCommand {
	private static final SuggestionProvider<CommandSourceStack> WEAPONS = (context, builder) -> {
		List<String> ids = new ArrayList<>();
		for (WeaponType type : WeaponType.values()) {
			ids.add(type.id());
		}
		ids.add("all");
		ids.add("divine_core");
		return SharedSuggestionProvider.suggest(ids, builder);
	};

	private static final SuggestionProvider<CommandSourceStack> WEAPON_TYPES = (context, builder) -> {
		List<String> ids = new ArrayList<>();
		for (WeaponType type : WeaponType.values()) {
			ids.add(type.id());
		}
		return SharedSuggestionProvider.suggest(ids, builder);
	};

	private GodforgeCommand() {
	}

	public static void init() {
		SelfTest.init();
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> register(dispatcher));
	}

	private static boolean isAdmin(CommandSourceStack source) {
		int level = GodforgeConfig.get().permissions.adminLevel;
		if (level <= 0) {
			return true;
		}
		return source.permissions().hasPermission(new net.minecraft.server.permissions.Permission.HasCommandLevel(net.minecraft.server.permissions.PermissionLevel.byId(level)));
	}

	private static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
		dispatcher.register(
			Commands.literal("godforge")
				.then(Commands.literal("info").executes(GodforgeCommand::info))
				.then(Commands.literal("reload").requires(GodforgeCommand::isAdmin).executes(GodforgeCommand::reload))
				.then(Commands.literal("stop").requires(GodforgeCommand::isAdmin).executes(GodforgeCommand::stop))
				.then(
					Commands.literal("destruction")
						.requires(GodforgeCommand::isAdmin)
						.then(Commands.argument("enabled", BoolArgumentType.bool()).executes(GodforgeCommand::destruction))
				)
				.then(
					Commands.literal("give")
						.requires(GodforgeCommand::isAdmin)
						.then(
							Commands.argument("targets", EntityArgument.players())
								.then(Commands.argument("weapon", StringArgumentType.word()).suggests(WEAPONS).executes(GodforgeCommand::give))
						)
				)
				.then(
					Commands.literal("resetcooldowns")
						.requires(GodforgeCommand::isAdmin)
						.executes(context -> resetCooldowns(context, List.of(context.getSource().getPlayerOrException())))
						.then(Commands.argument("targets", EntityArgument.players()).executes(context -> resetCooldowns(context, EntityArgument.getPlayers(context, "targets"))))
				)
				.then(
					Commands.literal("selftest")
						.requires(GodforgeCommand::isAdmin)
						.executes(context -> SelfTest.run(context, null))
						.then(Commands.argument("weapon", StringArgumentType.word()).suggests(WEAPON_TYPES).executes(context -> {
							String id = StringArgumentType.getString(context, "weapon");
							WeaponType type = WeaponType.byId(id);
							if (type == null) {
								context.getSource().sendFailure(Component.translatable("command.godforge.unknown_weapon", id));
								return 0;
							}
							return SelfTest.run(context, type);
						}))
				)
		);
	}

	private static int info(CommandContext<CommandSourceStack> context) {
		GodforgeConfig config = GodforgeConfig.get();
		CommandSourceStack source = context.getSource();
		source.sendSuccess(() -> Component.literal("Godforge Arsenal").withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD), false);
		source.sendSuccess(
			() -> Component.translatable(
				"command.godforge.info",
				DestructionManager.activeJobs(),
				DestructionManager.opsLastTick(),
				FlyingDebrisEntity.alive(),
				SingularityEntity.active(),
				config.general.terrainDestruction ? "ON" : "OFF"
			),
			false
		);
		return 1;
	}

	private static int reload(CommandContext<CommandSourceStack> context) {
		GodforgeConfig.load();
		context.getSource().sendSuccess(() -> Component.translatable("command.godforge.reloaded").withStyle(ChatFormatting.GREEN), true);
		return 1;
	}

	private static int stop(CommandContext<CommandSourceStack> context) {
		int jobs = DestructionManager.cancelAll();
		int entities = 0;
		for (ServerLevel level : context.getSource().getServer().getAllLevels()) {
			List<Entity> doomed = new ArrayList<>();
			for (Entity entity : level.getAllEntities()) {
				if (entity instanceof EffectEntity) {
					doomed.add(entity);
				}
			}
			for (Entity entity : doomed) {
				entity.discard();
				entities++;
			}
		}
		int finalEntities = entities;
		context.getSource().sendSuccess(() -> Component.translatable("command.godforge.stopped", jobs, finalEntities).withStyle(ChatFormatting.YELLOW), true);
		return jobs + entities;
	}

	private static int destruction(CommandContext<CommandSourceStack> context) {
		boolean enabled = BoolArgumentType.getBool(context, "enabled");
		GodforgeConfig.get().general.terrainDestruction = enabled;
		GodforgeConfig.save();
		context.getSource().sendSuccess(() -> Component.translatable("command.godforge.destruction", enabled ? "ON" : "OFF").withStyle(ChatFormatting.YELLOW), true);
		return 1;
	}

	private static int give(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		Collection<ServerPlayer> targets = EntityArgument.getPlayers(context, "targets");
		String id = StringArgumentType.getString(context, "weapon");
		List<Item> items = new ArrayList<>();
		if (id.equals("all")) {
			items.addAll(ModItems.WEAPONS);
		} else if (id.equals("divine_core")) {
			items.add(ModItems.DIVINE_CORE);
		} else {
			WeaponType type = WeaponType.byId(id);
			if (type == null) {
				context.getSource().sendFailure(Component.translatable("command.godforge.unknown_weapon", id));
				return 0;
			}
			items.add(ModItems.WEAPONS.get(type.ordinal()));
		}
		for (ServerPlayer player : targets) {
			for (Item item : items) {
				ItemStack stack = new ItemStack(item);
				if (item instanceof GodWeaponItem) {
					GodWeaponItem.applySettings(stack, GodWeaponItem.settings(stack));
				}
				if (!player.getInventory().add(stack)) {
					player.drop(stack, false);
				}
			}
		}
		context.getSource().sendSuccess(() -> Component.translatable("command.godforge.given", items.size(), targets.size()), true);
		return items.size() * targets.size();
	}

	private static int resetCooldowns(CommandContext<CommandSourceStack> context, Collection<ServerPlayer> players) {
		for (ServerPlayer player : players) {
			UltimateCooldowns.reset(player);
			for (Item item : ModItems.WEAPONS) {
				ItemStack stack = new ItemStack(item);
				player.getCooldowns().removeCooldown(player.getCooldowns().getCooldownGroup(stack));
			}
		}
		context.getSource().sendSuccess(() -> Component.translatable("command.godforge.cooldowns_reset", players.size()), true);
		return players.size();
	}

	static boolean allowed(ServerPlayer player, WeaponType type) {
		return WeaponAccess.denyReason(player, type, type.mode(0)) == null;
	}

	static void log(String message, Object... args) {
		Godforge.LOGGER.info("[selftest] " + message, args);
	}
}
