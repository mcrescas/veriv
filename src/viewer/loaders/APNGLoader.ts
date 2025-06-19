/*
	From https://github.com/movableink/three-gif-loader
*/

import {FileLoader, DefaultLoadingManager, CanvasTexture, LoadingManager} from 'three';
// @ts-ignore
import parseAPNG from './ext/apng_parser';
// @ts-ignore
import Player from './ext/apng_player';

class APNGTexture extends CanvasTexture {

	context !: CanvasRenderingContext2D;

	constructor(image = undefined, mapping = undefined, wrapS = undefined, wrapT = undefined, magFilter = undefined, minFilter = undefined, format = undefined, type = undefined, anisotropy = undefined) {
		super(image, mapping, wrapS, wrapT, magFilter, minFilter, format, type, anisotropy);
		
		this.needsUpdate = false;
	}
  
	setContext(apng: any) {
		this.image = document.createElement('canvas');
		this.image.width = apng.width;
		this.image.height = apng.height;
		this.context = this.image.getContext('2d');
	}
};

class APNGLoader {

	manager !: LoadingManager;
	crossOrigin !: string;
	path !: string;

	constructor(manager : LoadingManager | undefined = undefined) {
		this.manager = manager || DefaultLoadingManager;
		this.crossOrigin = 'anonymous';
	}

  load(url: any, onLoad: any, onProgress: any, onError: any) {
	const loader = new FileLoader(this.manager);
	loader.setPath(this.path);
	loader.setResponseType('arraybuffer');

    loader.load(url, (response) => {
		const apng = parseAPNG(response);

		if (apng instanceof Error) {
			if (onLoad) {
				onLoad(undefined, undefined);
			}
			return;
		}

		apng.createImages().then(() => {
			if (onLoad) {
				for(let i=0; i<apng.frames.length; i++) {
					const texture = new APNGTexture();
					texture.setContext(apng);
					const player = new Player(apng, texture.context, false);

					for (let j=0; j<=i; j++) {
						player.renderNextFrame();
					}

					onLoad(texture, undefined, i === apng.frames.length - 1);		
				}
			}
		});
	});
  }

  setPath(value: string) {
    this.path = value;
    return this;
  }
}

export {APNGLoader};
