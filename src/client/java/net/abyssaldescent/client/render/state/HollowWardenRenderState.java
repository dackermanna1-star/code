package net.abyssaldescent.client.render.state;

import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.world.entity.AnimationState;

public class HollowWardenRenderState extends LivingEntityRenderState {
	public final AnimationState idleAnimation = new AnimationState();
	public final AnimationState seatedAnimation = new AnimationState();
	public final AnimationState awakenAnimation = new AnimationState();
	public final AnimationState cleaveAnimation = new AnimationState();
	public final AnimationState cleaveBackAnimation = new AnimationState();
	public final AnimationState slamAnimation = new AnimationState();
	public final AnimationState eruptAnimation = new AnimationState();
	public final AnimationState chargeWindupAnimation = new AnimationState();
	public final AnimationState chargingAnimation = new AnimationState();
	public final AnimationState stunnedAnimation = new AnimationState();
	public final AnimationState volleyAnimation = new AnimationState();
	public final AnimationState roarAnimation = new AnimationState();
	public final AnimationState deathAnimation = new AnimationState();
	/** True while any action animation plays (suppresses walk/head tracking). */
	public boolean busy;
	public int phase = 1;
	public boolean dormant;
}
