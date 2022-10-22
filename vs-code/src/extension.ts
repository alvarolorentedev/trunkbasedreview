'use strict';

import * as vscode from 'vscode';

let commentId = 1;

class NoteComment implements vscode.Comment {
	id: number;
	label: string | undefined;
	savedBody: string | vscode.MarkdownString; // for the Cancel button
	constructor(
		public body: string | vscode.MarkdownString,
		public mode: vscode.CommentMode,
		public author: vscode.CommentAuthorInformation,
		public parent?: vscode.CommentThread,
		public contextValue?: string
	) {
		this.id = ++commentId;
		this.savedBody = this.body;
	}
}

export function activate(context: vscode.ExtensionContext) {
	// A `CommentController` is able to provide comments for documents.
	const commentController = vscode.comments.createCommentController('comment-sample', 'Comment API Sample');
	context.subscriptions.push(commentController);
	console.log("hello")
	vscode.workspace.openTextDocument(vscode.Uri.file('C:\\Users\\alvaro.perez\\OneDrive - ClimatePartner GmbH\\Desktop\\review.json')
	).then((document) => {
		let {threads} = JSON.parse(document.getText());
		threads.forEach((element:any) => {
			commentController.createCommentThread(
				vscode.Uri.file(element.file), 
				new vscode.Range(element.range.startLine,element.range.startCharacter,element.range.endLine,element.range.endCharacter), 
				element.comments.map((comment: any) => new NoteComment(comment.text, vscode.CommentMode.Preview, { name: comment.owner })))
		});
		console.log(threads)
	});
	commentController.createCommentThread(vscode.Uri.file('C:\\Users\\alvaro.perez\\OneDrive - ClimatePartner GmbH\\Desktop\\test.txt'), new vscode.Range(0,0,0,0), [
	 	new NoteComment("awesome", vscode.CommentMode.Preview, { name: 'vscode' }, undefined, undefined)
	 ])
	
	// A `CommentingRangeProvider` controls where gutter decorations that allow adding comments are shown
	commentController.commentingRangeProvider = {
		provideCommentingRanges: (document: vscode.TextDocument, token: vscode.CancellationToken) => {
			const lineCount = document.lineCount;
			return [new vscode.Range(0, 0, lineCount - 1, 0)];
		}
	};

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.createNote', (reply: vscode.CommentReply) => {
		replyNote(reply);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.replyNote', (reply: vscode.CommentReply) => {
		replyNote(reply);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.startDraft', (reply: vscode.CommentReply) => {
		const thread = reply.thread;
		thread.contextValue = 'draft';
		const newComment = new NoteComment(reply.text, vscode.CommentMode.Preview, { name: 'vscode' }, thread);
		newComment.label = 'pending';
		thread.comments = [...thread.comments, newComment];
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.finishDraft', (reply: vscode.CommentReply) => {
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

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.deleteNoteComment', (comment: NoteComment) => {
		const thread = comment.parent;
		if (!thread) {
			return;
		}

		thread.comments = thread.comments.filter(cmt => (cmt as NoteComment).id !== comment.id);

		if (thread.comments.length === 0) {
			thread.dispose();
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.deleteNote', (thread: vscode.CommentThread) => {
		thread.dispose();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.cancelsaveNote', (comment: NoteComment) => {
		if (!comment.parent) {
			return;
		}

		comment.parent.comments = comment.parent.comments.map(cmt => {
			if ((cmt as NoteComment).id === comment.id) {
				cmt.body = (cmt as NoteComment).savedBody;
				cmt.mode = vscode.CommentMode.Preview;
			}

			return cmt;
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.saveNote', (comment: NoteComment) => {
		if (!comment.parent) {
			return;
		}

		comment.parent.comments = comment.parent.comments.map(cmt => {
			if ((cmt as NoteComment).id === comment.id) {
				(cmt as NoteComment).savedBody = cmt.body;
				cmt.mode = vscode.CommentMode.Preview;
			}

			return cmt;
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.editNote', (comment: NoteComment) => {
		if (!comment.parent) {
			return;
		}

		comment.parent.comments = comment.parent.comments.map(cmt => {
			if ((cmt as NoteComment).id === comment.id) {
				cmt.mode = vscode.CommentMode.Editing;
			}

			return cmt;
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.dispose', () => {
		commentController.dispose();
	}));

	function replyNote(reply: vscode.CommentReply) {
		const thread = reply.thread;
		const newComment = new NoteComment(reply.text, vscode.CommentMode.Preview, { name: 'vscode' }, thread, thread.comments.length ? 'canDelete' : undefined);
		if (thread.contextValue === 'draft') {
			newComment.label = 'pending';
		}

		thread.comments = [...thread.comments, newComment];
		console.log(thread)
	}
}
