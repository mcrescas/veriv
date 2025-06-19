import * as Types from '../types/viewer';

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

function linear(sRGB: number) {
	const outSign = Math.sign(sRGB);
	sRGB = Math.abs(sRGB);

	if (sRGB <= 0.04045) {
		return outSign * sRGB / 12.92;
	} else {
		return outSign * Math.pow((sRGB + 0.055) / 1.055, 2.4);
	}
}

function get_pixel_data(x: number, y: number, ch: number, image: Types.ImageData, data: Types.Data, n_channels: number) {
	const xMax = image.width;
	const yMax = image.height;	
	if (x < 0 || x > xMax || y < 0 || y > yMax-1 || ch < 0 || ch > n_channels) {
		return 0.0;
	}

	if (!image.ldr) {
		y = yMax - 1 - y;
		const channel_count = n_channels;
		const pos = (y * xMax + x) * channel_count + ch;
		// return float16ToNumber(image.data[pos]);
		return data[pos];
	} else {
		// const index = y * (xMax * 4) + x * 4 + ch;
		const channel_count = n_channels;
		const index = (y * xMax + x) * channel_count + ch;
		let pixelData = data[index];
		pixelData = pixelData / 255.0;
		pixelData = linear(pixelData);
		return pixelData;
	}
}

function clamp(val: number, min: number, max: number) {
	val = Math.max(val, min);
	val = Math.min(val, max);
	return val;
}


const addition = 0.001;
const smallest = Math.log(addition);

function symmetricLog(val: number) {
	if (val > 0) {
		return Math.log(val + addition) - smallest;
	} else {
		return -(Math.log(-val + addition) - smallest);
	}
}

function symmetricLogInverse(val: number) {
	if (val > 0) {
		return Math.exp(val + smallest) - addition;
	} else {
		return -(Math.exp(-val + smallest) - addition);
	}
}

function val2pos(val: number, minimum: number, maximum: number) {
	const minLog = symmetricLog(minimum);
	const diffLog = symmetricLog(maximum) - minLog;
	return clamp((symmetricLog(val) - minLog) / diffLog, 0, 1);
}

function val2bin (val: number, NBINS: number, minimum: number, maximum: number) {
	const minLog = symmetricLog(minimum);
	const diffLog = symmetricLog(maximum) - minLog;
	const index = clamp(NBINS * ((symmetricLog(val) - minLog) / diffLog), 0, NBINS - 1);
	return Math.floor(index);
}

function bin2val (val: number, NBINS: number, minimum: number, maximum: number) {
	const minLog = symmetricLog(minimum);
	const diffLog = symmetricLog(maximum) - minLog;
	return symmetricLogInverse(((diffLog * val) / NBINS) + minLog);
}

function compute_metric(metric: number, pixel: number, pixel_ref: number) {
	const error = pixel - pixel_ref;
	if (metric == 0) {
		return error;
	} else if (metric == 1) {
		return Math.abs(error);
	} else if (metric == 2) {
		return error * error;
	} else if (metric == 3) {
		return Math.abs(error) / (pixel_ref + 0.01);
	} else if (metric == 4) {
		return (error * error) / (pixel_ref * pixel_ref + 0.01);
	} else {
		return 0.0;
	}
}

function format_number_stats(number: number) {
	const digits = Math.max(Math.floor(Math.log10(Math.abs(number))), 0) + 1;
	if (digits >= 4) {
		return number.toExponential(2);
	} else {
		return number.toFixed(4);
	}
}

export { get_pixel_data, val2bin, bin2val, linear, float16ToNumber, compute_metric, val2pos, format_number_stats};
