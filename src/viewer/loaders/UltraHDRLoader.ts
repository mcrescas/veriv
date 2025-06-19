import {
	Loader,
	HalfFloatType,
	FloatType,
	LinearSRGBColorSpace,
	DataTexture,
	ClampToEdgeWrapping,
	LinearFilter,
} from 'three';

import { HDRJPGLoader } from '@monogrid/gainmap-js';

// From: https://gist.github.com/mfirmin/456e1c6dcf7b0e1bda6e940add32adad
function float16ToNumber(input: number) {
	// Create a 32 bit DataView to store the input
	const arr = new ArrayBuffer(4);
	const dv = new DataView(arr);

	// Set the Float16 into the last 16 bits of the dataview
	// So our dataView is [00xx]
	dv.setUint16(2, input, false);

	// Get all 32 bits as a 32 bit integer
	// (JS bitwise operations are performed on 32 bit signed integers)
	const asInt32 = dv.getInt32(0, false);

	// All bits aside from the sign
	let rest = asInt32 & 0x7fff;
	// Sign bit
	let sign = asInt32 & 0x8000;
	// Exponent bits
	const exponent = asInt32 & 0x7c00;

	// Shift the non-sign bits into place for a 32 bit Float
	rest <<= 13;
	// Shift the sign bit into place for a 32 bit Float
	sign <<= 16;

	// Adjust bias
	// https://en.wikipedia.org/wiki/Half-precision_floating-point_format#Exponent_encoding
	rest += 0x38000000;
	// Denormals-as-zero
	rest = (exponent === 0 ? 0 : rest);
	// Re-insert sign bit
	rest |= sign;

	// Set the adjusted float32 (stored as int32) back into the dataview
	dv.setInt32(0, rest, false);

	// Get it back out as a float32 (which js will convert to a Number)
	const asFloat32 = dv.getFloat32(0, false);

	return asFloat32;
}

class UltraHDRLoader extends Loader {

	type: number;
	inner_loader: any;

	constructor( manager = undefined ) {

		super( manager );
		this.type = HalfFloatType;
		this.inner_loader = new HDRJPGLoader();
	}

	setDataType( value: any ) {

		this.type = value;
		return this;

	}


	load( url: any, onLoad: any, onProgress: any, onError: any ) {
		this.inner_loader.load( url, ( result: any ) => {
			const old_texture = result.toDataTexture();
			const uint16 = old_texture.source.data.data;
			let texture_data;
			if (this.type === FloatType) {
				texture_data = new Float32Array( uint16.length );
				for ( let i = 0; i < uint16.length; i ++ ) {
					texture_data[ i ] = float16ToNumber( uint16[ i ] );
				}
			} else {
				texture_data = uint16;
			}

			// Parse to local THREE DataTexture
			const texture = new DataTexture();

			texture.image.width = old_texture.source.data.width;
			texture.image.height = old_texture.source.data.height;
			texture.image.data = old_texture.source.data.data;

			texture.wrapS = ClampToEdgeWrapping;
			texture.wrapT = ClampToEdgeWrapping;

			texture.magFilter = LinearFilter;
			texture.minFilter = LinearFilter;

			texture.anisotropy = 1;

			// texture.encoding = LinearSRGBColorSpace;
			texture.colorSpace = LinearSRGBColorSpace;
			texture.flipY = old_texture.flipY;
			texture.format = old_texture.format;
			texture.type = old_texture.type;

			texture.generateMipmaps = false;
			texture.needsUpdate = true;

			onLoad( texture, { data: texture_data } );
		}, onProgress, onError );
	}
}

export { UltraHDRLoader };
