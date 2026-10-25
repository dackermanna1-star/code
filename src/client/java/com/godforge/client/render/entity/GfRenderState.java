package com.godforge.client.render.entity;

import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/** Render state shared by Godforge effect renderers; each renderer uses the fields it needs. */
public class GfRenderState extends EntityRenderState {
	public float size = 1.0F;
	public float charge = 1.0F;
	public int variant;
	public int color = 0xFFFFFF;
	public float progress;
	public float extra;
	public float extra2;
	public float yaw;
	public float pitch;
	public long seed;
	public Vec3 motion = Vec3.ZERO;
	public Vec3 start = Vec3.ZERO;
	public Vec3 end = Vec3.ZERO;
	public BlockState block = Blocks.STONE.defaultBlockState();
	public BlockState[] blocks = new BlockState[0];
	public int[] dims = {1, 1, 1};
	public boolean flag;
}
