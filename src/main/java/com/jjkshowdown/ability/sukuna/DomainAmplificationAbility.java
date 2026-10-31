package com.jjkshowdown.ability.sukuna;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.util.Fx;

/**
 * Domain Amplification: fill the body with an incomplete domain that neutralises techniques on contact. Lets
 * Sukuna's strikes pass through Infinity and blunts domain sure-hits, but his innate technique is unusable meanwhile.
 */
public class DomainAmplificationAbility extends Ability {
	public DomainAmplificationAbility() {
		super("domain_amplification", CharacterType.SUKUNA, AbilitySlot.TOGGLE, Mode.TOGGLE, 2, false, 40f, 20, 0);
	}

	@Override
	public boolean isToggledOn(SorcererState s) {
		return s.amplification;
	}

	@Override
	public void setToggled(SorcererState s, boolean on) {
		s.amplification = on;
	}

	@Override
	public void onToggle(CastContext ctx, boolean on) {
		if (on) {
			Fx.sound(ctx.caster(), ModSounds.AMPLIFICATION_ON, 1.2f, 1.0f);
			Fx.particles(ctx.level(), ModParticles.CE_WISP_RED, ctx.caster().position().add(0, 1, 0), 24, 0.4, 0.7, 0.4, 0.04);
			Casting.pose(ctx, CastPose.AMPLIFY, 12);
		} else {
			Fx.sound(ctx.caster(), ModSounds.AMPLIFICATION_ON, 0.6f, 1.5f);
		}
	}

	@Override
	public boolean toggleTick(CastContext ctx) {
		return CursedEnergy.spend(ctx.caster(), cost(ctx.caster()) * 0.035f);
	}
}
