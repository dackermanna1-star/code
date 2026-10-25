package com.modernapartments.item;

import com.modernapartments.build.ComplexType;
import com.modernapartments.build.placement.PlacementManager;
import com.modernapartments.build.placement.PlacementTransform;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Shared (client preview + server placement) logic for where a blueprint would build: the ground
 * block the player is looking at (up to 128 blocks away) becomes the centre of the building's front
 * edge, and the entrance faces the player (optionally turned with sneak-use).
 */
public final class BlueprintTargeting {
	public static final double RANGE = 128.0;

	public record Target(BlockPos frontCenter, Direction front, PlacementTransform transform) {
	}

	private BlueprintTargeting() {
	}

	public static int turns(ItemStack stack) {
		return stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag().getIntOr("Turns", 0) & 3;
	}

	public static void setTurns(ItemStack stack, int turns) {
		CustomData.update(DataComponents.CUSTOM_DATA, stack, tag -> tag.putInt("Turns", turns & 3));
	}

	public static @Nullable Target target(Level level, Player player, ComplexType type, ItemStack stack) {
		Vec3 eye = player.getEyePosition();
		Vec3 end = eye.add(player.getViewVector(1.0F).scale(RANGE));
		BlockHitResult hit = level.clip(new ClipContext(eye, end, ClipContext.Block.OUTLINE, ClipContext.Fluid.ANY, player));
		if (hit.getType() != HitResult.Type.BLOCK) {
			return null;
		}
		BlockPos p = hit.getBlockPos();
		int surface = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, p.getX(), p.getZ()) - 1;
		BlockPos ground = new BlockPos(p.getX(), Math.max(surface, level.getMinY()), p.getZ());
		Direction front = player.getDirection().getOpposite();
		for (int i = 0; i < turns(stack); i++) {
			front = front.getClockWise();
		}
		return new Target(ground, front, PlacementManager.transformFor(type, ground, front));
	}
}
