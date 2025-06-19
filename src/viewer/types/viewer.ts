import {Texture} from 'three';

export interface GUIParams {
	Exposure: number,
	Offset: number,
	Gamma: number,
	Tonemap: number,
	Metric: number,
	Normalize: boolean,
	NormalizeFalseColor: boolean,
	NormalizeInfo: {
		x: number,
		y: number,
	},
	Help: () => void,
	Reload: () => void,
	PixelCoordinates: { x: number, y: number },
	PixelValues:  { x: number, y: number, z: number },
}

export interface SettingsDict {
	colormap: string,
	interpolation: string,
	enableSidebar: boolean,
}
export type Settings = SettingsDict;

export type Data = Float32Array | Uint16Array;

export interface ChannelGroup {
	name: string,
	data: Data,
	length: number,
	texture: Texture,
}

export interface ImageData {
	uuid : string,
	path : string,
	width : number,
	height : number,
	ldr : boolean,
	animated : boolean,
	channel_groups : ChannelGroup[],
	flipY : boolean,
}

export interface HistogramData {
	histogram : Float32Array,
	mean_value : number,
	min_value : number,
	max_value : number,
	img_UUID : string,
	ref_UUID : string | null,
	channel_index : number,
	metric : number | null,
	finished: boolean,
	min_limit: number,
	max_limit: number,
}

export interface HistogramCache {
	[unique_key: string]: Histograms
}

export interface PixelsData {
	data: Data,
	channels: number,
}

export interface Histograms {
	[unique_key: string]: HistogramData
}

export interface CacheLimits {
	ref_uuid: string | null,
	channel_index: number | null,
	metric: number | null,

	min_limit: number | null,
	max_limit: number | null
}
