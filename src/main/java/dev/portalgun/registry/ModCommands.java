package dev.portalgun.registry;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import dev.portalgun.dimension.Destination;
import dev.portalgun.dimension.Destinations;
import dev.portalgun.item.PortalGunItem;
import dev.portalgun.travel.SafeSpotFinder;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.phys.Vec3;

/** /portalgun list | goto <dimension> | refill - handy for exploring and for testing. */
public final class ModCommands {
	private ModCommands() {
	}

	public static void init() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(
			Commands.literal("portalgun")
				.then(Commands.literal("list").executes(ModCommands::list))
				.then(Commands.literal("refill").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS)).executes(ModCommands::refill))
				.then(Commands.literal("goto").requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
					.then(Commands.argument("dimension", StringArgumentType.greedyString())
						.suggests((ctx, b) -> SharedSuggestionProvider.suggest(Destinations.all().stream().map(d -> d.id().getPath()), b))
						.executes(ModCommands::goTo)))));
	}

	private static int list(CommandContext<CommandSourceStack> ctx) {
		for (Destination d : Destinations.all()) {
			ctx.getSource().sendSuccess(() -> Component.literal(d.code() + "  ").withStyle(ChatFormatting.GREEN)
				.append(Component.literal(d.name()).withStyle(s -> s.withColor(d.color())))
				.append(Component.literal("  " + d.tagline()).withStyle(ChatFormatting.GRAY)), false);
		}
		return Destinations.all().size();
	}

	private static int refill(CommandContext<CommandSourceStack> ctx) throws com.mojang.brigadier.exceptions.CommandSyntaxException {
		ServerPlayer player = ctx.getSource().getPlayerOrException();
		ItemStack stack = player.getMainHandItem();
		if (stack.getItem() instanceof PortalGunItem) {
			PortalGunItem.setCharges(stack, PortalGunItem.MAX_CHARGES);
			return 1;
		}
		return 0;
	}

	private static int goTo(CommandContext<CommandSourceStack> ctx) throws com.mojang.brigadier.exceptions.CommandSyntaxException {
		ServerPlayer player = ctx.getSource().getPlayerOrException();
		String arg = StringArgumentType.getString(ctx, "dimension").trim();
		Identifier id = arg.contains(":") ? Identifier.tryParse(arg) : Identifier.fromNamespaceAndPath("portalgun", arg);
		Destination d = id == null ? null : Destinations.get(id);
		if (d == null && id != null) {
			d = Destinations.get(Identifier.withDefaultNamespace(arg));
		}
		if (d == null) {
			ctx.getSource().sendFailure(Component.literal("Unknown dimension " + arg));
			return 0;
		}
		ServerLevel level = ctx.getSource().getServer().getLevel(d.key());
		if (level == null) {
			ctx.getSource().sendFailure(Component.literal("Dimension not loaded: " + d.id()));
			return 0;
		}
		SafeSpotFinder.Spot spot = SafeSpotFinder.find(level, new Vec3(player.getX(), Destinations.info(d.id()) != null ? Destinations.info(d.id()).arrivalY : player.getY(), player.getZ()));
		player.teleport(new TeleportTransition(level, spot.pos(), Vec3.ZERO, player.getYRot(), player.getXRot(), TeleportTransition.DO_NOTHING));
		Destination fd = d;
		ctx.getSource().sendSuccess(() -> Component.literal("Welcome to " + fd.name()), false);
		return 1;
	}
}
