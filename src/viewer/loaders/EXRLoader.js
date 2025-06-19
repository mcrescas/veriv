import {
	DataTextureLoader,
	DataUtils,
	FloatType,
	HalfFloatType,
	LinearSRGBColorSpace,
	LinearFilter,
	RedFormat,
	RGFormat,
	RGBFormat,
	RGBAFormat,
	LinearMipmapLinearFilter,
	ClampToEdgeWrapping,
	DataTexture,
	FileLoader
} from 'three';

import { parseEXR } from './ext/exr_parser.js';

class EXRLoader extends DataTextureLoader {

	constructor( manager ) {
		super( manager );
		this.type = HalfFloatType;
	}

	setDataType( value ) {
		this.type = value;
		return this;
	}

	load( url, onLoad, onProgress, onError ) {
		const loader = new FileLoader(this.manager);
		loader.setResponseType('arraybuffer');
		loader.setRequestHeader(this.requestHeader);
		loader.setPath(this.path);
		loader.setWithCredentials(this.withCredentials);
		loader.load(url, (buffer) => {
			// Parse data from the file
			// const texData = this.parse(buffer);
			const texData = parseEXR(buffer, this.type, {
				DataUtils: DataUtils,
				FloatType: FloatType,
				HalfFloatType: HalfFloatType,
				LinearEncoding: LinearSRGBColorSpace,
				RGBAFormat: RGBAFormat,
				RedFormat: RedFormat,
			});
			const textures = [];

			if (!texData) return;

			// Create the textures of the groups
			for (let i = 0; i < texData.image_channels.length; i++) {
				const texture = new DataTexture();

				texture.image.width = texData.width;
				texture.image.height = texData.height;
				texture.image.data = texData.image_channels[i].data;

				texture.wrapS = texData.wrapS !== undefined ? texData.wrapS : ClampToEdgeWrapping;
				texture.wrapT = texData.wrapT !== undefined ? texData.wrapT : ClampToEdgeWrapping;

				texture.magFilter = texData.magFilter !== undefined ? texData.magFilter : LinearFilter;
				texture.minFilter = texData.minFilter !== undefined ? texData.minFilter : LinearFilter;

				texture.anisotropy = texData.anisotropy !== undefined ? texData.anisotropy : 1;

				if (texData.encoding !== undefined) {

					texture.encoding = texData.encoding;

				}

				if (texData.flipY !== undefined) {

					texture.flipY = texData.flipY;

				}

				if (texData.format !== undefined) {

					texture.format = texData.format;

				}

				if (texData.type !== undefined) {

					texture.type = texData.type;

				}

				if (texData.mipmaps !== undefined) {

					texture.mipmaps = texData.mipmaps;
					texture.minFilter = LinearMipmapLinearFilter; // presumably...

				}

				if (texData.mipmapCount === 1) {

					texture.minFilter = LinearFilter;

				}

				if (texData.generateMipmaps !== undefined) {

					texture.generateMipmaps = texData.generateMipmaps;

				}

				texture.needsUpdate = true;

				// Specific EXR loader
				// texture.encoding = texData.encoding;
				texture.minFilter = LinearFilter;
				texture.magFilter = LinearFilter;
				texture.generateMipmaps = false;
				texture.flipY = false;

				switch (texData.image_channels[i].length) {
					case 1:
						texture.format = RedFormat;
						break;
					case 2:
						texture.format = RGFormat;
						break;
					case 3:
						texture.format = RGBFormat;
						break;
					case 4:
						texture.format = RGBAFormat;
						break;
				}

				textures.push(texture);
			}

			if (onLoad) onLoad(textures, texData);

		}, onProgress, onError);
		
		return null;
	}

}

export { EXRLoader };
