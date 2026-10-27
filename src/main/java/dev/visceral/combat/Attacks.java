package dev.visceral.combat;

import dev.visceral.combat.AttackDef.Kind;
import dev.visceral.config.CommonConfig;
import dev.visceral.state.PhysState;
import dev.visceral.state.WoundType;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import org.jspecify.annotations.Nullable;

/**
 * The move set. Shared by client (prediction/animation) and server (validation/hit detection),
 * so selection must be deterministic from the same inputs.
 */
public final class Attacks {
	private static final List<AttackDef> BY_ID = new ArrayList<>();
	private static final Map<String, AttackDef> BY_NAME = new HashMap<>();

	// --- Fists -------------------------------------------------------------------------------
	public static final AttackDef FIST_JAB = add(new AttackDef("fist_jab", WeaponClass.FIST, Kind.STRIKE)
		.timing(2, 2, 4).thrust(2.3f).origin(-0.3f, -0.22f).power(0.8f, 0.45f).minRecovery(1));
	public static final AttackDef FIST_CROSS = add(new AttackDef("fist_cross", WeaponClass.FIST, Kind.STRIKE)
		.timing(3, 2, 5).thrust(2.45f).origin(-0.3f, 0.22f).power(1.0f, 0.8f).lunge(0.08f).minRecovery(1));
	public static final AttackDef FIST_HOOK = add(new AttackDef("fist_hook", WeaponClass.FIST, Kind.STRIKE)
		.timing(4, 3, 6).arc(-65, 25, 0).reach(2.1f).origin(-0.3f, -0.2f).power(1.15f, 1.1f).minRecovery(2));
	public static final AttackDef FIST_UPPERCUT = add(new AttackDef("fist_uppercut", WeaponClass.FIST, Kind.STRIKE)
		.timing(5, 3, 8).arc(-45, 40, -90).reach(2.0f).origin(-0.55f, 0.15f).power(1.3f, 1.5f).lift(0.45f).heavy());
	public static final AttackDef FIST_RUNNING = add(new AttackDef("fist_running", WeaponClass.FIST, Kind.STRIKE)
		.timing(4, 3, 8).thrust(2.7f).origin(-0.2f, 0.2f).power(1.3f, 1.8f).lunge(0.15f).heavy());
	public static final AttackDef FIST_FINISHER = add(new AttackDef("fist_finisher", WeaponClass.FIST, Kind.FINISHER_STAND)
		.timing(7, 3, 10).arc(70, -40, -15).reach(2.3f).power(2.0f, 3.0f).lift(0.3f).heavy());

	// --- Swords (and improvised tools) -------------------------------------------------------
	public static final AttackDef SWORD_SLASH_R = add(new AttackDef("sword_slash_r", WeaponClass.SWORD, Kind.STRIKE)
		.timing(4, 3, 7).arc(75, -70, -18).reach(2.9f).power(1.0f, 1.0f).lunge(0.1f));
	public static final AttackDef SWORD_SLASH_L = add(new AttackDef("sword_slash_l", WeaponClass.SWORD, Kind.STRIKE)
		.timing(3, 3, 7).arc(-70, 75, -12).reach(2.9f).power(0.95f, 1.0f).lunge(0.08f));
	public static final AttackDef SWORD_OVERHEAD = add(new AttackDef("sword_overhead", WeaponClass.SWORD, Kind.STRIKE)
		.timing(6, 3, 9).arc(-65, 50, 90).reach(2.8f).origin(-0.15f, 0.1f).power(1.3f, 1.5f).lunge(0.16f).heavy());
	public static final AttackDef SWORD_THRUST = add(new AttackDef("sword_thrust", WeaponClass.SWORD, Kind.STRIKE)
		.timing(4, 3, 8).thrust(3.3f).origin(-0.35f, 0.15f).power(1.15f, 1.2f).lunge(0.28f).wound(WoundType.STAB));
	public static final AttackDef SWORD_RUNNING = add(new AttackDef("sword_running", WeaponClass.SWORD, Kind.STRIKE)
		.timing(3, 4, 9).arc(85, -60, -22).reach(3.0f).power(1.25f, 1.9f).heavy());
	public static final AttackDef SWORD_FINISHER_GROUND = add(new AttackDef("sword_finisher_ground", WeaponClass.SWORD, Kind.FINISHER_GROUND)
		.timing(8, 3, 10).thrust(2.3f).power(2.5f, 0.6f).wound(WoundType.STAB).heavy());
	public static final AttackDef SWORD_FINISHER_STAND = add(new AttackDef("sword_finisher_stand", WeaponClass.SWORD, Kind.FINISHER_STAND)
		.timing(6, 4, 12).thrust(2.9f).origin(-0.4f, 0.1f).power(2.0f, 2.9f).lunge(0.3f).wound(WoundType.STAB).heavy());

	// --- Axes (two-handed, heavy) ------------------------------------------------------------
	public static final AttackDef AXE_CHOP = add(new AttackDef("axe_chop", WeaponClass.AXE, Kind.STRIKE)
		.timing(7, 3, 11).arc(75, -55, -38).reach(2.8f).power(1.0f, 2.0f).lunge(0.12f).heavy());
	public static final AttackDef AXE_OVERHEAD = add(new AttackDef("axe_overhead", WeaponClass.AXE, Kind.STRIKE)
		.timing(9, 3, 12).arc(-70, 55, 90).reach(2.8f).power(1.25f, 2.6f).lunge(0.18f).heavy());
	public static final AttackDef AXE_RUNNING = add(new AttackDef("axe_running", WeaponClass.AXE, Kind.STRIKE)
		.timing(5, 4, 12).arc(85, -50, -20).reach(2.9f).power(1.2f, 2.8f).heavy());
	public static final AttackDef AXE_FINISHER_GROUND = add(new AttackDef("axe_finisher_ground", WeaponClass.AXE, Kind.FINISHER_GROUND)
		.timing(10, 3, 12).thrust(2.3f).power(2.5f, 0.8f).heavy());
	public static final AttackDef AXE_FINISHER_STAND = add(new AttackDef("axe_finisher_stand", WeaponClass.AXE, Kind.FINISHER_STAND)
		.timing(9, 3, 14).arc(-75, 55, 90).reach(2.9f).power(2.2f, 3.6f).lunge(0.2f).heavy());

	// --- Maces (one-handed blunt) ------------------------------------------------------------
	public static final AttackDef MACE_SWING = add(new AttackDef("mace_swing", WeaponClass.MACE, Kind.STRIKE)
		.timing(6, 3, 9).arc(70, -60, -25).reach(2.7f).power(1.0f, 1.9f).lunge(0.1f).heavy());
	public static final AttackDef MACE_OVERHEAD = add(new AttackDef("mace_overhead", WeaponClass.MACE, Kind.STRIKE)
		.timing(8, 3, 11).arc(-65, 50, 90).reach(2.7f).power(1.3f, 2.5f).lunge(0.15f).heavy());
	public static final AttackDef MACE_FINISHER_GROUND = add(new AttackDef("mace_finisher_ground", WeaponClass.MACE, Kind.FINISHER_GROUND)
		.timing(9, 3, 11).thrust(2.3f).power(2.5f, 1.0f).heavy());

	// --- Spears / tridents -------------------------------------------------------------------
	public static final AttackDef SPEAR_THRUST = add(new AttackDef("spear_thrust", WeaponClass.SPEAR, Kind.STRIKE)
		.timing(4, 3, 7).thrust(3.7f).origin(-0.3f, 0.12f).power(1.0f, 1.2f).lunge(0.18f));
	public static final AttackDef SPEAR_THRUST_LOW = add(new AttackDef("spear_thrust_low", WeaponClass.SPEAR, Kind.STRIKE)
		.timing(3, 3, 7).thrust(3.6f).origin(-0.45f, 0.12f).pitch(0.6f, 14f).power(0.95f, 1.1f).lunge(0.15f));
	public static final AttackDef SPEAR_SWEEP = add(new AttackDef("spear_sweep", WeaponClass.SPEAR, Kind.STRIKE)
		.timing(6, 4, 9).arc(80, -80, 0).reach(3.3f).power(0.9f, 1.7f).wound(WoundType.BLUNT).heavy());
	public static final AttackDef SPEAR_FINISHER_GROUND = add(new AttackDef("spear_finisher_ground", WeaponClass.SPEAR, Kind.FINISHER_GROUND)
		.timing(8, 3, 10).thrust(2.5f).power(2.5f, 0.6f).heavy());

	// --- Legs (any weapon) -------------------------------------------------------------------
	public static final AttackDef KICK = add(new AttackDef("kick", WeaponClass.FIST, Kind.KICK)
		.timing(4, 3, 8).thrust(2.25f).origin(-0.7f, 0.1f).pitch(0.2f, 0).power(1f, 1f).lift(0.15f).wound(WoundType.BLUNT).heavy());
	public static final AttackDef KICK_RUNNING = add(new AttackDef("kick_running", WeaponClass.FIST, Kind.KICK)
		.timing(4, 4, 11).thrust(2.6f).origin(-0.6f, 0f).pitch(0.2f, 0).power(1.5f, 1.45f).lift(0.2f).lunge(0.3f).wound(WoundType.BLUNT).heavy());
	public static final AttackDef STOMP = add(new AttackDef("stomp", WeaponClass.FIST, Kind.STOMP)
		.timing(5, 3, 7).thrust(1.9f).power(1f, 0.5f).wound(WoundType.BLUNT).heavy());

	private static final AttackDef[] FIST_CHAIN = {FIST_JAB, FIST_CROSS, FIST_HOOK, FIST_UPPERCUT};
	private static final AttackDef[] SWORD_CHAIN = {SWORD_SLASH_R, SWORD_SLASH_L, SWORD_OVERHEAD};
	private static final AttackDef[] AXE_CHAIN = {AXE_CHOP, AXE_OVERHEAD};
	private static final AttackDef[] MACE_CHAIN = {MACE_SWING, MACE_OVERHEAD};
	private static final AttackDef[] SPEAR_CHAIN = {SPEAR_THRUST, SPEAR_THRUST_LOW, SPEAR_SWEEP};

	private Attacks() {
	}

	private static AttackDef add(AttackDef def) {
		def.id = BY_ID.size();
		BY_ID.add(def);
		BY_NAME.put(def.name, def);
		return def;
	}

	public static @Nullable AttackDef byId(int id) {
		return id >= 0 && id < BY_ID.size() ? BY_ID.get(id) : null;
	}

	public static @Nullable AttackDef byName(String name) {
		return BY_NAME.get(name);
	}

	public static List<AttackDef> all() {
		return BY_ID;
	}

	public static AttackDef[] chain(WeaponClass weapon) {
		return switch (weapon) {
			case FIST -> FIST_CHAIN;
			case SWORD, TOOL -> SWORD_CHAIN;
			case AXE -> AXE_CHAIN;
			case MACE -> MACE_CHAIN;
			case SPEAR -> SPEAR_CHAIN;
		};
	}

	/** Weapon family the move set of {@code weapon} is shared with (tools reuse sword moves). */
	public static WeaponClass moveSet(WeaponClass weapon) {
		return weapon == WeaponClass.TOOL ? WeaponClass.SWORD : weapon;
	}

	/**
	 * Duration multiplier for a wielder: maps the held item's attack-speed attribute onto the
	 * weapon family's authored pace, so faster/slower items (and Haste) change swing speed.
	 */
	public static float timeScale(LivingEntity wielder, WeaponClass weapon) {
		double speed = wielder.getAttributeValue(Attributes.ATTACK_SPEED);
		float ticksPerAttack = speed > 0.05 ? (float) (20.0 / speed) : 20f;
		float scale = ticksPerAttack / weapon.nominalTicks;
		if (weapon == WeaponClass.FIST) scale = Math.min(scale, 1.1f);
		scale = Math.max(0.7f, Math.min(1.5f, scale));
		return scale * CommonConfig.get().attackTimeScale;
	}

	/** Context-sensitive attack selection (see class doc about determinism). */
	public static AttackDef select(WeaponClass weapon, int comboStep, float moveForward, float moveStrafe, boolean sprinting,
		@Nullable PhysState targetState, float targetHealthFraction, boolean finishersEnabled) {
		WeaponClass set = moveSet(weapon);
		if (finishersEnabled && targetState != null) {
			if (targetState.grounded()) {
				return switch (set) {
					case SWORD -> SWORD_FINISHER_GROUND;
					case AXE -> AXE_FINISHER_GROUND;
					case MACE -> MACE_FINISHER_GROUND;
					case SPEAR -> SPEAR_FINISHER_GROUND;
					default -> STOMP;
				};
			}
			if (targetState == PhysState.STAGGERED && targetHealthFraction < 0.35f) {
				return switch (set) {
					case SWORD -> SWORD_FINISHER_STAND;
					case AXE, MACE -> AXE_FINISHER_STAND;
					case SPEAR -> SWORD_FINISHER_STAND;
					default -> FIST_FINISHER;
				};
			}
		}
		if (sprinting) {
			return switch (set) {
				case SWORD -> SWORD_RUNNING;
				case AXE, MACE -> AXE_RUNNING;
				case SPEAR -> SPEAR_THRUST;
				default -> FIST_RUNNING;
			};
		}
		if (set == WeaponClass.SWORD) {
			if (moveStrafe > 0.5f) return SWORD_SLASH_L;
			if (moveStrafe < -0.5f) return SWORD_SLASH_R;
			if (comboStep == 0 && moveForward > 0.5f) return SWORD_THRUST;
		}
		if (set == WeaponClass.SPEAR && Math.abs(moveStrafe) > 0.5f) return SPEAR_SWEEP;
		AttackDef[] chain = chain(set);
		return chain[Math.floorMod(comboStep, chain.length)];
	}

	/** Leg attack selection: stomp downed enemies, flying kick when running or airborne. */
	public static AttackDef selectKick(boolean sprintingOrAirborne, @Nullable PhysState targetState) {
		if (targetState != null && targetState.grounded()) return STOMP;
		return sprintingOrAirborne ? KICK_RUNNING : KICK;
	}

	/** Whether {@code def} may be used by someone holding {@code weapon}. */
	public static boolean allowedWith(AttackDef def, WeaponClass weapon) {
		if (def.kind == Kind.KICK || def.kind == Kind.STOMP) return true;
		return def.weapon == moveSet(weapon) || (def == AXE_FINISHER_STAND && moveSet(weapon) == WeaponClass.MACE)
			|| (def == SWORD_FINISHER_STAND && moveSet(weapon) == WeaponClass.SPEAR)
			|| ((def == AXE_RUNNING) && moveSet(weapon) == WeaponClass.MACE);
	}
}
