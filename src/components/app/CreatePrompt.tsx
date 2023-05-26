import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useRequireActiveOrg } from '../propelauth';
import { trpc } from '../trpc';
import { Layout } from './Layout';
import { defaultPrivacyLevel, Message, PrivacyLevel, PromptState, resolveTemplates } from './utils';

export function CreatePrompt() {
	const state = useLocation().state as PromptState;

	const [title, setTitle] = useState('Create prompt');
	return (
		<Layout title={title}>
			<EditPromptControls
				promptName={state?.prompt?.title}
				promptDescription={state?.prompt?.description}
				promptTags={state?.prompt?.tags}
				promptVisibility={defaultPrivacyLevel(state?.prompt?.privacyLevel)}
				setTitle={setTitle}
				template={
					state?.prompt?.template || [
						{
							role: 'system',
							content: `Talk like a pirate.`,
						},
						{
							role: 'user',
							content: `Your name is {{name||Brick Tamland}}. You love lamp.`,
						},
					]
				}
			/>
		</Layout>
	);
}

export const EditPromptControls = ({
	promptId,
	promptName,
	promptDescription,
	promptTags,
	promptVisibility,
	template: initialMessages,
	setTitle,
}: {
	promptId?: string; // if present, edit existing prompt
	promptName?: string;
	promptDescription?: string;
	promptTags?: string[];
	promptVisibility?: PrivacyLevel;
	template: Message[];
	setTitle?: (title: string) => void;
}) => {
	const queryClient = useQueryClient();
	const [messages, setMessages] = useState<Message[]>(initialMessages);
	const len = messages.length;
	const initialLen = initialMessages.length;
	useEffect(() => {
		const n = Math.max(0, len - initialLen);
		if (n >= 0) {
			setTitle?.(`Create pro${'o'.repeat(n)}mpt`);
		}
	}, [len, initialLen]);
	const runPromptMutation = trpc.prompts.runPrompt.useMutation({
		onSettled: () => {
			queryClient.invalidateQueries(getQueryKey(trpc.prompts.getDefaultKey));
		},
		onSuccess(e) {
			if (e.message) {
				setMessages((messages) => [
					...messages,
					{
						role: 'assistant',
						content: e.message,
					},
					{
						role: 'user',
						content: '',
					},
				]);
			}
		},
	});
	const { hasAnyKey, hasKey, defaultKeyData } = useKeys();

	const navigate = useNavigate();

	const addPromptMutation = trpc.prompts.createPrompt.useMutation({
		onSettled: () => {
			queryClient.invalidateQueries(getQueryKey(trpc.prompts.getPrompts));
		},
		onSuccess: (promptId) => {
			navigate(`/app/prompts/${promptId}`);
		},
	});
	const [saved, setSaved] = useState<string>();
	const updatePromptMutation = trpc.prompts.updatePrompt.useMutation({
		onSettled: () => {
			queryClient.invalidateQueries(getQueryKey(trpc.prompts.getPrompts));
		},
		onSuccess: (promptId) => {
			setSaved(promptId);
			setTimeout(() => setSaved((x) => (x === promptId ? undefined : x)), 500);
		},
	});

	const deletePromptMutation = trpc.prompts.deletePrompt.useMutation({
		onSuccess: () => {
			navigate(`/app/prompts`);
		},
		onSettled: () => {
			queryClient.invalidateQueries(getQueryKey(trpc.prompts.getPrompts));
		},
	});

	return (
		<div className="mt-4 mb-36 px-4 sm:px-6 lg:px-8 border border-gray-300 rounded-md py-8 flex flex-col gap-10">
			<div className="flex flex-col gap-4">
				<fieldset>
					<legend className="text-base font-medium text-gray-900">Chat history</legend>
					{messages.map((message, index) => (
						<div className="mt-4" key={index}>
							<label className="block text-sm font-medium text-gray-700">
								{message.role === 'user'
									? 'User'
									: message.role === 'assistant'
									? 'Assistant'
									: 'System'}{' '}
								template
							</label>
							<div className="mt-1 w-full">
								<div
									contentEditable
									// suppressContentEditableWarning={true}
									data-content={message.content}
									data-role={message.role}
									data-last={index === messages.length - 1}
									ref={setValueOnMount}
									role="textbox"
									aria-multiline="true"
									onFocus={(e) => {
										// https://codepen.io/sinfullycoded/details/oNLBJpm
										window.getSelection()?.selectAllChildren(e.currentTarget);
										window.getSelection()?.collapseToEnd();
									}}
									onBlur={(e) => {
										e.currentTarget.innerText = e.currentTarget.innerText || '';
									}}
									onInput={(e) => {
										const newText = e.currentTarget.innerText;
										setMessages((messages) => {
											const newMessages = [...messages];
											const x = newMessages[index];
											if (x) {
												x.content = newText;
											}
											return newMessages;
										});
									}}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && e.metaKey) {
											runPromptMutation.mutate({
												messages: resolveTemplates(messages),
											});
										}
									}}
									className={clsx(
										message.role === 'system'
											? 'bg-gray-200'
											: message.role === 'assistant'
											? 'bg-gray-100'
											: '',
										'shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2 min-h-[8rem] resize-y overflow-y-scroll whitespace-pre-wrap'
									)}
								></div>
							</div>
						</div>
					))}
				</fieldset>
				<form
					className="flex gap-4 flex-wrap"
					onSubmit={(e) => {
						e.preventDefault();
						const { submitter } = e.nativeEvent as any as { submitter: HTMLButtonElement };
						if (submitter.name === 'delete') {
							setMessages((messages) => messages.slice(0, -1));
							return;
						}
						if (submitter.name === 'generate') {
							runPromptMutation.mutate({
								messages: resolveTemplates(messages),
							});
							return;
						}
						setMessages((messages) => [
							...messages,
							{
								role: submitter.name as Message['role'],
								content: '',
							},
						]);
						setTimeout(() => {
							submitter.scrollIntoView({ block: 'nearest' });
						}, 0);
					}}
				>
					<button
						className="bg-blue-500 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded disabled:opacity-50"
						name="generate"
						disabled={!hasAnyKey || runPromptMutation.isLoading || runPromptMutation.isSuccess}
					>
						Generate response
					</button>
					<button
						className="bg-blue-500 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
						name="user"
					>
						Add new prompt
					</button>
					<button
						className="bg-blue-500 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
						name="assistant"
					>
						Add new response
					</button>
					<button
						className="bg-blue-500 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
						name="system"
					>
						Add new system message
					</button>
					{messages[messages.length - 1]?.content === '' && (
						<button
							className="bg-blue-500 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
							name="delete"
						>
							Delete
						</button>
					)}
				</form>
				<div>
					{hasKey === false && (
						<div className="text-sm text-gray-500">
							You need to have a key{' '}
							<a className="text-blue-500 hover:underline" href="/app/settings">
								set up
							</a>{' '}
							to run a prompt{' '}
							{defaultKeyData?.isSet && (
								<>
									without any limits. You have{' '}
									<code className="bg-gray-100 p-1 rounded-md">
										{defaultKeyData.requestsRemaining}
									</code>{' '}
									requests until {defaultKeyData.resetsAt?.toLocaleString()}
								</>
							)}
						</div>
					)}
					{runPromptMutation.error && (
						<div className="text-sm text-red-500">{runPromptMutation.error.message}</div>
					)}
					{runPromptMutation.data?.error && (
						<div className="text-sm text-red-500">{runPromptMutation.data?.error}</div>
					)}
				</div>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						const form = e.currentTarget;
						const formData = new FormData(form);
						const data = {
							...(Object.fromEntries(formData) as {
								title: string;
								description: string;
								visibility: PrivacyLevel;
							}),
							tags:
								formData
									.get('tags')
									?.toString()
									.split(',')
									.map((x) => x.trim()) ?? [],
							template: messages,
						};
						if (promptId) {
							updatePromptMutation.mutate({ promptId, ...data });
						} else {
							addPromptMutation.mutate(data);
						}
					}}
				>
					<fieldset>
						<legend className="text-base font-medium text-gray-900">Description</legend>
						<div className="mt-4">
							<label className="block text-sm font-medium text-gray-700" htmlFor="promptName">
								Prompt name
							</label>
							<div className="mt-1 w-full">
								<input
									type="text"
									name="title"
									id="promptName"
									className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
									placeholder="Prompt name"
									defaultValue={promptName}
								/>
							</div>
						</div>
						<div className="mt-4">
							<label
								className="block text-sm font-medium text-gray-700"
								htmlFor="promptDescription"
							>
								Prompt description
							</label>
							<div className="mt-1 w-full">
								<input
									type="text"
									name="description"
									id="promptDescription"
									className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
									placeholder="Prompt description"
									defaultValue={promptDescription}
								/>
							</div>
						</div>
						<div className="mt-4">
							<label className="block text-sm font-medium text-gray-700" htmlFor="promptTags">
								Tags, coma separated
							</label>
							<div className="mt-1 w-full">
								<input
									type="text"
									name="tags"
									id="promptTags"
									className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
									placeholder="Prompt tags"
									defaultValue={promptTags?.join(', ')}
								/>
							</div>
						</div>
						<div className="mt-4">
							<label className="block text-sm font-medium text-gray-700" htmlFor="promptVisibility">
								Visibility
							</label>
							<div className="mt-1 w-full">
								<select
									id="promptVisibility"
									name="visibility"
									className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
									defaultValue={promptVisibility}
								>
									<option value="public">Public (indexed by Google)</option>
									<option value="team">
										Team (only members of your organization can access it)
									</option>
									<option value="unlisted">
										Unlisted (only people with the link can access it)
									</option>
									<option value="private">Private (only you can access it)</option>
								</select>
							</div>
						</div>
					</fieldset>
					<fieldset className="mt-8 flex items-center gap-4">
						<button
							className="bg-blue-500 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded disabled:opacity-50 min-w-[6rem]"
							type="submit"
							disabled={addPromptMutation.isLoading || updatePromptMutation.isLoading}
						>
							{promptId ? 'Save' : 'Publish'}
							{addPromptMutation.isLoading || updatePromptMutation.isLoading ? 'ing' : ''}
						</button>
						{promptId && (
							<button
								className="bg-red-500 hover:bg-red-700 text-white font-medium py-2 px-4 rounded disabled:opacity-50 min-w-[6rem]"
								type="button"
								disabled={deletePromptMutation.isLoading}
								onClick={() => {
									const confirmed = confirm('Are you sure you want to delete this prompt?');
									if (confirmed) {
										deletePromptMutation.mutate({ promptId });
									}
								}}
							>
								Delete
								{deletePromptMutation.isLoading ? 'ing' : ''}
							</button>
						)}
						<span
							className={clsx(
								'text-gray-600 opacity-0',
								saved && saved === promptId ? 'opacity-100' : 'transition-opacity duration-1000'
							)}
						>
							Saved
						</span>
					</fieldset>
					<div className="mt-4">
						{addPromptMutation.error && (
							<div className="text-sm text-red-500">{addPromptMutation.error.message}</div>
						)}
					</div>
					<div className="mt-4">
						{updatePromptMutation.error && (
							<div className="text-sm text-red-500">{updatePromptMutation.error.message}</div>
						)}
					</div>
				</form>
			</div>
		</div>
	);
};

function setValueOnMount(el: HTMLDivElement | null) {
	if (el) {
		el.textContent = el.dataset.content ?? null;
		if (el.dataset.role === 'user' && el.dataset.last === 'true') {
			el.focus();
		}
	}
}

function useKeys() {
	const { activeOrg } = useRequireActiveOrg();
	const orgId = activeOrg?.orgId || '';
	const keysQuery = trpc.settings.getKeys.useQuery({ orgId }, { enabled: !!orgId });
	const hasKey = keysQuery.data === undefined ? undefined : (keysQuery.data?.length || 0) !== 0;
	const defaultKeyQuery = trpc.prompts.getDefaultKey.useQuery(undefined, {
		enabled: !!orgId && keysQuery.isSuccess && !hasKey,
	});

	const hasAnyKey = hasKey || (defaultKeyQuery.data?.isSet && !!defaultKeyQuery.data.canUse);
	const defaultKeyData = defaultKeyQuery.data;
	return {
		hasKey,
		hasAnyKey,
		defaultKeyData,
	};
}