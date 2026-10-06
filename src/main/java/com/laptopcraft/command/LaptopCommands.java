package com.laptopcraft.command;

import com.laptopcraft.account.AccountService;
import com.laptopcraft.account.MailTemplates;
import com.laptopcraft.account.Order;
import com.laptopcraft.account.OrderStatus;
import com.laptopcraft.account.PlayerAccount;
import com.laptopcraft.delivery.DeliveryManager;
import com.laptopcraft.delivery.OrderService;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Product;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.DynamicCommandExceptionType;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import java.util.List;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerPlayer;

/**
 * {@code /laptopcraft} commands:
 * <pre>
 *   /laptopcraft balance                         your EmeraldPay balance (everyone)
 *   /laptopcraft balance &lt;player&gt;                someone's balance (op)
 *   /laptopcraft balance set|add &lt;player&gt; &lt;n&gt;   change a balance (op)
 *   /laptopcraft orders [player]                 recent orders (own: everyone, others: op)
 *   /laptopcraft deliver [player]                make pending orders arrive now (op)
 *   /laptopcraft mail &lt;player&gt; &lt;subject&gt; &lt;msg&gt;  send an in-game mail (op)
 *   /laptopcraft gift &lt;player&gt; &lt;product&gt; [qty]  deliver a free gift next to the player (op)
 * </pre>
 */
public final class LaptopCommands {
	private static final int MAX_AMOUNT = PlayerAccount.MAX_BALANCE;
	private static final DynamicCommandExceptionType UNKNOWN_PRODUCT = new DynamicCommandExceptionType(
			id -> Component.translatable("commands.laptopcraft.gift.unknown", id));
	private static final SuggestionProvider<CommandSourceStack> PRODUCTS = (context, builder) ->
			SharedSuggestionProvider.suggest(Catalog.all().stream().map(Product::id), builder);

	private LaptopCommands() {
	}

	public static void init() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> register(dispatcher));
	}

	private static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
		var op = Commands.<CommandSourceStack>hasPermission(Commands.LEVEL_GAMEMASTERS);
		dispatcher.register(Commands.literal("laptopcraft")
				.then(Commands.literal("balance")
						.executes(ctx -> showBalance(ctx.getSource(), ctx.getSource().getPlayerOrException()))
						.then(Commands.argument("player", EntityArgument.player()).requires(op)
								.executes(ctx -> showBalance(ctx.getSource(), EntityArgument.getPlayer(ctx, "player"))))
						.then(Commands.literal("set").requires(op)
								.then(Commands.argument("player", EntityArgument.player())
										.then(Commands.argument("amount", IntegerArgumentType.integer(0, MAX_AMOUNT))
												.executes(ctx -> setBalance(ctx, false)))))
						.then(Commands.literal("add").requires(op)
								.then(Commands.argument("player", EntityArgument.player())
										.then(Commands.argument("amount", IntegerArgumentType.integer(-MAX_AMOUNT, MAX_AMOUNT))
												.executes(ctx -> setBalance(ctx, true))))))
				.then(Commands.literal("orders")
						.executes(ctx -> listOrders(ctx.getSource(), ctx.getSource().getPlayerOrException()))
						.then(Commands.argument("player", EntityArgument.player()).requires(op)
								.executes(ctx -> listOrders(ctx.getSource(), EntityArgument.getPlayer(ctx, "player")))))
				.then(Commands.literal("deliver").requires(op)
						.executes(ctx -> rush(ctx.getSource(), ctx.getSource().getPlayerOrException()))
						.then(Commands.argument("player", EntityArgument.player())
								.executes(ctx -> rush(ctx.getSource(), EntityArgument.getPlayer(ctx, "player")))))
				.then(Commands.literal("mail").requires(op)
						.then(Commands.argument("player", EntityArgument.player())
								.then(Commands.argument("subject", StringArgumentType.string())
										.then(Commands.argument("message", StringArgumentType.greedyString())
												.executes(LaptopCommands::mail)))))
				.then(Commands.literal("gift").requires(op)
						.then(Commands.argument("player", EntityArgument.player())
								.then(Commands.argument("product", StringArgumentType.string()).suggests(PRODUCTS)
										.executes(ctx -> gift(ctx, 1))
										.then(Commands.argument("quantity", IntegerArgumentType.integer(1, Catalog.MAX_UNITS_PER_LINE))
												.executes(ctx -> gift(ctx, IntegerArgumentType.getInteger(ctx, "quantity"))))))));
	}

	private static int showBalance(CommandSourceStack source, ServerPlayer player) {
		int balance = AccountService.account(player).balance();
		boolean self = player == source.getPlayer();
		Component amount = Component.literal(String.valueOf(balance)).withStyle(ChatFormatting.GREEN);
		source.sendSuccess(() -> self
				? Component.translatable("commands.laptopcraft.balance.self", amount)
				: Component.translatable("commands.laptopcraft.balance.other", player.getDisplayName(), amount), false);
		return balance;
	}

	private static int setBalance(CommandContext<CommandSourceStack> ctx, boolean add) throws CommandSyntaxException {
		ServerPlayer player = EntityArgument.getPlayer(ctx, "player");
		int amount = IntegerArgumentType.getInteger(ctx, "amount");
		PlayerAccount account = AccountService.account(player);
		int delta = add ? amount : amount - account.balance();
		int balance = AccountService.addBalance(player, delta, delta >= 0 ? "Bonus from the server" : "Adjustment by the server");
		if (delta != 0) {
			AccountService.notify(player, "bank", "Balance updated",
					(delta > 0 ? "+" : "") + delta + " emeralds. New balance: " + balance + ".");
		}
		Component name = player.getDisplayName();
		ctx.getSource().sendSuccess(() -> add
				? Component.translatable("commands.laptopcraft.balance.add", amount, name, balance)
				: Component.translatable("commands.laptopcraft.balance.set", name, balance), true);
		return balance;
	}

	private static int listOrders(CommandSourceStack source, ServerPlayer player) {
		List<Order> orders = AccountService.account(player).orders();
		long now = AccountService.now(source.getServer());
		if (orders.isEmpty()) {
			source.sendSuccess(() -> Component.translatable("commands.laptopcraft.orders.none", player.getDisplayName()), false);
			return 0;
		}
		source.sendSuccess(() -> Component.translatable("commands.laptopcraft.orders.header", player.getDisplayName(), orders.size())
				.withStyle(ChatFormatting.GOLD), false);
		for (Order order : orders.subList(0, Math.min(8, orders.size()))) {
			MutableComponent line = Component.literal(" #" + order.id() + " ").withStyle(ChatFormatting.GRAY)
					.append(Component.literal(order.store().displayName() + " ").withStyle(ChatFormatting.WHITE))
					.append(Component.literal(order.total() + "E ").withStyle(ChatFormatting.GREEN));
			if (order.status() == OrderStatus.PENDING) {
				long seconds = Math.max(0, (order.deliverAt() - now + 19) / 20);
				line.append(Component.translatable("commands.laptopcraft.orders.pending", seconds).withStyle(ChatFormatting.YELLOW));
			} else {
				line.append(Component.translatable("commands.laptopcraft.orders." + order.status().getSerializedName())
						.withStyle(order.status() == OrderStatus.DELIVERED ? ChatFormatting.DARK_GREEN : ChatFormatting.RED));
			}
			source.sendSuccess(() -> line, false);
		}
		return orders.size();
	}

	private static int rush(CommandSourceStack source, ServerPlayer player) {
		int rushed = DeliveryManager.rush(player);
		source.sendSuccess(() -> rushed == 0
				? Component.translatable("commands.laptopcraft.deliver.none", player.getDisplayName())
				: Component.translatable("commands.laptopcraft.deliver.success", rushed, player.getDisplayName()), true);
		return rushed;
	}

	private static int mail(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
		ServerPlayer player = EntityArgument.getPlayer(ctx, "player");
		String subject = StringArgumentType.getString(ctx, "subject");
		String message = StringArgumentType.getString(ctx, "message").replace("\\n", "\n");
		String from = ctx.getSource().getPlayer() != null ? ctx.getSource().getPlayer().getGameProfile().name() : MailTemplates.FROM_ADMIN;
		AccountService.sendMail(player, from, subject, message, "", true);
		ctx.getSource().sendSuccess(() -> Component.translatable("commands.laptopcraft.mail.success", player.getDisplayName()), true);
		return 1;
	}

	private static int gift(CommandContext<CommandSourceStack> ctx, int quantity) throws CommandSyntaxException {
		ServerPlayer player = EntityArgument.getPlayer(ctx, "player");
		String id = StringArgumentType.getString(ctx, "product");
		Product product = Catalog.get(id).orElseThrow(() -> UNKNOWN_PRODUCT.create(id));
		String from = ctx.getSource().getPlayer() != null ? ctx.getSource().getPlayer().getGameProfile().name() : MailTemplates.FROM_ADMIN;
		long orderId = OrderService.gift(player, product, quantity, 5, from);
		if (orderId < 0) {
			ctx.getSource().sendFailure(Component.translatable("commands.laptopcraft.gift.failed", product.name()));
			return 0;
		}
		ctx.getSource().sendSuccess(() -> Component.translatable("commands.laptopcraft.gift.success", quantity, product.name(),
				player.getDisplayName()), true);
		return 1;
	}
}
