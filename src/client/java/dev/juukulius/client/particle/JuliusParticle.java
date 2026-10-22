package dev.juukulius.client.particle;

import dev.juukulius.client.render.JuliusRenderTypes;
import dev.juukulius.particle.JuliusParticleOptions;
import net.minecraft.client.Camera;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.renderer.state.QuadParticleRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * One configurable particle covering every Julius style: glowing (additive, fullbright) or soft (alpha blended, lit),
 * camera-facing, motion-aligned streaks, or flat ground rings; with size/alpha curves and sprite animation.
 */
public class JuliusParticle extends SingleQuadParticle {
	private final Style style;
	private final SpriteSet sprites;
	private final float baseSize;
	private final float baseRed;
	private final float baseGreen;
	private final float baseBlue;
	private final float hueStart;
	private final float swaySeed;

	protected JuliusParticle(ClientLevel level, double x, double y, double z, double dx, double dy, double dz, JuliusParticleOptions options, Style style,
		SpriteSet sprites) {
		super(level, x, y, z, dx, dy, dz, sprites.first());
		this.style = style;
		this.sprites = sprites;
		this.xd = dx;
		this.yd = dy;
		this.zd = dz;
		this.baseRed = options.red();
		this.baseGreen = options.green();
		this.baseBlue = options.blue();
		this.setColor(this.baseRed, this.baseGreen, this.baseBlue);
		this.hueStart = this.random.nextFloat();
		this.swaySeed = this.random.nextFloat() * 10.0F;
		this.hasPhysics = style.physics;
		this.gravity = style.gravity;
		this.friction = style.friction;
		int lifetime = options.lifetime() > 0 ? options.lifetime() : style.minLife + this.random.nextInt(Math.max(1, style.maxLife - style.minLife + 1));
		this.setLifetime(lifetime);
		this.baseSize = style.size * options.scale() * (0.8F + this.random.nextFloat() * 0.4F);
		this.quadSize = this.baseSize;
		this.roll = this.random.nextFloat() * Mth.TWO_PI;
		this.oRoll = this.roll;
		if (style.animated) {
			this.setSpriteFromAge(sprites);
		} else {
			this.setSprite(sprites.get(this.random));
		}
	}

	@Override
	public void tick() {
		super.tick();
		if (this.removed) {
			return;
		}

		float life = this.age / (float) this.lifetime;
		if (this.style.animated) {
			this.setSpriteFromAge(this.sprites);
		}

		this.oRoll = this.roll;
		switch (this.style) {
			case RAINBOW -> {
				int rgb = Mth.hsvToRgb((this.hueStart + life * 0.8F) % 1.0F, 0.7F, 1.0F);
				this.setColor(((rgb >> 16) & 0xFF) / 255.0F, ((rgb >> 8) & 0xFF) / 255.0F, (rgb & 0xFF) / 255.0F);
				this.roll += 0.12F;
			}
			case EMBER -> {
				float cool = Math.min(1.0F, life * 1.3F);
				this.setColor(this.baseRed, this.baseGreen * (1.0F - cool * 0.55F), this.baseBlue * (1.0F - cool));
				this.xd += (this.random.nextFloat() - 0.5F) * 0.004F;
				this.zd += (this.random.nextFloat() - 0.5F) * 0.004F;
			}
			case LEAF -> {
				float sway = Mth.sin(this.age * 0.25F + this.swaySeed);
				this.xd += sway * 0.004F;
				this.zd += Mth.cos(this.age * 0.21F + this.swaySeed) * 0.004F;
				this.roll += sway * 0.12F;
			}
			case MOTE -> {
				this.xd += Mth.sin(this.age * 0.2F + this.swaySeed) * 0.0015F;
				this.zd += Mth.cos(this.age * 0.17F + this.swaySeed) * 0.0015F;
			}
			case DROPLET -> {
				if (this.onGround) {
					this.remove();
				}
			}
			case GLOW, SPARK_LINE -> this.roll += 0.05F;
			default -> {
			}
		}

		this.quadSize = this.baseSize * this.style.sizeCurve(life);
		this.alpha = this.style.alphaCurve(life);
	}

	@Override
	public void extract(QuadParticleRenderState renderState, Camera camera, float partialTick) {
		switch (this.style) {
			case STREAK, SPARK_LINE -> {
				// Align the streak with the particle's motion as seen on screen.
				Quaternionf rotation = new Quaternionf(camera.rotation());
				Vector3f velocity = new Vector3f((float) this.xd, (float) this.yd, (float) this.zd);
				Vector3f local = velocity.rotate(new Quaternionf(rotation).conjugate());
				float angle = (float) Math.atan2(local.y, local.x);
				rotation.rotateZ(angle);
				this.extractRotatedQuad(renderState, camera, rotation, partialTick);
			}
			case RING -> {
				Quaternionf flat = new Quaternionf().rotationX(-Mth.HALF_PI);
				this.extractRotatedQuad(renderState, camera, flat, partialTick);
			}
			default -> super.extract(renderState, camera, partialTick);
		}
	}

	@Override
	protected Layer getLayer() {
		return this.style.additive ? JuliusRenderTypes.ADDITIVE_PARTICLES : Layer.TRANSLUCENT;
	}

	@Override
	public int getLightColor(float partialTick) {
		return this.style.additive ? 0xF000F0 : super.getLightColor(partialTick);
	}

	/** Behaviour presets. */
	public enum Style {
		GLOW(true, 0.11F, 10, 20, 0.0F, 0.9F, false, false),
		RAINBOW(true, 0.12F, 12, 22, 0.0F, 0.9F, false, false),
		EMBER(true, 0.06F, 18, 32, -0.006F, 0.95F, false, false),
		FLAME(true, 0.22F, 10, 16, -0.012F, 0.9F, false, true),
		DROPLET(false, 0.07F, 14, 24, 0.055F, 0.98F, true, false),
		STREAK(true, 0.3F, 7, 11, 0.0F, 0.85F, false, false),
		LEAF(false, 0.1F, 28, 42, 0.012F, 0.94F, true, false),
		DUST(false, 0.32F, 18, 30, -0.002F, 0.86F, false, true),
		MOTE(true, 0.075F, 22, 36, -0.008F, 0.96F, false, false),
		WISP(false, 0.26F, 18, 28, -0.01F, 0.92F, false, true),
		FLASH(true, 0.8F, 4, 6, 0.0F, 0.0F, false, true),
		RING(true, 0.6F, 10, 12, 0.0F, 0.0F, false, false),
		SPARK_LINE(true, 0.22F, 4, 7, 0.0F, 0.7F, false, false);

		final boolean additive;
		final float size;
		final int minLife;
		final int maxLife;
		final float gravity;
		final float friction;
		final boolean physics;
		final boolean animated;

		Style(boolean additive, float size, int minLife, int maxLife, float gravity, float friction, boolean physics, boolean animated) {
			this.additive = additive;
			this.size = size;
			this.minLife = minLife;
			this.maxLife = maxLife;
			this.gravity = gravity;
			this.friction = friction;
			this.physics = physics;
			this.animated = animated;
		}

		float sizeCurve(float life) {
			return switch (this) {
				case DUST, WISP -> 0.6F + life * 0.9F;
				case FLAME -> 0.7F + Mth.sin(Math.min(1.0F, life * 1.4F) * Mth.PI) * 0.5F;
				case FLASH -> 0.5F + life * 1.2F;
				case RING -> 0.3F + life * 3.2F;
				case GLOW, RAINBOW, MOTE -> life < 0.15F ? life / 0.15F : 1.0F - (life - 0.15F) * 0.7F;
				default -> 1.0F - life * 0.5F;
			};
		}

		float alphaCurve(float life) {
			return switch (this) {
				case DUST -> 0.55F * (1.0F - life);
				case WISP -> 0.8F * (1.0F - life * life);
				case FLASH, RING -> (1.0F - life) * (1.0F - life);
				case LEAF, DROPLET -> life > 0.8F ? (1.0F - life) / 0.2F : 1.0F;
				default -> life > 0.6F ? (1.0F - life) / 0.4F : 1.0F;
			};
		}
	}

	/** Exposes the motion of a particle for providers that set it after construction. */
	public Vec3 motion() {
		return new Vec3(this.xd, this.yd, this.zd);
	}
}
