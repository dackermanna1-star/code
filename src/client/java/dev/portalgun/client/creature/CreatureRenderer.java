package dev.portalgun.client.creature;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.portalgun.PortalGunMod;
import dev.portalgun.content.ContentSpec;
import dev.portalgun.creature.SpecCreature;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.EyesLayer;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

/** Renderer for every spec creature: generated model + texture, glow overlay, shield swirl, swell/burrow effects. */
public class CreatureRenderer extends MobRenderer<SpecCreature, CreatureRenderState, CreatureModel> {
	private static final Identifier SHIELD_TEXTURE = Identifier.withDefaultNamespace("textures/entity/creeper/creeper_armor.png");
	private final ContentSpec.CreatureSpec spec;
	private final Identifier texture;
	private final float baseScale;

	public CreatureRenderer(EntityRendererProvider.Context context, ContentSpec.CreatureSpec spec, ModelLayerLocation layer, CreatureGeometry geo) {
		super(context, new CreatureModel(context.bakeLayer(layer), geo, spec.movement), spec.shadow);
		this.spec = spec;
		this.texture = PortalGunMod.id("textures/entity/creature/" + spec.id + ".png");
		this.baseScale = geo.scale > 0 ? geo.scale : spec.scale;
		if (geo.glow || spec.hasGlow) {
			RenderType eyes = RenderTypes.eyes(PortalGunMod.id("textures/entity/creature/" + spec.id + "_glow.png"));
			this.addLayer(new EyesLayer<>(this) {
				@Override
				public RenderType renderType() {
					return eyes;
				}
			});
		}
		if (spec.abilities.contains("shield")) {
			this.addLayer(new ShieldLayer(this));
		}
	}

	@Override
	public CreatureRenderState createRenderState() {
		return new CreatureRenderState();
	}

	@Override
	public void extractRenderState(SpecCreature entity, CreatureRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.attackAnim = entity.getAttackAnim(partialTick);
		state.onGround = entity.onGround();
		state.aggressive = entity.isAggressive();
		state.swell = entity.getSwell(partialTick);
		int b = entity.getBurrowTicks();
		if (b > 0) {
			int half = SpecCreature.BURROW_TIME / 2;
			float k = b > half ? (SpecCreature.BURROW_TIME - b + partialTick) / 10.0F : (b - partialTick) / 10.0F;
			state.burrow = Mth.clamp(k, 0.0F, 1.0F);
		} else {
			state.burrow = 0.0F;
		}
		state.shield = entity.flag(SpecCreature.FLAG_SHIELD);
		state.charging = entity.flag(SpecCreature.FLAG_CHARGE);
		state.verticalSpeed = (float) entity.getDeltaMovement().y;
		state.speedXZ = (float) entity.getDeltaMovement().horizontalDistance();
	}

	@Override
	protected void scale(CreatureRenderState state, PoseStack poseStack) {
		float s = this.baseScale;
		if (state.swell > 0) {
			float f = 1.0F + Mth.sin(state.swell * 100.0F) * state.swell * 0.01F;
			float g = Mth.clamp(state.swell, 0.0F, 1.0F);
			g *= g;
			g *= g;
			float xz = (1.0F + g * 0.4F) * f;
			float y = (1.0F + g * 0.1F) / f;
			poseStack.scale(s * xz, s * y, s * xz);
		} else {
			poseStack.scale(s, s, s);
		}
		if (state.burrow > 0) {
			poseStack.translate(0.0F, state.burrow * (state.boundingBoxHeight / Math.max(0.2F, s * state.scale)) * 1.05F, 0.0F);
		}
	}

	@Override
	protected float getWhiteOverlayProgress(CreatureRenderState state) {
		float f = state.swell;
		return (int) (f * 10.0F) % 2 == 0 ? 0.0F : Mth.clamp(f, 0.5F, 1.0F);
	}

	@Override
	protected int getBlockLightLevel(SpecCreature entity, BlockPos pos) {
		return this.spec.emissive ? 15 : super.getBlockLightLevel(entity, pos);
	}

	@Override
	protected boolean isShaking(CreatureRenderState state) {
		return super.isShaking(state) || state.charging && state.speedXZ < 0.05F;
	}

	@Override
	public Identifier getTextureLocation(CreatureRenderState state) {
		return this.texture;
	}

	/** Swirling energy bubble while a "shield" creature's shield is up. */
	private static class ShieldLayer extends RenderLayer<CreatureRenderState, CreatureModel> {
		ShieldLayer(RenderLayerParent<CreatureRenderState, CreatureModel> parent) {
			super(parent);
		}

		@Override
		public void submit(PoseStack poseStack, SubmitNodeCollector collector, int light, CreatureRenderState state, float yRot, float xRot) {
			if (!state.shield) {
				return;
			}
			float t = state.ageInTicks;
			poseStack.pushPose();
			poseStack.translate(0.0F, 1.5F, 0.0F);
			poseStack.scale(1.12F, 1.06F, 1.12F);
			poseStack.translate(0.0F, -1.5F, 0.0F);
			collector.order(1).submitModel(this.getParentModel(), state, poseStack,
				RenderTypes.energySwirl(SHIELD_TEXTURE, t * 0.01F % 1.0F, t * 0.01F % 1.0F), light, OverlayTexture.NO_OVERLAY, 0xFF6AB8FF, null,
				state.outlineColor, null);
			poseStack.popPose();
		}
	}
}
