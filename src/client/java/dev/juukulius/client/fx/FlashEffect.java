package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusTextures;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/** A brief bright flash at the moment of impact: a glow that blooms and fades plus a crisp star core. */
public final class FlashEffect extends WorldEffect {
	private final Anchor anchor;
	private final float size;
	private final int color;

	public FlashEffect(Anchor anchor, float size, int color, int lifetime) {
		super(lifetime);
		this.anchor = anchor;
		this.size = size;
		this.color = color;
	}

	@Override
	public void render(FxContext context) {
		float progress = this.progress(context.partialTick);
		float alpha = (1.0F - progress) * (1.0F - progress);
		if (alpha <= 0.01F) {
			return;
		}

		Vec3 world = this.anchor.position(context.partialTick);
		Vector3f p = context.rel(world);
		float bloom = this.size * (0.6F + progress * 0.8F);
		VertexConsumer glow = context.glow(JuliusTextures.GLOW);
		FxDraw.billboard(glow, context.matrix, context.cameraRotation, p.x, p.y, p.z, bloom, 0.0F, FxDraw.argb(alpha * 0.9F, this.color));
		FxDraw.billboard(glow, context.matrix, context.cameraRotation, p.x, p.y, p.z, bloom * 0.45F, 0.0F, FxDraw.argb(alpha, 0xFFFFFF));
		VertexConsumer spark = context.glow(JuliusTextures.SPARK);
		FxDraw.billboard(spark, context.matrix, context.cameraRotation, p.x, p.y, p.z, this.size * (0.5F + progress * 0.3F), progress * 0.6F,
			FxDraw.argb(alpha, FxDraw.lerpRgb(0.5F, this.color, 0xFFFFFF)));
	}
}
