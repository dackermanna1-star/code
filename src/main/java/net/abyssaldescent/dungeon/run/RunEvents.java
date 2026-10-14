package net.abyssaldescent.dungeon.run;

import java.util.List;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.registry.ModTags;
import net.abyssaldescent.world.DungeonDimension;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityWorldChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrownEnderpearl;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;

/** Wires the run system into Fabric's events: ticking, defeat, joins, dimension changes and dungeon protection. */
public final class RunEvents {
	private RunEvents() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(server -> {
			RunManager manager = RunManager.get(server);
			manager.tick();
			expelStrays(manager);
		});

		ServerLivingEntityEvents.ALLOW_DEATH.register((entity, source, amount) -> {
			// Every death during an expedition is a defeat, /kill included: a real death would scatter the gear the
			// player brought across the dungeon floor, and the rules promise that gear is kept. A held totem still gets
			// its chance first, but only where vanilla lets it fire.
			if (entity instanceof ServerPlayer player && DungeonDimension.isDungeon(player.level())) {
				RunManager manager = RunManager.get(player.level().getServer());
				if (manager.runOf(player) != null && !totemWillSave(player, source)) {
					manager.defeat(player, source);
					return false;
				}
			}
			return true;
		});

		ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> {
			RunManager manager = RunManager.get(newPlayer.level().getServer());
			if (!alive && manager.runOf(newPlayer) != null) {
				// A death we did not intercept (a totem-less death outside the depths, another mod): the expedition is over.
				manager.abandon(newPlayer);
			}
		});

		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> RunManager.get(server).onJoin(handler.player));

		ServerEntityWorldChangeEvents.AFTER_PLAYER_CHANGE_WORLD.register((player, origin, destination) -> {
			RunManager manager = RunManager.get(player.level().getServer());
			if (DungeonDimension.isDungeon(origin) && !DungeonDimension.isDungeon(destination)) {
				// Every way out ends the expedition, and a pearl still flying down there would pull the player back in.
				for (ThrownEnderpearl pearl : List.copyOf(player.getEnderPearls())) {
					if (DungeonDimension.isDungeon(pearl.level())) {
						pearl.discard();
					}
				}
				if (!manager.isAuthorizedTransfer(player.getUUID())) {
					manager.onUnauthorisedExit(player);
				}
			}
		});

		PlayerBlockBreakEvents.BEFORE.register((level, player, pos, state, blockEntity) -> !isProtected(level, player) || state.is(ModTags.DUNGEON_BREAKABLE));

		UseBlockCallback.EVENT.register((player, level, hand, hit) -> {
			ItemStack stack = player.getItemInHand(hand);
			if (!isProtected(level, player) || !(stack.getItem() instanceof BlockItem || isBanned(stack))) {
				return InteractionResult.PASS;
			}
			// Dungeon fixtures stay usable with a block, bucket or banned item in hand, but only the fixture's own use runs:
			// vanilla falls back to the item (placing the block) whenever the fixture does not consume the click, as an
			// iron door does, and the off hand never gets the fixture's empty-hand use at all.
			BlockState target = level.getBlockState(hit.getBlockPos());
			if (target.is(ModTags.DUNGEON_INTERACTABLE) && !player.isSecondaryUseActive()) {
				InteractionResult result = target.useItemOn(stack, level, player, hand, hit);
				if (result instanceof InteractionResult.TryEmptyHandInteraction && hand == InteractionHand.MAIN_HAND) {
					result = target.useWithoutItem(level, player, hit);
				}
				if (result.consumesAction()) {
					return result;
				}
			}
			resync(player);
			Consumable food = stack.get(DataComponents.CONSUMABLE);
			if (food != null && !isBanned(stack) && !player.getCooldowns().isOnCooldown(stack)) {
				// What vanilla does with food it cannot place (carrots, berries): eat it.
				return food.startConsuming(player, stack, hand);
			}
			warn(player);
			return InteractionResult.FAIL;
		});

		UseItemCallback.EVENT.register((player, level, hand) -> {
			if (isProtected(level, player) && isBanned(player.getItemInHand(hand))) {
				resync(player);
				warn(player);
				return InteractionResult.FAIL;
			}
			return InteractionResult.PASS;
		});
	}

	/**
	 * Only the server decides: a client does not know the server's rules, so its callbacks pass and it predicts the vanilla
	 * outcome, which the server's refusal then rolls back (block updates plus {@link #resync}).
	 */
	private static boolean isProtected(Level level, Player player) {
		return !level.isClientSide() && DungeonDimension.isDungeon(level) && AdConfig.get().rules.protectDungeon && !player.isCreative()
			&& !player.isSpectator();
	}

	private static boolean isBanned(ItemStack stack) {
		return stack.is(ModTags.DUNGEON_BANNED) || stack.getItem() instanceof BucketItem;
	}

	private static void warn(Player player) {
		player.displayClientMessage(Component.translatable("message.abyssal_descent.protected").withStyle(ChatFormatting.DARK_GRAY), true);
	}

	/** The client already applied the refused use to its copy of the inventory (a placed block, a filled bucket): undo it. */
	private static void resync(Player player) {
		if (player instanceof ServerPlayer serverPlayer) {
			serverPlayer.inventoryMenu.sendAllDataToRemote();
		}
	}

	/** Mirrors vanilla's totem check: a held totem gets its chance first, except against damage no totem stops (/kill, the void). */
	private static boolean totemWillSave(ServerPlayer player, DamageSource source) {
		if (source.is(DamageTypeTags.BYPASSES_INVULNERABILITY)) {
			return false;
		}
		for (InteractionHand hand : InteractionHand.values()) {
			if (player.getItemInHand(hand).has(DataComponents.DEATH_PROTECTION)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Sends back to the surface any survival player found in the depths without an expedition. Only the gate leads down, but
	 * other things can carry a player there (a pearl outliving its owner's death, a command, another mod), and nothing
	 * they found would be tagged as unsecured.
	 */
	private static void expelStrays(RunManager manager) {
		ServerLevel dungeon = manager.dungeon();
		if (dungeon == null) {
			return;
		}
		for (ServerPlayer player : List.copyOf(dungeon.players())) {
			if (player.isAlive() && !player.isCreative() && !player.isSpectator() && manager.runOf(player) == null) {
				manager.abandon(player);
				manager.returnPlayer(player, null);
				player.sendSystemMessage(Component.translatable("message.abyssal_descent.expelled").withStyle(ChatFormatting.GRAY));
			}
		}
	}
}
