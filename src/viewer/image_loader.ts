import * as Types from './types/viewer';

import {FloatType, TextureLoader, NearestFilter, RedFormat, RGFormat, RGBFormat, RGBAFormat} from 'three';

import { APNGLoader } from './loaders/APNGLoader';
import { RGBELoader } from './loaders/RGBELoader';
import { UltraHDRLoader } from './loaders/UltraHDRLoader';
import { GifLoader } from './loaders/gif-loader';
// @ts-ignore
import { EXRLoader } from './loaders/EXRLoader.js';

import { generateUUID } from './utils/uuid';

export class ImageLoader {
	image_path: string;
	animated: boolean;
	uuid: string;
	generate_UUID: () => string;

	constructor(image_path: string, uuid: string | null, animated = true) {
		this.image_path = image_path;
		this.generate_UUID = () => { return generateUUID(); };
		this.animated = animated;
		this.uuid = (uuid === null ? this.generate_UUID() : uuid);
	}

	/*
		Depending on the file extension, instantiate the appropriate loader.
		Default relies on the THREE js TextureLoader.
	*/
	initialize(image_path: string): [any, boolean, string, Error | null] {
		let file_extension = image_path.split('.').pop();
		if (file_extension === undefined) {
			const error = new Error("File extension not found");
			return [null, false, "", error];
		}

		// Guard to load animated PNG files
		if (file_extension === 'png' && this.animated) {
			file_extension = 'apng';
		}

		switch (file_extension) {
			case 'exr': {
				const loader = new EXRLoader();
				loader.setDataType(FloatType);
				this.animated = false;
				return [loader, false, file_extension, null];
			}
			case 'hdr': {
				const loader = new RGBELoader();
				loader.setDataType(FloatType);
				this.animated = false;
				return [loader, false, file_extension, null];
			}
			case 'gif': {
				const loader = new GifLoader();
				return [loader, true, file_extension, null];
			}
			case 'apng': {
				const loader = new APNGLoader();
				return [loader, true, file_extension, null];
			}
			case 'jpg':
			case 'jpeg': {
				const loader = new UltraHDRLoader();
				loader.setDataType(FloatType);
				this.animated = false;
				return [loader, false, file_extension, null];
			}
			default: {
				const loader = new TextureLoader();
				this.animated = false;
				return [loader, true, file_extension, null];
			}
		}
	}

	execute(success_callback: (image: Types.ImageData, finished: boolean) => void, error_callback: (error: any) => void): void {
		// First query the loader given the file extension
		const [loader, LDR, file_extension, error] = this.initialize(this.image_path);
		if (error !== null) {
			error_callback(error);
			return;
		}

		/*
			Perturb file path with UUID to ensure cache invalidation
		*/
		const perturbed_path = this.image_path + '?v=' + this.generate_UUID();

		// Execute the loading setup
		loader.load(
			perturbed_path,
			(textures: any, textureData: any, finished = true) => {
				if (textures === undefined) {
					// Re-execute in case we tried to load an animated PNG and it failed because it was static
					if (file_extension === 'apng') {
						this.animated = false;
						this.execute(success_callback, error_callback);
						return;
					}
					error_callback(new Error("Failed to load image due to texture being null."));
					return;
				}

				// Case for loaders not supporting multiple groups of channels
				if (!Array.isArray(textures)) {
					textures = [textures];

					if (textureData === undefined || textureData === null) {
						textureData = {
							image_channels: []
						};
					}

					textureData.image_channels = [{
						name: 'image',
						data: (!LDR ? textureData.data : null),
						length: this.get_channel_from_format(textures[0].format),
					}];
				}

				const img_width = textures[0].image.width;
				const img_height = textures[0].image.height;

				const img_obj: Types.ImageData = {
					uuid : (this.animated ? this.generate_UUID() : this.uuid), 
					path : this.image_path,
					// texture : null,
					// data : null,
					width : img_width,
					height : img_height,
					ldr : LDR,
					animated: this.animated,
					channel_groups : [],
					flipY : ('flipY' in textures[0] ? textures[0].flipY : false),
				};

				for (let i = 0; i < textures.length; i++) {
					const texture = textures[i];
					texture.minFilter = NearestFilter;
					texture.magFilter = NearestFilter;

					let dataLDR : ImageData | null = null;
					if (LDR) {
						const canvas = document.createElement('canvas')!;
						canvas.width = img_width;
						canvas.height = img_height;
						const canvas_context = canvas.getContext("2d", {
							willReadFrequently: true,
						})!;
						
						canvas_context.drawImage(texture.image, 0, 0, img_width, img_height);
						dataLDR = canvas_context.getImageData(0, 0, img_width, img_height);
					}

					const channel_group : Types.ChannelGroup = {
						name: textureData.image_channels[i].name,
						data: (dataLDR === null ? textureData.image_channels[i].data : dataLDR.data),
						length: textureData.image_channels[i].length,
						texture: texture,
					};

					img_obj.channel_groups.push(channel_group);
				}
				
				// Continue execution with the image data already prepared
				success_callback(img_obj, finished);
			},
			undefined,
			error_callback
		);
	}

	get_channel_from_format(format: number) {
		switch (format) {
			case RedFormat:
				return 1;
			case RGFormat:
				return 2;
			case RGBFormat:
				return 3;
			case RGBAFormat:
				return 4;
			default:
				throw new Error(`Unsupported format: ${format}`);
		}
	}
}
