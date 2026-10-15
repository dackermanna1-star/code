// GPU generator for the terrain layer texture arrays. Each layer is either baked procedurally (tileable noise
// recipes for grass, dry grass, forest floor, dirt, mud, rock, sand, gravel, plowed field) or blitted from PBR
// texture sets in public/assets/textures (albedo/normal/arm[/height]).
//
// Output encoding (RGBA8, no color-space conversion by the GPU):
//   albedo array: rgb = sRGB-encoded albedo, a = roughness
//   normal array: rg  = tangent-space normal xy (R → +X world/+u, G → +Z world/+v), b = AO, a = height

export const layerVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

export const layerFragment = /* glsl */ `
precision highp float;
uniform int uLayer;
uniform int uPass;      // 0 = albedo+roughness, 1 = normal+ao+height
uniform float uTexel;   // 1 / size
uniform int uSource;    // 0 = procedural, 1 = blit textures
uniform sampler2D tSrcAlbedo;
uniform sampler2D tSrcNormal;
uniform sampler2D tSrcArm;
uniform sampler2D tSrcHeight;
uniform int uHasHeight;
uniform int uHasArm;
uniform int uHasNormal;
varying vec2 vUv;

float hash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float pnoise( vec2 p, float P ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash12( mod( i, P ) ), b = hash12( mod( i + vec2( 1.0, 0.0 ), P ) );
  float c = hash12( mod( i + vec2( 0.0, 1.0 ), P ) ), d = hash12( mod( i + vec2( 1.0, 1.0 ), P ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
float pfbm( vec2 uv, float base, int oct, float gain ) {
  float s = 0.0, a = 0.5, n = 0.0, f = base;
  for ( int o = 0; o < 7; o ++ ) {
    if ( o >= oct ) break;
    s += a * pnoise( uv * f + float( o ) * 13.7, f );
    n += a;
    a *= gain;
    f *= 2.0;
  }
  return s / n;
}
// periodic Voronoi: x = F1 distance, y = cell id, z = F2 - F1 (edge distance)
vec3 pvoronoi( vec2 uv, float P ) {
  vec2 p = uv * P;
  vec2 i = floor( p ), f = fract( p );
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for ( int y = -1; y <= 1; y ++ )
    for ( int x = -1; x <= 1; x ++ ) {
      vec2 g = vec2( float( x ), float( y ) );
      vec2 c = mod( i + g, P );
      vec2 o = vec2( hash12( c ), hash12( c + 17.31 ) );
      vec2 r = g + o - f;
      float d = dot( r, r );
      if ( d < d1 ) { d2 = d1; d1 = d; id = hash12( c + 5.13 ); }
      else if ( d < d2 ) d2 = d;
    }
  return vec3( sqrt( d1 ), id, sqrt( d2 ) - sqrt( d1 ) );
}
float ridge( float n ) { n = 1.0 - abs( n * 2.0 - 1.0 ); return n * n; }

// Returns albedo (linear) in rgb, roughness in a; height in h.
vec4 layerSample( vec2 uv, out float h ) {
  vec3 col = vec3( 0.5 );
  float rough = 0.9;
  h = 0.5;
  if ( uLayer == 0 || uLayer == 1 ) {
    // grass / dry grass: soft multi-scale variation, dense fine blades, rare specks (3D grass covers it up close)
    float clump = pfbm( uv, 3.0, 3, 0.5 );
    float mid = pfbm( uv + 0.71, 12.0, 3, 0.5 );
    float fine = pfbm( uv + 0.37, 64.0, 2, 0.55 );
    vec3 vb = pvoronoi( uv + vec2( 0.0, pnoise( uv * 32.0, 32.0 ) * 0.04 ), 96.0 );
    float blade = 1.0 - smoothstep( 0.0, 0.5, vb.x );
    float spec = step( 0.965, vb.y );
    float t = clamp( fine * 0.45 + blade * 0.35 + mid * 0.3, 0.0, 1.0 );
    if ( uLayer == 0 ) {
      col = mix( vec3( 0.045, 0.075, 0.020 ), vec3( 0.105, 0.155, 0.040 ), t );
      col = mix( col, col * vec3( 1.18, 1.08, 0.75 ), smoothstep( 0.4, 0.8, clump ) * 0.5 );
      col = mix( col, vec3( 0.20, 0.18, 0.08 ), spec * 0.4 );
    } else {
      col = mix( vec3( 0.12, 0.11, 0.05 ), vec3( 0.25, 0.225, 0.11 ), t );
      col = mix( col, vec3( 0.09, 0.115, 0.04 ), smoothstep( 0.5, 0.8, clump ) * 0.45 );
      col = mix( col, vec3( 0.11, 0.09, 0.055 ), spec * 0.5 );
    }
    h = clamp( blade * 0.5 + fine * 0.3 + mid * 0.2, 0.0, 1.0 );
    rough = 0.88 + 0.08 * fine;
  } else if ( uLayer == 2 ) {
    // forest floor: needles, leaves, twigs, moss
    vec3 lv = pvoronoi( uv, 22.0 );
    vec3 nd = pvoronoi( uv * vec2( 1.0, 1.0 ) + 0.5, 70.0 );
    float n = pfbm( uv, 8.0, 4, 0.55 );
    float moss = smoothstep( 0.55, 0.7, pfbm( uv + 3.1, 4.0, 3, 0.5 ) );
    col = mix( vec3( 0.050, 0.034, 0.020 ), vec3( 0.17, 0.11, 0.06 ), n );
    col = mix( col, mix( vec3( 0.20, 0.10, 0.04 ), vec3( 0.12, 0.09, 0.05 ), lv.y ), step( 0.55, lv.y ) * ( 1.0 - smoothstep( 0.3, 0.45, lv.x ) ) * 0.6 );
    float needles = smoothstep( 0.06, 0.0, nd.z );
    col = mix( col, vec3( 0.22, 0.14, 0.07 ), needles * 0.5 );
    float twig = smoothstep( 0.035, 0.0, abs( pnoise( uv * vec2( 6.0, 30.0 ), 30.0 ) - 0.5 ) ) * step( 0.6, pnoise( uv * 9.0, 9.0 ) );
    col = mix( col, vec3( 0.09, 0.06, 0.035 ), twig );
    col = mix( col, vec3( 0.05, 0.09, 0.025 ), moss * 0.7 );
    h = clamp( n * 0.5 + needles * 0.25 + twig * 0.3 + moss * 0.15, 0.0, 1.0 );
    rough = 0.86;
  } else if ( uLayer == 3 ) {
    // dirt with pebbles and small cracks
    float n = pfbm( uv, 6.0, 5, 0.55 );
    vec3 pb = pvoronoi( uv, 34.0 );
    float pebble = step( 0.72, pb.y ) * smoothstep( 0.35, 0.15, pb.x );
    float crack = smoothstep( 0.03, 0.0, pvoronoi( uv + 0.21, 7.0 ).z ) * smoothstep( 0.45, 0.6, n );
    col = mix( vec3( 0.13, 0.095, 0.06 ), vec3( 0.27, 0.205, 0.13 ), n );
    col = mix( col, vec3( 0.30, 0.27, 0.22 ) * ( 0.7 + 0.5 * pb.y ), pebble );
    col *= 1.0 - crack * 0.45;
    h = clamp( n * 0.6 + pebble * ( 0.35 - pb.x ) * 1.5 - crack * 0.3, 0.0, 1.0 );
    rough = 0.9;
  } else if ( uLayer == 4 ) {
    // mud: dark, wet, with glossy puddles
    float n = pfbm( uv, 5.0, 5, 0.55 );
    float puddle = smoothstep( 0.38, 0.3, n );
    col = mix( vec3( 0.06, 0.045, 0.03 ), vec3( 0.15, 0.115, 0.075 ), n );
    col *= 1.0 - puddle * 0.35;
    h = n * ( 1.0 - puddle );
    rough = mix( 0.55, 0.08, puddle );
  } else if ( uLayer == 5 ) {
    // rock: warped strata, irregular multi-scale cracks, lichen; low regularity so it does not read as tiles
    vec2 w = vec2( pfbm( uv + 1.3, 3.0, 3, 0.5 ), pfbm( uv + 5.1, 3.0, 3, 0.5 ) ) - 0.5;
    vec2 wu = uv + w * 0.18;
    float n = pfbm( wu, 4.0, 6, 0.55 );
    float strata = ridge( pnoise( vec2( wu.x * 2.0, wu.y * 10.0 + n * 4.0 ), 10.0 ) );
    vec3 cr = pvoronoi( wu, 5.0 );
    vec3 cr2 = pvoronoi( wu + 0.37, 13.0 );
    float crack = smoothstep( 0.035, 0.0, cr.z ) * smoothstep( 0.35, 0.65, pnoise( wu * 9.0, 9.0 ) );
    crack = max( crack, smoothstep( 0.02, 0.0, cr2.z ) * 0.5 * smoothstep( 0.5, 0.7, n ) );
    float lichen = smoothstep( 0.6, 0.72, pfbm( uv + 7.7, 10.0, 3, 0.5 ) );
    col = mix( vec3( 0.085, 0.082, 0.075 ), vec3( 0.24, 0.23, 0.21 ), n * 0.75 + strata * 0.25 );
    col = mix( col, col * vec3( 1.06, 1.0, 0.92 ), cr.y * 0.4 );
    col *= 1.0 - crack * 0.45;
    col = mix( col, vec3( 0.22, 0.23, 0.12 ), lichen * 0.5 );
    h = clamp( n * 0.65 + strata * 0.3 - crack * 0.3 + 0.05, 0.0, 1.0 );
    rough = 0.82 - lichen * 0.05;
  } else if ( uLayer == 6 ) {
    // sand: fine grain + wind ripples
    float n = pfbm( uv, 4.0, 3, 0.5 );
    float grain = pnoise( uv * 256.0, 256.0 );
    float rip = sin( ( uv.y * 18.0 + pfbm( uv, 3.0, 2, 0.5 ) * 2.0 ) * 6.2831853 ) * 0.5 + 0.5;
    col = mix( vec3( 0.27, 0.23, 0.155 ), vec3( 0.43, 0.37, 0.26 ), n * 0.6 + grain * 0.25 + rip * 0.15 );
    h = clamp( rip * 0.6 + n * 0.3 + grain * 0.1, 0.0, 1.0 );
    rough = 0.95;
  } else if ( uLayer == 7 ) {
    // gravel: packed stones
    vec3 v = pvoronoi( uv, 30.0 );
    vec3 v2 = pvoronoi( uv + 0.5, 64.0 );
    float stone = smoothstep( 0.0, 0.18, v.z );
    float small = smoothstep( 0.0, 0.2, v2.z ) * 0.5;
    vec3 sc = mix( vec3( 0.16, 0.15, 0.135 ), vec3( 0.38, 0.36, 0.32 ), v.y );
    sc = mix( sc, vec3( 0.30, 0.24, 0.17 ), step( 0.8, v.y ) * 0.6 );
    col = mix( vec3( 0.07, 0.06, 0.05 ), sc, stone );
    col = mix( col, col * ( 0.85 + 0.3 * v2.y ), small );
    h = clamp( stone * ( 1.0 - v.x * 0.6 ) * 0.8 + small * 0.2, 0.0, 1.0 );
    rough = 0.85;
  } else {
    // plowed field: furrows + clods
    float n = pfbm( uv, 6.0, 4, 0.55 );
    float furrow = sin( ( uv.x * 10.0 + n * 0.15 ) * 6.2831853 ) * 0.5 + 0.5;
    vec3 cl = pvoronoi( uv, 40.0 );
    float clod = smoothstep( 0.0, 0.25, cl.z ) * 0.5;
    col = mix( vec3( 0.075, 0.05, 0.03 ), vec3( 0.21, 0.15, 0.09 ), furrow * 0.6 + n * 0.4 );
    col *= 0.85 + 0.3 * cl.y * clod;
    h = clamp( furrow * 0.7 + clod * 0.3, 0.0, 1.0 );
    rough = 0.95;
  }
  return vec4( col, rough );
}

vec3 linearToSrgb( vec3 c ) {
  return mix( c * 12.92, 1.055 * pow( max( c, 0.0 ), vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
}

void main() {
  vec2 uv = vUv;
  if ( uSource == 1 ) {
    // blit an asset texture set
    if ( uPass == 0 ) {
      vec3 a = texture2D( tSrcAlbedo, uv ).rgb; // raw sRGB values
      float r = uHasArm == 1 ? texture2D( tSrcArm, uv ).g : 0.9;
      gl_FragColor = vec4( a, r );
    } else {
      vec2 n = uHasNormal == 1 ? texture2D( tSrcNormal, uv ).rg : vec2( 0.5 );
      float ao = uHasArm == 1 ? texture2D( tSrcArm, uv ).r : 1.0;
      float hh = uHasHeight == 1 ? texture2D( tSrcHeight, uv ).r : dot( texture2D( tSrcAlbedo, uv ).rgb, vec3( 0.33 ) );
      gl_FragColor = vec4( n, ao, hh );
    }
    return;
  }
  float h;
  vec4 s = layerSample( uv, h );
  if ( uPass == 0 ) {
    gl_FragColor = vec4( linearToSrgb( s.rgb ), s.a );
  } else {
    float e = uTexel;
    float hx0, hx1, hz0, hz1;
    layerSample( uv - vec2( e, 0.0 ), hx0 );
    layerSample( uv + vec2( e, 0.0 ), hx1 );
    layerSample( uv - vec2( 0.0, e ), hz0 );
    layerSample( uv + vec2( 0.0, e ), hz1 );
    // bump strength per layer (grass is soft; rock/gravel strong), scaled with resolution
    float ls = uLayer <= 1 ? 0.35 : uLayer == 2 ? 0.6 : uLayer == 3 ? 0.7 : uLayer == 4 ? 0.5 : uLayer == 6 ? 0.45 : uLayer == 8 ? 0.8 : 1.0;
    float k = 0.012 / e * ls;
    vec3 n = normalize( vec3( ( hx0 - hx1 ) * k * 0.5, ( hz0 - hz1 ) * k * 0.5, 1.0 ) );
    float ao = clamp( 0.55 + h * 0.6 - ( ( hx0 + hx1 + hz0 + hz1 ) * 0.25 - h ) * 2.0, 0.35, 1.0 );
    gl_FragColor = vec4( n.xy * 0.5 + 0.5, ao, h );
  }
}
`;
