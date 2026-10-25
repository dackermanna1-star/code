package com.modernapartments.client;

import com.modernapartments.build.placement.PlacementTransform;
import com.modernapartments.build.placement.TerrainAdapter;
import com.modernapartments.item.BlueprintItem;
import com.modernapartments.item.BlueprintTargeting;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.core.Direction;
import net.minecraft.gizmos.GizmoStyle;
import net.minecraft.gizmos.Gizmos;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** While a blueprint is held, outlines the building footprint, height and entrance direction. */
public final class BlueprintPreview {
	private BlueprintPreview() {
	}

	public static void init() {
		ClientTickEvents.END_CLIENT_TICK.register(BlueprintPreview::tick);
	}

	private static void tick(Minecraft client) {
		if (client.player == null || client.level == null) {
			return;
		}
		ItemStack stack = client.player.getMainHandItem();
		if (!(stack.getItem() instanceof BlueprintItem blueprint)) {
			return;
		}
		BlueprintTargeting.Target target = BlueprintTargeting.target(client.level, client.player, blueprint.complexType(), stack);
		if (target == null) {
			return;
		}
		PlacementTransform t = target.transform();
		BoundingBox box = t.footprintBox();
		int ground = t.worldY(blueprint.complexType().groundY()) + 1;
		AABB footprint = new AABB(box.minX(), ground, box.minZ(), box.maxX() + 1, ground + 0.05, box.maxZ() + 1);
		Gizmos.cuboid(footprint, GizmoStyle.strokeAndFill(0xFF33CCFF, 2.0F, 0x2233CCFF));
		AABB volume = new AABB(box.minX(), box.minY(), box.minZ(), box.maxX() + 1, box.maxY() + 1, box.maxZ() + 1);
		Gizmos.cuboid(volume, GizmoStyle.stroke(0x8833CCFF, 1.0F));
		AABB blend = footprint.inflate(TerrainAdapter.BLEND, 0, TerrainAdapter.BLEND);
		Gizmos.cuboid(blend, GizmoStyle.stroke(0x5566FF66, 1.0F));
		Direction front = target.front();
		Vec3 start = Vec3.atBottomCenterOf(target.frontCenter()).add(0, 1.5, 0);
		Vec3 end = start.add(front.getStepX() * 6.0, 0, front.getStepZ() * 6.0);
		Gizmos.arrow(start, end, 0xFFFFCC33, 3.0F);
	}
}
