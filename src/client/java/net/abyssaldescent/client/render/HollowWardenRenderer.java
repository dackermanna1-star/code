package net.abyssaldescent.client.render;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.client.model.HollowWardenModel;
import net.abyssaldescent.client.render.state.HollowWardenRenderState;
import net.abyssaldescent.entity.boss.HollowWardenEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.layers.LivingEntityEmissiveLayer;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

public class HollowWardenRenderer extends MobRenderer<HollowWardenEntity, HollowWardenRenderState, HollowWardenModel> {
	private static final Identifier TEXTURE = AbyssalDescent.id("textures/entity/hollow_warden.png");
	private static final Identifier GLOW = AbyssalDescent.id("textures/entity/hollow_warden_glow.png");

	public HollowWardenRenderer(EntityRendererProvider.Context context) {
		super(context, new HollowWardenModel(context.bakeLayer(ModModelLayers.HOLLOW_WARDEN)), 1.1F);
		addLayer(new LivingEntityEmissiveLayer<>(this, s -> GLOW, (s, t) -> {
			if (s.dormant) {
				return 0.35F + 0.15F * Mth.sin(t * 0.05F);
			}
			float speed = s.phase >= 3 ? 0.45F : 0.12F;
			float base = s.phase >= 3 ? 0.85F : 0.7F;
			return Math.min(1.0F, base + 0.3F * Mth.sin(t * speed));
		}, getModel(), RenderTypes::entityTranslucentEmissive, false));
	}

	@Override
	public Identifier getTextureLocation(HollowWardenRenderState state) {
		return TEXTURE;
	}

	@Override
	public HollowWardenRenderState createRenderState() {
		return new HollowWardenRenderState();
	}

	@Override
	public void extractRenderState(HollowWardenEntity entity, HollowWardenRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.seatedAnimation.copyFrom(entity.seatedAnimation);
		state.awakenAnimation.copyFrom(entity.awakenAnimation);
		state.cleaveAnimation.copyFrom(entity.cleaveAnimation);
		state.cleaveBackAnimation.copyFrom(entity.cleaveBackAnimation);
		state.slamAnimation.copyFrom(entity.slamAnimation);
		state.eruptAnimation.copyFrom(entity.eruptAnimation);
		state.chargeWindupAnimation.copyFrom(entity.chargeWindupAnimation);
		state.chargingAnimation.copyFrom(entity.chargingAnimation);
		state.stunnedAnimation.copyFrom(entity.stunnedAnimation);
		state.volleyAnimation.copyFrom(entity.volleyAnimation);
		state.roarAnimation.copyFrom(entity.roarAnimation);
		state.deathAnimation.copyFrom(entity.deathAnimation);
		state.busy = entity.action() != 0;
		state.phase = entity.phase();
		state.dormant = entity.dormant();
		// The boss's death is a long cinematic: never apply the vanilla tip-over.
		state.deathTime = 0.0F;
	}
}
