package dev.portalgun.client.creature;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.util.Mth;

/**
 * One generic model for every spec creature: baked from {@link CreatureGeometry} and animated procedurally from the
 * per-part hints (walk cycles from limb swing, wing flaps, tentacle waves, slithering, bobbing, squish, head look,
 * attack swings, hops).
 */
public class CreatureModel extends EntityModel<CreatureRenderState> {
	private final List<Animated> animated = new ArrayList<>();
	private final boolean airborne;
	private final boolean swimmer;
	private final boolean hopper;

	private record Animated(ModelPart part, CreatureGeometry.Anim[] anims, String name) {
	}

	public CreatureModel(ModelPart root, CreatureGeometry geo, String movement) {
		super(root, geo.translucent ? RenderTypes::entityTranslucent : RenderTypes::entityCutoutNoCull);
		for (CreatureGeometry.Part p : geo.parts) {
			this.collect(root.getChild(p.name), p);
		}
		this.airborne = movement.equals("flying") || movement.equals("floating");
		this.swimmer = movement.equals("swimming");
		this.hopper = movement.equals("hopping") || geo.archetype.equals("hopper");
	}

	private void collect(ModelPart part, CreatureGeometry.Part p) {
		if (p.anims != null && !p.anims.isEmpty()) {
			this.animated.add(new Animated(part, p.anims.toArray(new CreatureGeometry.Anim[0]), p.name));
		}
		for (CreatureGeometry.Part ch : p.children) {
			this.collect(part.getChild(ch.name), ch);
		}
	}

	@Override
	public void setupAnim(CreatureRenderState s) {
		super.setupAnim(s);
		float t = s.ageInTicks;
		float wp = s.walkAnimationPos;
		float ws = Math.min(1.0F, s.walkAnimationSpeed);
		float headYaw = s.yRot * Mth.DEG_TO_RAD;
		float headPitch = s.xRot * Mth.DEG_TO_RAD;
		float swing = s.attackAnim > 0 ? Mth.sin(s.attackAnim * Mth.PI) : 0.0F;
		boolean inAir = !s.onGround && !s.isInWater;
		for (Animated a : this.animated) {
			ModelPart part = a.part;
			for (CreatureGeometry.Anim h : a.anims) {
				float v = 0.0F;
				switch (h.kind) {
					case "leg" -> {
						if (this.airborne && inAir) {
							v = Mth.sin(t * 0.1F + h.phase) * 0.08F * Math.abs(h.amp) + 0.25F * Math.signum(h.amp);
						} else {
							v = Mth.cos(wp * 0.6662F * h.speed + h.phase) * h.amp * ws;
						}
					}
					case "arm" -> {
						v = Mth.cos(wp * 0.6662F + h.phase) * h.amp * ws * 0.8F + Mth.sin(t * 0.067F + h.phase) * 0.05F;
						if ("x".equals(h.axis)) {
							v -= swing * (h.attack > 0 ? h.attack : 1.4F);
							if (s.aggressive && h.attack <= 0 && h.amp > 0.5F) {
								v -= 0.25F;
							}
						}
					}
					case "wing" -> {
						float rate = h.speed * (s.onGround && !this.airborne ? 0.0F : 1.0F);
						v = (rate == 0.0F ? 0.15F : Mth.sin(t * rate + h.phase)) * h.amp * (1.0F + ws * 0.3F);
					}
					case "tentacle", "sway" -> v = Mth.sin(t * h.speed + h.phase) * h.amp * (1.0F + ws * 0.8F);
					case "tail" -> v = Mth.sin(t * h.speed + h.phase) * h.amp + Mth.cos(wp * 0.6662F + h.phase) * 0.3F * ws;
					case "segment" -> v = Mth.sin(t * h.speed + wp * 0.45F + h.phase) * h.amp * (0.45F + 0.9F * ws);
					case "swim" -> {
						if (this.swimmer && !s.isInWater) {
							part.zRot += 1.5707964F;
							part.y -= 1.0F;
							v = Mth.sin(t * 0.9F) * 0.35F;
						} else {
							v = Mth.sin(t * h.speed * (1.0F + ws * 2.0F) + h.phase) * h.amp;
						}
					}
					case "bob" -> {
						part.y += Mth.sin(t * h.speed + h.phase) * h.amp;
						continue;
					}
					case "spin" -> v = t * h.speed * h.amp;
					case "jaw" -> {
						float open = Math.max(swing, s.aggressive ? 0.45F + 0.3F * Mth.sin(t * 0.35F) : 0.15F + 0.15F * Mth.sin(t * h.speed + h.phase));
						v = open * h.amp + h.rest;
					}
					case "look" -> {
						part.yRot += headYaw * h.amp;
						part.xRot += headPitch * h.amp + (s.charging ? 0.35F : 0.0F);
						continue;
					}
					case "squish" -> {
						float k = 1.0F + Mth.sin(t * h.speed + h.phase) * h.amp * 0.5F;
						if (this.hopper) {
							k += inAir ? 0.12F : -0.04F * ws;
						}
						k += s.swell * 0.25F;
						float side = 1.0F / Mth.sqrt(Math.max(0.2F, k));
						if ("z".equals(h.axis)) {
							part.zScale *= k;
							part.xScale *= side;
						} else {
							part.yScale *= k;
							part.xScale *= side;
							part.zScale *= side;
						}
						continue;
					}
					case "hop_body" -> v = inAir ? Mth.clamp(-s.verticalSpeed * 1.5F, -0.5F, 0.5F) * h.amp : 0.0F;
					case "hop_leg" -> v = inAir ? 0.9F * h.amp : -ws * 0.2F;
					case "hop_arm" -> v = inAir ? -0.6F * h.amp : Mth.cos(wp * 0.6662F) * 0.3F * ws;
					default -> {
					}
				}
				switch (h.axis) {
					case "y" -> part.yRot += v;
					case "z" -> part.zRot += v;
					default -> part.xRot += v;
				}
			}
		}
	}
}
