package com.jjkshowdown.client.render.model;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.entity.boss.SukunaBoss;
import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
import net.minecraft.resources.Identifier;

/** Renders the rival bosses with their skins, glowing eyes and technique auras. */
public class SorcererBossRenderer extends HumanoidMobRenderer<SorcererBoss, SorcererRenderState, SorcererModel> {
	public static final Identifier GOJO = JjkShowdown.id("textures/entity/gojo.png");
	public static final Identifier SUKUNA = JjkShowdown.id("textures/entity/sukuna.png");
	public static final Identifier HEIAN = JjkShowdown.id("textures/entity/sukuna_heian.png");

	public SorcererBossRenderer(EntityRendererProvider.Context ctx) {
		super(ctx, new SorcererModel(ctx.bakeLayer(SorcererModel.LAYER)), 0.5f);
		addLayer(new EmissiveLayer<>(this, false));
		addLayer(new TechniqueAuraLayer<>(this));
	}

	@Override
	public SorcererRenderState createRenderState() {
		return new SorcererRenderState();
	}

	@Override
	public void extractRenderState(SorcererBoss boss, SorcererRenderState s, float partial) {
		super.extractRenderState(boss, s, partial);
		s.character = boss.character();
		s.heian = boss instanceof SukunaBoss sb && sb.isHeianForm();
		s.awakened = boss.character() == CharacterType.GOJO && boss.phase() >= 2;
	}

	@Override
	public Identifier getTextureLocation(SorcererRenderState s) {
		if (s.character == CharacterType.GOJO) return GOJO;
		return s.heian ? HEIAN : SUKUNA;
	}
}
