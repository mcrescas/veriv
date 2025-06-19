import * as vscode from 'vscode';
import { ExrPreview } from './exrPreview';
import { VerivSingleton } from './singleton';

export class ExrCustomProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'veriv.exr';

  constructor(private readonly extensionRoot: vscode.Uri) {}

  public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: (): void => {} };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewEditor: vscode.WebviewPanel
  ): Promise<void> {

    vscode.commands.executeCommand("veriv.open", [document.uri]);
    webviewEditor.dispose();
  }

  public get activePreview(): ExrPreview | undefined {
    const singleton = VerivSingleton.getInstance();
    return singleton._activePreview;
  }

  private setActivePreview(value: ExrPreview | undefined): void {
    const singleton = VerivSingleton.getInstance();
    singleton._activePreview = value;
  }
}
