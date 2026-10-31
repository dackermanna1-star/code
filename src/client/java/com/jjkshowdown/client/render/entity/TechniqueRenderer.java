package com.jjkshowdown.client.render.entity;

import com.jjkshowdown.entity.projectile.TechniqueProjectile;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.core.BlockPos;

/** Base renderer for technique projectiles: always full-bright, never culled by its tiny hitbox. */
public abstract class TechniqueRenderer<T extends TechniqueProjectile> extends EntityRenderer<T, TechniqueRenderState> {
	protected TechniqueRenderer(EntityRendererProvider.Context ctx) {
		super(ctx);
	}

	@Override
	public TechniqueRenderState createRenderState() {
		return new TechniqueRenderState();
	}

	@Override
	public void extractRenderState(T e, TechniqueRenderState s, float partial) {
		super.extractRenderState(e, s, partial);
		s.scale = e.scale();
		s.charge = e.charge();
		s.roll = e.roll();
		s.velocity = e.getDeltaMovement();
	}

	@Override
	public boolean shouldRender(T e, Frustum frustum, double x, double y, double z) {
		return e.distanceToSqr(x, y, z) < 192 * 192;
	}

	@Override
	protected int getBlockLightLevel(T e, BlockPos pos) {
		return 15;
	}
}
