import * as model from "../../../webview/model"
export { getIndent } from "../../../webview/indent"
import * as vscode from "vscode"
import * as utilities from '../../../utilities';
import { ModelDocument } from "../../../webview/model-document";
import { LispTokenCursor } from "../../../webview/token-cursor";

let documents = new Map<vscode.TextDocument, MirroredDocument>();

class MirroredDocument implements ModelDocument {
    constructor(private document: vscode.TextDocument) { }

    get selectionStart(): number {
        return this.document.offsetAt(vscode.window.activeTextEditor.selection.start);
    }
    
    get selectionEnd(): number {
        return this.document.offsetAt(vscode.window.activeTextEditor.selection.end);
    }

    model = new model.LineInputModel(this.document.eol === vscode.EndOfLine.CRLF ? 2 : 1);

    growSelectionStack: [number, number][];

    public getTokenCursor(offset: number = this.selectionEnd, previous: boolean = false): LispTokenCursor {
        return this.model.getTokenCursor(offset, previous);
    }

    public insertString(text: string) {
        const editor = vscode.window.activeTextEditor,
            selection = editor.selection,
            wsEdit = new vscode.WorkspaceEdit(),
            edit = vscode.TextEdit.insert(this.document.positionAt(this.selectionStart), text);
        wsEdit.set(this.document.uri, [edit]);
        vscode.workspace.applyEdit(wsEdit).then((_v) => {
            editor.selection = selection;
        });
    }

    public getSelection() {
        const editor = vscode.window.activeTextEditor,
            selection = editor.selection;
        return this.document.getText(selection);
    }

    public delete() {
        vscode.commands.executeCommand('deleteRight');
    }
    
    public backspace() {
        vscode.commands.executeCommand('deleteLeft');
    }
}

let registered = false;

function processChanges(event: vscode.TextDocumentChangeEvent) {
    const model = documents.get(event.document).model;
    for(let change of event.contentChanges) {
        // vscode may have a \r\n marker, so it's line offsets are all wrong.
        const myStartOffset = model.getOffsetForLine(change.range.start.line)+change.range.start.character
        const myEndOffset = model.getOffsetForLine(change.range.end.line)+change.range.end.character
        model.changeRange(myStartOffset, myEndOffset, change.text.replace(/\r\n/g, '\n'))
    }
    model.flushChanges()

    // we must clear out the repaint cache data, since we don't use it.
    model.dirtyLines = []
    model.insertedLines.clear()
    model.deletedLines.clear();
}

export function getDocument(doc: vscode.TextDocument) {
    return documents.get(doc)
}

export function getDocumentOffset(doc: vscode.TextDocument, position: vscode.Position) {
    let model = getDocument(doc).model;
    return model.getOffsetForLine(position.line)+position.character;
}

function addDocument(doc: vscode.TextDocument): boolean {
    if (doc && doc.languageId == "clojure") {
        if (!documents.has(doc)) {
            const document = new MirroredDocument(doc);
            document.model.insertString(0, doc.getText())
            documents.set(doc, document);
            return false;
        } else {
            return true;
        }
    }
    return false;
}

export function activate() {
    // the last thing we want is to register twice and receive double events...
    if(registered)
        return;
    registered = true;
    
    addDocument(utilities.getDocument({}));

    vscode.workspace.onDidCloseTextDocument(e => {
        if(e.languageId == "clojure") {
            documents.delete(e);
        }
    })
    
    vscode.window.onDidChangeActiveTextEditor(e => {
        if(e && e.document && e.document.languageId == "clojure") {
            addDocument(e.document);
        }
    });
    
    vscode.workspace.onDidOpenTextDocument(doc => {
        addDocument(doc);
    });

    vscode.workspace.onDidChangeTextDocument(e => {
        if (addDocument(e.document)) {
            processChanges(e);
        }
    });
}
