import { createShortcut } from '@solid-primitives/keyboard';
import { type Event, listen } from '@tauri-apps/api/event';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { errorLog } from '@/lib/log';
import { useTerminal } from '@/lib/terminal';
import { isModalOpen } from '@/lib/utils';
import type { TmuxStatus } from '@/models';

const MAX_ROWS = 4;

function formatIdle(activity: number) {
	const seconds = Math.max(0, Math.floor(Date.now() / 1000) - activity);
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	return `${Math.floor(seconds / 3600)}h`;
}

function Tmux() {
	const { launch } = useTerminal();
	const [tmux, setTmux] = createSignal<TmuxStatus>();

	const unListen = listen('tmux', (event: Event<TmuxStatus>) =>
		setTmux(event.payload),
	);

	onCleanup(() => {
		unListen.then(f => f()).catch(errorLog);
	});

	const sessions = () => tmux()?.sessions ?? [];
	const visible = () => sessions().slice(0, MAX_ROWS);
	const hidden = () => Math.max(0, sessions().length - MAX_ROWS);

	for (let index = 1; index <= 9; index++) {
		createShortcut(
			['Alt', `Digit${index}`],
			() => {
				if (isModalOpen()) return;
				const session = sessions()[index - 1];
				if (session) {
					launch(`tmux:${session.name}`);
				}
			},
			{ preventDefault: true },
		);
	}

	return (
		<div class="tmux-panel font-united_sans_light tracking-[0.092vh] sm:px-0.5 md:px-1.5 lg:px-2.5 xl:px-3.5">
			<div class="tmux-head">
				<span class="sm:text-xs md:text-base lg:text-xl xl:text-3xl">TMUX</span>
				<span class="sm:text-xxxs opacity-50 md:text-xs lg:text-base xl:text-xl">
					ALT+1..9
				</span>
			</div>
			<Show
				when={visible().length > 0}
				fallback={
					<div class="tmux-empty">
						{sessions().length === 0 ? 'NO SESSIONS' : 'LOADING'}
					</div>
				}
			>
				<For each={visible()}>
					{(session, index) => (
						<button
							type="button"
							class="tmux-row"
							onMouseDown={() => launch(`tmux:${session.name}`)}
						>
							<span class={`tmux-dot ${session.attached ? 'attached' : ''}`} />
							<span class="tmux-index">{index() + 1}</span>
							<span class="tmux-name">{session.name}</span>
							<span class="tmux-meta">
								{session.windows}w · {formatIdle(session.activity)}
							</span>
						</button>
					)}
				</For>
			</Show>
			<Show when={hidden() > 0}>
				<div class="tmux-more">+{hidden()} MORE</div>
			</Show>
		</div>
	);
}

export default Tmux;
