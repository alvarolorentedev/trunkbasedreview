'use strict';

import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import * as Octokit from '@octokit/rest';

const GITHUB_AUTH_PROVIDER_ID = 'github';
const SCOPES = ['user:email', 'repo', 'workflow'];

export class Credentials {
	private octokit: Octokit.Octokit | undefined;

	async getOctokit(): Promise<Octokit.Octokit> {
		if (this.octokit) {
			return this.octokit;
		}
		const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });
		this.octokit = new Octokit.Octokit({
			auth: session.accessToken
		});

		return this.octokit;
	}
}

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
	const github = new Credentials()
	let user: any = {
		name: 'vs-code',
	}
	github.getOctokit().then(oktokit => oktokit.rest.users.getAuthenticated()).then((octoUser: any) => {
		console.log(octoUser)
		user = {
			name: octoUser.data.login,
			iconPath: vscode.Uri.parse(octoUser.data.avatar_url),
		}
	})
	let reviewConfigs: any = {}
	const commentController = vscode.comments.createCommentController('trunk-based-review', 'Trunk based development review comments');
	context.subscriptions.push(commentController);
	vscode.workspace.workspaceFolders?.forEach(
		folder => {
			const reviewFile = vscode.Uri.joinPath(folder.uri, '.review', 'unresolved.json')	
			Promise.resolve(vscode.workspace.openTextDocument(vscode.Uri.file(reviewFile.path))
			).then((document) => {
					reviewConfigs[folder.uri.path] = JSON.parse(document.getText());
					reviewConfigs[folder.uri.path].threads.forEach((element:any) => {
						commentController.createCommentThread(
							vscode.Uri.joinPath(folder.uri, element.file), 
							new vscode.Range(element.range.startLine,element.range.startCharacter,element.range.endLine,element.range.endCharacter), 
							element.comments.map((comment: any) => new NoteComment(comment.text, vscode.CommentMode.Preview, comment.owner )))
					});
			}).catch(() => console.log(`${folder.name} workspace does not use trunk based review`));
	}
	)

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
		const newComment = new NoteComment(reply.text, vscode.CommentMode.Preview, user, thread);
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
			const newComment = new NoteComment(reply.text, vscode.CommentMode.Preview, user, thread);
			thread.comments = [...thread.comments, newComment].map(comment => {
				comment.label = undefined;
				return comment;
			});
			saveWorkspaceNotes(thread)
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.deleteNoteComment', (comment: NoteComment) => {
		const thread = comment.parent;
		if (!thread) {
			return;
		}

		thread.comments = thread.comments.filter(cmt => (cmt as NoteComment).id !== comment.id);
		saveWorkspaceNotes(thread)
		if (thread.comments.length === 0) {
			removeThreadFromWorkspaceNotes(thread)
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('trunkbasedreview.deleteNote', (thread: vscode.CommentThread) => {
		removeThreadFromWorkspaceNotes(thread)
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
		const newComment = new NoteComment(reply.text, vscode.CommentMode.Preview, user, thread, thread.comments.length ? 'canDelete' : undefined);
		if (thread.contextValue === 'draft') {
			newComment.label = 'pending';
		}

		thread.comments = [...thread.comments, newComment];
		saveWorkspaceNotes(thread)
	}

	function removeThreadFromWorkspaceNotes (thread: vscode.CommentThread){
		const workspaceUri = vscode.workspace.getWorkspaceFolder(thread.uri)?.uri
		const workspacePath = workspaceUri?.path || ""
		const fileSubPath = thread.uri.path.replace(workspacePath, "")
		reviewConfigs[workspacePath].threads = reviewConfigs[workspacePath].threads.map((threadJson: any) => {
			if (threadJson.file != fileSubPath || !thread.range.isEqual(new vscode.Range(threadJson.range.startLine, threadJson.range.startCharacter, threadJson.range.endLine, threadJson.range.endCharacter)))
				return threadJson
		}).filter((thread: any) => thread)
		const reviewFile = vscode.Uri.joinPath(workspaceUri!, '.review', 'unresolved.json')
		vscode.workspace.fs.writeFile(reviewFile, new TextEncoder().encode(JSON.stringify(reviewConfigs[workspacePath], undefined, 4)));
		thread.dispose()
	}
	function saveWorkspaceNotes(thread: vscode.CommentThread){
		const workspaceUri = vscode.workspace.getWorkspaceFolder(thread.uri)?.uri
		const workspacePath = workspaceUri?.path || ""
		const fileSubPath = thread.uri.path.replace(workspacePath, "")
		let addedToExistingThread=false;
		if (!reviewConfigs[workspacePath]) {
			reviewConfigs[workspacePath]={
				threads: []
			}
		}
		reviewConfigs[workspacePath].threads = reviewConfigs[workspacePath].threads.map((threadJson: any) => {
			if (threadJson.file != fileSubPath || !thread.range.isEqual(new vscode.Range(threadJson.range.startLine, threadJson.range.startCharacter, threadJson.range.endLine, threadJson.range.endCharacter)))
				return threadJson
			addedToExistingThread = true
			threadJson.comments = thread.comments.map((comment: vscode.Comment) => ({
				owner: {
					name: comment.author.name,
					iconPath: comment.author.iconPath?.toString(),
				},
				text: comment.body
			}))
			return threadJson
		})
		if(!addedToExistingThread)
			reviewConfigs[workspacePath].threads = [...reviewConfigs[workspacePath].threads, {
				file: fileSubPath,
				range: {
					startLine: thread.range.start.line,
					startCharacter: thread.range.start.character,
					endLine: thread.range.end.line,
					endCharacter: thread.range.end.character,
				},
				comments: thread.comments.map((comment: vscode.Comment) => ({
					owner: user,
					text: comment.body
				}))
			}]
		const reviewFile = vscode.Uri.joinPath(workspaceUri!, '.review', 'unresolved.json')
		vscode.workspace.fs.writeFile(reviewFile, new TextEncoder().encode(JSON.stringify(reviewConfigs[workspacePath], undefined, 4)));
	}
}
