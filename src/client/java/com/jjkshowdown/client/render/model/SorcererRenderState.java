package com.jjkshowdown.client.render.model;

import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;

public class SorcererRenderState extends HumanoidRenderState {
	public CharacterType character = CharacterType.GOJO;
	public boolean heian;
	public boolean awakened;
}
