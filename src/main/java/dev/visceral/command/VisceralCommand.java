package dev.visceral.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.FloatArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import dev.visceral.config.CommonConfig;
import dev.visceral.entity.CombatState;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.physics.BalanceSystem;
import dev.visceral.physics.BodyMath;
import dev.visceral.registry.VisceralRegistry;
import java.util.Collection;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/** {@code /visceral}: config reload plus debugging helpers for the physics/wound systems. */
public final class VisceralCommand {
	private VisceralCommand() {
	}

	public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
		dispatcher.register(Commands.literal("visceral")
			.requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
			.then(Commands.literal("reload").executes(ctx -> {
				CommonConfig.load();
				ctx.getSource().sendSuccess(() -> Component.literal("Visceral common config reloaded"), true);
				return 1;
			}))
			.then(Commands.literal("knockdown")
				.then(Commands.argument("targets", EntityArgument.entities())
					.executes(ctx -> knockdown(ctx, 3.5f))
					.then(Commands.argument("force", FloatArgumentType.floatArg(0.5f, 20f))
						.executes(ctx -> knockdown(ctx, FloatArgumentType.getFloat(ctx, "force"))))))
			.then(Commands.literal("stagger")
				.then(Commands.argument("targets", EntityArgument.entities())
					.executes(ctx -> impact(ctx, 1.6f))))
			.then(Commands.literal("clearwounds")
				.then(Commands.argument("targets", EntityArgument.entities())
					.executes(VisceralCommand::clearWounds)))
			.then(Commands.literal("state")
				.then(Commands.argument("targets", EntityArgument.entities())
					.executes(VisceralCommand::state))));
	}

	private static Vec3 awayFromSource(CommandContext<CommandSourceStack> ctx, Entity target) {
		Vec3 from = ctx.getSource().getPosition();
		Vec3 dir = BodyMath.horizontal(target.position().subtract(from));
		return dir.lengthSqr() < 1e-6 ? new Vec3(1, 0, 0) : dir;
	}

	private static int knockdown(CommandContext<CommandSourceStack> ctx, float force) throws CommandSyntaxException {
		Collection<? extends Entity> targets = EntityArgument.getEntities(ctx, "targets");
		int n = 0;
		for (Entity e : targets) {
			if (e instanceof LivingEntity le && BalanceSystem.participates(le)) {
				BalanceSystem.forceKnockdown(le, awayFromSource(ctx, e), force);
				n++;
			}
		}
		int count = n;
		ctx.getSource().sendSuccess(() -> Component.literal("Knocked down " + count + " entities"), true);
		return n;
	}

	private static int impact(CommandContext<CommandSourceStack> ctx, float force) throws CommandSyntaxException {
		int n = 0;
		for (Entity e : EntityArgument.getEntities(ctx, "targets")) {
			if (e instanceof LivingEntity le) {
				BalanceSystem.applyImpact(le, awayFromSource(ctx, e), force, false);
				n++;
			}
		}
		return n;
	}

	private static int clearWounds(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
		int n = 0;
		for (Entity e : EntityArgument.getEntities(ctx, "targets")) {
			if (e instanceof LivingEntity le && le.hasAttached(VisceralRegistry.WOUNDS)) {
				le.removeAttached(VisceralRegistry.WOUNDS);
				dev.visceral.wound.WoundSystem.updateModifiers(le, dev.visceral.state.WoundList.EMPTY);
				n++;
			}
		}
		int count = n;
		ctx.getSource().sendSuccess(() -> Component.literal("Cleared wounds on " + count + " entities"), true);
		return n;
	}

	private static int state(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
		for (Entity e : EntityArgument.getEntities(ctx, "targets")) {
			CombatState cs = VisceralEntity.get(e);
			String s = cs == null ? "STANDING (no state)" : cs.state + " t=" + cs.stateTicks + "/" + cs.stateDuration
				+ String.format(" balance=%.2f imb=%.2f", cs.balance, Math.sqrt(cs.imbX * cs.imbX + cs.imbZ * cs.imbZ));
			ctx.getSource().sendSuccess(() -> Component.literal(e.getName().getString() + ": " + s), false);
		}
		return 1;
	}
}
