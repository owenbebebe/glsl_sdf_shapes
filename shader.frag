#ifdef GL_ES
precision highp float;
#endif

// ─── Built-ins provided by GlslCanvas ────────────────────────────────────────
uniform vec2  u_resolution;
uniform float u_time;

// ─── Shape uniforms — flattened (GlslCanvas does not support array uniforms) ──
// Each slot:  u_shape_center_N (vec2)  u_shape_radius_N (float, -1 = inactive)
// Active range: [0, u_shape_count)   Selected index: u_selected (-1 = none)
uniform vec2  u_shape_center_0,  u_shape_center_1,  u_shape_center_2,  u_shape_center_3;
uniform vec2  u_shape_center_4,  u_shape_center_5,  u_shape_center_6,  u_shape_center_7;
uniform vec2  u_shape_center_8,  u_shape_center_9,  u_shape_center_10, u_shape_center_11;
uniform vec2  u_shape_center_12, u_shape_center_13, u_shape_center_14, u_shape_center_15;

uniform float u_shape_radius_0,  u_shape_radius_1,  u_shape_radius_2,  u_shape_radius_3;
uniform float u_shape_radius_4,  u_shape_radius_5,  u_shape_radius_6,  u_shape_radius_7;
uniform float u_shape_radius_8,  u_shape_radius_9,  u_shape_radius_10, u_shape_radius_11;
uniform float u_shape_radius_12, u_shape_radius_13, u_shape_radius_14, u_shape_radius_15;

uniform float u_shape_count;  // number of active shapes (0-16)
uniform float u_selected;     // array-index of selected shape, -1 = none
uniform float u_blend_k;      // smooth-union blend radius (0 = hard union)

// ─── Helpers ──────────────────────────────────────────────────────────────────

float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

// Polynomial smooth-minimum (Inigo Quilez).
// k controls the blend radius: larger k → wider, softer merge.
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

void main() {
    vec2 st = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;

    // ── Populate shape arrays (local — GLSL ES 1.00 forbids global mutable arrays) ──
    vec2  gCenter[16];
    float gRadius[16];
    gCenter[0]  = u_shape_center_0;  gRadius[0]  = u_shape_radius_0;
    gCenter[1]  = u_shape_center_1;  gRadius[1]  = u_shape_radius_1;
    gCenter[2]  = u_shape_center_2;  gRadius[2]  = u_shape_radius_2;
    gCenter[3]  = u_shape_center_3;  gRadius[3]  = u_shape_radius_3;
    gCenter[4]  = u_shape_center_4;  gRadius[4]  = u_shape_radius_4;
    gCenter[5]  = u_shape_center_5;  gRadius[5]  = u_shape_radius_5;
    gCenter[6]  = u_shape_center_6;  gRadius[6]  = u_shape_radius_6;
    gCenter[7]  = u_shape_center_7;  gRadius[7]  = u_shape_radius_7;
    gCenter[8]  = u_shape_center_8;  gRadius[8]  = u_shape_radius_8;
    gCenter[9]  = u_shape_center_9;  gRadius[9]  = u_shape_radius_9;
    gCenter[10] = u_shape_center_10; gRadius[10] = u_shape_radius_10;
    gCenter[11] = u_shape_center_11; gRadius[11] = u_shape_radius_11;
    gCenter[12] = u_shape_center_12; gRadius[12] = u_shape_radius_12;
    gCenter[13] = u_shape_center_13; gRadius[13] = u_shape_radius_13;
    gCenter[14] = u_shape_center_14; gRadius[14] = u_shape_radius_14;
    gCenter[15] = u_shape_center_15; gRadius[15] = u_shape_radius_15;

    // ── Palette ──────────────────────────────────────────────────────────────
    vec3 bg_color    = vec3(0.10, 0.10, 0.12);
    vec3 fill_color  = vec3(0.80, 0.80, 0.84);
    vec3 sel_tint    = vec3(0.28, 0.62, 1.00);
    vec3 outline_col = vec3(0.18, 0.52, 1.00);

    float scene_dist = 1e9;
    float sel_dist   = 1e9;

    // ── Evaluate all shapes ───────────────────────────────────────────────────
    // GLSL 1.00: loop index must be constant → use literal 16 and early-out
    for (int i = 0; i < 16; i++) {
        if (float(i) >= u_shape_count) break;
        float d = sdCircle(st - gCenter[i], gRadius[i]);
        // Use smooth-min when a blend radius is set, hard min otherwise
        scene_dist = (u_blend_k > 0.0) ? smin(scene_dist, d, u_blend_k) : min(scene_dist, d);
        if (float(i) == u_selected) sel_dist = d;
    }

    // ── Ripple bands (inside + outside) ──────────────────────────────────────
    // cos(d * freq) produces continuous concentric rings that cross the
    // shape boundary seamlessly — negative d inside, positive outside.
    // step(0.0, cos(...)) snaps the gradient to hard alternating bands,
    // matching the graphic poster look in the reference image.
    float freq      = 50.0;                         // band frequency
    float band      = smoothstep(0.0, 0.5, cos(pow(scene_dist, 3.) * freq - u_time * 5.0));

    vec3  light_r_color = vec3(1.0, 0.62, 0.44);
    vec3 light_g_color = vec3(0.87, 1.0, 0.67);
    vec3 light_b_color = vec3(0.69, 0.72, 0.88);
    vec3 light_primary_color = vec3(1.0);
    vec3  out_light_color = vec3(1.0);
    vec3  out_dark_color  = vec3(0.0, 0.07, 0.05);

    // Inside palette: sky blue / deep blue
    vec3  in_light_color  = vec3(0.38, 0.72, 0.95);
    vec3  in_dark_color   = vec3(0.18, 0.40, 0.75);
    vec3 color;
    if (u_shape_count < 1.0) {
        // No shapes placed yet — show neutral background
        color = bg_color;
    } else if (scene_dist > 0.0) {
        color = mix(out_dark_color, out_light_color, band);
    } else {
        color = in_light_color;
    }

    // ── Selection outline ─────────────────────────────────────────────────────
    if (u_selected >= 0.0) {
        float outline_w  = 0.010;
        float outline_aa = 0.003;
        float edge  = abs(sel_dist) - outline_w * 0.5;
        float alpha = 1.0 - smoothstep(0.0, outline_aa, edge);
        color = mix(color, outline_col, alpha * 0.92);
    }

    // ── Soft vignette ─────────────────────────────────────────────────────────
    vec2 uv_n = gl_FragCoord.xy / u_resolution.xy - 0.5;
    float vig = 1.0 - dot(uv_n, uv_n) * 1.6;
    color *= clamp(vig, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}
