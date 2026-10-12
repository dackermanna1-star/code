package com.chaosunleashed.core;

import com.chaosunleashed.registry.ModParticles;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.text.Text;
import net.minecraft.util.math.ColorHelper;
import net.minecraft.util.math.MathHelper;
import net.minecraft.world.MoonPhase;
import net.minecraft.world.World;
import net.minecraft.world.attribute.AmbientParticle;
import net.minecraft.world.attribute.BedRule;
import net.minecraft.world.attribute.EnvironmentAttributes;
import net.minecraft.world.attribute.WorldEnvironmentAttributeAccess;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * Hooks Chaos events into Minecraft 1.21.11's environment attribute system (sky color, fog, light, stars,
 * moon phase, "monsters burn", bed rules, ambient particles...). The modifiers are added to every world (client and
 * server) by {@code WorldEnvironmentAttributeAccessMixin} and read the current event strengths each tick:
 * on the server from the {@link ChaosEventManager}, on the client from the synced client state.
 */
public final class ChaosEnvironment {
	/** Effect strengths for one world. */
	public interface Source {
		/** 0..1 visual strength of the event in this world (0 when not running). */
		float strength(ChaosEventType type);

		/** Event-specific value (e.g. eclipse coverage, rift dimension: 0 = nether, 1 = end). */
		float value(ChaosEventType type);
	}

	public static final Source NONE = new Source() {
		@Override
		public float strength(ChaosEventType type) {
			return 0.0F;
		}

		@Override
		public float value(ChaosEventType type) {
			return 0.0F;
		}
	};

	/** Set by the client entrypoint. */
	public static Function<World, Source> clientProvider = world -> NONE;

	private static final BedRule BLOOD_MOON_BEDS = new BedRule(BedRule.Condition.NEVER, BedRule.Condition.ALWAYS, false,
		Optional.of(Text.literal("You can't sleep during a Blood Moon!")));

	private ChaosEnvironment() {
	}

	public static Source get(World world) {
		return world.isClient() ? clientProvider.apply(world) : serverSource(world);
	}

	private static Source serverSource(World world) {
		ChaosEventManager manager = ChaosEventManager.get();
		if (manager == null || manager.activeEvents().isEmpty()) {
			return NONE;
		}
		return new Source() {
			@Override
			public float strength(ChaosEventType type) {
				ChaosEvent event = manager.getActive(type);
				if (event == null || event.world() != world) {
					return 0.0F;
				}
				return phaseStrength(event.phase(), event.phaseTicks(), event.phaseLength(), event.isWaitingForTime());
			}

			@Override
			public float value(ChaosEventType type) {
				ChaosEvent event = manager.getActive(type);
				return event == null || event.world() != world ? 0.0F : event.clientValue();
			}
		};
	}

	/**
	 * Shared visual curve: the warning phase builds up to 35%, the active phase reaches full strength within
	 * 5 seconds, the aftermath fades out.
	 */
	public static float phaseStrength(EventPhase phase, int ticks, int length, boolean waiting) {
		float progress = length <= 0 ? 1.0F : MathHelper.clamp(ticks / (float) length, 0.0F, 1.0F);
		return switch (phase) {
			case WARNING -> waiting ? 0.1F : 0.35F * progress;
			case ACTIVE -> MathHelper.clamp(0.35F + 0.65F * ticks / 100.0F, 0.35F, 1.0F);
			case AFTERMATH -> MathHelper.clamp(1.0F - progress * 1.25F, 0.0F, 1.0F);
			case END -> 0.0F;
		};
	}

	private static int lerp(int from, int to, float delta) {
		if (delta <= 0.0F) {
			return from;
		}
		return ColorHelper.lerp(Math.min(delta, 1.0F), from, to);
	}

	/** Eclipse darkness: driven by the server-computed coverage value. */
	private static float eclipse(Source source) {
		return source.strength(ChaosEventType.ECLIPSE) > 0.0F ? MathHelper.clamp(source.value(ChaosEventType.ECLIPSE), 0.0F, 1.0F) : 0.0F;
	}

	private static int riftColor(Source source) {
		return source.value(ChaosEventType.DIMENSION_RIFT) > 0.5F ? 0xFF3A1050 : 0xFF6A1808;
	}

	public static void addModifiers(WorldEnvironmentAttributeAccess.Builder builder, World world) {
		builder.timeBased(EnvironmentAttributes.SKY_COLOR_VISUAL, (color, time) -> {
			Source s = get(world);
			int c = color;
			c = lerp(c, 0xFF8A0A0A, s.strength(ChaosEventType.BLOOD_MOON) * 0.9F);
			c = lerp(c, 0xFFFF9A30, s.strength(ChaosEventType.SOLAR_FLARE) * 0.8F);
			c = lerp(c, 0xFF2A0A3A, s.strength(ChaosEventType.BLACK_HOLE) * 0.35F);
			c = lerp(c, riftColor(s), s.strength(ChaosEventType.DIMENSION_RIFT) * 0.45F);
			c = lerp(c, 0xFF40C080, s.strength(ChaosEventType.ALIEN_INVASION) * 0.2F);
			c = lerp(c, 0xFF04040A, eclipse(s) * 0.95F);
			return c;
		});
		builder.timeBased(EnvironmentAttributes.FOG_COLOR_VISUAL, (color, time) -> {
			Source s = get(world);
			int c = color;
			c = lerp(c, 0xFF600808, s.strength(ChaosEventType.BLOOD_MOON) * 0.9F);
			c = lerp(c, 0xFFFFB050, s.strength(ChaosEventType.SOLAR_FLARE) * 0.8F);
			c = lerp(c, riftColor(s), s.strength(ChaosEventType.DIMENSION_RIFT) * 0.4F);
			c = lerp(c, 0xFF8A6A48, s.strength(ChaosEventType.HERD_STAMPEDE) * 0.3F);
			c = lerp(c, 0xFF050508, eclipse(s) * 0.95F);
			return c;
		});
		builder.timeBased(EnvironmentAttributes.FOG_START_DISTANCE_VISUAL, (distance, time) -> {
			Source s = get(world);
			float d = distance;
			d = MathHelper.lerp(s.strength(ChaosEventType.BLOOD_MOON) * 0.9F, d, 0.0F);
			d = MathHelper.lerp(s.strength(ChaosEventType.SOLAR_FLARE) * 0.5F, d, Math.min(d, 16.0F));
			return d;
		});
		builder.timeBased(EnvironmentAttributes.FOG_END_DISTANCE_VISUAL, (distance, time) -> {
			Source s = get(world);
			float d = distance;
			d = MathHelper.lerp(s.strength(ChaosEventType.BLOOD_MOON) * 0.85F, d, Math.min(d, 56.0F));
			d = MathHelper.lerp(s.strength(ChaosEventType.SOLAR_FLARE) * 0.6F, d, Math.min(d, 120.0F));
			d = MathHelper.lerp(s.strength(ChaosEventType.HERD_STAMPEDE) * 0.4F, d, Math.min(d, 96.0F));
			d = MathHelper.lerp(eclipse(s) * 0.6F, d, Math.min(d, 96.0F));
			return d;
		});
		builder.timeBased(EnvironmentAttributes.CLOUD_COLOR_VISUAL, (color, time) -> {
			Source s = get(world);
			int c = color;
			c = lerp(c, 0xFF701010, s.strength(ChaosEventType.BLOOD_MOON) * 0.8F);
			c = lerp(c, 0xFFFFC070, s.strength(ChaosEventType.SOLAR_FLARE) * 0.7F);
			c = lerp(c, 0xFF101018, eclipse(s) * 0.9F);
			return c;
		});
		builder.timeBased(EnvironmentAttributes.SKY_LIGHT_COLOR_VISUAL, (color, time) -> {
			Source s = get(world);
			int c = color;
			c = lerp(c, 0xFFFF5040, s.strength(ChaosEventType.BLOOD_MOON) * 0.8F);
			c = lerp(c, 0xFFFFC080, s.strength(ChaosEventType.SOLAR_FLARE) * 0.6F);
			c = lerp(c, riftColor(s), s.strength(ChaosEventType.DIMENSION_RIFT) * 0.25F);
			c = lerp(c, 0xFF7070A0, eclipse(s) * 0.7F);
			return c;
		});
		builder.timeBased(EnvironmentAttributes.SKY_LIGHT_FACTOR_VISUAL, (factor, time) -> {
			Source s = get(world);
			float f = factor;
			f = MathHelper.lerp(eclipse(s) * 0.92F, f, 0.04F);
			f = MathHelper.lerp(s.strength(ChaosEventType.SOLAR_FLARE) * 0.5F, f, 1.0F);
			return MathHelper.clamp(f, 0.0F, 1.0F);
		});
		builder.timeBased(EnvironmentAttributes.STAR_BRIGHTNESS_VISUAL, (brightness, time) -> {
			Source s = get(world);
			float b = Math.max(brightness, eclipse(s) * 0.7F);
			b = MathHelper.lerp(s.strength(ChaosEventType.BLOOD_MOON) * 0.6F, b, b * 0.3F);
			return MathHelper.clamp(b, 0.0F, 1.0F);
		});
		builder.timeBased(EnvironmentAttributes.MOON_PHASE_VISUAL, (phase, time) ->
			get(world).strength(ChaosEventType.BLOOD_MOON) > 0.01F ? MoonPhase.FULL_MOON : phase);
		builder.timeBased(EnvironmentAttributes.SKY_LIGHT_LEVEL_GAMEPLAY, (level, time) ->
			MathHelper.lerp(eclipse(get(world)), level, Math.min(level, 4.0F)));
		builder.timeBased(EnvironmentAttributes.MONSTERS_BURN_GAMEPLAY, (burn, time) ->
			eclipse(get(world)) > 0.3F ? Boolean.FALSE : burn);
		builder.timeBased(EnvironmentAttributes.BED_RULE_GAMEPLAY, (rule, time) ->
			get(world).strength(ChaosEventType.BLOOD_MOON) > 0.0F ? BLOOD_MOON_BEDS : rule);
		builder.timeBased(EnvironmentAttributes.AMBIENT_PARTICLES_VISUAL, (particles, time) -> {
			Source s = get(world);
			float blood = s.strength(ChaosEventType.BLOOD_MOON);
			float flare = s.strength(ChaosEventType.SOLAR_FLARE);
			float rift = s.strength(ChaosEventType.DIMENSION_RIFT);
			float dark = eclipse(s);
			if (blood <= 0.0F && flare <= 0.0F && rift <= 0.0F && dark <= 0.0F) {
				return particles;
			}
			List<AmbientParticle> list = new ArrayList<>(particles);
			if (blood > 0.0F) {
				list.add(new AmbientParticle(ModParticles.BLOOD_MIST, 0.004F * blood));
			}
			if (flare > 0.0F) {
				list.add(new AmbientParticle(ModParticles.EMBER, 0.006F * flare));
			}
			if (rift > 0.0F) {
				list.add(new AmbientParticle(s.value(ChaosEventType.DIMENSION_RIFT) > 0.5F ? ParticleTypes.REVERSE_PORTAL : ParticleTypes.WHITE_ASH,
					0.01F * rift));
			}
			if (dark > 0.0F) {
				list.add(new AmbientParticle(ModParticles.SHADOW_WISP, 0.002F * dark));
			}
			return list;
		});
	}
}
