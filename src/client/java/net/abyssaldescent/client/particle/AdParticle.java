package net.abyssaldescent.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;

/**
 * One configurable particle covering every effect in the mod: animated or random sprites, fullbright glow, fades,
 * drift and gravity. Configured through {@link Style}.
 */
public class AdParticle extends SingleQuadParticle {
	public record Style(int minLife, int maxLife, float size, float gravity, float friction, boolean glow, boolean animated, boolean physics,
		float fadeIn, float fadeOut, float shrink, int color, float spin) {
		public static Style of(int minLife, int maxLife, float size) {
			return new Style(minLife, maxLife, size, 0.0F, 0.96F, true, false, false, 0.1F, 0.6F, 0.0F, 0xFFFFFF, 0.0F);
		}

		public Style gravity(float g) {
			return new Style(minLife, maxLife, size, g, friction, glow, animated, physics, fadeIn, fadeOut, shrink, color, spin);
		}

		public Style friction(float f) {
			return new Style(minLife, maxLife, size, gravity, f, glow, animated, physics, fadeIn, fadeOut, shrink, color, spin);
		}

		public Style dim() {
			return new Style(minLife, maxLife, size, gravity, friction, false, animated, physics, fadeIn, fadeOut, shrink, color, spin);
		}

		public Style withAnimation() {
			return new Style(minLife, maxLife, size, gravity, friction, glow, true, physics, fadeIn, fadeOut, shrink, color, spin);
		}

		public Style withPhysics() {
			return new Style(minLife, maxLife, size, gravity, friction, glow, animated, true, fadeIn, fadeOut, shrink, color, spin);
		}

		public Style fade(float in, float out) {
			return new Style(minLife, maxLife, size, gravity, friction, glow, animated, physics, in, out, shrink, color, spin);
		}

		public Style shrink(float s) {
			return new Style(minLife, maxLife, size, gravity, friction, glow, animated, physics, fadeIn, fadeOut, s, color, spin);
		}

		public Style color(int rgb) {
			return new Style(minLife, maxLife, size, gravity, friction, glow, animated, physics, fadeIn, fadeOut, shrink, rgb, spin);
		}

		public Style spin(float s) {
			return new Style(minLife, maxLife, size, gravity, friction, glow, animated, physics, fadeIn, fadeOut, shrink, color, s);
		}
	}

	private final SpriteSet sprites;
	private final Style style;
	private final float baseSize;

	protected AdParticle(ClientLevel level, double x, double y, double z, double xd, double yd, double zd, SpriteSet sprites, Style style,
		RandomSource random) {
		super(level, x, y, z, 0, 0, 0, sprites.get(random));
		this.sprites = sprites;
		this.style = style;
		this.xd = xd;
		this.yd = yd;
		this.zd = zd;
		this.lifetime = style.minLife() + (style.maxLife() > style.minLife() ? random.nextInt(style.maxLife() - style.minLife() + 1) : 0);
		this.gravity = style.gravity();
		this.friction = style.friction();
		this.hasPhysics = style.physics();
		this.baseSize = style.size() * (0.8F + random.nextFloat() * 0.4F);
		this.quadSize = baseSize;
		this.roll = random.nextFloat() * Mth.TWO_PI * (style.spin() != 0 ? 1 : 0);
		this.oRoll = roll;
		int c = style.color();
		float jitter = 0.92F + random.nextFloat() * 0.08F;
		setColor(((c >> 16) & 0xFF) / 255.0F * jitter, ((c >> 8) & 0xFF) / 255.0F * jitter, (c & 0xFF) / 255.0F * jitter);
		if (style.animated()) {
			setSpriteFromAge(sprites);
		}
		updateAlpha();
	}

	@Override
	public void tick() {
		super.tick();
		if (removed) {
			return;
		}
		if (style.animated()) {
			setSpriteFromAge(sprites);
		}
		oRoll = roll;
		roll += style.spin();
		float t = age / (float) lifetime;
		quadSize = baseSize * (1.0F - style.shrink() * t);
		updateAlpha();
	}

	private void updateAlpha() {
		float t = lifetime <= 0 ? 0 : age / (float) lifetime;
		float a = 1.0F;
		if (style.fadeIn() > 0 && t < style.fadeIn()) {
			a = t / style.fadeIn();
		}
		if (t > style.fadeOut()) {
			a = Math.min(a, (1.0F - t) / Math.max(0.01F, 1.0F - style.fadeOut()));
		}
		setAlpha(Mth.clamp(a, 0.0F, 1.0F));
	}

	@Override
	protected Layer getLayer() {
		return Layer.TRANSLUCENT;
	}

	@Override
	protected int getLightColor(float partialTick) {
		return style.glow() ? 0xF000F0 : super.getLightColor(partialTick);
	}
}
