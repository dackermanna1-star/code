package com.ordnance.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.DynamicCommandExceptionType;
import com.ordnance.config.ConfigManager;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.explosion.OrdnanceExplosion;
import com.ordnance.weapon.MissileStrikeManager;
import java.util.Arrays;
import java.util.Locale;
import net.minecraft.command.CommandRegistryAccess;
import net.minecraft.command.CommandSource;
import net.minecraft.command.argument.Vec3ArgumentType;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.text.Text;
import net.minecraft.util.math.Vec3d;

/**
 * {@code /ordnance reload | explode <warhead> [pos] | strike <pos>} for operators: reload the config without a
 * restart, and test explosions and missile strikes.
 */
public final class OrdnanceCommand {
	private static final DynamicCommandExceptionType UNKNOWN_WARHEAD = new DynamicCommandExceptionType(
		name -> Text.translatable("commands.ordnance.unknown_warhead", name)
	);

	private OrdnanceCommand() {
	}

	public static void register(CommandDispatcher<ServerCommandSource> dispatcher, CommandRegistryAccess access, CommandManager.RegistrationEnvironment environment) {
		dispatcher.register(
			CommandManager.literal("ordnance")
				.requires(CommandManager.requirePermissionLevel(CommandManager.GAMEMASTERS_CHECK))
				.then(CommandManager.literal("reload").executes(OrdnanceCommand::reload))
				.then(
					CommandManager.literal("explode")
						.then(
							CommandManager.argument("warhead", StringArgumentType.word())
								.suggests((context, builder) -> CommandSource.suggestMatching(
									Arrays.stream(ExplosionProfile.values()).filter(ExplosionProfile::isConfigurable).map(ExplosionProfile::key), builder
								))
								.executes(context -> explode(context, context.getSource().getPosition()))
								.then(CommandManager.argument("pos", Vec3ArgumentType.vec3()).executes(context -> explode(context, Vec3ArgumentType.getVec3(context, "pos"))))
						)
				)
				.then(
					CommandManager.literal("strike")
						.then(CommandManager.argument("pos", Vec3ArgumentType.vec3()).executes(context -> strike(context, Vec3ArgumentType.getVec3(context, "pos"))))
				)
		);
	}

	private static int reload(CommandContext<ServerCommandSource> context) {
		boolean ok = ConfigManager.load();
		context.getSource().sendFeedback(() -> Text.translatable(ok ? "commands.ordnance.reload.success" : "commands.ordnance.reload.failed", ConfigManager.path().toString()), true);
		return ok ? 1 : 0;
	}

	private static int explode(CommandContext<ServerCommandSource> context, Vec3d pos) throws CommandSyntaxException {
		String name = StringArgumentType.getString(context, "warhead").toLowerCase(Locale.ROOT);
		ExplosionProfile profile = Arrays.stream(ExplosionProfile.values())
			.filter(p -> p.isConfigurable() && p.key().equals(name))
			.findFirst()
			.orElseThrow(() -> UNKNOWN_WARHEAD.create(name));
		OrdnanceExplosion.detonate(context.getSource().getWorld(), pos, profile, null, context.getSource().getEntity(), new Vec3d(0.0, -1.0, 0.0));
		context.getSource().sendFeedback(() -> Text.translatable("commands.ordnance.explode.success", name), true);
		return 1;
	}

	private static int strike(CommandContext<ServerCommandSource> context, Vec3d pos) {
		MissileStrikeManager.schedule(context.getSource().getWorld(), pos, context.getSource().getEntity());
		context.getSource().sendFeedback(() -> Text.translatable("commands.ordnance.strike.success"), true);
		return 1;
	}
}
