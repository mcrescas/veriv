# `VERIV` - `V`scode `E`xtended `R`ange `I`maging `V`iewer!

<!-- START GITHUB -->

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mcrespo.veriv"><img src="https://img.shields.io/badge/Extension%20Page-0078d7.svg?style=for-the-badge&logo=visual-studio-code&logoColor=white"></a>
</p>

<p align="center">
  <img src="https://vsmarketplacebadges.dev/version-short/mcrespo.veriv.svg">
  <img src="https://vsmarketplacebadges.dev/installs-short/mcrespo.veriv.svg">
  <img src="https://vsmarketplacebadges.dev/downloads-short/mcrespo.veriv.svg">
</p>

<br>

<!-- END GITHUB -->

<figure style="margin-left: 0; margin-right: 0;">
  <img src="https://github.com/mcrescas/veriv/raw/main/images/viewer.png" style="width: 100%; height: auto;">
</figure>

<div style="justify-content: center; text-align: center;">
    <img src="https://github.com/mcrescas/veriv/raw/main/images/error_comparison.png" style="width: 49%; height: auto;">
    <img src="https://github.com/mcrescas/veriv/raw/main/images/pixel_values.png" style="width: 49%; height: auto;">
</div>
<br>

This extension provides you with a powerful viewer of **LDR** and **HDR** (including animated) images, going beyond the standard VS Code image preview.
Optimize your remote workflows with seamless support, eliminating file transfer hassles.

**Features:**

* **Precise Image Navigation:** Pan and smoothly zoom to examine pixel-level details.
* **Dynamic Image Adjustment:** Control exposure and gamma for optimal viewing.
* **Versatile Tone Mapping Options:** Apply sRGB, inverse gamma, +/- mapping, and false color for diverse visual analysis.
* **Comprehensive Image Comparison:** Quantify differences between images using error metrics: Error, Absolute Error, Squared Error, Relative Absolute Error, and Relative Squared Error.
* **Pixel Value Inspection:** Zoom in to view individual pixel values.
* **In-Depth Histogram Visualization:** Histograms for image or error metrics values to understand data distribution.
* **Image Reloading:** Refresh displayed images using the GUI, key bindings, or by executing the "Reload All" command.
* **Flexible Animated Image Playback:** Play image sequences as videos with adjustable playback speed using customizable FPS settings.
* **Efficient Folder Image Access:** Open all images within a directory directly from a right-click context menu.
* **Save Edited Images:** Export the currently edited image — including error metric computations and other modifications — directly to a file or copy it to the clipboard.

</br>

> ⚠ If you hit any problems or want to request a feature, please create an [issue or discussion on the repo](https://github.com/mcrescas/veriv).

</br>

## Supported Image Formats

* `.exr`: High Dynamic Range (HDR) image format.
* `.hdr`: High Dynamic Range (HDR) image format.
* `.png`: Low Dynamic Range (LDR) image format, including animated PNG sequences.
* `.jpg|.jpeg`: Ultra HDR and Low Dynamic Range (LDR) image format.
* `.bmp`: Bitmap image format.
* `.gif`: Graphics Interchange Format (GIF) for animated images.

## Getting Started

1.  Open an image file with a supported format (`.exr`, `.hdr`, `.png`, `.jpg|.jpeg`, `.bmp`, or `.gif`). The image will automatically open in the extension's viewer within a new VS Code tab.
2.  If you modify the image file after opening it in the viewer, update the displayed image by clicking the `reload` button or using the corresponding keybinding.
3.  While the viewer tab remains open, any subsequent images you open will be displayed within the same window, enabling convenient side-by-side comparison.
4.  For a complete list of keyboard shortcuts, press `h` or `?` while the viewer is active.


<!-- START GITHUB -->

## Project Setup and Build Instructions

This document outlines the steps to set up, build, and package the project.

### Prerequisites

* **Node.js and npm:** Ensure you have Node.js and npm installed on your system.

### Installation

1.  **Install Node Dependencies:**
    ```sh
    npm install
    ```
    This command installs all the necessary dependencies listed in `package.json`.

### Build Process

The build process compiles the TypeScript code, bundles resources, and optimizes the extension for distribution.

1.  **Development Build:**
    ```sh
    npm run build
    ```
    This command performs the following steps:
    * Uses Webpack to compile TypeScript and bundle required resources.
    * Executes `lib/inlineLib.js` to inline webview data, improving loading times.
    The resulting build artifacts are placed in the `out` directory.

2.  **Production Build:**
    ```sh
    npm run build-prod
    ```
    This command generates an optimized build suitable for production deployment. It typically includes minification and other performance enhancements. The output is also located in the `out` directory.

### Debugging

The project includes two debugging configurations (accessible from the debugging tab in VS Code):
* **Run Extension** : Launches a VS Code window in Developer Mode with the extension pre-loaded.
* **Run Extension (Web)** : Similar to the previous one, but initializes the extension in web mode. Useful for testing in web environment.

### Packaging

1.  **Package the Extension:**
    ```sh
    npm run package
    ```
    This command creates the extension package (`.vsix` file) and places it in the `build` directory.

## Cleanup

1.  **Clean Build Artifacts:**
    ```sh
    npm run clean
    ```
    This command removes the generated build files from the `out`, `dist` and `build` directories.

<!-- END GITHUB -->
