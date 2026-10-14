package net.abyssaldescent.client.render.state;

import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.world.entity.AnimationState;

/** Render state for the custom-rigged dungeon enemies (ghoul, skull, knight). */
public class DungeonMobRenderState extends LivingEntityRenderState {
	public final AnimationState actionA = new AnimationState();
	public final AnimationState actionB = new AnimationState();
	public final AnimationState actionC = new AnimationState();
	public int action;
	public boolean elite;
	public int eliteColor;
}
