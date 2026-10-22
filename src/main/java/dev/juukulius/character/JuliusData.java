package dev.juukulius.character;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.juukulius.combat.Ability;
import dev.juukulius.combat.CombatRules;
import dev.juukulius.spirit.Spirit;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.util.Mth;

/**
 * Authoritative, persistent per-player state. Lives only on the server (saved with the player) and is mirrored to
 * clients through {@link JuliusAppearance} (everyone) and {@link JuliusStats} (owner only).
 */
public final class JuliusData {
	public static final Codec<JuliusData> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			Codec.BOOL.optionalFieldOf("transformed", false).forGetter(data -> data.transformed),
			Codec.BOOL.optionalFieldOf("spirits_out", true).forGetter(data -> data.spiritsOut),
			Codec.INT.optionalFieldOf("selected_spirit", 0).forGetter(data -> data.selectedSpirit),
			Codec.FLOAT.optionalFieldOf("mana", CombatRules.MAX_MANA).forGetter(data -> data.mana),
			Codec.unboundedMap(Codec.STRING, Codec.INT).optionalFieldOf("cooldowns", Map.of()).forGetter(JuliusData::cooldownsAsMap),
			Codec.INT.optionalFieldOf("ultimate_ticks", 0).forGetter(data -> data.ultimateTicks),
			Codec.BOOL.optionalFieldOf("sword_granted", false).forGetter(data -> data.swordGranted)
		)
		.apply(instance, JuliusData::new));

	public boolean transformed;
	public boolean spiritsOut;
	public int selectedSpirit;
	public float mana;
	public final int[] cooldowns = new int[Ability.COUNT];
	/** Remaining Al Cranvel ticks; 0 when inactive. */
	public int ultimateTicks;
	public boolean swordGranted;

	public JuliusData() {
		this(false, true, 0, CombatRules.MAX_MANA, Map.of(), 0, false);
	}

	private JuliusData(boolean transformed, boolean spiritsOut, int selectedSpirit, float mana, Map<String, Integer> cooldowns,
		int ultimateTicks, boolean swordGranted) {
		this.transformed = transformed;
		this.spiritsOut = spiritsOut;
		this.selectedSpirit = Mth.positiveModulo(selectedSpirit, Spirit.COUNT);
		this.mana = Mth.clamp(mana, 0.0F, CombatRules.MAX_MANA);
		this.ultimateTicks = Math.max(0, ultimateTicks);
		this.swordGranted = swordGranted;
		cooldowns.forEach((id, ticks) -> {
			Ability ability = Ability.byId(id);
			if (ability != null) {
				this.cooldowns[ability.ordinal()] = Math.max(0, ticks);
			}
		});
	}

	private Map<String, Integer> cooldownsAsMap() {
		Map<String, Integer> map = new HashMap<>();
		for (Ability ability : Ability.values()) {
			int ticks = this.cooldowns[ability.ordinal()];
			if (ticks > 0) {
				map.put(ability.id, ticks);
			}
		}

		return map;
	}

	public Spirit spirit() {
		return Spirit.byIndex(this.selectedSpirit);
	}

	public boolean ultimateActive() {
		return this.ultimateTicks > 0;
	}

	public int cooldown(Ability ability) {
		return this.cooldowns[ability.ordinal()];
	}

	/** Copies everything; used when the player entity is recreated (respawn, end portal). */
	public JuliusData copy() {
		JuliusData copy = new JuliusData();
		copy.transformed = this.transformed;
		copy.spiritsOut = this.spiritsOut;
		copy.selectedSpirit = this.selectedSpirit;
		copy.mana = this.mana;
		System.arraycopy(this.cooldowns, 0, copy.cooldowns, 0, this.cooldowns.length);
		copy.ultimateTicks = this.ultimateTicks;
		copy.swordGranted = this.swordGranted;
		return copy;
	}
}
