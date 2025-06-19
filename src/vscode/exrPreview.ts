// import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable } from './disposable';

import html_file from './index.html';

type PreviewState = 'Disposed' | 'Visible' | 'Active';

export class ExrPreview extends Disposable {
	private _previewState: PreviewState = 'Visible';
	public roots: vscode.Uri[];

	constructor(
		private readonly extensionRoot: vscode.Uri,
		public readonly webviewEditor: vscode.WebviewPanel,
		public readonly imageUris: vscode.Uri[]
	) {
		super();

		// Relaxed origin in the local machine – needed for opening images from outside the current workspace
		const roots = [];

		// Get data from file
		if (imageUris != undefined) {
			for (let i = 0; i < imageUris.length; i++) {
				const imageUri = imageUris[i];

				const match = imageUri.path.match(/\/([a-zA-Z]:\/)/);
				if (match != null) {
					const new_uri = imageUri.with({ path: match[0] });
					roots.push(new_uri);
				} else {
					const new_uri = imageUri.with({ path: '/' });
					roots.push(new_uri);
				}
			}
		}

		// Get data from workspaces
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const maxN = (workspaceFolders != undefined) ? workspaceFolders.length : -1;
		if (workspaceFolders != undefined) {
			for (let i = 0; i < maxN; i++) {
				const uri_w = workspaceFolders[i].uri;
				const match = uri_w.path.match(/\/([a-zA-Z]:\/)/);
				if (match != null) {
					const new_uri = uri_w.with({ path: match[0] });
					roots.push(new_uri);
				} else {
					const new_uri = uri_w.with({ path: '/' });
					roots.push(new_uri);
				}
			}
		}

		if (roots.length == 0)
			vscode.window.showErrorMessage('Please reopen VERIV inside a workspace (folder) or directly with an image.');

		// Extension folder
		if (extensionRoot != undefined)
			roots.push(extensionRoot);

		this.roots = roots;

		webviewEditor.webview.options = {
			enableScripts: true,
			localResourceRoots: roots,
		};

		this._register(
			webviewEditor.webview.onDidReceiveMessage((message) => {
				switch (message.command) {
					case 'alert':
						vscode.window.showInformationMessage(message.text);
						return;
					case 'error':
						vscode.window.showErrorMessage(message.text);
						return;
					case 'warning':
						vscode.window.showWarningMessage(message.text);
						return;
					case 'settings': {
						const new_settings = message.settings;
						const old_settings = vscode.workspace.getConfiguration('veriv');
						
						for (const key in new_settings) {
							if (old_settings.has(key) && old_settings.get(key) !== new_settings[key]) {
								old_settings.update(key, new_settings[key], true);
							}
						}
						return;
					}
				}
			})
		);

		this._register(
			webviewEditor.onDidChangeViewState(() => {
				this.update();
			})
		);

		this._register(
			webviewEditor.onDidDispose(() => {
				this._previewState = 'Disposed';
			})
		);

		this.webviewEditor.webview.html = this.getWebviewContents();
		this.update();
	}

	private reload(): void {
		if (this._previewState !== 'Disposed') {
			this.webviewEditor.webview.postMessage({ type: 'reload' });
		}
	}

	private update(): void {
		if (this._previewState === 'Disposed') {
			return;
		}

		if (this.webviewEditor.active) {
			this._previewState = 'Active';
			return;
		}
		this._previewState = 'Visible';
	}

	private getWebviewContents(): string {
		const webview = this.webviewEditor.webview;
		let html = html_file;

		const icon_path = vscode.Uri.joinPath(this.extensionRoot, 'icon.png');
		const icon_path_uri = webview.asWebviewUri(icon_path);
		html = html.replace('${iconURI}', icon_path_uri.toString());

		const worker_prime_path = vscode.Uri.joinPath(this.extensionRoot, 'out', 'worker_prime.js');
		const worker_prime_path_uri = webview.asWebviewUri(worker_prime_path);
		html = html.replace('replace:worker_prime', worker_prime_path_uri.toString());

		return html;
	}
}
