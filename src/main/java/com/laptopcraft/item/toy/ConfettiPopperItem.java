package com.laptopcraft.item.toy;

import com.laptopcraft.registry.ModSounds;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/** Single-use party popper: POP! and a cone of colourful confetti in front of the player. */
public class ConfettiPopperItem extends Item {
	private static final int[] COLORS = {0xFF4D6D, 0x3FA9FF, 0xFFD23F, 0x4FD17A, 0xC06BFF, 0xFF8A3D, 0xFFFFFF, 0x4FD1D1};

	public ConfettiPopperItem(Item.Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		level.playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.TOY_POP, SoundSource.PLAYERS, 1.0F, 0.9F + level.getRandom().nextFloat() * 0.2F);
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.FIREWORK_ROCKET_TWINKLE, SoundSource.PLAYERS, 0.5F, 1.3F);
		if (level instanceof ServerLevel serverLevel) {
			burst(serverLevel, player);
		}
		player.awardStat(Stats.ITEM_USED.get(this));
		stack.consume(1, player);
		player.getCooldowns().addCooldown(stack, 10);
		return InteractionResult.SUCCESS;
	}

	private static void burst(ServerLevel level, Player player) {
		Vec3 look = player.getLookAngle();
		Vec3 eye = player.getEyePosition();
		var random = level.getRandom();
		for (int step = 1; step <= 5; step++) {
			double dist = 0.6 + step * 0.45;
			double spread = 0.12 + step * 0.12;
			Vec3 p = eye.add(look.scale(dist));
			for (int color : COLORS) {
				DustParticleOptions dust = new DustParticleOptions(color, 0.9F + random.nextFloat() * 0.6F);
				level.sendParticles(dust, p.x, p.y, p.z, 2, spread, spread * 0.8, spread, 0.0);
			}
		}
		Vec3 front = eye.add(look.scale(1.2));
		level.sendParticles(ParticleTypes.FIREWORK, front.x, front.y, front.z, 14, 0.15, 0.15, 0.15, 0.12);
	}
}
