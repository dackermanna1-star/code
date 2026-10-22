package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusTextures;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * A column of light rising around an entity: the rainbow pillar of the transformation, In's golden empowerment,
 * Kua's healing spring. Scrolling bands fade towards the top.
 */
public final class PillarEffect extends WorldEffect {
	private final Anchor anchor;
	private final float radius;
	private final float height;
	private final int color;
	private final boolean rainbow;

	public PillarEffect(Anchor anchor, float radius, float height, int color, boolean rainbow, int lifetime) {
		super(lifetime);
		this.anchor = anchor;
		this.radius = radius;
		this.height = height;
		this.color = color;
		this.rainbow = rainbow;
	}

	@Override
	public void render(FxContext context) {
		float pt = context.partialTick;
		float progress = this.progress(pt);
		float rise = 1.0F - (1.0F - Math.min(1.0F, progress * 3.0F)) * (1.0F - Math.min(1.0F, progress * 3.0F));
		float alpha = this.envelope(pt, 0.1F, 0.45F) * 0.75F;
		if (alpha <= 0.01F) {
			return;
		}

		Vec3 world = this.anchor.position(pt);
		Vector3f base = context.rel(world);
		float time = (this.age + pt) / 20.0F;
		float height = this.height * rise;
		VertexConsumer consumer = context.glow(JuliusTextures.VORTEX);
		int layers = this.rainbow ? 6 : 2;
		for (int i = 0; i < layers; i++) {
			int c = this.rainbow ? FxDraw.rainbow(i / 6.0F + time * 0.2F) : this.color;
			float r = this.radius * (0.75F + i * (this.rainbow ? 0.06F : 0.3F)) * (1.0F + progress * 0.25F);
			FxDraw.band(consumer, context.matrix, base, r, r * 0.6F, height, 24, time * (0.3F + i * 0.05F) * (i % 2 == 0 ? 1 : -1), 2.0F,
				FxDraw.argb(alpha * (this.rainbow ? 0.45F : 0.7F), c), FxDraw.argb(0.0F, c));
		}

		VertexConsumer glow = context.glow(JuliusTextures.GLOW);
		Vector3f mid = new Vector3f(base).add(0.0F, height * 0.35F, 0.0F);
		int glowColor = this.rainbow ? FxDraw.rainbow(time * 0.3F) : this.color;
		FxDraw.billboard(glow, context.matrix, context.cameraRotation, mid.x, mid.y, mid.z, this.radius * 2.2F * Mth.lerp(progress, 1.0F, 0.6F), 0.0F,
			FxDraw.argb(alpha * 0.6F, glowColor));
	}
}
