package com.chaosunleashed.core;

import com.chaosunleashed.events.alien.AlienInvasionEvent;
import com.chaosunleashed.events.blackhole.BlackHoleEvent;
import com.chaosunleashed.events.bloodmoon.BloodMoonEvent;
import com.chaosunleashed.events.eclipse.EclipseEvent;
import com.chaosunleashed.events.kaiju.KaijuAttackEvent;
import com.chaosunleashed.events.gravityflip.GravityFlipEvent;
import com.chaosunleashed.events.rift.DimensionRiftEvent;
import com.chaosunleashed.events.solarflare.SolarFlareEvent;
import com.chaosunleashed.events.stampede.HerdStampedeEvent;
import com.chaosunleashed.registry.ModItems;
import net.minecraft.item.Item;
import net.minecraft.item.Items;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import org.jetbrains.annotations.Nullable;

import java.util.Locale;
import java.util.function.Function;
import java.util.function.Supplier;

/** Every world event in the mod. The order here is the order shown in menus and the Control Panel. */
public enum ChaosEventType {
	ALIEN_INVASION("alien_invasion", "Alien Invasion", "☄", 0x55FF55, TimeRequirement.NONE, false,
		() -> ModItems.PLASMA_PISTOL, AlienInvasionEvent::new,
		"UFOs abduct animals and drop alien soldiers. Shoot them down for alien tech!"),
	BLOOD_MOON("blood_moon", "Blood Moon", "☾", 0xFF3333, TimeRequirement.NIGHT, true,
		() -> Items.ZOMBIE_HEAD, BloodMoonEvent::new,
		"Zombie apocalypse: the moon bleeds, zombies swarm and break in. Survive until sunrise."),
	KAIJU_ATTACK("kaiju_attack", "Kaiju Attack", "♜", 0x33AA66, TimeRequirement.NONE, false,
		() -> ModItems.KAIJU_HEART, KaijuAttackEvent::new,
		"A 100-block monster stomps across the land. Hit its glowing weak points!"),
	BLACK_HOLE("black_hole", "Black Hole", "◉", 0xAA55FF, TimeRequirement.NONE, false,
		() -> ModItems.STABILIZER_CORE, BlackHoleEvent::new,
		"A growing singularity devours everything. Throw a Stabilizer Core in or surround it with beacons."),
	SOLAR_FLARE("solar_flare", "Solar Flare", "☀", 0xFFAA00, TimeRequirement.DAY, true,
		() -> Items.BLAZE_POWDER, SolarFlareEvent::new,
		"The sun scorches anyone without a roof and knocks out all redstone."),
	GRAVITY_FLIP("gravity_flip", "Gravity Flip", "⇅", 0x55FFFF, TimeRequirement.NONE, false,
		() -> Items.FEATHER, GravityFlipEvent::new,
		"Everything floats upward for a minute... then crashes back down."),
	ECLIPSE("eclipse", "Eclipse", "◐", 0x8888AA, TimeRequirement.DAY, true,
		() -> Items.ENDER_EYE, EclipseEvent::new,
		"The sun goes dark. Monsters and Shade Stalkers hunt in the false night."),
	DIMENSION_RIFT("dimension_rift", "Dimension Rift", "✦", 0xFF55FF, TimeRequirement.NONE, false,
		() -> ModItems.RIFT_SHARD, DimensionRiftEvent::new,
		"A crack in the sky converts the land into the Nether or the End."),
	HERD_STAMPEDE("herd_stampede", "Herd Stampede", "♞", 0xC08040, TimeRequirement.NONE, false,
		() -> ModItems.BISON_SPAWN_EGG, HerdStampedeEvent::new,
		"Hundreds of animals charge across the land, trampling everything.");

	public enum TimeRequirement {
		NONE, DAY, NIGHT
	}

	private final String id;
	private final String displayName;
	private final String symbol;
	private final int color;
	private final TimeRequirement timeRequirement;
	private final boolean needsSky;
	private final Supplier<Item> icon;
	private final Function<EventContext, ChaosEvent> factory;
	private final String description;

	ChaosEventType(String id, String displayName, String symbol, int color, TimeRequirement timeRequirement, boolean needsSky,
				   Supplier<Item> icon, Function<EventContext, ChaosEvent> factory, String description) {
		this.id = id;
		this.displayName = displayName;
		this.symbol = symbol;
		this.color = color;
		this.timeRequirement = timeRequirement;
		this.needsSky = needsSky;
		this.icon = icon;
		this.factory = factory;
		this.description = description;
	}

	public String id() {
		return this.id;
	}

	public String displayName() {
		return this.displayName;
	}

	public String symbol() {
		return this.symbol;
	}

	public int color() {
		return this.color;
	}

	public TimeRequirement timeRequirement() {
		return this.timeRequirement;
	}

	public boolean needsSky() {
		return this.needsSky;
	}

	public Item icon() {
		return this.icon.get();
	}

	public String description() {
		return this.description;
	}

	public ChaosEvent create(EventContext context) {
		return this.factory.apply(context);
	}

	/** "☄ Alien Invasion" in the event's color. */
	public MutableText coloredName() {
		return Text.literal(this.symbol + " " + this.displayName).styled(style -> style.withColor(this.color));
	}

	public MutableText plainName() {
		return Text.literal(this.displayName).styled(style -> style.withColor(this.color));
	}

	@Nullable
	public static ChaosEventType byId(String id) {
		String normalized = id.toLowerCase(Locale.ROOT).replace('-', '_');
		if (normalized.equals("zombie_apocalypse")) {
			return BLOOD_MOON;
		}
		if (normalized.equals("kaiju")) {
			return KAIJU_ATTACK;
		}
		if (normalized.equals("stampede")) {
			return HERD_STAMPEDE;
		}
		for (ChaosEventType type : values()) {
			if (type.id.equals(normalized)) {
				return type;
			}
		}
		return null;
	}

	@Nullable
	public static ChaosEventType byOrdinal(int ordinal) {
		ChaosEventType[] values = values();
		return ordinal >= 0 && ordinal < values.length ? values[ordinal] : null;
	}
}
