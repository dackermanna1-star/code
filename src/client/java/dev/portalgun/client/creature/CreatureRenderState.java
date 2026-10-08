package dev.portalgun.client.creature;

import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;

/** Everything the generic creature model needs to animate one creature for one frame. */
public class CreatureRenderState extends LivingEntityRenderState {
	public float attackAnim;
	public boolean onGround = true;
	public boolean aggressive;
	public float swell;
	/** 0 = above ground .. 1 = fully burrowed. */
	public float burrow;
	public boolean shield;
	public boolean charging;
	public float verticalSpeed;
	public float speedXZ;
}
