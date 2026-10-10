package dev.overkill.client.fx;

import dev.overkill.item.StormcallerGauntletItem;
import dev.overkill.registry.ModItems;
import dev.overkill.registry.ModParticles;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/** Idle ambience for weapons in hand: crackling gauntlets, void-dripping scythes, glowing barrels. */
public final class HeldWeaponEffects {
	private HeldWeaponEffects() {
	}

	public static void tick(Minecraft client) {
		ClientLevel level = client.level;
		if (level == null || client.isPaused()) {
			return;
		}
		for (Player player : level.players()) {
			if (player.isInvisible() || player.distanceToSqr(client.gameRenderer.getMainCamera().position()) > 64.0 * 64.0) {
				continue;
			}
			for (InteractionHand hand : InteractionHand.values()) {
				ItemStack stack = player.getItemInHand(hand);
				if (!stack.isEmpty()) {
					emit(client, level, player, hand, stack);
				}
			}
		}
	}

	private static void emit(Minecraft client, ClientLevel level, Player player, InteractionHand hand, ItemStack stack) {
		RandomSource random = level.getRandom();
		if (stack.is(ModItems.STORMCALLER_GAUNTLET)) {
			int charge = StormcallerGauntletItem.getCharge(stack);
			if (charge > 0 && random.nextInt(11) < charge + 1) {
				Vec3 hp = handPos(client, player, hand);
				spark(level, ModParticles.STATIC_SPARK, hp.add(jitter(random, 0.12)), jitter(random, 0.04));
				if (charge >= StormcallerGauntletItem.MAX_CHARGE) {
					level.addParticle(ModParticles.ARC, true, true, hp.x + random.nextGaussian() * 0.15, hp.y + random.nextGaussian() * 0.15,
						hp.z + random.nextGaussian() * 0.15, 1.2, 0.9, 3.0);
				}
			}
		} else if (stack.is(ModItems.RIFTFANG_SCYTHE)) {
			if (random.nextInt(4) == 0) {
				Vec3 hp = handPos(client, player, hand).add(0.0, 0.35, 0.0);
				spark(level, ModParticles.VOID_MOTE, hp.add(jitter(random, 0.25)), new Vec3(0.0, -0.02, 0.0));
			}
		} else if (stack.is(ModItems.GRAVEMAKER)) {
			if (random.nextInt(5) == 0) {
				Vec3 hp = handPos(client, player, hand);
				Vec3 offset = jitter(random, 0.35);
				spark(level, ModParticles.VOID_MOTE, hp.add(offset), offset.scale(-0.08));
			}
		} else if (stack.is(ModItems.SUNLINE_RIFLE)) {
			if (random.nextInt(9) == 0 && !player.getCooldowns().isOnCooldown(stack)) {
				Vec3 hp = handPos(client, player, hand);
				spark(level, ModParticles.SUN_SPARK, hp.add(jitter(random, 0.1)), new Vec3(0.0, 0.03, 0.0));
			}
		} else if (stack.is(ModItems.WORLDBREAKER_CANNON)) {
			if (random.nextInt(8) == 0 && !player.isUsingItem()) {
				Vec3 hp = handPos(client, player, hand);
				spark(level, ModParticles.STATIC_SPARK, hp.add(jitter(random, 0.15)), jitter(random, 0.02));
			}
		}
	}

	private static void spark(ClientLevel level, ParticleOptions type, Vec3 pos, Vec3 velocity) {
		level.addParticle(type, pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z);
	}

	private static Vec3 jitter(RandomSource random, double amount) {
		return new Vec3(random.nextGaussian() * amount, random.nextGaussian() * amount, random.nextGaussian() * amount);
	}

	/** Approximate world position of the hand holding the item. */
	private static Vec3 handPos(Minecraft client, Player player, InteractionHand hand) {
		HumanoidArm arm = hand == InteractionHand.MAIN_HAND ? player.getMainArm() : player.getMainArm().getOpposite();
		float side = arm == HumanoidArm.RIGHT ? 1.0F : -1.0F;
		boolean firstPerson = player == client.player && client.options.getCameraType().isFirstPerson();
		if (firstPerson) {
			Vec3 look = player.getViewVector(1.0F);
			Vec3 right = look.cross(new Vec3(0.0, 1.0, 0.0));
			right = right.lengthSqr() < 1.0E-4 ? new Vec3(1.0, 0.0, 0.0) : right.normalize();
			return player.getEyePosition().add(look.scale(0.75)).add(right.scale(0.38 * side)).add(0.0, -0.38, 0.0);
		}
		float yaw = player.yBodyRot * Mth.DEG_TO_RAD;
		Vec3 forward = new Vec3(-Mth.sin(yaw), 0.0, Mth.cos(yaw));
		Vec3 right = new Vec3(-Mth.cos(yaw), 0.0, -Mth.sin(yaw));
		return player.position().add(0.0, 0.85, 0.0).add(right.scale(0.38 * side)).add(forward.scale(0.3));
	}
}
