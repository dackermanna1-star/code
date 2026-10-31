package com.jjkshowdown.ability.gojo;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.util.Fx;

/**
 * Limitless: Infinity. An infinite series between Gojo and everything approaching him: attacks and projectiles slow
 * to a stop and never connect. Neutralised by Domain Amplification, domain sure-hits and the World-Cutting Slash.
 */
public class InfinityAbility extends Ability {
	public InfinityAbility() {
		super("infinity", CharacterType.GOJO, AbilitySlot.TOGGLE, Mode.TOGGLE, 1, true, 40f, 10, 0);
	}

	/** Upkeep per tick (already reduced by the Six Eyes through {@link #cost}). */
	public float upkeep(CastContext ctx) {
		return cost(ctx.caster()) * 0.022f;
	}

	@Override
	public boolean isToggledOn(SorcererState s) {
		return s.infinity;
	}

	@Override
	public void setToggled(SorcererState s, boolean on) {
		s.infinity = on;
	}

	@Override
	public void onToggle(CastContext ctx, boolean on) {
		Fx.sound(ctx.caster(), on ? ModSounds.INFINITY_ON : ModSounds.INFINITY_OFF, 1.0f, 1.0f);
		if (on) {
			Fx.particles(ctx.level(), ModParticles.BLUE_SPARK, ctx.caster().position().add(0, 1, 0), 20, 0.6, 0.02);
			Casting.voice(ctx, VoiceLine.GOJO_INFINITY, 0.25f);
		}
	}

	@Override
	public boolean toggleTick(CastContext ctx) {
		return CursedEnergy.spend(ctx.caster(), upkeep(ctx));
	}
}
