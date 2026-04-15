#ifdef GL_ES
precision highp float;
#endif

uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_time;

float sdCircle( in vec2 p, in float r )
{
    return length(p)-r;
}

void main()
{
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 st = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    vec2 m = (2.0 * u_mouse - u_resolution.xy) / u_resolution.y;
    vec3 circle_color = vec3(0.85);
    vec3 bg_color = vec3(0.35);

    vec2 trace_m = st - m;
    float dist = sdCircle(trace_m, 0.5);

    // coloring
    vec3 color = (dist > 0.0) ? bg_color : circle_color;
    color *= 0.8 + 0.2 * cos(dist * 150.);

    gl_FragColor = vec4(color, 1.0);
}