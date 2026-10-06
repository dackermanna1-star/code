package com.laptopcraft.delivery;

import com.laptopcraft.registry.ModSounds;
import com.laptopcraft.shop.Store;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;

/** Particles and sounds for package arrivals and unboxing (server side; broadcast to nearby players). */
public final class DeliveryEffects {
	/** Confetti colors: Emerazon orange, emerald green, sky blue, pink, yellow, purple. */
	private static final int[] CONFETTI = {0xFF9900, 0x17DD62, 0x3D8BFD, 0xFF5FA2, 0xFFE14D, 0xA35BFF};
	private static final int[] ENDER_CONFETTI = {0xA35BFF, 0xD08CFF, 0x2EE6C9, 0xFFFFFF};

	private DeliveryEffects() {
	}

	/** A package just arrived at {@code pos}. */
	public static void arrival(ServerLevel level, BlockPos pos, Store store) {
		double x = pos.getX() + 0.5;
		double y = pos.getY() + 0.4;
		double z = pos.getZ() + 0.5;
		if (store == Store.ENDER_EATS) {
			// An Enderman courier just teleported in.
			level.sendParticles(ParticleTypes.PORTAL, x, y + 0.3, z, 90, 0.45, 0.9, 0.45, 0.7);
			level.sendParticles(ParticleTypes.REVERSE_PORTAL, x, y, z, 24, 0.25, 0.3, 0.25, 0.04);
			level.playSound(null, pos, SoundEvents.ENDERMAN_TELEPORT, SoundSource.NEUTRAL, 1.0f, 1.0f);
			level.playSound(null, pos, ModSounds.DELIVERY_ARRIVE, SoundSource.BLOCKS, 0.7f, 1.15f);
		} else {
			level.sendParticles(ParticleTypes.POOF, x, y, z, 22, 0.35, 0.25, 0.35, 0.03);
			level.sendParticles(ParticleTypes.CLOUD, x, y + 0.2, z, 8, 0.3, 0.1, 0.3, 0.02);
			level.sendParticles(ParticleTypes.HAPPY_VILLAGER, x, y + 0.3, z, 8, 0.4, 0.3, 0.4, 0.0);
			level.playSound(null, pos, ModSounds.DELIVERY_ARRIVE, SoundSource.BLOCKS, 1.0f, 1.0f);
		}
	}

	/** Confetti burst for an opened package. */
	public static void unbox(ServerLevel level, BlockPos pos, Store store) {
		double x = pos.getX() + 0.5;
		double y = pos.getY() + 0.5;
		double z = pos.getZ() + 0.5;
		RandomSource random = level.getRandom();
		int[] colors = store == Store.ENDER_EATS ? ENDER_CONFETTI : CONFETTI;
		for (int color : colors) {
			level.sendParticles(new DustParticleOptions(color, 1.0f + random.nextFloat() * 0.6f), x, y + 0.3, z, 7, 0.45, 0.45, 0.45, 0.0);
		}
		level.sendParticles(ParticleTypes.TOTEM_OF_UNDYING, x, y, z, 26, 0.1, 0.1, 0.1, 0.32);
		level.sendParticles(ParticleTypes.POOF, x, y - 0.2, z, 10, 0.25, 0.15, 0.25, 0.02);
		if (store == Store.ENDER_EATS) {
			level.sendParticles(ParticleTypes.PORTAL, x, y, z, 30, 0.3, 0.3, 0.3, 0.5);
		} else {
			level.sendParticles(ParticleTypes.HAPPY_VILLAGER, x, y + 0.2, z, 10, 0.4, 0.3, 0.4, 0.0);
		}
		level.playSound(null, pos, ModSounds.DELIVERY_UNBOX, SoundSource.BLOCKS, 1.0f, 1.0f);
		level.playSound(null, pos, SoundEvents.ITEM_PICKUP, SoundSource.PLAYERS, 0.4f, 1.6f);
	}

	/** Plays a sound only for {@code player} (Player#playSound excludes the player themselves). */
	public static void playTo(ServerPlayer player, SoundEvent sound, float volume, float pitch) {
		player.connection.send(new ClientboundSoundPacket(BuiltInRegistries.SOUND_EVENT.wrapAsHolder(sound), SoundSource.MASTER,
				player.getX(), player.getEyeY(), player.getZ(), volume, pitch, player.getRandom().nextLong()));
	}
}
