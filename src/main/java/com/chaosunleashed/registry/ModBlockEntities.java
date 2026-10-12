package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.block.ChaosControlPanelBlockEntity;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.block.entity.BlockEntityType;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

public final class ModBlockEntities {
	public static final BlockEntityType<ChaosControlPanelBlockEntity> CHAOS_CONTROL_PANEL = Registry.register(
		Registries.BLOCK_ENTITY_TYPE, ChaosUnleashed.id("chaos_control_panel"),
		FabricBlockEntityTypeBuilder.create(ChaosControlPanelBlockEntity::new, ModBlocks.CHAOS_CONTROL_PANEL).build());

	private ModBlockEntities() {
	}

	public static void init() {
	}
}
