package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.spirit.Spirit;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/** Nes's yin seal: a dark circle under the bound target with shadow bands coiling up around it. */
public final class SealEffect extends WorldEffect {
	private final Anchor anchor;
	private final float radius;

	public SealEffect(Anchor anchor, float radius, int lifetime) {
		super(lifetime);
		this.anchor = anchor;
		this.radius = radius;
	}

	@Override
	public void render(FxContext context) {
		float pt = context.partialTick;
		float alpha = this.envelope(pt, 0.08F, 0.25F);
		if (alpha <= 0.01F) {
			return;
		}

		Vec3 world = this.anchor.position(pt);
		Entity entity = this.anchor.entity();
		float height = entity != null ? entity.getBbHeight() : 1.8F;
		Vector3f base = context.rel(world.x, world.y + 0.04, world.z);
		float time = (this.age + pt) / 20.0F;
		Vector3f u = new Vector3f(1.0F, 0.0F, 0.0F);
		Vector3f v = new Vector3f(0.0F, 0.0F, 1.0F);

		VertexConsumer veil = context.veil(JuliusTextures.CIRCLE_OUTER);
		float angle = time * 0.9F;
		Vector3f ru = new Vector3f(u).mul(Mth.cos(angle) * this.radius).add(new Vector3f(v).mul(Mth.sin(angle) * this.radius));
		Vector3f rv = new Vector3f(v).mul(Mth.cos(angle) * this.radius).sub(new Vector3f(u).mul(Mth.sin(angle) * this.radius));
		FxDraw.plane(veil, context.matrix, base, ru, rv, FxDraw.argb(alpha * 0.85F, Spirit.NES.accent));

		VertexConsumer glow = context.glow(JuliusTextures.CIRCLE_INNER);
		FxDraw.plane(glow, context.matrix, base, new Vector3f(rv).mul(0.8F), new Vector3f(ru).mul(-0.8F), FxDraw.argb(alpha * 0.9F, Spirit.NES.color));

		VertexConsumer bands = context.veil(JuliusTextures.VORTEX);
		float tighten = 1.0F - 0.25F * Mth.clamp(this.progress(pt) * 4.0F, 0.0F, 1.0F);
		FxDraw.band(bands, context.matrix, base, this.radius * 0.7F * tighten, this.radius * 0.45F * tighten, height * 1.05F, 20, time * 0.8F, 2.0F,
			FxDraw.argb(alpha * 0.7F, Spirit.NES.accent), FxDraw.argb(0.0F, Spirit.NES.accent));
	}
}
