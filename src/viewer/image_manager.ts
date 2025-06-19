import * as Types from './types/viewer';
import { ImageLoader } from './image_loader';
import { run_thread } from './utils/worker_utils';

export class ImageManager {
	image_cache: Types.ImageData[];
	n_images: number;
	active_image: number;
	ref_image: number;
	active_channel_group : number;
	statistics_cache: Types.HistogramCache;
	workers_path: string[];
	N_BINS_HIST: number;
	default_callback: () => void;

	cache_limits: Types.CacheLimits;

	constructor(workers_path: string[], N_BINS_HIST: number, default_callback: () => void) {
		this.workers_path = workers_path;
		this.N_BINS_HIST = N_BINS_HIST;
		this.image_cache = [];
		this.statistics_cache = {};
		this.active_image = -1;
		this.active_channel_group = 0;
		this.ref_image = -1;
		this.n_images = 0;
		this.default_callback = default_callback;
		this.cache_limits = {
			ref_uuid: null,
			channel_index: null,
			metric: null,
			min_limit: 0.0,
			max_limit: 1.0
		};
	}

	size(): number {
		return this.image_cache.length;
	}

	active_ref_different(): boolean {
		return this.active_image !== this.ref_image;
	}

	valid_image(): boolean {
		return this.active_image !== -1;
	}

	get_index_active(): number {
		return this.active_image;
	}

	get_index_ref(): number {
		return this.ref_image;
	}

	get_channel_group_active(): number {
		return this.active_channel_group;
	}

	get_current_image(): [Types.ImageData | null, Types.ChannelGroup | null] {
		return this.get_image_data(this.active_image);
	}

	get_current_ref_image(): [Types.ImageData | null, Types.ChannelGroup | null] {
		return this.get_image_data(this.ref_image);
	}

	get_image_data(index: number | null, channel_index: number | null = null): [Types.ImageData | null, Types.ChannelGroup | null] {
		if (index === null || index < 0 || index >= this.image_cache.length) {
			return [null, null];
		}

		const image = this.image_cache[index];
		if (image.channel_groups.length === 0) {
			throw new Error('Image has no channel groups');
		}

		let channel_id = (channel_index !== null ? channel_index : this.active_channel_group);
		if (channel_id >= image.channel_groups.length) {
			// Reset the channel group if the current one is invalid
			channel_id = 0;
		}
		const channel_group = image.channel_groups[channel_id];

		return [image, channel_group];
	}

	set_active_image(index: number): void {
		if (index < 0 || index >= this.image_cache.length) {
			throw new Error('Invalid image index');
		}
		this.active_image = index;
	}

	set_ref_image(index: number): void {
		if (index < 0 || index >= this.image_cache.length) {
			throw new Error('Invalid image index');
		}
		this.ref_image = index;
	}

	find_uuid(uuid: string): [number, Types.ImageData | null] {
		for (let i = 0; i < this.image_cache.length; i++) {
			if (this.image_cache[i].uuid === uuid) {
				return [i, this.image_cache[i]];
			}
		}
		return [-1, null];
	}

	load_image(image_path: string, reload_id: number, success_callback: (should_advance: boolean) => void, error_callback: (error: any) => void): void {
		const uuid_reload = (reload_id !== -1 ? this.image_cache[reload_id].uuid : null);
		const loader = new ImageLoader(
			image_path,
			uuid_reload
		);
		loader.execute(
			(image_data: Types.ImageData, finished: boolean) => {
				let index_update = -1;
				if (uuid_reload !== null) {
					// Ensure we reload the same image
					const current_index = this.find_uuid(uuid_reload)[0];
					if (current_index !== -1) {
						index_update = current_index;
						this.image_cache[current_index] = image_data;
						// Reset statistics
						this.clean_statistics(uuid_reload);
						success_callback(finished);
					} else {
						return;
					}
				} else {
					index_update = this.n_images;
					this.image_cache.push(image_data);
					this.statistics_cache[image_data.uuid] = {};
					this.active_image = this.n_images;
					this.n_images += 1;
					success_callback(finished);
				}
				
				// Generate the statistics for the image
				for (let ch = 0; ch < image_data.channel_groups.length; ch++) {
					this.compute_statistics(index_update, null, null, ch);
				}
			},
			error_callback
		);
	}

	remove_image(index: number): void {
		// We want to remove the current active image
		if (index === -1) {
			index = this.active_image;
		}
		// Check range
		if (index < 0 || index >= this.image_cache.length) {
			throw new Error('Invalid image index');
		}

		// Disable comparison if we are removing the reference image
		if (this.ref_image == index) {
			this.ref_image = -1;
		} else if (this.ref_image > index) {
			this.ref_image -= 1;
		}


		// Update count of images
		this.n_images -= 1;
		// Update active image if we are removing the current one
		if (this.active_image == index) {
			this.active_image -= 1;
			this.active_image = (this.active_image == -1 && this.n_images > 0 ? 0 : this.active_image);
		} else if (this.active_image > index) {
			this.active_image -= 1;
		}

		// Remove statistics saved for this image
		const img_uuid = this.image_cache[index].uuid;
		this.clean_statistics(img_uuid);

		// Remove image from cache
		this.image_cache.splice(index, 1);
	}

	shift_image(offset: number): void {
		this.active_image = this.active_image + offset;

		if (this.active_image < 0) {
			this.active_image = this.n_images + this.active_image;
		}
		if (this.active_image >= this.n_images) {
			this.active_image = this.active_image - this.n_images;
		}

		// Reset active channel group if current is invalid
		const [image, channel_group] = this.get_current_image();
		if (image === null || channel_group === null) {
			return;
		}
		if (this.active_channel_group >= image.channel_groups.length) {
			this.active_channel_group = 0;
		}
	}

	shift_channel_group(offset: number): void {
		const [image, channel_group] = this.get_current_image();
		if (image === null || channel_group === null) {
			return;
		}
		this.active_channel_group = this.active_channel_group + offset;
		if (this.active_channel_group < 0) {
			this.active_channel_group = image.channel_groups.length + this.active_channel_group;
		}
		if (this.active_channel_group >= image.channel_groups.length) {
			this.active_channel_group = this.active_channel_group - image.channel_groups.length;
		}
	}

	select_image(index: number, is_ref: boolean): void {
		if (index < this.n_images) {
			if (is_ref) {
				this.ref_image = (index == this.ref_image ? -1 : index);
			} else {
				this.active_image = index;
			}

			if (!is_ref) {
				// Reset active channel group if current is invalid
				const [image, channel_group] = this.get_current_image();
				if (image === null || channel_group === null) {
					return;
				}
				if (this.active_channel_group >= image.channel_groups.length) {
					this.active_channel_group = 0;
				}
			}
		}
	}

	select_channel_group(index: number): void {
		const [image, channel_group] = this.get_current_image();
		if (image === null || channel_group === null) {
			return;
		}
		if (index < image.channel_groups.length) {
			this.active_channel_group = index;
		} else {
			this.active_channel_group = 0;
		}
	}

	clean_cache(): void {
		this.image_cache = [];
		this.statistics_cache = {};
		this.active_image = -1;
		this.ref_image = -1;
		this.n_images = 0;

		this.reset_limits();
	}

	// For each loop over the images
	for_each_image(callback: (image: Types.ImageData, index: number) => void): void {
		for (let i = 0; i < this.image_cache.length; i++) {
			callback(this.image_cache[i], i);
		}
	}

	// Return the maximum across all images of their dimensions
	get_max_dims(): number {
		let max_dim = 0;
		for (let i = 0; i < this.image_cache.length; i++) {
			const img = this.image_cache[i];
			const local_max = Math.max(img.width, img.height);
			max_dim = Math.max(max_dim, local_max);
		}
		if ((max_dim % 2) > 0) {
			max_dim += 1;
		}
		return max_dim;
	}

	statistics_key(uuid_img: string | null, uuid_ref: string | null, metric: string | null, channel_index: number) : string {
		let key = '';
		if (uuid_ref !== null) {
			key += `{${uuid_ref}}`;
		}
		if (metric !== null) {
			key += `|${metric}|`;
		}
		if (uuid_img !== null) {
			key += `[${uuid_img}]`;
		}
		key += `(${channel_index})`;
		return key;
	}

	/* 
		Obtain data for the current indices and the required metric
	*/
	get_statistics(metric: number, onFinishCompute = this.default_callback) {
		const img_uuid = (this.active_image != -1 ? this.image_cache[this.active_image].uuid : null);
		const ref_uuid = (this.ref_image != -1 ? this.image_cache[this.ref_image].uuid : null);
		const key = this.statistics_key(
			img_uuid,
			ref_uuid,
			metric.toString(),
			this.active_channel_group
		);

		if (img_uuid !== null && img_uuid in this.statistics_cache && key in this.statistics_cache[img_uuid]) {
			// Return computed statistics
			return this.statistics_cache[img_uuid][key];
		} else if (img_uuid !== null) {
			// Launch computation of statistics
			return this.compute_statistics(
				this.active_image,
				(this.ref_image != -1 ? this.ref_image : null),
				metric,
				this.active_channel_group,
				onFinishCompute
			);
		} else {
			return null;
		}
	}

	clean_statistics(target_uuid: string): void {
		if (target_uuid in this.statistics_cache) {
			delete this.statistics_cache[target_uuid];
		}

		for (const base_key in this.statistics_cache) {
			for (const key in this.statistics_cache[base_key]) {
				if (key.startsWith(`{${target_uuid}}`)) {
					delete this.statistics_cache[base_key][key];
				}
			}
		}

		// Reset limits
		this.reset_limits();
	}

	compute_statistics(img_index: number, ref_index: number | null, metric: number | null, channel_index: number, onFinishCompute = this.default_callback) {
		const [img, img_channel] = this.get_image_data(img_index, channel_index);
		const [ref, ref_channel] = this.get_image_data(ref_index, channel_index);

		if (img === null || img_channel === null) {
			throw new Error('Invalid image index for computing statistics');
		}
		
		const base_key = img.uuid;
		const data_key = this.statistics_key(
			img.uuid, 
			(ref !== null ? ref.uuid : null),
			(metric !== null ? metric.toString() : null),
			channel_index,
		);

		const statistics_data: Types.HistogramData = {
			histogram: new Float32Array(1),
			mean_value: 0,
			min_value: 0,
			max_value: 0,
			img_UUID: img.uuid,
			ref_UUID: (ref !== null ? ref.uuid : null),
			channel_index: channel_index,
			metric: (ref !== null ? metric : null),
			finished: false,
			min_limit: 0.0,
			max_limit: 1.0,
		};

		if (!(base_key in this.statistics_cache)) {
			this.statistics_cache[base_key] = {};
		}
		this.statistics_cache[base_key][data_key] = statistics_data;

		run_thread(this.workers_path[0],
			(worker) => {
				worker.postMessage({
					img_obj : {
						ldr : img.ldr,
						data : img_channel.data,
						width : img.width,
						height : img.height,
						n_channels : img_channel.length,
					},
					ref_obj : (ref === null || ref_channel === null ? null : {
						ldr : ref.ldr,
						data : ref_channel.data,
						width : ref.width,
						height : ref.height,
						n_channels : ref_channel.length,
					}),
					N_BINS_HIST : this.N_BINS_HIST,
					metric : metric
				});
			},
			(error) => {
				throw new Error('Error computing statistics: ' + error);
			},
			(result) => {
				if (base_key in this.statistics_cache && data_key in this.statistics_cache[base_key]) {
					const stats = this.statistics_cache[base_key][data_key];

					stats.histogram = result.histogram;
					stats.mean_value = result.mean_value;
					stats.min_value = result.min_value;
					stats.max_value = result.max_value;
					stats.finished = true;
					stats.min_limit = result.min_limit;
					stats.max_limit = result.max_limit;

					// Reset limits
					this.reset_limits();
					// Continue execution and notify
					onFinishCompute();
				}
			}
		);
		return statistics_data;
	}

	get_limits(metric: number): Types.CacheLimits {
		const ref_uuid = (this.ref_image != -1 ? this.image_cache[this.ref_image].uuid : null);
		const channel_index = this.active_channel_group;

		// Return the computed value if available
		if (ref_uuid === null && channel_index === this.cache_limits.channel_index) {
			return this.cache_limits;
		} else if (
			ref_uuid === this.cache_limits.ref_uuid &&
			channel_index === this.cache_limits.channel_index &&
			metric === this.cache_limits.metric
		) {
			return this.cache_limits;
		}

		// Otherwise, compute the limits
		this.cache_limits.ref_uuid = ref_uuid;
		this.cache_limits.channel_index = channel_index;
		this.cache_limits.metric = metric;

		let tmp_min : number | null = Number.MAX_VALUE;
		let tmp_max : number | null = -Number.MAX_VALUE;

		for (const base_key in this.statistics_cache) {
			let local_key;
			if (ref_uuid === null) {
				local_key = this.statistics_key(base_key, null, null, channel_index);
			} else {
				local_key = this.statistics_key(base_key, ref_uuid, metric.toString(), channel_index);
			}

			if (!(local_key in this.statistics_cache[base_key])) {
				// If the key does not exist, we cannot compute limits
				continue;
			}

			const histogram_data = this.statistics_cache[base_key][local_key];
			if (histogram_data.finished) {
				tmp_min = Math.min(tmp_min, histogram_data.min_limit);
				tmp_max = Math.max(tmp_max, histogram_data.max_limit);
			} else {
				tmp_min = null;
				tmp_max = null;
				break;
			}
		}

		this.cache_limits.min_limit = tmp_min;
		this.cache_limits.max_limit = tmp_max;
		return this.cache_limits;
	}

	reset_limits () : void {
		// Set everything to null to recompute later 
		this.cache_limits.ref_uuid = null;
		this.cache_limits.channel_index = null; 
		this.cache_limits.metric = null;
		this.cache_limits.min_limit = null;
		this.cache_limits.max_limit = null;
	}
}
