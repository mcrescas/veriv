import * as vscode from 'vscode';
import { ExrCustomProvider } from './exrProvider';
import { VerivSingleton } from './singleton';
import { ExrPreview } from './exrPreview';
import { openImagesDir, reload_images } from './utils';

export function activate(context: vscode.ExtensionContext): void {
	const extensionRoot = context.extensionUri;

	// Register our custom editor provider
	const provider = new ExrCustomProvider(extensionRoot);

	const file_extensions_accepted = [
		"veriv.exr",
		"veriv.hdr",
		"veriv.png",
		"veriv.jpeg",
		"veriv.bmp",
		"veriv.gif",
	];

	// Register the custom editor provider for the specified file extensions
	for (const ext of file_extensions_accepted) {
		context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			ext,
			provider,
			{
			supportsMultipleEditorsPerDocument: false,
			webviewOptions: {
				enableFindWidget: false, // default
				retainContextWhenHidden: true,
			},
			}
		)
		);
	}

	// Register the creation of the viewer / opening
	context.subscriptions.push(
		vscode.commands.registerCommand('veriv.open', (uri_documents) => {
			const singleton = VerivSingleton.getInstance();
			// If no viewer is active
			if (!singleton._previews) {
				const panel_editor = vscode.window.createWebviewPanel(
				'veriv', // Identifies the type of the webview. Used internally
				'VERIV', // Title of the panel displayed to the user
				vscode.ViewColumn.Active, // Editor column to show the new webview panel in.
				{
					enableFindWidget: false,
					retainContextWhenHidden: true,
				}
				);

				// Set icon of the webview
				panel_editor.iconPath = vscode.Uri.joinPath(extensionRoot, "icon.png");

				const preview = new ExrPreview(
					extensionRoot,
					panel_editor,
					uri_documents
				);
				singleton._previews = preview;

				panel_editor.onDidDispose(() => {
					singleton._previews = null;
				});


				/*
					Obtain settings and pass them to the webview
				*/
				const vscode_settings = vscode.workspace.getConfiguration('veriv');
				const settings = {
					"colormap" : vscode_settings.get<string>('colormap'),
					"interpolation" : vscode_settings.get<string>('interpolation'),
					"enableSidebar" : vscode_settings.get<boolean>('enableSidebar'),
				};

				singleton._previews.webviewEditor.webview.postMessage({
					command: 'veriv.settings',
					settings: settings,
				});

				singleton._previews.webviewEditor.reveal(singleton._previews.webviewEditor.viewColumn);

			} else {
				singleton._previews.webviewEditor.reveal(singleton._previews.webviewEditor.viewColumn);
			}

			// If we want to open an especific image
			if (uri_documents !== undefined) {
				const webview_uris = [];
				for (let i = 0; i < uri_documents.length; i++) {
					const uri_document = singleton._previews.webviewEditor.webview.asWebviewUri(uri_documents[i]).toString();
					webview_uris.push(uri_document);
				}

				singleton._previews.webviewEditor.webview.postMessage({
					command: 'veriv.load',
					paths: webview_uris,
				});
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
		'veriv.open-dir-images',
		openImagesDir,
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
		'veriv.reload-all-images',
		reload_images,
		)
	);

}

export function deactivate(): void { }
