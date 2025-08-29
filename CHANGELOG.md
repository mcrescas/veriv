# Changelog
All notable changes to this project will be documented in this file.

> This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-08-29
### Added
* Support for saving images to file as an LDR in PNG format.
* Support for copying the current edited image into the clipboard [(Feature request)](https://github.com/mcrescas/veriv/issues/8).

## [1.1.0] - 2025-06-19
### Added
* Now the extension should work both in desktop and web modes.
* Added support for loading `.hdr` and UltraHDR `.jpeg` image files.
* Multichannel EXRs can now be loaded and visualized [(Feature request)](https://github.com/mcrescas/veriv/issues/5).
* Introduced a new layout mode with a sidebar.
* Added support for viewing pixel values and coordinates under the cursor [(Feature request)](https://github.com/mcrescas/veriv/issues/6).
* Global Image Reload Command: Added a command to reload all images currently loaded in VERIV [(Feature request)](https://github.com/mcrescas/veriv/issues/3).
* Enhanced statistics caching for faster retrieval.
* Improved histogram visualization.
* Native LDR format reloading to avoid caching issues with Electron.
* Integrated Tweakpane interface.
* Optimized pixel value drawing code.
* Improved the development pipeline.
* Truncated long image names: Image names exceeding a specified threshold are now truncated for better display.
* Enhanced zooming experience for viewing pixel values.
* Added support for settings, including color map, image interpolation, and the image list sidebar.
* Extended list of colormaps available.
* Improved tonemapping options for false color visualizations.
* Added support for normalizing the false color visualization across all images loaded in the viewer.

### Fixed
* Corrected tab list image names: Resolved an issue with incorrect image name display in the tab list.
* Fixed scrollbar overlap: Resolved a bug where the scrollbar obscured the image list.
* Preserved image load order: Ensured that the original order of images is maintained when loading multiple files simultaneously.
* Fixed an issue with loading EXRs that were not three-channel images.


## [1.0.6] - 2023-04-10
### Added
- Better error handling.
### Fixed
- Opening images without specifying a workspace.

## [1.0.5] - 2023-03-21
### Fixed
- Missing webworker code in the package.

## [1.0.4] - 2023-03-19
### Added
- Histogram computation, including pixel values of images and error metrics.
- Right-click menu entry for opening all images inside the directory.

## [1.0.3] - 2023-02-20
### Fixed
- Loading images in Windows now works again.

## [1.0.2] - 2023-02-19
### Added
- Added support for loading animated images (`APNG` and `GIF`).
- Added button to play/pause video display.
- Added keybinding for closing all images (`shift+q`).

### Changed
- Improved initialization of the viewer.
- Removed limitation of not being able to close the first image used to open the viewer.

## [1.0.1] - 2023-02-18
### Added
- Now it is possible to load images from outside of the current workspace path.
- Loading BMP images `.bmp` is now supported by the extension.

### Changed
- Reloading images now works always.

## [1.0.0] - 2023-01-16
### Added
- Support for different tone mappings: sRGB, inverse gamma, false color, and positive/negative colors.
- Support for computing different error metrics between images.
- Visualization of pixel values from the viewer.

### Changed
- When opening different images, they reuse the same viewer window.
- Improved handling of fitting the image to the available viewport.

## [0.0.5] - 2022-01-17
### Changed 
- Minor update to the README

### Removed
- Right-click menu

## [0.0.4] - 2022-01-16
### Changed 
- Added teaser to the README

## [0.0.3] - 2021-12-16
### Added 
- Support for reloading images.

## [0.0.2] - 2021-12-05
### Changed 
- Modified extension bundle so loading times are smaller.

## [0.0.1] - 2021-12-30
### Added 
- Basic unique image viewer.
- Load both LDR and HDR image files.
- Zoom with centering given mouse position.
- Basic GUI with exposure control.
