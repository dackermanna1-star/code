#version 330

#moj_import <minecraft:globals.glsl>

// Heat distortion: the image is refracted by a few layers of rising sine waves. The effect is strongest in the
// lower part of the screen (heat rising off the ground) and fades towards the edges.

uniform sampler2D InSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 InSize;
};

layout(std140) uniform HeatConfig {
    float Strength;
};

in vec2 texCoord;

out vec4 fragColor;

void main() {
    float time = GameTime * 1200.0;
    vec2 uv = texCoord;
    float vertical = 0.35 + 0.65 * smoothstep(1.0, 0.2, uv.y);
    float edges = smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x) * smoothstep(0.0, 0.06, uv.y) * smoothstep(1.0, 0.94, uv.y);
    float weight = Strength * vertical * edges;
    float w1 = sin(uv.y * 70.0 - time * 9.0) * cos(uv.x * 31.0 + time * 4.3);
    float w2 = sin(uv.y * 133.0 - time * 13.0 + uv.x * 21.0);
    float w3 = sin(uv.y * 41.0 - time * 5.7 + sin(uv.x * 9.0 + time));
    vec2 offset = vec2(w1 * 0.5 + w2 * 0.3 + w3 * 0.2, (w2 - w1) * 0.3 + w3 * 0.15) * weight * 0.005;
    vec3 color = texture(InSampler, uv + offset).rgb;
    color += vec3(0.018, 0.007, 0.0) * weight;
    fragColor = vec4(color, 1.0);
}
