uniform vec2 pixelSize;
uniform vec2 checkerSize;
out vec2 checkerUv;

void main() {
	checkerUv = position.xy / (pixelSize * checkerSize);
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
