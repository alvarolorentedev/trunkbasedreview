'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
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
    // A `CommentController` is able to provide comments for documents.
    const commentController = vscode.comments.createCommentController('comment-sample', 'Comment API Sample');
    context.subscriptions.push(commentController);
    vscode.workspace.openTextDocument(vscode.Uri.file('C:\\Users\\alvaro.perez\\OneDrive - ClimatePartner GmbH\\Desktop\\review.json')).then((document) => {
        let { threads } = JSON.parse(document.getText());
        threads.forEach((element) => {
            commentController.createCommentThread(vscode.Uri.file(element.file), new vscode.Range(element.range.startLine, element.range.startCharacter, element.range.endLine, element.range.endCharacter), element.comments.map((comment) => new NoteComment(comment.text, vscode.CommentMode.Preview, { name: comment.owner })));
        });
        console.log(threads);
    });
    commentController.createCommentThread(vscode.Uri.file('C:\\Users\\alvaro.perez\\OneDrive - ClimatePartner GmbH\\Desktop\\test.txt'), new vscode.Range(0, 0, 0, 0), [
        new NoteComment("awesome", vscode.CommentMode.Preview, { name: 'vscode' }, undefined, undefined)
    ]);
    // A `CommentingRangeProvider` controls where gutter decorations that allow adding comments are shown
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
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.deleteNoteComment', (comment) => {
        const thread = comment.parent;
        if (!thread) {
            return;
        }
        thread.comments = thread.comments.filter(cmt => cmt.id !== comment.id);
        if (thread.comments.length === 0) {
            thread.dispose();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.deleteNote', (thread) => {
        thread.dispose();
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
        console.log(thread);
    }
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map