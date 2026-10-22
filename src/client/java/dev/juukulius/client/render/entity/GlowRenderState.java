package dev.juukulius.client.render.entity;

import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.phys.Vec3;

/** Render state shared by the glowing art projectiles. */
public class GlowRenderState extends EntityRenderState {
	public Vec3 direction = new Vec3(0.0, 0.0, 1.0);
	public int kind;
	public float power = 1.0F;
	public float roll;
	public float width = 1.0F;
	public float intensity = 1.0F;
	public boolean empowered;
}
