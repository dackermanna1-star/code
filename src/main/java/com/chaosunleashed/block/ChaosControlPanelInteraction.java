package com.chaosunleashed.block;

import com.chaosunleashed.core.ChaosActions;
import com.chaosunleashed.core.ChaosEventManager;
import com.chaosunleashed.core.ChaosPermissions;
import com.chaosunleashed.registry.ModBlocks;
import com.chaosunleashed.registry.ModSounds;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;

/** Sneak + right-click on a Chaos Control Panel (with any item in hand) quick-stops every running event. */
public final class ChaosControlPanelInteraction {
	private ChaosControlPanelInteraction() {
	}

	public static void init() {
		UseBlockCallback.EVENT.register((player, world, hand, hit) -> {
			if (!player.isSneaking() || player.isSpectator()) {
				return ActionResult.PASS;
			}
			BlockPos pos = hit.getBlockPos();
			if (!world.getBlockState(pos).isOf(ModBlocks.CHAOS_CONTROL_PANEL)) {
				return ActionResult.PASS;
			}
			if (!world.isClient() && player instanceof ServerPlayerEntity serverPlayer) {
				quickStop(serverPlayer, pos);
			}
			return ActionResult.SUCCESS;
		});
	}

	private static void quickStop(ServerPlayerEntity player, BlockPos pos) {
		ChaosEventManager manager = ChaosEventManager.get();
		if (manager == null) {
			return;
		}
		if (!ChaosPermissions.canUsePanel(player)) {
			player.sendMessage(ChaosActions.prefix().append(Text.literal("You don't have permission to stop events.").formatted(Formatting.RED)), true);
			return;
		}
		player.getEntityWorld().playSound(null, pos, ModSounds.PANEL_CLICK, SoundCategory.BLOCKS, 1.0F, 0.6F);
		player.sendMessage(ChaosActions.stopAll(manager), false);
	}
}
