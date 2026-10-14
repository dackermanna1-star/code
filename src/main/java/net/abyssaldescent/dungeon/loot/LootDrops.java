package net.abyssaldescent.dungeon.loot;

import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Presents loot: items burst out in a fountain, with sparkles and a sound matching the best rarity. */
public final class LootDrops {
	private LootDrops() {
	}

	public static void fountain(ServerLevel level, Vec3 origin, List<ItemStack> stacks, @Nullable ServerPlayer owner) {
		Rarity best = Rarity.COMMON;
		int i = 0;
		for (ItemStack stack : stacks) {
			if (stack.isEmpty()) {
				continue;
			}
			Rarity rarity = Rarity.of(stack);
			if (rarity.ordinal() > best.ordinal()) {
				best = rarity;
			}
			ItemEntity entity = new ItemEntity(level, origin.x, origin.y, origin.z, stack);
			double angle = (i++ / (double) Math.max(1, stacks.size())) * Math.PI * 2 + level.random.nextDouble() * 0.5;
			double spread = 0.12 + level.random.nextDouble() * 0.06;
			entity.setDeltaMovement(Math.cos(angle) * spread, 0.32 + level.random.nextDouble() * 0.1, Math.sin(angle) * spread);
			entity.setPickUpDelay(12);
			if (owner != null) {
				entity.setTarget(owner.getUUID());
			}
			entity.setExtendedLifetime();
			level.addFreshEntity(entity);
			if (rarity.sparkle() != null) {
				level.sendParticles(rarity.sparkle(), origin.x, origin.y + 0.2, origin.z, 6 + rarity.ordinal() * 4, 0.2, 0.3, 0.2, 0.08);
			}
		}
		SoundEvent sound = best.dropSound();
		if (sound != null) {
			if (owner != null && best.ordinal() >= Rarity.EPIC.ordinal()) {
				// Epic and legendary drops get a personal fanfare so it is never missed in a fight.
				net.abyssaldescent.util.Messages.privateSound(owner, sound, 1.0F, 1.0F);
			} else {
				level.playSound(null, origin.x, origin.y, origin.z, sound, SoundSource.PLAYERS, 1.0F, 1.0F);
			}
		}
	}
}
