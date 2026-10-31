package com.jjkshowdown.network;

import com.jjkshowdown.JjkShowdown;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * All custom packets. C2S = client to server, S2C = server to client.
 */
public final class Payloads {
	private Payloads() {
	}

	private static <T extends CustomPacketPayload> CustomPacketPayload.Type<T> typeOf(String name) {
		return new CustomPacketPayload.Type<>(JjkShowdown.id(name));
	}

	// ============================================ C2S ============================================

	public record SelectCharacter(int character) implements CustomPacketPayload {
		public static final Type<SelectCharacter> TYPE = typeOf("select_character");
		public static final StreamCodec<RegistryFriendlyByteBuf, SelectCharacter> CODEC =
				StreamCodec.composite(ByteBufCodecs.VAR_INT, SelectCharacter::character, SelectCharacter::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	public record AbilityInput(int slot, boolean pressed) implements CustomPacketPayload {
		public static final Type<AbilityInput> TYPE = typeOf("ability_input");
		public static final StreamCodec<RegistryFriendlyByteBuf, AbilityInput> CODEC =
				StreamCodec.composite(ByteBufCodecs.VAR_INT, AbilityInput::slot, ByteBufCodecs.BOOL, AbilityInput::pressed, AbilityInput::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Movement/defence actions. {@code x}/{@code z} carry the local input direction (strafe, forward). */
	public record CombatAction(int action, float x, float z) implements CustomPacketPayload {
		public static final int DODGE = 0, DOUBLE_JUMP = 1, BLOCK_START = 2, BLOCK_END = 3, HOVER_START = 4, HOVER_END = 5;
		public static final Type<CombatAction> TYPE = typeOf("combat_action");
		public static final StreamCodec<RegistryFriendlyByteBuf, CombatAction> CODEC = StreamCodec.composite(
				ByteBufCodecs.VAR_INT, CombatAction::action, ByteBufCodecs.FLOAT, CombatAction::x, ByteBufCodecs.FLOAT, CombatAction::z, CombatAction::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	public record QteResponse(int qteId, int presses, int elapsedTicks) implements CustomPacketPayload {
		public static final Type<QteResponse> TYPE = typeOf("qte_response");
		public static final StreamCodec<RegistryFriendlyByteBuf, QteResponse> CODEC = StreamCodec.composite(
				ByteBufCodecs.VAR_INT, QteResponse::qteId, ByteBufCodecs.VAR_INT, QteResponse::presses, ByteBufCodecs.VAR_INT, QteResponse::elapsedTicks, QteResponse::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	public record CinematicSkip(int sessionId) implements CustomPacketPayload {
		public static final Type<CinematicSkip> TYPE = typeOf("cinematic_skip");
		public static final StreamCodec<RegistryFriendlyByteBuf, CinematicSkip> CODEC =
				StreamCodec.composite(ByteBufCodecs.VAR_INT, CinematicSkip::sessionId, CinematicSkip::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Client-side preferences the server needs to respect. */
	public record ClientSettings(boolean qteEnabled, boolean cinematicsEnabled, boolean autoSkipCinematics) implements CustomPacketPayload {
		public static final Type<ClientSettings> TYPE = typeOf("client_settings");
		public static final StreamCodec<RegistryFriendlyByteBuf, ClientSettings> CODEC = StreamCodec.composite(
				ByteBufCodecs.BOOL, ClientSettings::qteEnabled, ByteBufCodecs.BOOL, ClientSettings::cinematicsEnabled,
				ByteBufCodecs.BOOL, ClientSettings::autoSkipCinematics, ClientSettings::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Single-player/op request to apply an edited common config. Carries the JSON. */
	public record ApplyConfig(String json) implements CustomPacketPayload {
		public static final Type<ApplyConfig> TYPE = typeOf("apply_config");
		public static final StreamCodec<RegistryFriendlyByteBuf, ApplyConfig> CODEC =
				StreamCodec.composite(ByteBufCodecs.stringUtf8(262144), ApplyConfig::json, ApplyConfig::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	// ============================================ S2C ============================================

	/** Full sorcerer HUD state for the owning player. */
	public record SorcererSync(int character, int mastery, float xp, float xpNext, float energy, float maxEnergy, int fingers,
			int flags, int burnout, int burnoutTotal, int chargeSlot, int chargeTicks, int maxCharge, int combo, int comboTicks,
			int stagger, int unlockedMask, int[] cooldowns, int[] cooldownTotals, int counterTicks, int zoneTicks) implements CustomPacketPayload {
		public static final int F_INFINITY = 1, F_AMPLIFICATION = 2, F_BLOCKING = 4, F_RCT = 8, F_HOVER = 16, F_ZONE = 32,
				F_COUNTER = 64, F_BURNOUT = 128, F_OVERLOADED = 256, F_IN_DOMAIN = 512, F_LOCKED = 1024, F_CREATIVE_UNLOCK = 2048;
		public static final Type<SorcererSync> TYPE = typeOf("sorcerer_sync");
		public static final StreamCodec<RegistryFriendlyByteBuf, SorcererSync> CODEC = StreamCodec.of((buf, p) -> {
			buf.writeVarInt(p.character);
			buf.writeVarInt(p.mastery);
			buf.writeFloat(p.xp);
			buf.writeFloat(p.xpNext);
			buf.writeFloat(p.energy);
			buf.writeFloat(p.maxEnergy);
			buf.writeVarInt(p.fingers);
			buf.writeVarInt(p.flags);
			buf.writeVarInt(p.burnout);
			buf.writeVarInt(p.burnoutTotal);
			buf.writeVarInt(p.chargeSlot + 1);
			buf.writeVarInt(p.chargeTicks);
			buf.writeVarInt(p.maxCharge);
			buf.writeVarInt(p.combo);
			buf.writeVarInt(p.comboTicks);
			buf.writeVarInt(p.stagger);
			buf.writeVarInt(p.unlockedMask);
			buf.writeVarInt(p.cooldowns.length);
			for (int i = 0; i < p.cooldowns.length; i++) {
				buf.writeVarInt(p.cooldowns[i]);
				buf.writeVarInt(p.cooldownTotals[i]);
			}
			buf.writeVarInt(p.counterTicks);
			buf.writeVarInt(p.zoneTicks);
		}, buf -> {
			int character = buf.readVarInt();
			int mastery = buf.readVarInt();
			float xp = buf.readFloat();
			float xpNext = buf.readFloat();
			float energy = buf.readFloat();
			float maxEnergy = buf.readFloat();
			int fingers = buf.readVarInt();
			int flags = buf.readVarInt();
			int burnout = buf.readVarInt();
			int burnoutTotal = buf.readVarInt();
			int chargeSlot = buf.readVarInt() - 1;
			int chargeTicks = buf.readVarInt();
			int maxCharge = buf.readVarInt();
			int combo = buf.readVarInt();
			int comboTicks = buf.readVarInt();
			int stagger = buf.readVarInt();
			int unlocked = buf.readVarInt();
			int n = Math.min(buf.readVarInt(), 32);
			int[] cd = new int[n];
			int[] cdt = new int[n];
			for (int i = 0; i < n; i++) {
				cd[i] = buf.readVarInt();
				cdt[i] = buf.readVarInt();
			}
			int counter = buf.readVarInt();
			int zone = buf.readVarInt();
			return new SorcererSync(character, mastery, xp, xpNext, energy, maxEnergy, fingers, flags, burnout, burnoutTotal,
					chargeSlot, chargeTicks, maxCharge, combo, comboTicks, stagger, unlocked, cd, cdt, counter, zone);
		});

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Visual state of any sorcerer entity, sent to everyone tracking it. */
	public record EntityVisual(int entityId, int character, int flags, int pose, int poseTicks, int poseDuration, int chargeSlot)
			implements CustomPacketPayload {
		public static final Type<EntityVisual> TYPE = typeOf("entity_visual");
		public static final StreamCodec<RegistryFriendlyByteBuf, EntityVisual> CODEC = StreamCodec.composite(
				ByteBufCodecs.VAR_INT, EntityVisual::entityId, ByteBufCodecs.VAR_INT, EntityVisual::character,
				ByteBufCodecs.VAR_INT, EntityVisual::flags, ByteBufCodecs.VAR_INT, EntityVisual::pose,
				ByteBufCodecs.VAR_INT, EntityVisual::poseTicks, ByteBufCodecs.VAR_INT, EntityVisual::poseDuration,
				ByteBufCodecs.INT, EntityVisual::chargeSlot, EntityVisual::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	public record Cinematic(int sessionId, int cinematic, int anchorId, int targetId, int duration, int variant) implements CustomPacketPayload {
		public static final Type<Cinematic> TYPE = typeOf("cinematic");
		public static final StreamCodec<RegistryFriendlyByteBuf, Cinematic> CODEC = StreamCodec.composite(
				ByteBufCodecs.VAR_INT, Cinematic::sessionId, ByteBufCodecs.VAR_INT, Cinematic::cinematic,
				ByteBufCodecs.INT, Cinematic::anchorId, ByteBufCodecs.INT, Cinematic::targetId,
				ByteBufCodecs.VAR_INT, Cinematic::duration, ByteBufCodecs.VAR_INT, Cinematic::variant, Cinematic::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	public record CinematicEnd(int sessionId) implements CustomPacketPayload {
		public static final Type<CinematicEnd> TYPE = typeOf("cinematic_end");
		public static final StreamCodec<RegistryFriendlyByteBuf, CinematicEnd> CODEC =
				StreamCodec.composite(ByteBufCodecs.VAR_INT, CinematicEnd::sessionId, CinematicEnd::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/**
	 * Start a quick-time event. {@code key}: 0 = dodge, 1 = attack, 2 = domain, 3 = ultimate, 4 = jump.
	 * {@code kind}: 0 = press, 1 = mash, 2 = timing.
	 */
	public record QteStart(int qteId, int kind, int key, int duration, int presses, int sweetStart, int sweetEnd, String label)
			implements CustomPacketPayload {
		public static final Type<QteStart> TYPE = typeOf("qte_start");
		public static final StreamCodec<RegistryFriendlyByteBuf, QteStart> CODEC = StreamCodec.composite(
				ByteBufCodecs.VAR_INT, QteStart::qteId, ByteBufCodecs.VAR_INT, QteStart::kind, ByteBufCodecs.VAR_INT, QteStart::key,
				ByteBufCodecs.VAR_INT, QteStart::duration, ByteBufCodecs.VAR_INT, QteStart::presses, ByteBufCodecs.VAR_INT, QteStart::sweetStart,
				ByteBufCodecs.VAR_INT, QteStart::sweetEnd, ByteBufCodecs.STRING_UTF8, QteStart::label, QteStart::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** {@code outcome}: 0 success, 1 partial, 2 fail, 3 cancelled. */
	public record QteEnd(int qteId, int outcome) implements CustomPacketPayload {
		public static final Type<QteEnd> TYPE = typeOf("qte_end");
		public static final StreamCodec<RegistryFriendlyByteBuf, QteEnd> CODEC =
				StreamCodec.composite(ByteBufCodecs.VAR_INT, QteEnd::qteId, ByteBufCodecs.VAR_INT, QteEnd::outcome, QteEnd::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	public record ScreenEffect(int effect, float intensity, int duration, int color) implements CustomPacketPayload {
		public static final int SHAKE = 0, FLASH = 1, BLACK_FLASH = 2, VIGNETTE = 3, INVERT = 4, IMPACT_FRAME = 5, SLOW_MO = 6;
		public static final Type<ScreenEffect> TYPE = typeOf("screen_effect");
		public static final StreamCodec<RegistryFriendlyByteBuf, ScreenEffect> CODEC = StreamCodec.composite(
				ByteBufCodecs.VAR_INT, ScreenEffect::effect, ByteBufCodecs.FLOAT, ScreenEffect::intensity,
				ByteBufCodecs.VAR_INT, ScreenEffect::duration, ByteBufCodecs.INT, ScreenEffect::color, ScreenEffect::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	public record Voice(int entityId, int line) implements CustomPacketPayload {
		public static final Type<Voice> TYPE = typeOf("voice");
		public static final StreamCodec<RegistryFriendlyByteBuf, Voice> CODEC =
				StreamCodec.composite(ByteBufCodecs.INT, Voice::entityId, ByteBufCodecs.VAR_INT, Voice::line, Voice::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Domain clash meter. balance in [-1,1] (positive favours domain A), integrity = barrier integrity of A or B (UV). */
	public record Clash(int domainA, int domainB, float balance, float integrity, int ticksLeft, boolean active, int charA, int charB)
			implements CustomPacketPayload {
		public static final Type<Clash> TYPE = typeOf("clash");
		public static final StreamCodec<RegistryFriendlyByteBuf, Clash> CODEC = StreamCodec.composite(
				ByteBufCodecs.INT, Clash::domainA, ByteBufCodecs.INT, Clash::domainB, ByteBufCodecs.FLOAT, Clash::balance,
				ByteBufCodecs.FLOAT, Clash::integrity, ByteBufCodecs.VAR_INT, Clash::ticksLeft, ByteBufCodecs.BOOL, Clash::active,
				ByteBufCodecs.VAR_INT, Clash::charA, ByteBufCodecs.VAR_INT, Clash::charB, Clash::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** HUD notification. kind: 0 info, 1 warning, 2 big centre callout (e.g. "BLACK FLASH"), 3 level-up, 4 unlock. */
	public record Notify(int kind, Component message, int color) implements CustomPacketPayload {
		public static final int INFO = 0, WARN = 1, CALLOUT = 2, LEVEL_UP = 3, UNLOCK = 4;
		public static final Type<Notify> TYPE = typeOf("notify");
		public static final StreamCodec<RegistryFriendlyByteBuf, Notify> CODEC = StreamCodec.composite(
				ByteBufCodecs.VAR_INT, Notify::kind, ComponentSerialization.STREAM_CODEC, Notify::message, ByteBufCodecs.INT, Notify::color, Notify::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	public record OpenSelection(boolean firstTime) implements CustomPacketPayload {
		public static final Type<OpenSelection> TYPE = typeOf("open_selection");
		public static final StreamCodec<RegistryFriendlyByteBuf, OpenSelection> CODEC =
				StreamCodec.composite(ByteBufCodecs.BOOL, OpenSelection::firstTime, OpenSelection::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Combo hit feedback for the attacker's HUD (Black Flash timing ring). Times are in ticks from now. */
	public record ComboEvent(int combo, int step, int bfOpenIn, int bfLength, boolean blackFlash) implements CustomPacketPayload {
		public static final Type<ComboEvent> TYPE = typeOf("combo_event");
		public static final StreamCodec<RegistryFriendlyByteBuf, ComboEvent> CODEC = StreamCodec.composite(
				ByteBufCodecs.VAR_INT, ComboEvent::combo, ByteBufCodecs.VAR_INT, ComboEvent::step, ByteBufCodecs.VAR_INT, ComboEvent::bfOpenIn,
				ByteBufCodecs.VAR_INT, ComboEvent::bfLength, ByteBufCodecs.BOOL, ComboEvent::blackFlash, ComboEvent::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}

	/** Server gameplay values the client needs for HUD and input timing, plus permission to edit config. */
	public record ConfigSync(String commonJson, boolean canEdit) implements CustomPacketPayload {
		public static final Type<ConfigSync> TYPE = typeOf("config_sync");
		public static final StreamCodec<RegistryFriendlyByteBuf, ConfigSync> CODEC = StreamCodec.composite(
				ByteBufCodecs.stringUtf8(262144), ConfigSync::commonJson, ByteBufCodecs.BOOL, ConfigSync::canEdit, ConfigSync::new);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}
}
