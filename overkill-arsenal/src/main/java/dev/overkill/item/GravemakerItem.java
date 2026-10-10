package dev.overkill.item;

import dev.overkill.entity.SingularityRoundEntity;
import dev.overkill.network.Fx;
import dev.overkill.network.FxKind;
import dev.overkill.registry.ModItems;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Gravemaker: fires a dark marble that blooms into a black hole for 4 seconds, pulling in mobs,
 * items and ripped-up terrain before collapsing and exploding outward. Sneak to fire a white hole
 * instead, which blasts everything (you included) away.
 */
public class GravemakerItem extends Item {
	public static final int BLACK_HOLE_COOLDOWN = 140;
	public static final int WHITE_HOLE_COOLDOWN = 50;

	public GravemakerItem(Item.Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		boolean white = player.isSecondaryUseActive();
		if (level instanceof ServerLevel serverLevel) {
			ItemStack round = new ItemStack(white ? ModItems.WHITE_HOLE_ROUND : ModItems.SINGULARITY_ROUND);
			SingularityRoundEntity projectile = new SingularityRoundEntity(serverLevel, player, round);
			projectile.shootFromRotation(player, player.getXRot(), player.getYRot(), 0.0F, white ? 2.2F : 2.6F, 0.4F);
			serverLevel.addFreshEntity(projectile);

			Vec3 look = player.getViewVector(1.0F);
			Vec3 muzzle = player.getEyePosition().add(look.scale(1.0)).add(0.0, -0.25, 0.0);
			Fx.send(serverLevel, muzzle, 96.0, FxKind.MUZZLE_FLASH, muzzle, look, 1.0F, white ? FxKind.WEAPON_GRAVEMAKER_WHITE : FxKind.WEAPON_GRAVEMAKER);
			level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.SHULKER_SHOOT, SoundSource.PLAYERS, 1.2F, white ? 1.6F : 0.6F);
			level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.ILLUSIONER_MIRROR_MOVE, SoundSource.PLAYERS, 1.0F, white ? 1.4F : 0.7F);
			level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.RESPAWN_ANCHOR_DEPLETE, SoundSource.PLAYERS, 0.7F, white ? 1.8F : 0.8F);
			player.push(look.scale(-0.15));
			player.hurtMarked = true;
			if (player instanceof ServerPlayer serverPlayer) {
				Fx.shake(serverPlayer, 1.0F, 6);
			}
			player.getCooldowns().addCooldown(stack, white ? WHITE_HOLE_COOLDOWN : BLACK_HOLE_COOLDOWN);
		}
		return InteractionResult.CONSUME;
	}
}
