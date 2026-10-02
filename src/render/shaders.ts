// Geometry is supplied in room-image pixels (origin top-left) plus a depth value
// (0..1, larger = nearer) used to order overlapping patches of one surface.
export const vertexShader = /* glsl */ `#version 300 es
in vec3 a_pos;
in vec2 a_uv;
uniform vec2 u_size;
out vec2 v_img;
out vec2 v_uv;
void main() {
  v_img = a_pos.xy;
  v_uv = a_uv;
  vec2 clip = a_pos.xy / u_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 1.0 - 2.0 * a_pos.z, 1.0);
}`

export const photoFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_img;
uniform vec2 u_size;
uniform sampler2D u_photo;
out vec4 outColor;
void main() {
  outColor = vec4(texture(u_photo, v_img / u_size).rgb, 1.0);
}`

const common = /* glsl */ `
float idMatch(sampler2D ids, vec2 uv, vec3 color) {
  vec3 c = texture(ids, uv).rgb;
  return step(distance(c, color), 0.09);
}
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
`

/**
 * Projects the material onto a patch, tiles it at real-world scale with the
 * selection's scale/rotation/offset, masks it to the surface (4-tap coverage on
 * the id map for anti-aliased edges) and relights it:
 *  - with a shading map: exact, colour = tonemap(albedo × irradiance)
 *  - without: luminance of the photo relative to the surface's average.
 */
export const surfaceFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_img;
in vec2 v_uv;
uniform vec2 u_size;
uniform sampler2D u_photo;
uniform sampler2D u_shading;
uniform sampler2D u_ids;
uniform sampler2D u_material;
uniform vec3 u_idColor;
uniform bool u_useHomography;
uniform mat3 u_toUnit;
uniform vec2 u_patchCm;
uniform vec2 u_tileCm;
uniform bool u_stretch;
uniform float u_scale;
uniform float u_rotation;
uniform vec2 u_offsetCm;
uniform bool u_hasShading;
uniform float u_baseLum;
uniform float u_gloss;
out vec4 outColor;
${common}
void main() {
  vec2 p = v_img;
  float cov = 0.0;
  cov += idMatch(u_ids, (p + vec2(-0.25, -0.25)) / u_size, u_idColor);
  cov += idMatch(u_ids, (p + vec2(0.25, -0.25)) / u_size, u_idColor);
  cov += idMatch(u_ids, (p + vec2(-0.25, 0.25)) / u_size, u_idColor);
  cov += idMatch(u_ids, (p + vec2(0.25, 0.25)) / u_size, u_idColor);
  cov *= 0.25;
  if (cov <= 0.0) discard;

  vec2 uv = v_uv;
  if (u_useHomography) {
    vec3 q = u_toUnit * vec3(p, 1.0);
    uv = q.xy / q.z;
  }
  float c = cos(u_rotation), s = sin(u_rotation);
  mat2 rot = mat2(c, -s, s, c);
  vec2 tc;
  if (u_stretch) {
    vec2 t = (uv - 0.5) * u_patchCm;
    t = rot * t / u_scale;
    tc = t / u_patchCm + 0.5 - u_offsetCm / u_patchCm;
  } else {
    vec2 cm = uv * u_patchCm - u_offsetCm;
    tc = (rot * cm) / (u_scale * u_tileCm);
  }
  vec3 material = toLinear(texture(u_material, tc).rgb);

  vec3 color;
  if (u_hasShading) {
    vec3 sh = texture(u_shading, p / u_size).rgb;
    vec3 E = 4.0 * sh * sh;
    vec3 lit = material * E;
    // Glossy finishes catch a little extra light where the room is brightest.
    lit += u_gloss * 0.06 * E * E;
    color = toSrgb(aces(lit));
  } else {
    vec3 photo = toLinear(texture(u_photo, p / u_size).rgb);
    float lum = dot(photo, vec3(0.2126, 0.7152, 0.0722));
    float shade = lum / max(u_baseLum, 1e-3);
    vec3 lit = material * min(shade, 1.0);
    float highlight = max(shade - 1.0, 0.0);
    lit += highlight * mix(material, vec3(1.0), 0.25 + 0.5 * u_gloss) * (0.6 + u_gloss);
    color = toSrgb(lit);
  }
  outColor = vec4(color, cov);
}`

/** Hover tint, selection outline and optional dimming of everything else. */
export const overlayFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_img;
uniform vec2 u_size;
uniform sampler2D u_ids;
uniform vec3 u_hover;
uniform vec3 u_selected;
uniform bool u_hasHover;
uniform bool u_hasSelected;
uniform float u_outlinePx;
uniform vec3 u_outlineColor;
uniform float u_dim;
out vec4 outColor;
${common}
void main() {
  vec2 p = v_img;
  vec2 uv = p / u_size;
  float inSel = u_hasSelected ? idMatch(u_ids, uv, u_selected) : 0.0;
  float inHover = u_hasHover ? idMatch(u_ids, uv, u_hover) : 0.0;

  float selEdge = 0.0, hoverEdge = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 d = vec2(cos(a), sin(a));
    for (int k = 1; k <= 2; k++) {
      vec2 q = (p + d * u_outlinePx * float(k) * 0.5) / u_size;
      if (u_hasSelected) selEdge = max(selEdge, abs(inSel - idMatch(u_ids, q, u_selected)));
      if (u_hasHover) hoverEdge = max(hoverEdge, abs(inHover - idMatch(u_ids, q, u_hover)));
    }
  }

  vec4 c = vec4(0.0);
  if (u_hasSelected && inSel < 0.5) c = vec4(0.0, 0.0, 0.0, u_dim);
  if (inSel > 0.5) c = vec4(u_outlineColor, 0.07);
  if (inHover > 0.5 && inSel < 0.5) c = vec4(1.0, 1.0, 1.0, 0.16);
  if (hoverEdge > 0.5 && inSel < 0.5) c = vec4(1.0, 1.0, 1.0, 0.85);
  if (selEdge > 0.5) c = vec4(u_outlineColor, 1.0);
  outColor = c;
}`
