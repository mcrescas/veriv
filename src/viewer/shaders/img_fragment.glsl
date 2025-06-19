// Adapted from TEV - https://github.com/Tom94/tev

uniform sampler2D image;
uniform bool hasImage;
uniform sampler2D imageAlt;
uniform bool hasImageAlt;

uniform int n_channels_img;
uniform int n_channels_ref;

uniform float exposure;
uniform float offset;
uniform float gamma;
uniform bool clipToLdr;
uniform int tonemap;
uniform int metric;

uniform sampler2D colorMap;
uniform sampler2D colorMapPosNeg;

uniform bool imageLDR;
uniform bool imageAltLDR;

in vec2 board_uv;
in vec2 boardAlt_uv;

uniform bool normalizeFalseColor;
uniform float min_limit;
uniform float max_limit;

#define SRGB        0
#define GAMMA       1
#define POS_NEG     2
#define FALSE_COLOR 3
#define FALSE_COLOR_SYMMETRIC 4
#define FALSE_COLOR_POSNEG 5

#define ERROR                   0
#define ABSOLUTE_ERROR          1
#define SQUARED_ERROR           2
#define RELATIVE_ABSOLUTE_ERROR 3
#define RELATIVE_SQUARED_ERROR  4

#define OFFSET 0.01

struct ImageData {
    vec4 color;
    bool isValid;
};


// Utility functions
vec4 sample_texture_safe(sampler2D sampler_, vec2 uv, int n_channels) {
    vec4 color = texture2D(sampler_, uv);
    
    // Check bounds and set alpha to 0 if outside
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        color = vec4(0.0);
    }
    
    // Handle single channel textures
    if (n_channels == 1) {
        color = vec4(color.xxx, color.a);
    }
    
    return color;
}

float linear(float sRGB) {
    float outSign = sign(sRGB);
    sRGB = abs(sRGB);
    
    return (sRGB <= 0.04045) ? 
        outSign * sRGB / 12.92 : 
        outSign * pow((sRGB + 0.055) / 1.055, 2.4);
}

float sRGB(float linear) {
    float outSign = sign(linear);
    linear = abs(linear);
    
    return (linear < 0.0031308) ? 
        outSign * 12.92 * linear : 
        outSign * 1.055 * pow(linear, 0.41666) - 0.055;
}

vec3 convert_to_linear(vec3 srgb_color) {
    vec3 result;
    result.x = linear(srgb_color.x);
    result.y = linear(srgb_color.y);
    result.z = linear(srgb_color.z);
    return result;
}

float average(vec3 col) {
    return dot(col, vec3(1.0 / 3.0));
}

float symmetric_log2(float x) {
	return sign(x) * log2(abs(x) + 1.0);
}

// Image processing pipeline
ImageData load_primary_image() {
    ImageData data;
    data.isValid = hasImage;
    
    if (!data.isValid) {
        data.color = vec4(0.0);
        return data;
    }
    
    data.color = sample_texture_safe(image, board_uv, n_channels_img);
    
    if (imageLDR) {
        data.color.rgb = convert_to_linear(data.color.rgb);
    }
    
    return data;
}

ImageData load_reference_image() {
    ImageData data;
    data.isValid = hasImageAlt;
    
    if (!data.isValid) {
        data.color = vec4(0.0);
        return data;
    }
    
    data.color = sample_texture_safe(imageAlt, boardAlt_uv, n_channels_ref);
    
    if (imageAltLDR) {
        data.color.rgb = convert_to_linear(data.color.rgb);
    }
    
    return data;
}

vec3 calculate_error_metric(vec3 error, vec3 reference) {
    switch (metric) {
        case ERROR:
            return error;
        case ABSOLUTE_ERROR:
            return abs(error);
        case SQUARED_ERROR:
            return error * error;
        case RELATIVE_ABSOLUTE_ERROR:
            return abs(error) / (reference + vec3(OFFSET));
        case RELATIVE_SQUARED_ERROR:
            return error * error / (reference * reference + vec3(OFFSET));
        default:
            return vec3(0.0);
    }
}

vec3 apply_exposure_and_offset(vec3 col) {
    return pow(2.0, exposure) * col + offset;
}

vec3 apply_tone_mapping(vec3 col) {
    switch (tonemap) {
        case SRGB:
            return vec3(sRGB(col.r), sRGB(col.g), sRGB(col.b));

        case GAMMA:
            return sign(col) * pow(abs(col), vec3(1.0 / gamma));

        case POS_NEG:
            return vec3(
                -average(min(col, vec3(0.0))) * 2.0,
                average(max(col, vec3(0.0))) * 2.0,
                0.0
            );

        case FALSE_COLOR:
            float average_col = average(col);
            average_col = max(average_col, 0.0);
            float val;
            if (normalizeFalseColor) {
                float updated_min = max(min_limit, 0.0);
                val = (max(average_col, 0.0) - updated_min) / (max_limit - updated_min);
            } else {
                val = log2(average_col + 0.03125) / 10.0 + 0.5;
            }
            return texture2D(colorMap, vec2(val, 0.5)).rgb;

        case FALSE_COLOR_POSNEG:
        case FALSE_COLOR_SYMMETRIC:
            float average_col_sym = average(col);
            if (!normalizeFalseColor) {
                float val_sym = sign(average_col_sym) * (log2(abs(average_col_sym) + 0.03125) / 10.0 + 0.5) / 1.5 + 0.5;
                if (tonemap == FALSE_COLOR_POSNEG) {
                    return texture2D(colorMapPosNeg, vec2(val_sym, 0.5)).rgb;
                } else if (tonemap == FALSE_COLOR_SYMMETRIC) {
                    return texture2D(colorMap, vec2(val_sym, 0.5)).rgb;
                }
            } else {
                if (tonemap == FALSE_COLOR_SYMMETRIC) {
                    average_col_sym = (average_col_sym - min_limit) / (max_limit - min_limit);
                    return texture2D(colorMap, vec2(average_col_sym, 0.5)).rgb;
                } else {
                    float mask = step(0.0, average_col_sym);
                    float col_neg = (average_col_sym - min_limit) / (0.0 - min_limit);
                    float col_pos = (average_col_sym - 0.0) / (max_limit - 0.0);
                    average_col_sym = mix(col_neg, col_pos, mask) / 2.0 + mix(0.0, 0.5, mask);
                    return texture2D(colorMapPosNeg, vec2(average_col_sym, 0.5)).rgb;    
                }
            }
        default:
            return vec3(0.0);
    }
}

vec4 process_single_image(ImageData primary) {
    vec3 processed = apply_tone_mapping(apply_exposure_and_offset(primary.color.rgb));
    return vec4(processed, primary.color.a);
}

vec4 process_comparison_images(ImageData primary, ImageData reference) {
    vec3 error = primary.color.rgb - reference.color.rgb;
    vec3 metric_result = calculate_error_metric(error, reference.color.rgb);
    vec3 processed = apply_tone_mapping(apply_exposure_and_offset(metric_result));
    float alpha = (primary.color.a + reference.color.a) * 0.5;
    return vec4(processed, alpha);
}

void main() {
    // Load primary image
    ImageData primary = load_primary_image();
    if (!primary.isValid) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    // Load reference image
    ImageData reference = load_reference_image();
    
    // Process based on available images
    if (reference.isValid) {
        gl_FragColor = process_comparison_images(primary, reference);
    } else {
        gl_FragColor = process_single_image(primary);
    }
}


