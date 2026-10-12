package com.chaosunleashed.client;

import com.chaosunleashed.core.ChaosEnvironment;
import com.chaosunleashed.core.ChaosEventType;
import com.chaosunleashed.core.EventPhase;
import com.chaosunleashed.network.ChaosStatusPayload;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.util.math.MathHelper;
import org.jetbrains.annotations.Nullable;

import java.util.List;

/**
 * Client copy of the server's Chaos status, plus smoothed per-event visual strengths for the current world.
 * The Control Panel GUI reads the toggles from here; sky/fog/HUD effects read the strengths.
 */
public final class ClientChaosState {
	private static boolean randomEnabled = true;
	private static int enabledMask;
	private static int cooldownTicks;
	private static boolean canEdit;
	private static List<ChaosStatusPayload.EventInfo> events = List.of();
	private static int ticksSinceSync;
	private static int version;

	private static final float[] STRENGTH = new float[ChaosEventType.values().length];
	private static final float[] LAST_STRENGTH = new float[ChaosEventType.values().length];
	private static final float[] VALUE = new float[ChaosEventType.values().length];

	public static final ChaosEnvironment.Source SOURCE = new ChaosEnvironment.Source() {
		@Override
		public float strength(ChaosEventType type) {
			return STRENGTH[type.ordinal()];
		}

		@Override
		public float value(ChaosEventType type) {
			return VALUE[type.ordinal()];
		}
	};

	private ClientChaosState() {
	}

	public static void apply(ChaosStatusPayload payload) {
		randomEnabled = payload.randomEnabled();
		enabledMask = payload.enabledMask();
		cooldownTicks = payload.cooldownTicks();
		canEdit = payload.canEdit();
		events = List.copyOf(payload.events());
		ticksSinceSync = 0;
		version++;
	}

	public static void reset() {
		events = List.of();
		for (int i = 0; i < STRENGTH.length; i++) {
			STRENGTH[i] = 0.0F;
			LAST_STRENGTH[i] = 0.0F;
			VALUE[i] = 0.0F;
		}
	}

	/** Called every client tick: interpolates timers and smooths visual strengths. */
	public static void tick(MinecraftClient client) {
		ticksSinceSync++;
		ClientWorld world = client.world;
		float[] target = new float[STRENGTH.length];
		float[] targetValue = new float[STRENGTH.length];
		if (world != null) {
			for (ChaosStatusPayload.EventInfo info : events) {
				ChaosEventType type = ChaosEventType.byOrdinal(info.type());
				if (type == null || !info.dimension().equals(world.getRegistryKey().getValue())) {
					continue;
				}
				EventPhase phase = EventPhase.byOrdinal(info.phase());
				int ticks = info.phaseTicks() + ticksSinceSync;
				target[type.ordinal()] = ChaosEnvironment.phaseStrength(phase, Math.min(ticks, info.phaseLength()), info.phaseLength(), info.waiting());
				targetValue[type.ordinal()] = info.value();
			}
		}
		for (int i = 0; i < STRENGTH.length; i++) {
			LAST_STRENGTH[i] = STRENGTH[i];
			STRENGTH[i] = approach(STRENGTH[i], target[i], 0.02F);
			VALUE[i] = MathHelper.lerp(0.1F, VALUE[i], targetValue[i]);
			if (Math.abs(VALUE[i] - targetValue[i]) < 0.001F) {
				VALUE[i] = targetValue[i];
			}
		}
	}

	private static float approach(float current, float target, float step) {
		if (current < target) {
			return Math.min(target, current + step);
		}
		return Math.max(target, current - step);
	}

	public static float strength(ChaosEventType type) {
		return STRENGTH[type.ordinal()];
	}

	public static float strength(ChaosEventType type, float tickDelta) {
		return MathHelper.lerp(tickDelta, LAST_STRENGTH[type.ordinal()], STRENGTH[type.ordinal()]);
	}

	public static float value(ChaosEventType type) {
		return VALUE[type.ordinal()];
	}

	public static boolean isRandomEnabled() {
		return randomEnabled;
	}

	public static boolean isEnabled(ChaosEventType type) {
		return (enabledMask & (1 << type.ordinal())) != 0;
	}

	public static boolean canEdit() {
		return canEdit;
	}

	public static int cooldownTicks() {
		return Math.max(0, cooldownTicks - ticksSinceSync);
	}

	public static List<ChaosStatusPayload.EventInfo> events() {
		return events;
	}

	public static int version() {
		return version;
	}

	@Nullable
	public static ChaosStatusPayload.EventInfo active(ChaosEventType type) {
		for (ChaosStatusPayload.EventInfo info : events) {
			if (info.type() == type.ordinal()) {
				return info;
			}
		}
		return null;
	}

	/** Remaining ticks in the current phase, interpolated since the last sync. */
	public static int remaining(ChaosStatusPayload.EventInfo info) {
		return info.waiting() ? info.remaining() : Math.max(0, info.remaining() - ticksSinceSync);
	}
}
