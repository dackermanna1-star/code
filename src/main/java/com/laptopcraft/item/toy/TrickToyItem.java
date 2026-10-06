package com.laptopcraft.item.toy;

import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * A hand-held toy that does a "trick" when used (yo-yo, fidget spinner): a sound, a little particle puff next to the
 * hand and a random trick name in the action bar ({@code item.laptopcraft.<id>.trick.<n>}).
 */
public class TrickToyItem extends Item {
	private final String id;
	private final int tricks;
	private final SoundEvent sound;
	private final float pitch;
	private final ParticleOptions particle;
	private final int cooldown;

	public TrickToyItem(String id, int tricks, SoundEvent sound, float pitch, ParticleOptions particle, int cooldown, Item.Properties properties) {
		super(properties);
		this.id = id;
		this.tricks = tricks;
		this.sound = sound;
		this.pitch = pitch;
		this.particle = particle;
		this.cooldown = cooldown;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		level.playSound(null, player.getX(), player.getY(), player.getZ(), sound, SoundSource.PLAYERS, 0.7F, pitch + level.getRandom().nextFloat() * 0.2F);
		if (level instanceof ServerLevel serverLevel) {
			Vec3 look = player.getLookAngle();
			Vec3 side = new Vec3(-look.z, 0, look.x).normalize().scale(hand == InteractionHand.MAIN_HAND ? 0.35 : -0.35);
			Vec3 p = player.getEyePosition().add(look.scale(0.7)).add(side).add(0, -0.45, 0);
			serverLevel.sendParticles(particle, p.x, p.y, p.z, 6, 0.12, 0.12, 0.12, 0.02);
			int trick = level.getRandom().nextInt(tricks);
			player.displayClientMessage(Component.translatable("item.laptopcraft." + id + ".trick." + trick).withStyle(ChatFormatting.AQUA), true);
		}
		player.getCooldowns().addCooldown(player.getItemInHand(hand), cooldown);
		return InteractionResult.SUCCESS;
	}
}
