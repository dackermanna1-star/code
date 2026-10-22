package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.spirit.Spirit;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * A layered runic circle: soft glow disc, outer rune ring, inner six-pointed star (one point per spirit) and a glyph
 * band, counter-rotating. Lies on the ground or stands upright facing a direction (in front of the casting hand).
 */
public final class MagicCircleEffect extends WorldEffect {
	private final Anchor anchor;
	private final Vec3 normal;
	private final float radius;
	private final int color;
	private final boolean rainbow;
	private final float spin;

	public MagicCircleEffect(Anchor anchor, Vec3 normal, float radius, int color, boolean rainbow, int lifetime, float spin) {
		super(lifetime);
		this.anchor = anchor;
		this.normal = normal.lengthSqr() < 1.0E-6 ? new Vec3(0.0, 1.0, 0.0) : normal.normalize();
		this.radius = radius;
		this.color = color;
		this.rainbow = rainbow;
		this.spin = spin;
	}

	public static MagicCircleEffect ground(Anchor anchor, float radius, int color, boolean rainbow, int lifetime) {
		return new MagicCircleEffect(anchor, new Vec3(0.0, 1.0, 0.0), radius, color, rainbow, lifetime, 0.6F);
	}

	public static MagicCircleEffect facing(Anchor anchor, Vec3 direction, float radius, int color, int lifetime) {
		return new MagicCircleEffect(anchor, direction, radius, color, false, lifetime, 1.4F);
	}

	@Override
	public void render(FxContext context) {
		if (!dev.juukulius.client.config.JuliusClientConfig.get().magicCircles) {
			return;
		}

		float pt = context.partialTick;
		float progress = this.progress(pt);
		float appear = Mth.clamp(progress / 0.18F, 0.0F, 1.0F);
		float scale = appear < 1.0F ? backOut(appear) : 1.0F;
		float fade = Mth.clamp((1.0F - progress) / 0.25F, 0.0F, 1.0F);
		float alpha = Math.min(appear * 1.4F, 1.0F) * fade;
		if (alpha <= 0.01F) {
			return;
		}

		Vec3 world = this.anchor.position(pt);
		boolean flat = this.normal.y > 0.99;
		Vector3f center = context.rel(world.x, world.y + (flat ? 0.03 : 0.0), world.z);
		Vector3f u = new Vector3f();
		Vector3f v = new Vector3f();
		FxDraw.basis(new Vector3f((float) this.normal.x, (float) this.normal.y, (float) this.normal.z), u, v);
		float r = this.radius * scale;
		float time = (this.age + pt) / 20.0F;
		int baseColor = this.rainbow ? FxDraw.rainbow(time * 0.25F) : this.color;

		VertexConsumer glow = context.glow(JuliusTextures.GLOW);
		draw(glow, context, center, u, v, r * 1.25F, 0.0F, FxDraw.argb(alpha * 0.35F, baseColor));

		VertexConsumer outer = context.glow(JuliusTextures.CIRCLE_OUTER);
		draw(outer, context, center, u, v, r, time * this.spin, FxDraw.argb(alpha * 0.95F, baseColor));

		VertexConsumer glyphs = context.glow(JuliusTextures.CIRCLE_GLYPHS);
		draw(glyphs, context, center, u, v, r * 0.82F, -time * this.spin * 0.6F, FxDraw.argb(alpha * 0.8F, FxDraw.lerpRgb(0.4F, baseColor, 0xFFFFFF)));

		VertexConsumer inner = context.glow(JuliusTextures.CIRCLE_INNER);
		draw(inner, context, center, u, v, r * 0.62F, -time * this.spin * 1.5F, FxDraw.argb(alpha, baseColor));

		// Six star points carry the six spirits' colours on rainbow circles.
		if (this.rainbow) {
			VertexConsumer dots = context.glow(JuliusTextures.GLOW);
			float starAngle = -time * this.spin * 1.5F;
			// The star points sit at 92% of the inner texture's radius.
			float starRadius = r * 0.62F * 0.92F;
			for (Spirit spirit : Spirit.values()) {
				float a = starAngle + spirit.ordinal() * Mth.TWO_PI / Spirit.COUNT;
				Vector3f p = new Vector3f(u).mul(Mth.cos(a) * starRadius).add(new Vector3f(v).mul(Mth.sin(a) * starRadius)).add(center);
				Vector3f du = new Vector3f(u).mul(r * 0.12F);
				Vector3f dv = new Vector3f(v).mul(r * 0.12F);
				FxDraw.plane(dots, context.matrix, p, du, dv, FxDraw.argb(alpha, spirit.color));
			}
		}
	}

	private static void draw(VertexConsumer consumer, FxContext context, Vector3f center, Vector3f u, Vector3f v, float radius, float angle, int color) {
		float cos = Mth.cos(angle);
		float sin = Mth.sin(angle);
		Vector3f ru = new Vector3f(u).mul(cos).add(new Vector3f(v).mul(sin)).mul(radius);
		Vector3f rv = new Vector3f(v).mul(cos).sub(new Vector3f(u).mul(sin)).mul(radius);
		FxDraw.plane(consumer, context.matrix, center, ru, rv, color);
	}

	private static float backOut(float t) {
		float c1 = 1.4F;
		float f = t - 1.0F;
		return 1.0F + (c1 + 1.0F) * f * f * f + c1 * f * f;
	}
}
