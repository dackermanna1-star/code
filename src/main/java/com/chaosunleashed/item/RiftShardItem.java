package com.chaosunleashed.item;

import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.World;

/** Rift Shard: rift-only loot. Use it to blink up to 16 blocks in the direction you are looking. */
public class RiftShardItem extends Item {
	private static final double RANGE = 16.0;

	public RiftShardItem(Settings settings) {
		super(settings);
	}

	@Override
	public ActionResult use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);
		if (world instanceof ServerWorld serverWorld) {
			Vec3d eyes = user.getEyePos();
			Vec3d end = eyes.add(user.getRotationVec(1.0F).multiply(RANGE));
			BlockHitResult hit = world.raycast(new RaycastContext(eyes, end, RaycastContext.ShapeType.COLLIDER, RaycastContext.FluidHandling.NONE, user));
			Vec3d target = hit.getType() == HitResult.Type.MISS ? end : hit.getPos().subtract(user.getRotationVec(1.0F).multiply(0.8));
			BlockPos feet = BlockPos.ofFloored(target.x, target.y - 1.0, target.z);
			// Find a spot with room for the player.
			for (int i = 0; i < 4; i++) {
				if (world.isSpaceEmpty(user, user.getDimensions(user.getPose()).getBoxAt(target.x, feet.getY() + i, target.z))) {
					Vec3d from = user.getEntityPos();
					serverWorld.spawnParticles(ParticleTypes.REVERSE_PORTAL, from.x, from.y + 1, from.z, 30, 0.3, 0.6, 0.3, 0.1);
					user.requestTeleport(target.x, feet.getY() + i, target.z);
					user.fallDistance = 0.0;
					serverWorld.spawnParticles(ParticleTypes.PORTAL, target.x, feet.getY() + i + 1, target.z, 40, 0.3, 0.6, 0.3, 0.3);
					world.playSound(null, target.x, feet.getY() + i, target.z, SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.PLAYERS, 1.0F, 1.3F);
					stack.decrementUnlessCreative(1, user);
					user.getItemCooldownManager().set(stack, 30);
					return ActionResult.SUCCESS;
				}
			}
			return ActionResult.FAIL;
		}
		return ActionResult.SUCCESS;
	}
}
