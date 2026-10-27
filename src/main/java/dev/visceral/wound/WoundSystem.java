package dev.visceral.wound;

import dev.visceral.Visceral;
import dev.visceral.config.CommonConfig;
import dev.visceral.entity.CombatState;
import dev.visceral.registry.VisceralRegistry;
import dev.visceral.state.BloodType;
import dev.visceral.state.BodyRegion;
import dev.visceral.state.Wound;
import dev.visceral.state.WoundList;
import dev.visceral.state.WoundType;
import dev.visceral.physics.BodyMath;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.phys.Vec3;

/** Creates localised wounds, applies their gameplay effects (limping, weak arms, bleeding) and heals them. */
public final class WoundSystem {
	private static final Identifier LEG_MODIFIER = Visceral.id("leg_wounds");
	private static final Identifier ARM_MODIFIER = Visceral.id("arm_wounds");

	private WoundSystem() {
	}

	/**
	 * Records a wound at {@code hitPoint}. {@code dir} is the direction the blow travelled.
	 * Returns the severity assigned (0 if no wound was created).
	 */
	public static float inflict(LivingEntity e, BodyRegion region, WoundType type, Vec3 hitPoint, Vec3 dir, float damage) {
		CommonConfig cfg = CommonConfig.get();
		if (!cfg.wounds || cfg.maxWoundsPerEntity <= 0 || damage < 0.75f) return 0;
		if (BloodType.of(e) == BloodType.NONE && type != WoundType.SEVERED) return 0;
		float maxHealth = Math.max(1f, e.getMaxHealth());
		float severity = Mth.clamp(damage / (maxHealth * 0.3f), 0.1f, 1f);
		int face = BodyMath.face(e, dir);
		// Position on the face: lateral from the hit point, vertical within the region's band.
		double h = BodyMath.heightFraction(e, hitPoint);
		double lat = BodyMath.lateralFraction(e, hitPoint);
		float v = switch (region) {
			case HEAD -> (float) Mth.clamp((1.0 - h) / 0.22, 0.15, 0.85);
			case TORSO, RIGHT_ARM, LEFT_ARM -> (float) Mth.clamp((0.78 - h) / 0.38, 0.1, 0.9);
			default -> (float) Mth.clamp((0.40 - h) / 0.40, 0.1, 0.9);
		};
		float u = (float) Mth.clamp(0.5 + lat * (region == BodyRegion.TORSO ? 0.55 : 0.35), 0.12, 0.88);
		if (face >= 2) u = 0.25f + e.getRandom().nextFloat() * 0.5f;
		int rotation = e.getRandom().nextInt(360);
		Wound wound = new Wound(region, type, face, u, v, severity, rotation, e.level().getGameTime());
		WoundList list = e.getAttachedOrElse(VisceralRegistry.WOUNDS, WoundList.EMPTY).with(wound, cfg.maxWoundsPerEntity);
		e.setAttached(VisceralRegistry.WOUNDS, list);
		updateModifiers(e, list);
		return severity;
	}

	public static void sever(LivingEntity e, BodyRegion region) {
		CommonConfig cfg = CommonConfig.get();
		Wound wound = new Wound(region, WoundType.SEVERED, 5, 0.5f, 0.5f, 1f, 0, e.level().getGameTime());
		WoundList list = e.getAttachedOrElse(VisceralRegistry.WOUNDS, WoundList.EMPTY).with(wound, Math.max(1, cfg.maxWoundsPerEntity));
		e.setAttached(VisceralRegistry.WOUNDS, list);
	}

	public static void updateModifiers(LivingEntity e, WoundList list) {
		boolean on = CommonConfig.get().woundEffects;
		float legs = list.severity(BodyRegion.LEFT_LEG) + list.severity(BodyRegion.RIGHT_LEG);
		float arms = list.severity(BodyRegion.LEFT_ARM) + list.severity(BodyRegion.RIGHT_ARM);
		setModifier(e.getAttribute(Attributes.MOVEMENT_SPEED), LEG_MODIFIER, on ? -Math.min(0.45, legs * 0.12) : 0);
		setModifier(e.getAttribute(Attributes.ATTACK_DAMAGE), ARM_MODIFIER, on ? -Math.min(0.4, arms * 0.12) : 0);
	}

	private static void setModifier(AttributeInstance inst, Identifier id, double amount) {
		if (inst == null) return;
		if (Math.abs(amount) < 1e-3) {
			inst.removeModifier(id);
		} else {
			inst.addOrUpdateTransientModifier(new AttributeModifier(id, amount, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
		}
	}

	/** Server tick: bleeding damage over time and slow healing once the entity has recovered. */
	public static void tick(LivingEntity e, CombatState cs) {
		WoundList list = e.getAttached(VisceralRegistry.WOUNDS);
		if (list == null || list.isEmpty() || !(e.level() instanceof ServerLevel level) || e.isDeadOrDying()) return;
		CommonConfig cfg = CommonConfig.get();
		long now = level.getGameTime();
		if (cfg.bleeding && ++cs.bleedTimer >= 40) {
			cs.bleedTimer = 0;
			for (Wound w : list.wounds()) {
				if (w.isBleeding(now)) {
					e.hurtServer(level, e.damageSources().source(VisceralRegistry.BLEEDING), cfg.bleedDamage);
					break;
				}
			}
		}
		if (++cs.healTimer >= 200) {
			cs.healTimer = 0;
			if (e.getHealth() >= e.getMaxHealth() * 0.95f) {
				WoundList healed = list.withoutOldestHealable();
				if (healed != list) {
					e.setAttached(VisceralRegistry.WOUNDS, healed.isEmpty() ? null : healed);
					updateModifiers(e, healed);
				}
			}
		}
	}

	/** Reapply transient modifiers after (re)loading an entity with persisted wounds. */
	public static void onLoad(LivingEntity e) {
		WoundList list = e.getAttached(VisceralRegistry.WOUNDS);
		if (list != null) updateModifiers(e, list);
	}
}
