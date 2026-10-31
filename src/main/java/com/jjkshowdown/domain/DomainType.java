package com.jjkshowdown.domain;

import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.network.chat.Component;

public enum DomainType {
	/** Closed domain: barrier dome + void floor. Sure-hit: infinite information (paralysis). */
	UNLIMITED_VOID("unlimited_void", CharacterType.GOJO, 0x8FE6FF, true, 1.06f),
	/** Open domain without a barrier: enormous radius, sure-hit Dismantle/Cleave on everything. */
	MALEVOLENT_SHRINE("malevolent_shrine", CharacterType.SUKUNA, 0xD0182E, false, 1.0f);

	public final String id;
	public final CharacterType owner;
	public final int color;
	public final boolean hasBarrier;
	/** Intrinsic refinement used in clashes. */
	public final float refinement;

	DomainType(String id, CharacterType owner, int color, boolean hasBarrier, float refinement) {
		this.id = id;
		this.owner = owner;
		this.color = color;
		this.hasBarrier = hasBarrier;
		this.refinement = refinement;
	}

	public float radius() {
		JjkConfig.Domains d = JjkConfig.get().domains;
		return this == UNLIMITED_VOID ? d.unlimitedVoidRadius : d.malevolentShrineRadius;
	}

	public Component displayName() {
		return Component.translatable("domain.jjkshowdown." + id);
	}

	public static DomainType byOrdinal(int i) {
		DomainType[] v = values();
		return i >= 0 && i < v.length ? v[i] : UNLIMITED_VOID;
	}

	public static DomainType of(CharacterType c) {
		return c == CharacterType.SUKUNA ? MALEVOLENT_SHRINE : UNLIMITED_VOID;
	}
}
