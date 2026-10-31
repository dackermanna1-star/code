package com.jjkshowdown.ability;

import com.jjkshowdown.ability.gojo.BlinkAbility;
import com.jjkshowdown.ability.gojo.BlueAbility;
import com.jjkshowdown.ability.gojo.HollowPurpleAbility;
import com.jjkshowdown.ability.gojo.InfinityAbility;
import com.jjkshowdown.ability.gojo.RedAbility;
import com.jjkshowdown.ability.gojo.UnlimitedVoidAbility;
import com.jjkshowdown.ability.shared.ReverseCursedTechniqueAbility;
import com.jjkshowdown.ability.sukuna.CleaveAbility;
import com.jjkshowdown.ability.sukuna.DismantleAbility;
import com.jjkshowdown.ability.sukuna.DomainAmplificationAbility;
import com.jjkshowdown.ability.sukuna.FugaAbility;
import com.jjkshowdown.ability.sukuna.MalevolentShrineAbility;
import com.jjkshowdown.ability.sukuna.WorldSlashAbility;
import com.jjkshowdown.sorcerer.CharacterType;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Registry of every technique, indexed by character and slot. */
public final class Abilities {
	private static final Map<CharacterType, EnumMap<AbilitySlot, Ability>> BY_SLOT = new EnumMap<>(CharacterType.class);
	private static final Map<String, Ability> BY_ID = new LinkedHashMap<>();

	public static final InfinityAbility INFINITY = reg(new InfinityAbility());
	public static final BlueAbility BLUE = reg(new BlueAbility());
	public static final RedAbility RED = reg(new RedAbility());
	public static final BlinkAbility BLINK = reg(new BlinkAbility());
	public static final HollowPurpleAbility HOLLOW_PURPLE = reg(new HollowPurpleAbility());
	public static final UnlimitedVoidAbility UNLIMITED_VOID = reg(new UnlimitedVoidAbility());

	public static final DismantleAbility DISMANTLE = reg(new DismantleAbility());
	public static final CleaveAbility CLEAVE = reg(new CleaveAbility());
	public static final FugaAbility FUGA = reg(new FugaAbility());
	public static final WorldSlashAbility WORLD_SLASH = reg(new WorldSlashAbility());
	public static final DomainAmplificationAbility DOMAIN_AMPLIFICATION = reg(new DomainAmplificationAbility());
	public static final MalevolentShrineAbility MALEVOLENT_SHRINE = reg(new MalevolentShrineAbility());

	public static final ReverseCursedTechniqueAbility RCT_GOJO = reg(new ReverseCursedTechniqueAbility(CharacterType.GOJO));
	public static final ReverseCursedTechniqueAbility RCT_SUKUNA = reg(new ReverseCursedTechniqueAbility(CharacterType.SUKUNA));

	private Abilities() {
	}

	private static <T extends Ability> T reg(T a) {
		BY_SLOT.computeIfAbsent(a.character, c -> new EnumMap<>(AbilitySlot.class)).put(a.slot, a);
		BY_ID.putIfAbsent(a.id, a);
		return a;
	}

	@Nullable
	public static Ability get(CharacterType c, AbilitySlot slot) {
		EnumMap<AbilitySlot, Ability> m = BY_SLOT.get(c);
		return m == null ? null : m.get(slot);
	}

	@Nullable
	public static Ability byId(String id) {
		return BY_ID.get(id);
	}

	public static List<Ability> forCharacter(CharacterType c) {
		EnumMap<AbilitySlot, Ability> m = BY_SLOT.get(c);
		return m == null ? List.of() : new ArrayList<>(m.values());
	}

	public static void init() {
	}
}
