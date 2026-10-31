package com.jjkshowdown.client.render.entity;

import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.phys.Vec3;

public class TechniqueRenderState extends EntityRenderState {
	public float scale = 1f;
	public float charge;
	public float roll;
	public Vec3 velocity = Vec3.ZERO;
	public Vec3 edge = new Vec3(1, 0, 0);
	public Vec3 forward = new Vec3(0, 0, 1);
	public float life;
	public int phase;
	public float progress;
	public float collapse;
	public float integrity = 1f;
	public boolean clashing;
	public int domainType;
	public float radius;
}
