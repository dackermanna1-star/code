package net.abyssaldescent.client.model;

import static net.abyssaldescent.client.anim.Anim.p;
import static net.abyssaldescent.client.anim.Anim.pos;
import static net.abyssaldescent.client.anim.Anim.r;
import static net.abyssaldescent.client.anim.Anim.rot;
import static net.abyssaldescent.client.anim.Anim.s;
import static net.abyssaldescent.client.anim.Anim.scale;

import net.abyssaldescent.client.render.state.DungeonMobRenderState;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.KeyframeAnimation;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.util.Mth;

/** A floating skull with a hinged jaw, a dangling spine and a crown of soul fire. 64x32 texture. */
public class WailingSkullModel extends EntityModel<DungeonMobRenderState> {
	private final ModelPart skull;
	private final KeyframeAnimation idle;
	private final KeyframeAnimation charge;

	public WailingSkullModel(ModelPart root) {
		super(root, RenderTypes::entityCutoutNoCull);
		this.skull = root.getChild("skull");
		this.idle = IDLE.bake(root);
		this.charge = CHARGE.bake(root);
	}

	public static LayerDefinition createBodyLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		PartDefinition skull = root.addOrReplaceChild("skull", CubeListBuilder.create().texOffs(0, 0).addBox(-4.0F, -8.0F, -4.0F, 8.0F, 8.0F, 8.0F),
			PartPose.offset(0.0F, 18.0F, 0.0F));
		skull.addOrReplaceChild("jaw", CubeListBuilder.create().texOffs(32, 0).addBox(-3.0F, 0.0F, -6.0F, 6.0F, 2.0F, 6.0F),
			PartPose.offset(0.0F, -0.5F, 2.0F));
		PartDefinition flames = skull.addOrReplaceChild("flames", CubeListBuilder.create(), PartPose.offset(0.0F, -8.0F, 0.0F));
		flames.addOrReplaceChild("flame_a", CubeListBuilder.create().texOffs(32, 8).addBox(-5.0F, -8.0F, 0.0F, 10.0F, 8.0F, 0.0F),
			PartPose.rotation(0.0F, 0.785F, 0.0F));
		flames.addOrReplaceChild("flame_b", CubeListBuilder.create().texOffs(32, 8).addBox(-5.0F, -8.0F, 0.0F, 10.0F, 8.0F, 0.0F),
			PartPose.rotation(0.0F, -0.785F, 0.0F));
		PartDefinition spine1 = skull.addOrReplaceChild("spine1", CubeListBuilder.create().texOffs(0, 16).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 2.0F, 2.0F),
			PartPose.offset(0.0F, 0.0F, 2.5F));
		PartDefinition spine2 = spine1.addOrReplaceChild("spine2", CubeListBuilder.create().texOffs(8, 16).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 2.0F, 2.0F),
			PartPose.offset(0.0F, 2.0F, 0.6F));
		spine2.addOrReplaceChild("spine3", CubeListBuilder.create().texOffs(16, 16).addBox(-0.5F, 0.0F, -0.5F, 1.0F, 2.0F, 1.0F),
			PartPose.offset(0.0F, 2.0F, 0.6F));
		return LayerDefinition.create(mesh, 64, 32);
	}

	@Override
	public void setupAnim(DungeonMobRenderState state) {
		super.setupAnim(state);
		skull.yRot = state.yRot * Mth.DEG_TO_RAD;
		skull.xRot = state.xRot * Mth.DEG_TO_RAD * 0.6F;
		idle.apply((long) (state.ageInTicks * 50.0F), 1.0F);
		charge.apply(state.actionA, state.ageInTicks);
	}

	static final AnimationDefinition IDLE = AnimationDefinition.Builder.withLength(2.4F).looping()
		.addAnimation("skull", pos(p(0, 0, 0, 0), p(1.2F, 0, 1.2F, 0), p(2.4F, 0, 0, 0)))
		.addAnimation("jaw", rot(r(0, 6, 0, 0), r(0.6F, 14, 0, 0), r(1.2F, 4, 0, 0), r(1.8F, 12, 0, 0), r(2.4F, 6, 0, 0)))
		.addAnimation("spine1", rot(r(0, 15, 0, 6), r(1.2F, 30, 0, -6), r(2.4F, 15, 0, 6)))
		.addAnimation("spine2", rot(r(0, 10, 0, -8), r(1.2F, 20, 0, 8), r(2.4F, 10, 0, -8)))
		.addAnimation("spine3", rot(r(0, 5, 0, 10), r(1.2F, 15, 0, -10), r(2.4F, 5, 0, 10)))
		.addAnimation("flames", scale(s(0, 1, 1, 1), s(0.6F, 1.05, 1.15, 1.05), s(1.2F, 0.95, 0.9, 0.95), s(1.8F, 1.05, 1.1, 1.05), s(2.4F, 1, 1, 1)))
		.build();

	/** Keening before a bolt: the jaw gapes and the flames flare. */
	static final AnimationDefinition CHARGE = AnimationDefinition.Builder.withLength(0.9F)
		.addAnimation("skull", rot(r(0, 0, 0, 0), r(0.5F, -20, 0, 0), r(0.8F, 15, 0, 0), r(0.9F, 0, 0, 0)))
		.addAnimation("jaw", rot(r(0, 10, 0, 0), r(0.3F, 50, 0, 0), r(0.8F, 55, 0, 0), r(0.9F, 10, 0, 0)))
		.addAnimation("flames", scale(s(0, 1, 1, 1), s(0.6F, 1.3, 1.7, 1.3), s(0.8F, 1.4, 1.8, 1.4), s(0.9F, 1, 1, 1)))
		.build();
}
