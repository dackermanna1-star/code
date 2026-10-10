package net.earthscapes.client.entity;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.earthscapes.Earthscapes;
import net.earthscapes.entity.EsAnimal;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;
import org.jspecify.annotations.Nullable;

public class EsAnimalRenderer extends MobRenderer<EsAnimal, EsAnimalRenderState, EsAnimalModel> {
	/**
	 * How an animal looks: its model, gait and leg swing, how wide its jaws open, render scale and
	 * shadow, a texture per variant (and optionally for the young), which variants have no mane,
	 * and whether the display rears the animal up on its hind legs (z of the hind feet in blocks).
	 */
	public record Look(ModelLayerLocation layer, EsAnimalModel.Gait gait, float legSwing, float jawOpen, float scale, float shadow, String[] textures,
		@Nullable String babyTexture, int manelessFrom, float rearUp) {
		public static Look of(ModelLayerLocation layer, float legSwing, float shadow, String... textures) {
			return new Look(layer, EsAnimalModel.Gait.TROT, legSwing, 0.0F, 1.0F, shadow, textures, null, Integer.MAX_VALUE, 0.0F);
		}

		public Look pace() {
			return new Look(this.layer, EsAnimalModel.Gait.PACE, this.legSwing, this.jawOpen, this.scale, this.shadow, this.textures, this.babyTexture,
				this.manelessFrom, this.rearUp);
		}

		public Look jaw(float open) {
			return new Look(this.layer, this.gait, this.legSwing, open, this.scale, this.shadow, this.textures, this.babyTexture, this.manelessFrom, this.rearUp);
		}

		public Look scale(float scale) {
			return new Look(this.layer, this.gait, this.legSwing, this.jawOpen, scale, this.shadow, this.textures, this.babyTexture, this.manelessFrom, this.rearUp);
		}

		public Look baby(String texture) {
			return new Look(this.layer, this.gait, this.legSwing, this.jawOpen, this.scale, this.shadow, this.textures, texture, this.manelessFrom, this.rearUp);
		}

		/** Variants from this index on (e.g. lionesses) have no mane. */
		public Look manelessFrom(int variant) {
			return new Look(this.layer, this.gait, this.legSwing, this.jawOpen, this.scale, this.shadow, this.textures, this.babyTexture, variant, this.rearUp);
		}

		public Look rearUp(float hindFeetZ) {
			return new Look(this.layer, this.gait, this.legSwing, this.jawOpen, this.scale, this.shadow, this.textures, this.babyTexture, this.manelessFrom,
				hindFeetZ);
		}
	}

	private final Look look;
	private final Identifier[] textures;
	private final @Nullable Identifier babyTexture;

	public EsAnimalRenderer(EntityRendererProvider.Context context, Look look) {
		super(context, new EsAnimalModel(context.bakeLayer(look.layer()), look.legSwing(), look.gait(), look.jawOpen()), look.shadow());
		this.look = look;
		this.textures = new Identifier[look.textures().length];
		for (int i = 0; i < this.textures.length; i++) {
			this.textures[i] = texture(look.textures()[i]);
		}
		this.babyTexture = look.babyTexture() == null ? null : texture(look.babyTexture());
	}

	private static Identifier texture(String name) {
		return Earthscapes.id("textures/entity/" + name + ".png");
	}

	@Override
	public EsAnimalRenderState createRenderState() {
		return new EsAnimalRenderState();
	}

	@Override
	public void extractRenderState(EsAnimal animal, EsAnimalRenderState state, float partialTick) {
		super.extractRenderState(animal, state, partialTick);
		state.variant = animal.getVariant();
		state.grazeAmount = animal.getGrazeAmount(partialTick);
		state.actionAmount = animal.getActionAmount(partialTick);
		state.hideMane = state.variant >= this.look.manelessFrom();
	}

	@Override
	public Identifier getTextureLocation(EsAnimalRenderState state) {
		if (state.isBaby && this.babyTexture != null) {
			return this.babyTexture;
		}
		return this.textures[Math.floorMod(state.variant, this.textures.length)];
	}

	@Override
	protected void scale(EsAnimalRenderState state, PoseStack poseStack) {
		float s = this.look.scale() * state.ageScale;
		poseStack.scale(s, s, s);
	}

	@Override
	protected void setupRotations(EsAnimalRenderState state, PoseStack poseStack, float bodyRot, float scale) {
		super.setupRotations(state, poseStack, bodyRot, scale);
		if (this.look.rearUp() != 0.0F && state.actionAmount > 0.0F) {
			// stand up on the hind legs (marmot on the lookout)
			float z = this.look.rearUp() * state.ageScale;
			poseStack.translate(0.0F, 0.0F, z);
			poseStack.mulPose(Axis.XP.rotationDegrees(70.0F * state.actionAmount));
			poseStack.translate(0.0F, 0.0F, -z);
		}
	}
}
