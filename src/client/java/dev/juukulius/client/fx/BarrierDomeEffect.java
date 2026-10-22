package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.character.JuliusAppearance;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusTextures;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * Al Clauzeria's protective variant: a dome of six-element rainbow light around Julius. Lives as long as the server
 * reports the barrier active, then dissolves.
 */
public final class BarrierDomeEffect extends WorldEffect {
	private static final float RADIUS = 1.7F;
	private final Anchor anchor;
	private int fadeOut = -1;

	public BarrierDomeEffect(Anchor anchor) {
		super(400);
		this.anchor = anchor;
	}

	@Override
	public boolean tick(ClientLevel level) {
		this.age++;
		Entity entity = this.anchor.entity();
		boolean active = entity instanceof Player player && JuliusAttachments.appearance(player).barrierActive(level.getGameTime());
		if (!active && this.fadeOut < 0 && this.age > 4) {
			this.fadeOut = 8;
		}

		if (this.fadeOut > 0) {
			this.fadeOut--;
		}

		return this.fadeOut != 0 && this.age < this.lifetime;
	}

	@Override
	public void render(FxContext context) {
		float pt = context.partialTick;
		float appear = Mth.clamp((this.age + pt) / 6.0F, 0.0F, 1.0F);
		float alpha = appear * (this.fadeOut >= 0 ? Math.max(0.0F, (this.fadeOut - pt) / 8.0F) : 1.0F);
		if (alpha <= 0.01F) {
			return;
		}

		Vec3 world = this.anchor.position(pt);
		Vector3f base = context.rel(world);
		float time = (this.age + pt) / 20.0F;
		float pulse = 0.85F + 0.15F * Mth.sin(time * 6.0F);
		VertexConsumer consumer = context.glow(JuliusTextures.DOME);
		int stacks = 8;
		float radius = RADIUS * (0.6F + 0.4F * easeOut(appear));
		for (int i = 0; i < stacks; i++) {
			float a0 = Mth.HALF_PI * i / stacks;
			float a1 = Mth.HALF_PI * (i + 1) / stacks;
			float r0 = Mth.cos(a0) * radius;
			float r1 = Mth.cos(a1) * radius;
			float y0 = Mth.sin(a0) * radius * 1.25F;
			float y1 = Mth.sin(a1) * radius * 1.25F;
			int c0 = FxDraw.rainbow(i / (float) stacks + time * 0.15F);
			int c1 = FxDraw.rainbow((i + 1) / (float) stacks + time * 0.15F);
			Vector3f ringBase = new Vector3f(base).add(0.0F, y0, 0.0F);
			FxDraw.band(consumer, context.matrix, ringBase, r0, r1, y1 - y0, 28, time * 0.25F, 3.0F,
				FxDraw.argb(alpha * 0.32F * pulse, c0), FxDraw.argb(alpha * 0.32F * pulse, c1));
		}
	}

	private static float easeOut(float t) {
		return 1.0F - (1.0F - t) * (1.0F - t);
	}
}
