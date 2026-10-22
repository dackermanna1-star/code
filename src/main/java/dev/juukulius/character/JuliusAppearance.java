package dev.juukulius.character;

import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * Public state that every client tracking the player needs for rendering: outfit, orbiting spirits, aura.
 * Times are absolute level game times so clients can animate transitions without per-tick updates.
 *
 * @param transformed     whether Julius's form is active
 * @param spiritsOut      whether the six spirits are manifested
 * @param selectedSpirit  index into {@link dev.juukulius.spirit.Spirit}
 * @param changeTime      game time of the last transform/revert (drives materialize/dissolve)
 * @param spiritsTime     game time of the last summon/dismiss
 * @param ultimateEnd     game time when Al Cranvel ends, or 0
 * @param barrierEnd      game time when the Al Clauzeria barrier ends, or 0
 * @param version         bumped on every write so re-syncs are never skipped as "unchanged"
 */
public record JuliusAppearance(boolean transformed, boolean spiritsOut, int selectedSpirit, long changeTime, long spiritsTime,
	long ultimateEnd, long barrierEnd, int version) {
	public static final JuliusAppearance NONE = new JuliusAppearance(false, true, 0, -1000L, -1000L, 0L, 0L, 0);

	public static final StreamCodec<ByteBuf, JuliusAppearance> STREAM_CODEC = StreamCodec.composite(
		ByteBufCodecs.BOOL, JuliusAppearance::transformed,
		ByteBufCodecs.BOOL, JuliusAppearance::spiritsOut,
		ByteBufCodecs.VAR_INT, JuliusAppearance::selectedSpirit,
		ByteBufCodecs.VAR_LONG, JuliusAppearance::changeTime,
		ByteBufCodecs.VAR_LONG, JuliusAppearance::spiritsTime,
		ByteBufCodecs.VAR_LONG, JuliusAppearance::ultimateEnd,
		ByteBufCodecs.VAR_LONG, JuliusAppearance::barrierEnd,
		ByteBufCodecs.VAR_INT, JuliusAppearance::version,
		JuliusAppearance::new
	);

	public boolean ultimateActive(long gameTime) {
		return this.ultimateEnd > gameTime;
	}

	public boolean barrierActive(long gameTime) {
		return this.barrierEnd > gameTime;
	}
}
