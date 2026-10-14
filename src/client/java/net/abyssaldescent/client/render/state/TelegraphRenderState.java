package net.abyssaldescent.client.render.state;

import net.abyssaldescent.entity.fx.TelegraphEntity;
import net.minecraft.client.renderer.entity.state.EntityRenderState;

public class TelegraphRenderState extends EntityRenderState {
	public TelegraphEntity.Shape shape = TelegraphEntity.Shape.CIRCLE;
	public float radius;
	public float width;
	public float progress;
	public float yaw;
	public int color;
}
