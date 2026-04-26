#ifdef GL_ES
precision highp float;
#endif

// ─── Built-ins provided by GlslCanvas ────────────────────────────────────────
uniform vec2  u_resolution;
uniform float u_time;

// ─── Shape uniforms — flattened (GlslCanvas does not support array uniforms) ──
uniform vec2  u_shape_center_0,  u_shape_center_1,  u_shape_center_2,  u_shape_center_3;
uniform vec2  u_shape_center_4,  u_shape_center_5,  u_shape_center_6,  u_shape_center_7;
uniform vec2  u_shape_center_8,  u_shape_center_9,  u_shape_center_10, u_shape_center_11;
uniform vec2  u_shape_center_12, u_shape_center_13, u_shape_center_14, u_shape_center_15;

uniform float u_shape_radius_0,  u_shape_radius_1,  u_shape_radius_2,  u_shape_radius_3;
uniform float u_shape_radius_4,  u_shape_radius_5,  u_shape_radius_6,  u_shape_radius_7;
uniform float u_shape_radius_8,  u_shape_radius_9,  u_shape_radius_10, u_shape_radius_11;
uniform float u_shape_radius_12, u_shape_radius_13, u_shape_radius_14, u_shape_radius_15;

uniform float u_shape_count;  
uniform float u_selected;
uniform float u_blend_k;

// ─── Helpers ──────────────────────────────────────────────────────────────────

float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Noise Functions ──────────────────────────────────────────────────────────

// 2D Random generator
float random(in vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// 2D Value Noise
float noise(in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    // Smooth Interpolation
    vec2 u = f * f * (3.0 - 2.0 * f);

    // Mix the 4 corners based on the smooth step
    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}

// Fractal Brownian Motion (Layers of noise for an organic feel)
float fbm(in vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    vec2 shift = vec2(100.0);
    // Rotate to reduce axial patterns
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
    for (int i = 0; i < 4; ++i) {
        value += amplitude * noise(st);
        st = rot * st * 2.0 + shift;
        amplitude *= 0.5;
    }
    return value;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

void main() {
    vec2 st = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;

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

    for (int i = 0; i < 16; i++) {
        if (float(i) >= u_shape_count) break;
        float d = sdCircle(st - gCenter[i], gRadius[i]);
        scene_dist = (u_blend_k > 0.0) ? smin(scene_dist, d, u_blend_k) : min(scene_dist, d);
        if (float(i) == u_selected) sel_dist = d;
    }
    
    // ── Generate Noise Data ───────────────────────────────────────────────────
    // We sample the fBM slightly offset by time so the noise evolves slowly
    float n1 = fbm(st * 3.0 + u_time * 0.2); 
    float n2 = fbm(st * 1.5 - u_time * 0.15);

    // ── Ripple bands (inside + outside) ──────────────────────────────────────
    float freq = 50.0;
    
    // INJECT NOISE INTO RIPPLES: We center the noise around 0 (-0.5 to 0.5) 
    // and multiply by a scale factor. We add this to the phase of the cosine.
    
    // temp remove the distortion function call for now 
    //float edge_distortion = (n1 - 0.5) * 2.5; 
    
    // Note: We use abs(scene_dist) to ensure pow() doesn't break on negative interior values
    //float band = smoothstep(0.0, 0.5, cos(pow(abs(scene_dist), 3.) * freq - u_time * 5.0 + edge_distortion));
    float band = smoothstep(0.0, 0.5, cos(pow(abs(scene_dist), 3.) * freq - u_time * 5.0 ));

    vec3 light_r_color = vec3(0.98, 0.91, 0.87);
    vec3 light_g_color = vec3(0.97, 1.0, 0.93);
    vec3 light_b_color = vec3(0.93, 0.94, 1.0);
    vec3 light_primary_color = vec3(1.0);

    // INJECT NOISE INTO COLOR MIX: We use the second noise function (n2) to 
    // offset the distance measurement used in the smoothstep mask.
    float color_distortion = (n2 - 0.5) * 1.5;
    float mask = smoothstep(0.3, 1.2, scene_dist + color_distortion);
    
    vec3 out_light_color = mix(light_primary_color, light_r_color, mask);
    out_light_color = mix(out_light_color, light_g_color, mask);
    out_light_color = mix(out_light_color, light_b_color, mask);
    vec3 out_dark_color  = vec3(0.0);

    vec3  in_light_color  = vec3(1.0);
    vec3 color;
    
    if (u_shape_count < 1.0) {
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