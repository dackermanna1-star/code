package com.modernapartments.command;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.BuildCache;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.placement.PlacedBuilding;
import com.modernapartments.build.placement.PlacementManager;
import com.modernapartments.build.placement.PlacementTransform;
import com.modernapartments.build.validation.ReachabilityValidator;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.LongArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.SimpleCommandExceptionType;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.commands.arguments.coordinates.BlockPosArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.permissions.Permissions;

/**
 * /apartments place|list|undo|validate|info. Placement uses the same pipeline as blueprints.
 */
public final class ApartmentsCommand {
	private static final SimpleCommandExceptionType UNKNOWN = new SimpleCommandExceptionType(
		Component.translatable("command.modernapartments.unknown_complex"));
	private static final SuggestionProvider<CommandSourceStack> COMPLEXES = (ctx, builder) ->
		SharedSuggestionProvider.suggest(Arrays.stream(ComplexType.values()).map(ComplexType::id), builder);
	private static final SuggestionProvider<CommandSourceStack> FACINGS = (ctx, builder) ->
		SharedSuggestionProvider.suggest(List.of("north", "east", "south", "west"), builder);

	private ApartmentsCommand() {
	}

	public static void init() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> register(dispatcher));
	}

	private static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
		dispatcher.register(Commands.literal("apartments")
			.requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
			.then(Commands.literal("place")
				.then(Commands.argument("complex", StringArgumentType.word()).suggests(COMPLEXES)
					.executes(ctx -> place(ctx, BlockPos.containing(ctx.getSource().getPosition()).below(), null, null))
					.then(Commands.argument("pos", BlockPosArgument.blockPos())
						.executes(ctx -> place(ctx, BlockPosArgument.getLoadedBlockPos(ctx, "pos"), null, null))
						.then(Commands.argument("facing", StringArgumentType.word()).suggests(FACINGS)
							.executes(ctx -> place(ctx, BlockPosArgument.getLoadedBlockPos(ctx, "pos"),
								StringArgumentType.getString(ctx, "facing"), null))
							.then(Commands.argument("seed", LongArgumentType.longArg())
								.executes(ctx -> place(ctx, BlockPosArgument.getLoadedBlockPos(ctx, "pos"),
									StringArgumentType.getString(ctx, "facing"), LongArgumentType.getLong(ctx, "seed"))))))))
			.then(Commands.literal("list").executes(ApartmentsCommand::list))
			.then(Commands.literal("undo").executes(ApartmentsCommand::undo))
			.then(Commands.literal("validate")
				.then(Commands.argument("complex", StringArgumentType.word()).suggests(COMPLEXES)
					.executes(ctx -> validate(ctx, 0L))
					.then(Commands.argument("seed", LongArgumentType.longArg())
						.executes(ctx -> validate(ctx, LongArgumentType.getLong(ctx, "seed"))))))
			.then(Commands.literal("info").executes(ApartmentsCommand::info)));
	}

	private static ComplexType complex(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
		ComplexType type = ComplexType.byId(StringArgumentType.getString(ctx, "complex"));
		if (type == null) {
			throw UNKNOWN.create();
		}
		return type;
	}

	private static int place(CommandContext<CommandSourceStack> ctx, BlockPos ground, String facing, Long seed) throws CommandSyntaxException {
		ComplexType type = complex(ctx);
		CommandSourceStack source = ctx.getSource();
		Direction front = facing == null ? Direction.fromYRot(source.getRotation().y).getOpposite()
			: Direction.byName(facing.toLowerCase(Locale.ROOT));
		if (front == null || front.getAxis().isVertical()) {
			front = Direction.SOUTH;
		}
		ServerLevel level = source.getLevel();
		PlacementTransform transform = PlacementManager.transformFor(type, ground, front);
		Component error = PlacementManager.checkFits(level, transform);
		if (error != null) {
			source.sendFailure(error);
			return 0;
		}
		long actualSeed = seed == null ? level.random.nextLong() : seed;
		PlacementManager.start(level, type, actualSeed, transform, source.getPlayer());
		Direction finalFront = front;
		source.sendSuccess(() -> Component.translatable("command.modernapartments.placing", type.displayName(),
			transform.min().toShortString(), finalFront.getName(), actualSeed), true);
		return 1;
	}

	private static int list(CommandContext<CommandSourceStack> ctx) {
		List<PlacedBuilding> buildings = PlacementManager.placed(ctx.getSource().getLevel());
		ctx.getSource().sendSuccess(() -> Component.translatable("command.modernapartments.list_header", buildings.size()), false);
		for (PlacedBuilding b : buildings) {
			ctx.getSource().sendSuccess(() -> Component.literal(" - ").append(b.complexType().displayName())
				.append(" @ " + b.transform().min().toShortString()), false);
		}
		return buildings.size();
	}

	private static int undo(CommandContext<CommandSourceStack> ctx) {
		ServerLevel level = ctx.getSource().getLevel();
		PlacedBuilding latest = PlacementManager.latest(level);
		if (latest == null) {
			ctx.getSource().sendFailure(Component.translatable("command.modernapartments.nothing_to_undo"));
			return 0;
		}
		PlacementManager.demolish(level, latest);
		ctx.getSource().sendSuccess(() -> Component.translatable("message.modernapartments.demolishing", latest.complexType().displayName()), true);
		return 1;
	}

	private static int validate(CommandContext<CommandSourceStack> ctx, long seed) throws CommandSyntaxException {
		ComplexType type = complex(ctx);
		long start = System.currentTimeMillis();
		BlockBuffer buffer = BuildCache.generate(type, seed);
		ReachabilityValidator.Report report = ReachabilityValidator.validate(buffer);
		long ms = System.currentTimeMillis() - start;
		CommandSourceStack source = ctx.getSource();
		int units = buffer.markers("unit").size();
		source.sendSuccess(() -> Component.translatable("command.modernapartments.validate_summary", type.displayName(), units,
			report.markersChecked(), report.unreachable().size(), report.warnings().size(), report.nodesVisited(), ms), false);
		report.unreachable().stream().limit(12).forEach(u -> source.sendSuccess(() -> Component.literal(" unreachable: " + u), false));
		report.warnings().stream().limit(12).forEach(w -> source.sendSuccess(() -> Component.literal(" warning: " + w), false));
		return report.ok() ? 1 : 0;
	}

	private static int info(CommandContext<CommandSourceStack> ctx) {
		ServerLevel level = ctx.getSource().getLevel();
		PlacedBuilding b = PlacementManager.findAt(level, BlockPos.containing(ctx.getSource().getPosition()));
		if (b == null) {
			ctx.getSource().sendFailure(Component.translatable("message.modernapartments.no_building_here"));
			return 0;
		}
		ctx.getSource().sendSuccess(() -> Component.translatable("command.modernapartments.info", b.complexType().displayName(),
			b.transform().min().toShortString(), b.transform().rotation().name().toLowerCase(Locale.ROOT), b.seed()), false);
		return 1;
	}
}
