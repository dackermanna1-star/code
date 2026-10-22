package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.spirit.Spirit;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * An expanding ring: ground shockwaves (normal up) or pressure waves travelling along a direction (normal = direction).
 * The rainbow variant stacks six thin rings in the spirits' colours.
 */
public final class RingWaveEffect extends WorldEffect {
	private final Anchor anchor;
	private final Vec3 normal;
	private final float startRadius;
	private final float endRadius;
	private final float thickness;
	private final int color;
	private final boolean rainbow;
	private final float travel;
	private final float maxAlpha;

	public RingWaveEffect(Anchor anchor, Vec3 normal, float startRadius, float endRadius, float thickness, int color, boolean rainbow, int lifetime,
		float travel, float maxAlpha) {
		super(lifetime);
		this.anchor = anchor;
		this.normal = normal.lengthSqr() < 1.0E-6 ? new Vec3(0.0, 1.0, 0.0) : normal.normalize();
		this.startRadius = startRadius;
		this.endRadius = endRadius;
		this.thickness = thickness;
		this.color = color;
		this.rainbow = rainbow;
		this.travel = travel;
		this.maxAlpha = maxAlpha;
	}

	public static RingWaveEffect ground(Anchor anchor, float endRadius, int color, boolean rainbow, int lifetime) {
		return new RingWaveEffect(anchor, new Vec3(0.0, 1.0, 0.0), 0.3F, endRadius, 0.55F, color, rainbow, lifetime, 0.0F, 0.85F);
	}

	@Override
	public void render(FxContext context) {
		float pt = context.partialTick;
		float progress = this.progress(pt);
		float eased = 1.0F - (1.0F - progress) * (1.0F - progress);
		float radius = Mth.lerp(eased, this.startRadius, this.endRadius);
		float alpha = this.maxAlpha * (1.0F - progress) * Math.min(1.0F, progress * 6.0F + 0.2F);
		if (alpha <= 0.01F) {
			return;
		}

		Vec3 world = this.anchor.position(pt).add(this.normal.scale(this.travel * eased));
		Vector3f center = context.rel(world.x, world.y + (this.normal.y > 0.99 ? 0.05 : 0.0), world.z);
		Vector3f u = new Vector3f();
		Vector3f v = new Vector3f();
		FxDraw.basis(new Vector3f((float) this.normal.x, (float) this.normal.y, (float) this.normal.z), u, v);
		float width = this.thickness * (1.0F - progress * 0.5F);
		int segments = Mth.clamp((int) (radius * 10.0F), 24, 72);
		VertexConsumer consumer = context.glow(JuliusTextures.SHOCKWAVE);
		if (this.rainbow) {
			float band = width / 3.0F;
			for (Spirit spirit : Spirit.values()) {
				float inner = radius - width + spirit.ordinal() * band * 0.5F;
				int c = FxDraw.argb(alpha, spirit.color);
				FxDraw.ring(consumer, context.matrix, center, u, v, Math.max(0.0F, inner), inner + band, segments, 4.0F, c, c);
			}
		} else {
			int c = FxDraw.argb(alpha, this.color);
			FxDraw.ring(consumer, context.matrix, center, u, v, Math.max(0.0F, radius - width), radius, segments, 4.0F, c, c);
		}
	}
}
