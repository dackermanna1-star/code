package com.jjkshowdown.ability.gojo;

import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.CastContext;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.cinematic.CinematicType;
import com.jjkshowdown.cinematic.Cinematics;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.domain.DomainManager;
import com.jjkshowdown.domain.DomainType;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.LivingEntity;

/** Domain Expansion: Unlimited Void. */
public class UnlimitedVoidAbility extends Ability {
	public UnlimitedVoidAbility() {
		super("unlimited_void", CharacterType.GOJO, AbilitySlot.DOMAIN, Mode.INSTANT, 5, true, 850f, 1600, 0);
	}

	@Override
	public Component checkUse(CastContext ctx) {
		if (DomainManager.ownedBy(ctx.caster()) != null) return Component.translatable("message.jjkshowdown.domain_active");
		return null;
	}

	@Override
	public void cast(CastContext ctx, int chargeTicks) {
		expand(ctx, DomainType.UNLIMITED_VOID, CinematicType.UNLIMITED_VOID, VoiceLine.GOJO_DOMAIN, CastPose.HAND_SIGN_VOID);
	}

	/** Shared domain activation flow (also used by Malevolent Shrine). */
	public static DomainEntity expand(CastContext ctx, DomainType type, CinematicType cinematic, VoiceLine line, CastPose pose) {
		LivingEntity caster = ctx.caster();
		int form = JjkConfig.get().cinematics.enabled ? Cinematics.duration(cinematic) : 16;
		DomainEntity d = DomainEntity.create(ctx.level(), caster, type, form);
		ctx.level().addFreshEntity(d);
		DomainManager.register(d);
		Casting.pose(ctx, pose, form + 10);
		Casting.voice(ctx, line, 1.0f);
		LivingEntity target = ctx.target(type.radius());
		Cinematics.play(ctx.level(), cinematic, caster, target, () -> d.hurryForming(10));
		return d;
	}
}
