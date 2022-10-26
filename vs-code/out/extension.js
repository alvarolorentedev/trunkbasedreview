'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const util_1 = require("util");
const vscode = require("vscode");
let commentId = 1;
class NoteComment {
    constructor(body, mode, author, parent, contextValue) {
        this.body = body;
        this.mode = mode;
        this.author = author;
        this.parent = parent;
        this.contextValue = contextValue;
        this.id = ++commentId;
        this.savedBody = this.body;
    }
}
function activate(context) {
    let reviewConfigs = {};
    const commentController = vscode.comments.createCommentController('trunk-based-review', 'Trunk based development review comments');
    context.subscriptions.push(commentController);
    vscode.workspace.workspaceFolders?.forEach(folder => {
        const reviewFile = vscode.Uri.joinPath(folder.uri, '.review', 'unresolved.json');
        Promise.resolve(vscode.workspace.openTextDocument(vscode.Uri.file(reviewFile.path))).then((document) => {
            reviewConfigs[folder.uri.path] = JSON.parse(document.getText());
            reviewConfigs[folder.uri.path].threads.forEach((element) => {
                commentController.createCommentThread(vscode.Uri.joinPath(folder.uri, element.file), new vscode.Range(element.range.startLine, element.range.startCharacter, element.range.endLine, element.range.endCharacter), element.comments.map((comment) => new NoteComment(comment.text, vscode.CommentMode.Preview, { name: comment.owner })));
            });
        }).catch(() => console.log(`${folder.name} workspace does not use trunk based review`));
    });
    commentController.commentingRangeProvider = {
        provideCommentingRanges: (document, token) => {
            const lineCount = document.lineCount;
            return [new vscode.Range(0, 0, lineCount - 1, 0)];
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.createNote', (reply) => {
        replyNote(reply);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.replyNote', (reply) => {
        replyNote(reply);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.startDraft', (reply) => {
        const thread = reply.thread;
        thread.contextValue = 'draft';
        const newComment = new NoteComment(reply.text, vscode.CommentMode.Preview, { name: 'vscode' }, thread);
        newComment.label = 'pending';
        thread.comments = [...thread.comments, newComment];
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.finishDraft', (reply) => {
        const thread = reply.thread;
        if (!thread) {
            return;
        }
        thread.contextValue = undefined;
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
        if (reply.text) {
            const newComment = new NoteComment(reply.text, vscode.CommentMode.Preview, { name: 'vscode' }, thread);
            thread.comments = [...thread.comments, newComment].map(comment => {
                comment.label = undefined;
                return comment;
            });
            saveWorkspaceNotes(thread);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.deleteNoteComment', (comment) => {
        const thread = comment.parent;
        if (!thread) {
            return;
        }
        thread.comments = thread.comments.filter(cmt => cmt.id !== comment.id);
        saveWorkspaceNotes(thread);
        if (thread.comments.length === 0) {
            removeThreadFromWorkspaceNotes(thread);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.deleteNote', (thread) => {
        removeThreadFromWorkspaceNotes(thread);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.cancelsaveNote', (comment) => {
        if (!comment.parent) {
            return;
        }
        comment.parent.comments = comment.parent.comments.map(cmt => {
            if (cmt.id === comment.id) {
                cmt.body = cmt.savedBody;
                cmt.mode = vscode.CommentMode.Preview;
            }
            return cmt;
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.saveNote', (comment) => {
        if (!comment.parent) {
            return;
        }
        comment.parent.comments = comment.parent.comments.map(cmt => {
            if (cmt.id === comment.id) {
                cmt.savedBody = cmt.body;
                cmt.mode = vscode.CommentMode.Preview;
            }
            return cmt;
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.editNote', (comment) => {
        if (!comment.parent) {
            return;
        }
        comment.parent.comments = comment.parent.comments.map(cmt => {
            if (cmt.id === comment.id) {
                cmt.mode = vscode.CommentMode.Editing;
            }
            return cmt;
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.dispose', () => {
        commentController.dispose();
    }));
    function replyNote(reply) {
        const thread = reply.thread;
        const newComment = new NoteComment(reply.text, vscode.CommentMode.Preview, { name: 'vscode' }, thread, thread.comments.length ? 'canDelete' : undefined);
        if (thread.contextValue === 'draft') {
            newComment.label = 'pending';
        }
        thread.comments = [...thread.comments, newComment];
        saveWorkspaceNotes(thread);
    }
    function removeThreadFromWorkspaceNotes(thread) {
        const workspaceUri = vscode.workspace.getWorkspaceFolder(thread.uri)?.uri;
        const workspacePath = workspaceUri?.path || "";
        const fileSubPath = thread.uri.path.replace(workspacePath, "");
        reviewConfigs[workspacePath].threads = reviewConfigs[workspacePath].threads.map((threadJson) => {
            if (threadJson.file != fileSubPath || !thread.range.isEqual(new vscode.Range(threadJson.range.startLine, threadJson.range.startCharacter, threadJson.range.endLine, threadJson.range.endCharacter)))
                return threadJson;
        }).filter((thread) => thread);
        const reviewFile = vscode.Uri.joinPath(workspaceUri, '.review', 'unresolved.json');
        vscode.workspace.fs.writeFile(reviewFile, new util_1.TextEncoder().encode(JSON.stringify(reviewConfigs[workspacePath], undefined, 4)));
        thread.dispose();
    }
    function saveWorkspaceNotes(thread) {
        const workspaceUri = vscode.workspace.getWorkspaceFolder(thread.uri)?.uri;
        const workspacePath = workspaceUri?.path || "";
        const fileSubPath = thread.uri.path.replace(workspacePath, "");
        let addedToExistingThread = false;
        if (!reviewConfigs[workspacePath]) {
            reviewConfigs[workspacePath] = {
                threads: []
            };
        }
        reviewConfigs[workspacePath].threads = reviewConfigs[workspacePath].threads.map((threadJson) => {
            if (threadJson.file != fileSubPath || !thread.range.isEqual(new vscode.Range(threadJson.range.startLine, threadJson.range.startCharacter, threadJson.range.endLine, threadJson.range.endCharacter)))
                return threadJson;
            addedToExistingThread = true;
            threadJson.comments = thread.comments.map((comment) => ({
                owner: comment.author.name,
                text: comment.body
            }));
            return threadJson;
        });
        if (!addedToExistingThread)
            reviewConfigs[workspacePath].threads = [...reviewConfigs[workspacePath].threads, {
                    file: fileSubPath,
                    range: {
                        startLine: thread.range.start.line,
                        startCharacter: thread.range.start.character,
                        endLine: thread.range.end.line,
                        endCharacter: thread.range.end.character,
                    },
                    comments: thread.comments.map((comment) => ({
                        owner: comment.author.name,
                        text: comment.body
                    }))
                }];
        const reviewFile = vscode.Uri.joinPath(workspaceUri, '.review', 'unresolved.json');
        vscode.workspace.fs.writeFile(reviewFile, new util_1.TextEncoder().encode(JSON.stringify(reviewConfigs[workspacePath], undefined, 4)));
    }
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map