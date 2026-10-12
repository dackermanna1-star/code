package com.extremesports.client.render;

import com.extremesports.client.anim.RideFrame;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.EquipmentKind;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import org.jspecify.annotations.Nullable;

public class EquipmentRenderState extends EntityRenderState {
	public EquipmentKind kind = EquipmentKind.STREET_BOARD;
	public EquipmentConfig config = EquipmentConfig.EMPTY;
	public @Nullable RideFrame frame;
	public boolean ridden;
	/** GUI previews skip shared ride transforms and spin slowly. */
	public boolean preview;
}
