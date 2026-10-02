// Wood family: planks, bark (log sides / stems) and end grain (log tops).
Mat material(vec2 uv) {
  int v = uVariant;
  if (v == V_PLANKS) return planks(uv, uC[0], uC[1], uC[2], uC[3], uP[0], 40.0);
  if (v == V_BARK) return bark(uv, uC[0], uC[1], uC[2], uC[3], uC[4], uC[5], uP[0], uP[1], 50.0);
  if (v == V_LOG_TOP) return logTop(uv, uC[0], uC[1], uC[2], uC[3], uC[4], uC[5], uP[0], 60.0);
  return missingTex(uv);
}
