# `VERIV` - `V`scode `E`xtended `R`ange `I`maging `V`iewer!

This extension provides support for loading and visualizing **LDR** / **HDR** images directly inside Vscode. Apart from that, the viewer contains more useful features than the native one included by default:

* Translation and smooth zooming inside the image, allowing to see pixel values.
* Control for adjusting exposure.
* Different tone mapping possibilities: sRGB, inverse gamma, positive/negative color, and false color visualization.
* Possibility of comparing different images using a specified error metric (Error, Absolute error, Squared Error, Relative Absolute Error, or Relative Squared Error).
* Reloading images is also supported (for `.exr` files).
* Playing the images as a video depending on the user selection of `FPS` (Frames per second).

</br>

![Teaser](https://github.com/mcrescas/veriv/raw/master/images/teaser.png "Teaser")

## Currently supported formats
  * `.exr` - High dynamic-range **(HDR)** image file format.
  * `.png` - Low dynamic-range image without compression.
  * `.jpg` - Low dynamic-range image with compression.

## How to use it

Open a file from one of the supported formats and the viewer will open automatically in a new tab. Note that if the file was modified after opening the viewer, it is possible to update the image using the `reload` button or the specific keybinding.
While the window is not closed, the next open images will reuse the window, allowing you to compare them.

> If you want to see all the possible keybinding, feel free to press `h` or `?` to open the list.

## Contributors

<table>
	<tr>
	<td align="center">
	<a href="https://mcrespo.me"><img src="https://avatars.githubusercontent.com/u/62649574?v=3?s=100" width="100px;" alt=""/><br /><sub><b>Miguel Crespo</b></sub></a><br /> <hr/>
	<a href="https://mcrespo.me" title="Website"><code>[🌍 Web]</code></a> <a href="https://github.com/mcrescas" title="Github"><code>[💾 Github]</code></a>
	</td>
</table>