package net.earthscapes.client.entity;

import java.util.function.Function;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;
import org.jspecify.annotations.Nullable;

/**
 * Animates any of the generic animal models by part name: walking (trot or pace) or striding on
 * two legs, head turning on the neck, grazing, swishing tails, flicking or flapping ears, a
 * swaying trunk, and the species' display (trunk raised, jaws opened, head thrown up).
 */
public class EsAnimalModel extends EntityModel<EsAnimalRenderState> {
	public enum Gait {
		/** Diagonal legs together, like most quadrupeds. */
		TROT,
		/** Both legs of a side together, like giraffes and camels. */
		PACE
	}

	private static final float DEG = Mth.DEG_TO_RAD;

	private final @Nullable ModelPart body;
	private final @Nullable ModelPart neck;
	private final @Nullable ModelPart head;
	private final @Nullable ModelPart earL;
	private final @Nullable ModelPart earR;
	private final @Nullable ModelPart jaw;
	private final @Nullable ModelPart trunk1;
	private final @Nullable ModelPart trunk2;
	private final @Nullable ModelPart trunk3;
	private final @Nullable ModelPart tail;
	private final @Nullable ModelPart tail2;
	private final @Nullable ModelPart tail3;
	private final @Nullable ModelPart wingL;
	private final @Nullable ModelPart wingR;
	private final @Nullable ModelPart legFL;
	private final @Nullable ModelPart legFR;
	private final @Nullable ModelPart legHL;
	private final @Nullable ModelPart legHR;
	private final @Nullable ModelPart legL;
	private final @Nullable ModelPart legR;
	private final @Nullable ModelPart horns;
	private final @Nullable ModelPart mane;
	private final @Nullable ModelPart tusks;
	private final float legSwing;
	private final Gait gait;
	private final float jawOpen;
	private final boolean bigEars;

	public EsAnimalModel(ModelPart root, float legSwing, Gait gait, float jawOpen) {
		super(root);
		Function<String, ModelPart> parts = root.createPartLookup();
		this.body = parts.apply("body");
		this.neck = parts.apply("neck");
		this.head = parts.apply("head");
		this.earL = parts.apply("ear_l");
		this.earR = parts.apply("ear_r");
		this.jaw = parts.apply("jaw");
		this.trunk1 = parts.apply("trunk1");
		this.trunk2 = parts.apply("trunk2");
		this.trunk3 = parts.apply("trunk3");
		this.tail = parts.apply("tail");
		this.tail2 = parts.apply("tail2");
		this.tail3 = parts.apply("tail3");
		this.wingL = parts.apply("wing_l");
		this.wingR = parts.apply("wing_r");
		this.legFL = parts.apply("leg_fl");
		this.legFR = parts.apply("leg_fr");
		this.legHL = parts.apply("leg_hl");
		this.legHR = parts.apply("leg_hr");
		this.legL = parts.apply("leg_l");
		this.legR = parts.apply("leg_r");
		this.horns = parts.apply("horns");
		this.mane = parts.apply("mane");
		this.tusks = parts.apply("tusks");
		this.legSwing = legSwing;
		this.gait = gait;
		this.jawOpen = jawOpen;
		this.bigEars = this.trunk1 != null;
	}

	@Override
	public void setupAnim(EsAnimalRenderState state) {
		super.setupAnim(state);
		float age = state.ageInTicks;
		float speed = Math.min(1.0F, state.walkAnimationSpeed);
		float phase = state.walkAnimationPos * 0.6662F;
		float swing = this.legSwing * speed;
		float action = state.actionAmount;
		float graze = state.grazeAmount;

		// legs: walking, or paddling while swimming
		if (state.isInWater && speed < 0.2F) {
			phase = age * 0.35F;
			swing = this.legSwing * 0.5F;
		}
		if (this.legFL != null && this.legFR != null && this.legHL != null && this.legHR != null) {
			this.legFL.xRot += Mth.cos(phase) * swing;
			this.legFR.xRot += Mth.cos(phase + Mth.PI) * swing;
			float hind = this.gait == Gait.PACE ? 0.0F : Mth.PI;
			this.legHL.xRot += Mth.cos(phase + hind) * swing;
			this.legHR.xRot += Mth.cos(phase + hind + Mth.PI) * swing;
		}
		if (this.legL != null && this.legR != null) {
			this.legL.xRot += Mth.cos(phase) * swing;
			this.legR.xRot += Mth.cos(phase + Mth.PI) * swing;
		}

		// head and neck follow the look direction
		float yaw = Mth.clamp(state.yRot, -60.0F, 60.0F) * DEG;
		float pitch = Mth.clamp(state.xRot, -40.0F, 40.0F) * DEG;
		if (this.neck != null && this.head != null) {
			this.neck.yRot += yaw * 0.6F;
			this.head.yRot += yaw * 0.4F;
			this.neck.xRot += pitch * 0.4F;
			this.head.xRot += pitch * 0.6F;
		} else if (this.head != null) {
			this.head.yRot += yaw;
			this.head.xRot += pitch;
		}

		// grazing: head down to the ground, chewing
		if (graze > 0.0F && this.head != null) {
			float chew = Mth.sin(age * 1.1F) * 0.06F * graze;
			if (this.neck != null) {
				this.neck.xRot += graze * 1.05F;
				this.head.xRot += graze * 0.3F + chew;
			} else if (this.trunk1 != null) {
				// elephants pluck grass with the trunk
				this.trunk1.xRot -= graze * 0.5F;
				this.trunk3.xRot += graze * 0.9F;
				this.head.xRot += graze * 0.15F;
			} else {
				this.head.xRot += graze * 0.85F + chew;
			}
		}

		// tails swish
		if (this.tail != null) {
			if (this.tail3 != null) {
				// long reptile tails sway from side to side
				float sway = Mth.sin(state.walkAnimationPos * 0.3F) * 0.3F * speed + Mth.sin(age * 0.05F) * 0.06F;
				this.tail.yRot += sway;
				this.tail2.yRot += sway * 1.3F;
				this.tail3.yRot += sway * 1.6F;
			} else {
				this.tail.zRot += Mth.sin(age * 0.09F) * 0.12F;
				this.tail.xRot += Mth.cos(phase) * 0.1F * speed;
				if (this.tail2 != null) {
					this.tail2.zRot += Mth.sin(age * 0.09F - 0.8F) * 0.14F;
				}
			}
		}

		// ears flick now and then; elephant ears fan slowly
		if (this.earL != null && this.earR != null) {
			if (this.bigEars) {
				float fan = Mth.sin(age * 0.06F) * 0.14F + action * 0.5F;
				this.earL.yRot += fan;
				this.earR.yRot -= fan;
			} else {
				float flick = Math.max(0.0F, Mth.sin(age * 0.21F) - 0.92F) * 4.0F;
				this.earL.zRot -= flick * 0.4F;
				this.earR.zRot += Math.max(0.0F, Mth.sin(age * 0.17F + 2.0F) - 0.92F) * 1.6F;
			}
		}

		// the trunk sways, and is raised high to trumpet
		if (this.trunk1 != null) {
			this.trunk1.xRot += Mth.sin(age * 0.045F) * 0.05F - action * 1.5F;
			this.trunk1.zRot += Mth.sin(age * 0.03F) * 0.05F;
			this.trunk2.xRot += Mth.sin(age * 0.045F + 0.6F) * 0.07F - action * 0.8F;
			this.trunk3.xRot += Mth.sin(age * 0.045F + 1.2F) * 0.1F - action * 0.7F;
			if (this.head != null) {
				this.head.xRot -= action * 0.3F;
			}
		}

		// jaws gape (hippo yawn, crocodile gape) or the head is thrown up (roar, alarm call)
		if (this.jaw != null) {
			this.jaw.xRot += action * this.jawOpen;
			if (this.head != null) {
				this.head.xRot -= action * this.jawOpen * 0.35F;
			}
		} else if (this.head != null && this.trunk1 == null) {
			this.head.xRot -= action * 0.45F;
		}

		// running birds hold their wings out
		if (this.wingL != null && this.wingR != null) {
			float out = speed * 0.35F + action * 0.8F;
			this.wingL.zRot -= out;
			this.wingR.zRot += out;
		}

		if (this.body != null && this.legL != null) {
			this.body.zRot += Mth.cos(phase) * 0.04F * speed;
		}

		// the young have no horns, tusks or mane yet, and bigger heads
		if (this.mane != null) {
			this.mane.visible = !state.isBaby && !state.hideMane;
		}
		if (this.horns != null) {
			this.horns.visible = !state.isBaby;
		}
		if (this.tusks != null) {
			this.tusks.visible = !state.isBaby;
		}
		if (state.isBaby && this.head != null) {
			this.head.xScale = this.head.yScale = this.head.zScale = 1.35F;
		}
	}
}
