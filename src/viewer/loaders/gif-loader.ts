/*
	From https://github.com/movableink/three-gif-loader
*/


import { FileLoader, DefaultLoadingManager, LoadingManager } from 'three';
import { GifTexture } from './ext/gif-texture';
// @ts-ignore
import { GifReader } from './ext/omggif.js';

class GifLoader {

  manager: LoadingManager;
  crossOrigin: string;
  path!: string;

  constructor(manager = undefined) {
    this.manager = manager || DefaultLoadingManager;
    this.crossOrigin = 'anonymous';
  }

  load(url: any, onLoad: any, onProgress: any, onError: any) {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType('arraybuffer');

    loader.load(url, (response: string | ArrayBuffer) => {
      if (typeof response === 'string') {
        onError(new Error('THREE.GifLoader: Did not receive an ArrayBuffer.'));
        return;
      }

      const gifData = new Uint8Array(response);
      const reader = new GifReader(gifData);

      if (onLoad) {
        for(let i=0; i<reader.numFrames(); i++) {
          const texture = new GifTexture();
          texture.setReader(reader);
          for (let j = 0; j <= i; j++) {
            texture.draw(j);
          }

          onLoad(texture, undefined, i === reader.numFrames() - 1);
        }
      }
    }, onProgress, onError);
  }

  setPath(value: string) {
    this.path = value;
    return this;
  }
}

export {GifLoader};
