package dev.juukulius.character;

import dev.juukulius.combat.Ability;
import io.netty.buffer.ByteBuf;
import java.util.Arrays;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * Private numbers only the owning client needs (HUD and input prediction).
 *
 * @param mana         current mana
 * @param cooldowns    remaining ticks per {@link Ability} ordinal
 * @param ultimateTicks remaining Al Cranvel ticks
 * @param lockTicks    remaining server-side action lock
 */
public record JuliusStats(float mana, int[] cooldowns, int ultimateTicks, int lockTicks) {
	public static final JuliusStats EMPTY = new JuliusStats(100.0F, new int[Ability.COUNT], 0, 0);

	public static final StreamCodec<ByteBuf, JuliusStats> STREAM_CODEC = StreamCodec.composite(
		ByteBufCodecs.FLOAT, JuliusStats::mana,
		ByteBufCodecs.VAR_INT.apply(ByteBufCodecs.list(Ability.COUNT)).map(
			list -> list.stream().mapToInt(Integer::intValue).toArray(),
			array -> Arrays.stream(array).boxed().toList()
		), JuliusStats::cooldowns,
		ByteBufCodecs.VAR_INT, JuliusStats::ultimateTicks,
		ByteBufCodecs.VAR_INT, JuliusStats::lockTicks,
		JuliusStats::new
	);

	public int cooldown(Ability ability) {
		int index = ability.ordinal();
		return index < this.cooldowns.length ? this.cooldowns[index] : 0;
	}

	@Override
	public boolean equals(Object other) {
		return other instanceof JuliusStats stats
			&& Float.compare(stats.mana, this.mana) == 0
			&& stats.ultimateTicks == this.ultimateTicks
			&& stats.lockTicks == this.lockTicks
			&& Arrays.equals(stats.cooldowns, this.cooldowns);
	}

	@Override
	public int hashCode() {
		return Float.hashCode(this.mana) * 31 * 31 + Arrays.hashCode(this.cooldowns) * 31 + this.ultimateTicks + this.lockTicks;
	}

	@Override
	public String toString() {
		return "JuliusStats[mana=" + this.mana + ", cooldowns=" + Arrays.toString(this.cooldowns) + ", ultimate=" + this.ultimateTicks + "]";
	}
}
