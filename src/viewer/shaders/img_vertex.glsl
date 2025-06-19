uniform vec2 img_aspect_offset;
uniform vec2 img_aspect_scaling;
uniform vec2 imgAlt_aspect_offset;
uniform vec2 imgAlt_aspect_scaling;

out vec2 board_uv;
out vec2 boardAlt_uv;

void main() {
	board_uv = (uv.xy - img_aspect_offset) / img_aspect_scaling;
	boardAlt_uv = (uv.xy - imgAlt_aspect_offset) / imgAlt_aspect_scaling; 
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
