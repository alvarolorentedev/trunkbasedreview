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
		user = {
			name: octoUser.data.login,
			iconPath: vscode.Uri.parse(octoUser.data.avatar_url),
		}
	})
	let reviewConfigs: any = {
	}
	const commentController = vscode.comments.createCommentController('trunk-based-review', 'Trunk based development review comments');
	context.subscriptions.push(commentController);
	vscode.workspace.workspaceFolders?.forEach(
		folder => {
			const unresolvedFile = vscode.Uri.joinPath(folder.uri, '.review', 'unresolved.json')	
			const resolvedFile = vscode.Uri.joinPath(folder.uri, '.review', 'resolved.json')	
			Promise.resolve(vscode.workspace.openTextDocument(vscode.Uri.file(unresolvedFile.path))
			).then((document) => {
				
				if(!reviewConfigs[folder.uri.path])
					reviewConfigs[folder.uri.path] = {}
				reviewConfigs[folder.uri.path].unresolved = JSON.parse(document.getText());
				reviewConfigs[folder.uri.path].unresolved.threads.forEach((element:any) => {
					commentController.createCommentThread(
						vscode.Uri.joinPath(folder.uri, element.file), 
						new vscode.Range(element.range.startLine,element.range.startCharacter,element.range.endLine,element.range.endCharacter), 
						element.comments.map((comment: any) => new NoteComment(comment.text, vscode.CommentMode.Preview, {
							name: comment.owner.name,
							iconPath: vscode.Uri.parse(comment.owner.iconPath),
						} )))
				});
			}).catch(() => console.log(`${folder.name} workspace does not use trunk based review`));
			Promise.resolve(vscode.workspace.openTextDocument(vscode.Uri.file(resolvedFile.path))
			).then((document) => {
				if(!reviewConfigs[folder.uri.path])
					reviewConfigs[folder.uri.path]={}
				reviewConfigs[folder.uri.path].resolved = JSON.parse(document.getText());
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
		
		reviewConfigs[workspacePath].unresolved.threads = reviewConfigs[workspacePath].unresolved.threads.map((threadJson: any) => {
			if (threadJson.file != fileSubPath || !thread.range.isEqual(new vscode.Range(threadJson.range.startLine, threadJson.range.startCharacter, threadJson.range.endLine, threadJson.range.endCharacter)))
				return threadJson
			reviewConfigs[workspacePath].resolved.threads.push(threadJson)
		}).filter((thread: any) => thread)
		const unresolvedFile = vscode.Uri.joinPath(workspaceUri!, '.review', 'unresolved.json')
		vscode.workspace.fs.writeFile(unresolvedFile, new TextEncoder().encode(JSON.stringify(reviewConfigs[workspacePath].unresolved, undefined, 4)));
		const resolvedFile = vscode.Uri.joinPath(workspaceUri!, '.review', 'resolved.json')
		vscode.workspace.fs.writeFile(resolvedFile, new TextEncoder().encode(JSON.stringify(reviewConfigs[workspacePath].resolved, undefined, 4)));
		thread.dispose()
	}
	function saveWorkspaceNotes(thread: vscode.CommentThread){
		const workspaceUri = vscode.workspace.getWorkspaceFolder(thread.uri)?.uri
		const workspacePath = workspaceUri?.path || ""
		const fileSubPath = thread.uri.path.replace(workspacePath, "")
		let addedToExistingThread=false;
		if (!reviewConfigs[workspacePath]) {
			reviewConfigs[workspacePath]={
				unresolved: {
					threads: []
				},
				resolved: {
					threads: []
				}
			}
		}
		reviewConfigs[workspacePath].unresolved.threads = reviewConfigs[workspacePath].unresolved.threads.map((threadJson: any) => {
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
			reviewConfigs[workspacePath].unresolved.threads = [...reviewConfigs[workspacePath].unresolved.threads, {
				file: fileSubPath,
				range: {
					startLine: thread.range.start.line,
					startCharacter: thread.range.start.character,
					endLine: thread.range.end.line,
					endCharacter: thread.range.end.character,
				},
				comments: thread.comments.map((comment: vscode.Comment) => ({
					owner: {
						name: user.name,
						iconPath: user.iconPath?.toString(),
					},
					text: comment.body
				}))
			}]
		const unresolvedFile = vscode.Uri.joinPath(workspaceUri!, '.review', 'unresolved.json')
		vscode.workspace.fs.writeFile(unresolvedFile, new TextEncoder().encode(JSON.stringify(reviewConfigs[workspacePath].unresolved, undefined, 4)));
	}
}
