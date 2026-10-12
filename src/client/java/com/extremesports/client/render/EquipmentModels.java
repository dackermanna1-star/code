package com.extremesports.client.render;

import com.extremesports.client.render.EquipmentModel.Group;
import com.extremesports.client.render.EquipmentModel.Spec;
import com.extremesports.sport.EquipmentKind;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.PartDefinition;

/**
 * Geometry for every piece of equipment, in pixels with +y up and +z toward the front.
 * Colour names refer to customization colour slots; "#RRGGBB" values are fixed colours.
 */
public final class EquipmentModels {
	public static final String STEEL = "#B8BCC2";
	public static final String DARK = "#2A2B2E";
	public static final String BLACK = "#18181A";

	/** Board geometry constants shared with the renderer (graphic/sticker placement). */
	public record BoardDims(float halfWidth, float halfLength, float deckBottom, float deckTop, float kick) {
	}

	private EquipmentModels() {
	}

	public static BoardDims boardDims(EquipmentKind kind) {
		return switch (kind) {
			case CRUISER -> new BoardDims(3.0F, 5.5F, 2.4F, 3.0F, 2.6F);
			case LONGBOARD -> new BoardDims(3.0F, 10.0F, 2.0F, 2.6F, 0.0F);
			default -> new BoardDims(2.5F, 6.5F, 2.2F, 2.8F, 2.8F);
		};
	}

	// ------------------------------------------------------------------ skateboards

	public static Spec skateboard(EquipmentKind kind) {
		Spec spec = new Spec();
		PartDefinition root = spec.root();
		BoardDims d = boardDims(kind);
		float w = d.halfWidth() * 2.0F;
		float thick = d.deckTop() - d.deckBottom();
		float midY = (d.deckBottom() + d.deckTop()) / 2.0F;
		// Deck and grip
		spec.box(root, "deck", Material.WOOD, "deck", Group.BODY, -d.halfWidth(), d.deckBottom(), -d.halfLength(), w, thick, d.halfLength() * 2.0F);
		spec.box(root, "grip", Material.GRIP, "grip", Group.BODY, -d.halfWidth() + 0.05F, d.deckTop(), -d.halfLength(), w - 0.1F, 0.06F, d.halfLength() * 2.0F);
		if (d.kick() > 0.0F) {
			boolean nose = kind != EquipmentKind.CRUISER;
			float kickAngle = 0.42F;
			// Tail kick
			spec.box(root, "tail", Material.WOOD, "deck", Group.BODY, "",
				-d.halfWidth(), -thick / 2.0F, -d.kick(), w, thick, d.kick(),
				PartPose.offsetAndRotation(0.0F, midY, -d.halfLength(), kickAngle, 0.0F, 0.0F));
			spec.box(root, "tail_grip", Material.GRIP, "grip", Group.BODY, "",
				-d.halfWidth() + 0.05F, thick / 2.0F, -d.kick(), w - 0.1F, 0.06F, d.kick(),
				PartPose.offsetAndRotation(0.0F, midY, -d.halfLength(), kickAngle, 0.0F, 0.0F));
			if (nose) {
				spec.box(root, "nose", Material.WOOD, "deck", Group.BODY, "",
					-d.halfWidth(), -thick / 2.0F, 0.0F, w, thick, d.kick(),
					PartPose.offsetAndRotation(0.0F, midY, d.halfLength(), -kickAngle, 0.0F, 0.0F));
				spec.box(root, "nose_grip", Material.GRIP, "grip", Group.BODY, "",
					-d.halfWidth() + 0.05F, thick / 2.0F, 0.0F, w - 0.1F, 0.06F, d.kick(),
					PartPose.offsetAndRotation(0.0F, midY, d.halfLength(), -kickAngle, 0.0F, 0.0F));
			}
		} else {
			// Longboard: rounded tips
			spec.box(root, "tip_front", Material.WOOD, "deck", Group.BODY, -d.halfWidth() + 0.8F, d.deckBottom(), d.halfLength(), w - 1.6F, thick, 1.5F);
			spec.box(root, "tip_back", Material.WOOD, "deck", Group.BODY, -d.halfWidth() + 0.8F, d.deckBottom(), -d.halfLength() - 1.5F, w - 1.6F, thick, 1.5F);
		}
		// Trucks and wheels
		float wheelRadius = switch (kind) {
			case CRUISER -> 1.0F;
			case LONGBOARD -> 1.15F;
			default -> 0.8F;
		};
		float wheelWidth = kind == EquipmentKind.STREET_BOARD ? 1.2F : 1.5F;
		float axleZ = kind == EquipmentKind.LONGBOARD ? d.halfLength() - 2.2F : d.halfLength() - 1.3F;
		float hangerHalf = d.halfWidth() + 0.1F;
		float wheelX = hangerHalf + wheelWidth / 2.0F - 0.2F;
		for (int i = 0; i < 2; i++) {
			float z = i == 0 ? axleZ : -axleZ;
			String n = i == 0 ? "front" : "back";
			spec.box(root, n + "_base", Material.METAL, "trucks", Group.BODY, -0.9F, wheelRadius + 0.6F, z - 0.9F, 1.8F, d.deckBottom() - wheelRadius - 0.6F, 1.8F);
			spec.box(root, n + "_hanger", Material.METAL, "trucks", Group.BODY, -hangerHalf, wheelRadius - 0.35F, z - 0.45F, hangerHalf * 2.0F, 0.95F, 0.9F);
			for (int side = 0; side < 2; side++) {
				float x = side == 0 ? wheelX : -wheelX;
				PartDefinition wheel = spec.group(root, n + "_wheel" + side, PartPose.offset(x, wheelRadius, z), "wheel");
				spec.box(wheel, n + "_wheel_a" + side, Material.RUBBER, "wheels", Group.BODY,
					-wheelWidth / 2.0F, -wheelRadius, -wheelRadius * 0.62F, wheelWidth, wheelRadius * 2.0F, wheelRadius * 1.24F);
				spec.box(wheel, n + "_wheel_b" + side, Material.RUBBER, "wheels", Group.BODY,
					-wheelWidth / 2.0F, -wheelRadius * 0.62F, -wheelRadius, wheelWidth, wheelRadius * 1.24F, wheelRadius * 2.0F);
			}
		}
		return spec;
	}

	// ------------------------------------------------------------------ BMX

	/** Steering axis pivot and tilt (radians) shared with the renderer. */
	public static final float BMX_PIVOT_Y = 9.6F;
	public static final float BMX_PIVOT_Z = 6.8F;
	public static final float BMX_HEAD_ANGLE = 0.227F;

	public static Spec bmx() {
		Spec spec = new Spec();
		PartDefinition root = spec.root();
		float axleY = 4.05F;
		float rearZ = -6.5F;
		float frontZ = 8.5F;
		float bbY = 4.6F;
		// Rear wheel
		PartDefinition rear = spec.group(root, "rear_wheel", PartPose.offset(0.0F, axleY, rearZ), "wheel");
		wheel(spec, rear, "rear", Group.FRAME, 3.45F);
		// Frame
		Group f = Group.FRAME;
		spec.box(root, "bb_shell", Material.METAL, "frame", f, -1.1F, bbY - 0.6F, -0.6F, 2.2F, 1.2F, 1.2F);
		spec.tube(root, "down_tube", Material.METAL, "frame", f, "", 0.0F, bbY, 0.0F, 0.0F, 8.6F, 7.0F, 1.1F);
		spec.tube(root, "top_tube", Material.METAL, "frame", f, "", 0.0F, 9.7F, -1.4F, 0.0F, 10.4F, 6.8F, 1.0F);
		spec.tube(root, "seat_tube", Material.METAL, "frame", f, "", 0.0F, bbY, -0.1F, 0.0F, 10.5F, -1.6F, 1.0F);
		spec.tube(root, "chain_stay_l", Material.METAL, "frame", f, "", 0.9F, bbY - 0.2F, -0.3F, 0.9F, axleY, rearZ, 0.7F);
		spec.tube(root, "chain_stay_r", Material.METAL, "frame", f, "", -0.9F, bbY - 0.2F, -0.3F, -0.9F, axleY, rearZ, 0.7F);
		spec.tube(root, "seat_stay_l", Material.METAL, "frame", f, "", 0.8F, 9.6F, -1.4F, 0.9F, axleY + 0.3F, rearZ, 0.6F);
		spec.tube(root, "seat_stay_r", Material.METAL, "frame", f, "", -0.8F, 9.6F, -1.4F, -0.9F, axleY + 0.3F, rearZ, 0.6F);
		spec.tube(root, "head_tube", Material.METAL, "frame", f, "", 0.0F, 8.2F, 7.15F, 0.0F, 11.0F, 6.5F, 1.5F);
		spec.tube(root, "seat_post", Material.CHROME, STEEL, f, "", 0.0F, 10.3F, -1.6F, 0.0F, 11.5F, -1.9F, 0.7F);
		spec.box(root, "seat", Material.FABRIC, "seat", f, "", -0.85F, -0.4F, -2.4F, 1.7F, 0.8F, 4.4F,
			PartPose.offsetAndRotation(0.0F, 11.8F, -1.8F, 0.08F, 0.0F, 0.0F));
		spec.box(root, "sprocket_a", Material.CHROME, STEEL, f, "", -0.15F, -1.6F, -1.6F, 0.3F, 3.2F, 3.2F, PartPose.offset(1.25F, bbY, 0.0F));
		spec.box(root, "sprocket_b", Material.CHROME, STEEL, f, "", -0.15F, -1.6F, -1.6F, 0.3F, 3.2F, 3.2F,
			PartPose.offsetAndRotation(1.25F, bbY, 0.0F, (float) Math.PI / 4.0F, 0.0F, 0.0F));
		spec.tube(root, "chain_top", Material.METAL, DARK, f, "", 1.25F, bbY + 1.5F, 0.0F, 1.25F, axleY + 0.6F, rearZ, 0.25F);
		spec.tube(root, "chain_bottom", Material.METAL, DARK, f, "", 1.25F, bbY - 1.5F, 0.0F, 1.25F, axleY - 0.6F, rearZ, 0.25F);
		// Rear pegs
		spec.box(root, "peg_rear_l", Material.CHROME, STEEL, f, "pegs", 1.3F, axleY - 0.45F, rearZ - 0.45F, 1.6F, 0.9F, 0.9F);
		spec.box(root, "peg_rear_r", Material.CHROME, STEEL, f, "pegs", -2.9F, axleY - 0.45F, rearZ - 0.45F, 1.6F, 0.9F, 0.9F);
		// Cranks
		PartDefinition crank = spec.group(root, "crank", PartPose.offset(0.0F, bbY, 0.0F), "crank");
		spec.box(crank, "crank_r", Material.CHROME, STEEL, f, -1.85F, 0.0F, -0.3F, 0.55F, 2.7F, 0.6F);
		spec.box(crank, "pedal_r", Material.PLASTIC, BLACK, f, -3.4F, 2.45F, -0.55F, 1.6F, 0.5F, 1.1F);
		spec.box(crank, "crank_l", Material.CHROME, STEEL, f, 1.3F, -2.7F, -0.3F, 0.55F, 2.7F, 0.6F);
		spec.box(crank, "pedal_l", Material.PLASTIC, BLACK, f, 1.8F, -2.95F, -0.55F, 1.6F, 0.5F, 1.1F);
		// Front: fork, stem, bars, front wheel (drawn with steering rotation)
		Group fr = Group.FRONT;
		spec.tube(root, "fork_l", Material.METAL, "frame", fr, "", 0.95F, 8.4F, 7.2F, 0.95F, axleY, frontZ, 0.7F);
		spec.tube(root, "fork_r", Material.METAL, "frame", fr, "", -0.95F, 8.4F, 7.2F, -0.95F, axleY, frontZ, 0.7F);
		spec.box(root, "fork_crown", Material.METAL, "frame", fr, -1.3F, 8.1F, 6.7F, 2.6F, 0.6F, 1.0F);
		spec.tube(root, "stem", Material.METAL, "bars", fr, "", 0.0F, 11.0F, 6.5F, 0.0F, 11.6F, 7.4F, 1.1F);
		spec.tube(root, "riser_l", Material.METAL, "bars", fr, "", 0.8F, 11.4F, 7.2F, 2.6F, 14.2F, 6.0F, 0.6F);
		spec.tube(root, "riser_r", Material.METAL, "bars", fr, "", -0.8F, 11.4F, 7.2F, -2.6F, 14.2F, 6.0F, 0.6F);
		spec.tube(root, "crossbar", Material.METAL, "bars", fr, "", -1.8F, 12.9F, 6.6F, 1.8F, 12.9F, 6.6F, 0.5F);
		spec.tube(root, "bar_top", Material.METAL, "bars", fr, "", -3.2F, 14.2F, 6.0F, 3.2F, 14.2F, 6.0F, 0.6F);
		spec.tube(root, "grip_l", Material.RUBBER, BLACK, fr, "", 3.0F, 14.2F, 6.0F, 4.9F, 14.2F, 6.0F, 0.85F);
		spec.tube(root, "grip_r", Material.RUBBER, BLACK, fr, "", -3.0F, 14.2F, 6.0F, -4.9F, 14.2F, 6.0F, 0.85F);
		PartDefinition front = spec.group(root, "front_wheel", PartPose.offset(0.0F, axleY, frontZ), "wheel");
		wheel(spec, front, "front", fr, 3.45F);
		spec.box(root, "peg_front_l", Material.CHROME, STEEL, fr, "pegs", 1.3F, axleY - 0.45F, frontZ - 0.45F, 1.6F, 0.9F, 0.9F);
		spec.box(root, "peg_front_r", Material.CHROME, STEEL, fr, "pegs", -2.9F, axleY - 0.45F, frontZ - 0.45F, 1.6F, 0.9F, 0.9F);
		return spec;
	}

	private static void wheel(Spec spec, PartDefinition wheel, String prefix, Group group, float radius) {
		spec.ring(wheel, prefix + "_tire", Material.RUBBER, "tires", group, "", radius, 12, 1.25F, 1.1F);
		spec.ring(wheel, prefix + "_rim", Material.METAL, "rims", group, "", radius - 0.9F, 12, 0.7F, 0.5F);
		for (int i = 0; i < 4; i++) {
			float angle = (float) (Math.PI / 4.0 * i);
			spec.box(wheel, prefix + "_spoke" + i, Material.CHROME, STEEL, group, "", -0.08F, -(radius - 1.0F), -0.08F, 0.16F, 2.0F * (radius - 1.0F), 0.16F,
				PartPose.rotation(angle, 0.0F, 0.0F));
		}
		spec.box(wheel, prefix + "_hub", Material.METAL, DARK, group, -0.9F, -0.45F, -0.45F, 1.8F, 0.9F, 0.9F);
	}

	// ------------------------------------------------------------------ scooter

	public static final float SCOOTER_STEM_Z = 7.4F;

	public static Spec scooter() {
		Spec spec = new Spec();
		PartDefinition root = spec.root();
		Group f = Group.FRAME;
		Group fr = Group.FRONT;
		float wheelR = 1.5F;
		// Deck
		spec.box(root, "deck", Material.METAL, "deck", f, -2.1F, 1.6F, -6.6F, 4.2F, 0.8F, 13.0F);
		spec.box(root, "deck_grip", Material.GRIP, BLACK, f, -2.0F, 2.4F, -6.4F, 4.0F, 0.06F, 12.4F);
		spec.box(root, "neck", Material.METAL, "deck", f, "", -1.0F, -0.5F, -0.6F, 2.0F, 2.6F, 1.2F,
			PartPose.offsetAndRotation(0.0F, 2.6F, 6.8F, -0.35F, 0.0F, 0.0F));
		spec.box(root, "brake", Material.METAL, BLACK, f, "", -1.1F, -0.25F, -2.0F, 2.2F, 0.5F, 2.2F,
			PartPose.offsetAndRotation(0.0F, 2.7F, -6.6F, -0.18F, 0.0F, 0.0F));
		spec.box(root, "dropout_l", Material.METAL, "deck", f, 1.4F, 0.9F, -7.8F, 0.6F, 1.0F, 1.6F);
		spec.box(root, "dropout_r", Material.METAL, "deck", f, -2.0F, 0.9F, -7.8F, 0.6F, 1.0F, 1.6F);
		PartDefinition rear = spec.group(root, "rear_wheel", PartPose.offset(0.0F, wheelR, -7.0F), "wheel");
		smallWheel(spec, rear, "rear", f, wheelR);
		// Bars, fork and front wheel
		spec.tube(root, "headset", Material.METAL, DARK, fr, "", 0.0F, 3.4F, SCOOTER_STEM_Z, 0.0F, 5.0F, SCOOTER_STEM_Z, 1.6F);
		spec.tube(root, "stem", Material.METAL, "bars", fr, "", 0.0F, 5.0F, SCOOTER_STEM_Z, 0.0F, 14.6F, SCOOTER_STEM_Z, 1.0F);
		spec.tube(root, "crossbar", Material.METAL, "bars", fr, "", -3.1F, 14.6F, SCOOTER_STEM_Z, 3.1F, 14.6F, SCOOTER_STEM_Z, 0.9F);
		spec.tube(root, "brace", Material.METAL, "bars", fr, "", -1.8F, 12.6F, SCOOTER_STEM_Z, 1.8F, 12.6F, SCOOTER_STEM_Z, 0.5F);
		spec.tube(root, "grip_l", Material.RUBBER, "grips", fr, "", 3.0F, 14.6F, SCOOTER_STEM_Z, 4.9F, 14.6F, SCOOTER_STEM_Z, 1.2F);
		spec.tube(root, "grip_r", Material.RUBBER, "grips", fr, "", -3.0F, 14.6F, SCOOTER_STEM_Z, -4.9F, 14.6F, SCOOTER_STEM_Z, 1.2F);
		spec.tube(root, "fork_l", Material.METAL, "bars", fr, "", 0.85F, 3.6F, SCOOTER_STEM_Z, 0.85F, wheelR, 7.7F, 0.55F);
		spec.tube(root, "fork_r", Material.METAL, "bars", fr, "", -0.85F, 3.6F, SCOOTER_STEM_Z, -0.85F, wheelR, 7.7F, 0.55F);
		PartDefinition front = spec.group(root, "front_wheel", PartPose.offset(0.0F, wheelR, 7.7F), "wheel");
		smallWheel(spec, front, "front", fr, wheelR);
		return spec;
	}

	private static void smallWheel(Spec spec, PartDefinition wheel, String prefix, Group group, float r) {
		spec.box(wheel, prefix + "_a", Material.RUBBER, "wheels", group, -0.5F, -r, -r * 0.62F, 1.0F, r * 2.0F, r * 1.24F);
		spec.box(wheel, prefix + "_b", Material.RUBBER, "wheels", group, -0.5F, -r * 0.62F, -r, 1.0F, r * 1.24F, r * 2.0F);
		spec.box(wheel, prefix + "_core", Material.METAL, DARK, group, -0.6F, -0.55F, -0.55F, 1.2F, 1.1F, 1.1F);
	}

	// ------------------------------------------------------------------ inline skate (one skate)

	/** Height from the sole to the bottom of the wheels, in pixels. */
	public static final float SKATE_HEIGHT = 3.6F;

	/** One skate, sole at y = 0, toe toward -z (matches the player's leg, which faces -z). */
	public static Spec skate() {
		Spec spec = new Spec();
		PartDefinition root = spec.root();
		Group g = Group.BODY;
		spec.box(root, "boot", Material.FABRIC, "boot", g, -2.35F, 0.0F, -3.2F, 4.7F, 3.6F, 5.6F);
		spec.box(root, "toe_cap", Material.PLASTIC, "boot", g, -2.2F, 0.0F, -3.5F, 4.4F, 1.6F, 0.6F);
		spec.box(root, "cuff", Material.PLASTIC, "boot", g, -2.5F, 3.2F, -2.6F, 5.0F, 1.6F, 5.0F);
		spec.box(root, "strap", Material.PLASTIC, BLACK, g, -2.45F, 2.2F, -2.6F, 4.9F, 0.6F, 2.0F);
		spec.box(root, "soul_plate", Material.PLASTIC, DARK, g, -2.3F, -0.5F, -3.4F, 4.6F, 0.5F, 6.0F);
		spec.box(root, "frame", Material.METAL, "frame", g, -0.75F, -1.3F, -3.4F, 1.5F, 0.85F, 6.4F);
		float[] wheelZ = {-2.55F, -0.85F, 0.85F, 2.55F};
		for (int i = 0; i < wheelZ.length; i++) {
			PartDefinition wheel = spec.group(root, "wheel" + i, PartPose.offset(0.0F, -2.35F, wheelZ[i]), "wheel");
			spec.box(wheel, "wheel_a" + i, Material.RUBBER, "wheels", g, -0.45F, -1.2F, -0.75F, 0.9F, 2.4F, 1.5F);
			spec.box(wheel, "wheel_b" + i, Material.RUBBER, "wheels", g, -0.45F, -0.75F, -1.2F, 0.9F, 1.5F, 2.4F);
		}
		return spec;
	}
}
