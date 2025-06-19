import { quickselect } from "../utils/quickselect";
import { get_pixel_data, val2bin, bin2val, compute_metric} from "../utils/pixel_utils";

import { TDigest } from 'tdigest';

self.onmessage = function(e) {
	const data = e.data;
	const img_obj = data.img_obj;
	const ref_obj = data.ref_obj;
	const N_BINS_HIST = data.N_BINS_HIST;
	const metric = data.metric;

	let n_channels = img_obj.n_channels;
	n_channels = n_channels == 4 ? 3 : n_channels; // Ignore alpha channel

	img_obj.min_value = Number.POSITIVE_INFINITY;
	img_obj.max_value = Number.NEGATIVE_INFINITY;
	img_obj.mean_value = 0.0;
	img_obj.histogram = new Float32Array(N_BINS_HIST * n_channels).fill(0.0);

	const digest = new TDigest();
	

	for (let y=0; y<img_obj.height; y++) {
		for (let x=0; x<img_obj.width; x++) {
			for (let ch=0; ch<n_channels; ch++) {
				var val = get_pixel_data(x, y, ch, img_obj, img_obj.data, img_obj.n_channels);
				if (ref_obj != null) {
					const ref_val = get_pixel_data(x, y, ch, ref_obj, ref_obj.data, ref_obj.n_channels);
					val = compute_metric(metric, val, ref_val);
				}
				img_obj.min_value = Math.min(img_obj.min_value, val);
				img_obj.max_value = Math.max(img_obj.max_value, val);
				img_obj.mean_value += val;
				digest.push(val);
			}
		}
	}

	for (let y=0; y<img_obj.height; y++) {
		for (let x=0; x<img_obj.width; x++) {
			for (let ch=0; ch<n_channels; ch++) {
				val = get_pixel_data(x, y, ch, img_obj, img_obj.data, img_obj.n_channels);
				if (ref_obj != null) {
					const ref_val = get_pixel_data(x, y, ch, ref_obj, ref_obj.data, ref_obj.n_channels);
					val = compute_metric(metric, val, ref_val);
				}
				const index = val2bin(val, N_BINS_HIST, img_obj.min_value, img_obj.max_value) + N_BINS_HIST * ch;
				img_obj.histogram[index] += 1;
			}
		}
	}

	// Normalize bin given its width
	for(let i=0; i<img_obj.histogram.length; i++) {
		const bin = i % N_BINS_HIST;
		const bin_size = bin2val(bin + 1, N_BINS_HIST, img_obj.min_value, img_obj.max_value) - bin2val(bin, N_BINS_HIST, img_obj.min_value, img_obj.max_value);
		img_obj.histogram[i] /= bin_size;
	}

	img_obj.mean_value /= img_obj.width * img_obj.height * n_channels;
	
	const index = img_obj.histogram.length - 10;
	let typedArray = [...img_obj.histogram];
	quickselect(typedArray, index);
	var norm = typedArray[index];
	
	digest.compress();
	const min_quantile = digest.percentile(0.01);
	const max_quantile = digest.percentile(0.99);

	norm = 1.0 / (Math.max(norm, 0.1) * 1.15);

	for(let i=0; i<img_obj.histogram.length; i++) {
		img_obj.histogram[i] *= norm;
	}

	self.postMessage({
		histogram : img_obj.histogram,
		mean_value : img_obj.mean_value,
		min_value : img_obj.min_value,
		max_value : img_obj.max_value,

		min_limit : min_quantile,
		max_limit : max_quantile,
	});
};
