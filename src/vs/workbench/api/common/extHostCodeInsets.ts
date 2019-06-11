/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import * as vscode from 'vscode';
import { MainThreadEditorInsetsShape } from './extHost.protocol';
import { ExtHostEditors } from 'vs/workbench/api/common/extHostTextEditors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ExtHostTextEditor } from 'vs/workbench/api/common/extHostTextEditor';

export class ExtHostEditorInsets implements ExtHostEditorInsets {

	private _handlePool = 0;
	private _disposables = new DisposableStore();
	private _insets = new Map<number, { editor: vscode.TextEditor, inset: vscode.WebviewEditorInset, onDidReceiveMessage: Emitter<any> }>();

	constructor(
		private readonly _proxy: MainThreadEditorInsetsShape,
		private readonly _editors: ExtHostEditors
	) {

		// dispose editor inset whenever the hosting editor goes away
		this._disposables.add(_editors.onDidChangeVisibleTextEditors(() => {
			const visibleEditor = _editors.getVisibleTextEditors();
			this._insets.forEach(value => {
				if (visibleEditor.indexOf(value.editor) < 0) {
					value.inset.dispose(); // will remove from `this._insets`
				}
			});
		}));
	}

	dispose(): void {
		this._insets.forEach(value => value.inset.dispose());
		this._disposables.dispose();
	}

	createWebviewEditorInset(editor: vscode.TextEditor, range: vscode.Range, options?: vscode.WebviewOptions): vscode.WebviewEditorInset {

		let apiEditor: ExtHostTextEditor | undefined;
		for (const candidate of this._editors.getVisibleTextEditors()) {
			if (candidate === editor) {
				apiEditor = <ExtHostTextEditor>candidate;
				break;
			}
		}
		if (!apiEditor) {
			throw new Error('not a visible editor');
		}

		const that = this;
		const handle = this._handlePool++;
		const onDidReceiveMessage = new Emitter<any>();
		const onDidDispose = new Emitter<void>();

		const webview = new class implements vscode.Webview {

			private _html: string = '';
			private _options: vscode.WebviewOptions;

			set options(value: vscode.WebviewOptions) {
				this._options = value;
				that._proxy.$setOptions(handle, value);
			}

			get options(): vscode.WebviewOptions {
				return this._options;
			}

			set html(value: string) {
				this._html = value;
				that._proxy.$setHtml(handle, value);
			}

			get html(): string {
				return this._html;
			}

			get onDidReceiveMessage(): vscode.Event<any> {
				return onDidReceiveMessage.event;
			}

			postMessage(message: any): Thenable<boolean> {
				return that._proxy.$postMessage(handle, message);
			}
		};

		const inset = new class implements vscode.WebviewEditorInset {

			readonly editor: vscode.TextEditor = editor;
			readonly range: vscode.Range = range;
			readonly webview: vscode.Webview = webview;
			readonly onDidDispose: vscode.Event<void> = onDidDispose.event;

			dispose(): void {
				if (that._insets.has(handle)) {
					that._insets.delete(handle);
					that._proxy.$disposeEditorInset(handle);
					onDidDispose.fire();

					// final cleanup
					onDidDispose.dispose();
					onDidReceiveMessage.dispose();
				}
			}
		};

		this._proxy.$createEditorInset(handle, apiEditor.id, apiEditor.document.uri, typeConverters.Range.from(range), options || {});
		this._insets.set(handle, { editor, inset, onDidReceiveMessage });

		return inset;
	}

	$onDidDispose(handle: number): void {
		const value = this._insets.get(handle);
		if (value) {
			value.inset.dispose();
		}
	}

	$onDidReceiveMessage(handle: number, message: any): void {
		const value = this._insets.get(handle);
		if (value) {
			value.onDidReceiveMessage.fire(message);
		}
	}
}
