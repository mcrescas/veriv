"""

This scripts generates Javascript code to be used to store the different colormaps

"""

import matplotlib.cm as cm
import matplotlib
from matplotlib.colors import LinearSegmentedColormap
import numpy as np


def print_colormap_data(name):
	cmap = matplotlib.colormaps[name]

	if isinstance(cmap, LinearSegmentedColormap):
		colors = cmap(np.linspace(0, 1, cmap.N + 1))
		N = cmap.N + 1
	else:
		colors = cmap.colors
		N = cmap.N

	result = f'"{name}": new Float32Array(['
	for index, color in enumerate(colors):
		# Convert the color to RGBA format
		rgba = matplotlib.colors.to_rgba(color)
		# Append the RGBA values to the result string
		result += f"{rgba[0]:.6f}, {rgba[1]:.6f}, {rgba[2]:.6f}, {rgba[3]:.6f}"

		if (index) != (N - 1):
			result += ", "

	result += "]),\n"
	return result


COLOR_LIST = ["viridis", "turbo", "plasma", "inferno", "magma", "RdBu"]

res = ""
for c_name in COLOR_LIST:
    res += print_colormap_data(c_name)

print(res)
