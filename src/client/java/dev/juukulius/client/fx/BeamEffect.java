package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusTextures;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/** A radiant beam (In's Radiant Burst): crossed glowing planes with a white-hot core, flaring at the origin. */
public final class BeamEffect extends WorldEffect {
	private final Anchor anchor;
	private final Vec3 direction;
	private final float length;
	private final float width;
	private final int color;

	public BeamEffect(Anchor anchor, Vec3 direction, float length, float width, int color, int lifetime) {
		super(lifetime);
		this.anchor = anchor;
		this.direction = direction.normalize();
		this.length = length;
		this.width = width;
		this.color = color;
	}

	@Override
	public void render(FxContext context) {
		float pt = context.partialTick;
		float progress = this.progress(pt);
		float extend = Math.min(1.0F, progress * 5.0F);
		float alpha = progress < 0.2F ? 1.0F : (1.0F - progress) / 0.8F;
		if (alpha <= 0.01F) {
			return;
		}

		Vec3 origin = this.anchor.position(pt);
		Vector3f start = context.rel(origin);
		Vector3f dir = new Vector3f((float) this.direction.x, (float) this.direction.y, (float) this.direction.z);
		Vector3f end = new Vector3f(dir).mul(this.length * extend).add(start);
		Vector3f u = new Vector3f();
		Vector3f v = new Vector3f();
		FxDraw.basis(dir, u, v);
		float width = this.width * (1.0F + progress * 0.4F);
		VertexConsumer beam = context.glow(JuliusTextures.BEAM);
		for (int i = 0; i < 3; i++) {
			float angle = i * Mth.PI / 3.0F + progress * 0.8F;
			Vector3f side = new Vector3f(u).mul(Mth.cos(angle)).add(new Vector3f(v).mul(Mth.sin(angle))).mul(width);
			Vector3f a = new Vector3f(start).sub(side);
			Vector3f b = new Vector3f(start).add(side);
			Vector3f c = new Vector3f(end).add(side);
			Vector3f d = new Vector3f(end).sub(side);
			FxDraw.gradientQuad(beam, context.matrix, a, b, c, d, 0.0F, 0.0F, 1.0F, 1.0F, FxDraw.argb(alpha, this.color), FxDraw.argb(alpha * 0.35F, this.color));
			Vector3f coreSide = new Vector3f(side).mul(0.35F);
			FxDraw.gradientQuad(beam, context.matrix, new Vector3f(start).sub(coreSide), new Vector3f(start).add(coreSide), new Vector3f(end).add(coreSide),
				new Vector3f(end).sub(coreSide), 0.0F, 0.0F, 1.0F, 1.0F, FxDraw.argb(alpha, 0xFFFFFF), FxDraw.argb(alpha * 0.3F, 0xFFFFFF));
		}

		VertexConsumer glow = context.glow(JuliusTextures.GLOW);
		FxDraw.billboard(glow, context.matrix, context.cameraRotation, start.x, start.y, start.z, width * 3.5F, 0.0F, FxDraw.argb(alpha, this.color));
	}
}
