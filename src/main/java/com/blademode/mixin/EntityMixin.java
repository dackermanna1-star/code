package com.blademode.mixin;

import com.blademode.piece.PieceEntity;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Resting pieces are solid with their real (rotated) shape instead of an axis-aligned box. */
@Mixin(Entity.class)
public abstract class EntityMixin {
	@WrapOperation(method = {"collide", "collectAllColliders"}, at = @At(value = "INVOKE",
		target = "Lnet/minecraft/world/level/Level;getEntityCollisions(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/phys/AABB;)Ljava/util/List;"))
	private static List<VoxelShape> blademode$pieceCollisions(Level level, @Nullable Entity entity, AABB box, Operation<List<VoxelShape>> original) {
		List<VoxelShape> shapes = original.call(level, entity, box);
		if (entity instanceof PieceEntity || entity == null || entity.noPhysics) {
			return shapes;
		}
		List<PieceEntity> pieces = level.getEntitiesOfClass(PieceEntity.class, box.inflate(0.5), p -> p.isResting() && !p.isRemoved());
		if (pieces.isEmpty()) {
			return shapes;
		}
		List<VoxelShape> list = new ArrayList<>(shapes);
		for (PieceEntity piece : pieces) {
			piece.addCollisionShapes(box, list);
		}
		return list;
	}
}
