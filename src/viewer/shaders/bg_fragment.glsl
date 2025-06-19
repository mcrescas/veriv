in vec2 checkerUv;

void main() {
	vec3 darkGray = vec3(0.5, 0.5, 0.5);
	vec3 lightGray = vec3(0.55, 0.55, 0.55);
	vec3 checker = mod(floor(checkerUv.x) + floor(checkerUv.y), 2.0) == 0.0 ? darkGray : lightGray;
	gl_FragColor = vec4(checker, 1.0);
}

