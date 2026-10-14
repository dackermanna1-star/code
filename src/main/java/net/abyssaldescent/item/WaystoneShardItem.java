package net.abyssaldescent.item;

import java.util.function.Consumer;
import net.abyssaldescent.dungeon.run.DungeonRun;
import net.abyssaldescent.dungeon.run.RunManager;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

/**
 * Emergency extraction: channel for four seconds (any damage interrupts) to return to the surface with your loot
 * secured. Cannot be used while sealed inside an encounter.
 */
public class WaystoneShardItem extends Item {
	private static final int CHANNEL = 80;

	public WaystoneShardItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (level instanceof ServerLevel serverLevel && player instanceof ServerPlayer serverPlayer) {
			RunManager manager = RunManager.get(serverLevel.getServer());
			DungeonRun run = manager.runOf(serverPlayer);
			if (run == null) {
				serverPlayer.displayClientMessage(Component.translatable("message.abyssal_descent.shard.no_run"), true);
				return InteractionResult.FAIL;
			}
			if (sealed(run)) {
				serverPlayer.displayClientMessage(Component.translatable("message.abyssal_descent.shard.sealed").withStyle(ChatFormatting.RED), true);
				return InteractionResult.FAIL;
			}
		}
		player.startUsingItem(hand);
		return InteractionResult.CONSUME;
	}

	@Override
	public int getUseDuration(ItemStack stack, LivingEntity entity) {
		return CHANNEL;
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.BOW;
	}

	@Override
	public void onUseTick(Level level, LivingEntity entity, ItemStack stack, int remaining) {
		if (!(level instanceof ServerLevel serverLevel)) {
			return;
		}
		// Every tick, up to the last: a hit in the final ticks must still break the channel.
		if (entity.hurtTime > 0) {
			interrupt(entity, "message.abyssal_descent.shard.interrupted");
			return;
		}
		if (remaining % 4 == 0) {
			// A room can seal (or the boss wake) around a player who started channelling outside it.
			if (entity instanceof ServerPlayer player && sealed(RunManager.get(serverLevel.getServer()).runOf(player))) {
				interrupt(entity, "message.abyssal_descent.shard.sealed");
				return;
			}
			double angle = remaining * 0.4;
			serverLevel.sendParticles(ModParticles.RIFT_MOTE, entity.getX() + Math.cos(angle), entity.getY() + 0.1, entity.getZ() + Math.sin(angle), 2, 0,
				0.1, 0, 0.0);
		}
		if (remaining % 20 == 0) {
			serverLevel.playSound(null, entity.getX(), entity.getY(), entity.getZ(), ModSounds.GATE_ATTUNE, SoundSource.PLAYERS, 0.5F,
				1.0F + (CHANNEL - remaining) / 100.0F);
		}
	}

	@Override
	public ItemStack finishUsingItem(ItemStack stack, Level level, LivingEntity entity) {
		if (level instanceof ServerLevel serverLevel && entity instanceof ServerPlayer player) {
			RunManager manager = RunManager.get(serverLevel.getServer());
			DungeonRun run = manager.runOf(player);
			if (run != null) {
				// The same checks as during the channel; the shard is only spent on a real extraction.
				String blocked = player.hurtTime > 0 ? "message.abyssal_descent.shard.interrupted"
					: sealed(run) ? "message.abyssal_descent.shard.sealed" : null;
				if (blocked != null) {
					player.displayClientMessage(Component.translatable(blocked).withStyle(ChatFormatting.RED), true);
					return stack;
				}
				stack.shrink(1);
				manager.extract(player, run);
			}
		}
		return stack;
	}

	/** True while the run's party is sealed inside an encounter or a boss fight. */
	private static boolean sealed(@Nullable DungeonRun run) {
		return run != null && (run.floorState.encounter != null || run.floorState.bossStarted && !run.floorState.bossDefeated);
	}

	private static void interrupt(LivingEntity entity, String message) {
		entity.stopUsingItem();
		if (entity instanceof ServerPlayer player) {
			player.displayClientMessage(Component.translatable(message).withStyle(ChatFormatting.RED), true);
		}
	}

	@Override
	@SuppressWarnings("deprecation")
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> out, TooltipFlag flag) {
		out.accept(Component.translatable("item.abyssal_descent.waystone_shard.desc").withStyle(ChatFormatting.GRAY));
	}
}
