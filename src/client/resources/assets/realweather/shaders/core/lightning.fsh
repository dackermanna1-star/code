#version 330

#moj_import <minecraft:fog.glsl>
#moj_import <minecraft:dynamictransforms.glsl>

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec4 vertexColor;

out vec4 fragColor;

void main() {
    // Lightning is far brighter than its surroundings: haze dims it but never hides it completely.
    float fog = total_fog_value(sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd);
    float extinction = exp(-sphericalVertexDistance / 1600.0);
    fragColor = vertexColor * ColorModulator * mix(1.0, 0.3, fog) * extinction;
}
