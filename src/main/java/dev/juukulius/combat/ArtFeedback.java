package dev.juukulius.combat;

import dev.juukulius.network.FxType;
import dev.juukulius.registry.JuliusSounds;
import dev.juukulius.spirit.Spirit;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Cast feedback shared by the server and the predicting client. The caster plays the cast sound and cast effect
 * locally the moment the key is pressed; the server sends the same feedback to everyone else.
 */
public final class ArtFeedback {
	private ArtFeedback() {
	}

	public static @Nullable SoundEvent castSound(Ability ability) {
		return switch (ability) {
			case HEAVY_STRIKE -> JuliusSounds.SWORD_HEAVY_SWING;
			case AL_CLARISTA -> JuliusSounds.SWORD_WAVE_RELEASE;
			case AL_CLAUZERIA -> JuliusSounds.CLAUZERIA_CHARGE;
			case AL_CRANVEL -> JuliusSounds.ULTIMATE_ACTIVATE;
			case IA_FLAME_BURST -> JuliusSounds.FIRE_CAST;
			case UL_GORA -> JuliusSounds.UL_GORA;
			case KUA_TIDE_LANCE -> JuliusSounds.WATER_CAST;
			case KUA_HEALING_WATER -> JuliusSounds.WATER_HEAL;
			case ARO_GALE_STEP -> JuliusSounds.DASH;
			case EL_FURA -> JuliusSounds.EL_FURA;
			case IKU_STONE_SPIRES -> JuliusSounds.EARTH_CAST;
			case IKU_GROUND_SHATTER -> JuliusSounds.EARTH_SHATTER;
			case IN_RADIANT_BURST -> JuliusSounds.YANG_CAST;
			case IN_STRENGTH_ENHANCEMENT -> JuliusSounds.YANG_BUFF;
			case NES_UMBRAL_BOLT -> JuliusSounds.YIN_CAST;
			case NES_YIN_SEAL -> null;
		};
	}

	/** The cast effect (magic circle, pressure wave, aura...) that accompanies a spirit art, or null. */
	public static @Nullable FxType castFx(Ability ability) {
		return switch (ability) {
			case IA_FLAME_BURST, KUA_TIDE_LANCE, NES_UMBRAL_BOLT, NES_YIN_SEAL -> FxType.CAST_CIRCLE;
			case UL_GORA -> FxType.UL_GORA_CAST;
			case KUA_HEALING_WATER -> FxType.HEALING_WATER;
			case ARO_GALE_STEP -> FxType.GALE_STEP;
			case EL_FURA -> FxType.EL_FURA;
			case IKU_STONE_SPIRES -> FxType.CAST_CIRCLE;
			case IKU_GROUND_SHATTER -> FxType.GROUND_SHATTER;
			case IN_RADIANT_BURST -> FxType.RADIANT_BURST;
			case IN_STRENGTH_ENHANCEMENT -> FxType.STRENGTH_ENHANCEMENT;
			default -> null;
		};
	}

	public static Spirit spiritOf(Ability ability) {
		return switch (ability) {
			case IA_FLAME_BURST, UL_GORA -> Spirit.IA;
			case KUA_TIDE_LANCE, KUA_HEALING_WATER -> Spirit.KUA;
			case ARO_GALE_STEP, EL_FURA -> Spirit.ARO;
			case IKU_STONE_SPIRES, IKU_GROUND_SHATTER -> Spirit.IKU;
			case IN_RADIANT_BURST, IN_STRENGTH_ENHANCEMENT -> Spirit.IN;
			case NES_UMBRAL_BOLT, NES_YIN_SEAL -> Spirit.NES;
			default -> Spirit.IN;
		};
	}

	/** Where the left (casting) hand is: Julius keeps the sword in his right hand and casts with the left. */
	public static Vec3 castPoint(Player player) {
		Vec3 look = player.getLookAngle();
		float yaw = player.getYRot() * ((float) Math.PI / 180.0F);
		// Arts are cast from the free hand: the left one, or the right one for left-handed players.
		double side = player.getMainArm() == HumanoidArm.LEFT ? -0.3 : 0.3;
		Vec3 left = new Vec3(Math.cos(yaw), 0.0, Math.sin(yaw));
		return player.getEyePosition().add(look.scale(0.7)).add(left.scale(side)).add(0.0, -0.3, 0.0);
	}

	/** Gale Step travel speed in blocks per tick (applied client-side, validated server-side). */
	public static final double GALE_STEP_SPEED = 1.55;
	public static final int GALE_STEP_TICKS = 6;
	/** Finisher lunge applied to the attacker at the start of combo step 3. */
	public static final double FINISHER_LUNGE = 0.42;
}
