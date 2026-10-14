package net.abyssaldescent.dungeon.run;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.abyssaldescent.dungeon.encounter.EnemyKind;
import net.abyssaldescent.entity.EliteAffix;
import net.minecraft.core.BlockPos;
import org.jetbrains.annotations.Nullable;

/** A live room encounter: its waves, the enemies currently alive and the ones still materialising. */
public final class Encounter {
	public enum Kind {
		ROOM,
		ELITE,
		TRIAL
	}

	public static final class Pending {
		public final EnemyKind kind;
		@Nullable
		public final EliteAffix affix;
		public final BlockPos pos;
		public int ticks;

		Pending(EnemyKind kind, @Nullable EliteAffix affix, BlockPos pos, int ticks) {
			this.kind = kind;
			this.affix = affix;
			this.pos = pos;
			this.ticks = ticks;
		}
	}

	public final Kind kind;
	public final int roomId;
	public final int waves;
	public int wave;
	public final List<UUID> mobs = new ArrayList<>();
	public final List<Pending> pending = new ArrayList<>();
	/** For trials: where the reward reliquary appears. */
	@Nullable
	public final BlockPos anchor;
	/** Ticks between the last enemy of a wave dying and the next wave arriving. */
	public int interlude;
	public int age;

	public Encounter(Kind kind, int roomId, int waves, @Nullable BlockPos anchor) {
		this.kind = kind;
		this.roomId = roomId;
		this.waves = waves;
		this.anchor = anchor;
	}

	public void queue(EnemyKind kind, @Nullable EliteAffix affix, BlockPos pos, int delay) {
		pending.add(new Pending(kind, affix, pos, delay));
	}
}
