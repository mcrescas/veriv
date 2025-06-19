import * as vscode from 'vscode';
import { VerivSingleton } from './singleton';

const VALID_EXTENSIONS = ['exr', '.hdr', 'png', 'bmp', 'gif', 'jpg', 'jpeg'];


function openImages(uri: vscode.Uri) {
	vscode.workspace.fs
		.readDirectory(uri)
		.then( (files) => {
			files.sort((a, b) => a[0].toLocaleLowerCase().localeCompare(b[0].toLocaleLowerCase()));

			const path_array = [];
			for (const [fileName, fileType] of files) {
				const path = vscode.Uri.joinPath(uri, fileName);
				const fileExt = fileName.split('.').pop();

				if (fileExt !== undefined && VALID_EXTENSIONS.includes(fileExt)) {
					path_array.push(path);
				}
			}
			vscode.commands.executeCommand("veriv.open", path_array);
		}, (reason) => {
			if (reason instanceof Error) {
				vscode.window.showErrorMessage(
					`Cannot read Directory. Error: ${reason.message}`,
				);
			} else {
				vscode.window.showErrorMessage(`Unknown Error: ${reason}`);
			}
		});
}

function openImagesDir (uri: vscode.Uri) {
	if (typeof uri === 'undefined') {
		vscode.window.showErrorMessage('Please select a folder to open the images inside');
	} else {
		openImages(uri);
	}
}


function reload_images() {
	const singleton = VerivSingleton.getInstance();

	if (!singleton._previews) {
		vscode.window.showErrorMessage('VERIV is not open for reloading images.');
		return;
	}

	// Communicate with webview for reloading images
	singleton._previews.webviewEditor.webview.postMessage({
		command : 'veriv.reload-all-images'
	});
}

export {openImagesDir, reload_images};
