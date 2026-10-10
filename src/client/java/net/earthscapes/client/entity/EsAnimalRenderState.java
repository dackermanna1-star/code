package net.earthscapes.client.entity;

import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;

public class EsAnimalRenderState extends LivingEntityRenderState {
	public int variant;
	/** 0..1 how far the head is lowered to graze. */
	public float grazeAmount;
	/** 0..1 progress of the display (trunk raised, yawn, gape, roar, alarm stance). */
	public float actionAmount;
	public boolean hideMane;
}
