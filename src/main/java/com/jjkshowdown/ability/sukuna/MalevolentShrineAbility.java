package com.jjkshowdown.ability.sukuna;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.gojo.UnlimitedVoidAbility;
import com.jjkshowdown.cinematic.CinematicType;
import com.jjkshowdown.domain.DomainManager;
import com.jjkshowdown.domain.DomainType;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.network.chat.Component;

/** Domain Expansion: Malevolent Shrine — an open domain without a barrier. */
public class MalevolentShrineAbility extends Ability {
	public MalevolentShrineAbility() {
		super("malevolent_shrine", CharacterType.SUKUNA, AbilitySlot.DOMAIN, Mode.INSTANT, 5, true, 850f, 1600, 0);
	}

	@Override
	public Component checkUse(CastContext ctx) {
		if (DomainManager.ownedBy(ctx.caster()) != null) return Component.translatable("message.jjkshowdown.domain_active");
		return null;
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		UnlimitedVoidAbility.expand(ctx, DomainType.MALEVOLENT_SHRINE, CinematicType.MALEVOLENT_SHRINE, VoiceLine.SUKUNA_DOMAIN, CastPose.HAND_SIGN_SHRINE);
	}
}
