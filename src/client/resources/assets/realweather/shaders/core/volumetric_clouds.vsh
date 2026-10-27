#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:projection.glsl>
#moj_import <realweather:rw_clouds_ubo.glsl>

in vec3 Position;

out vec3 rayEnd;

void main() {
    vec3 pos = mix(BoxMin.xyz, BoxMax.xyz, Position * 0.5 + 0.5);
    rayEnd = pos;
    gl_Position = ProjMat * ModelViewMat * vec4(pos, 1.0);
}
