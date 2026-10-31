import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';

const LOGO = `
 ███████╗██████╗ ███████╗██╗  ██╗    ██╗   ██╗██╗
 ██╔════╝██╔══██╗██╔════╝╚██╗██╔╝    ██║   ██║██║
 █████╗  ██║  ██║█████╗   ╚███╔╝     ██║   ██║██║
 ██╔══╝  ██║  ██║██╔══╝   ██╔██╗     ██║   ██║██║
 ███████╗██████╔╝███████╗██╔╝ ██╗    ╚██████╔╝██║
 ╚══════╝╚═════╝ ╚══════╝╚═╝  ╚═╝     ╚═════╝ ╚═╝`;

const LINES = [
	'[ OK ] mounting /dev/mmcblk0p2 (ext4)',
	'[ OK ] render node /dev/dri/renderD128',
	'[ OK ] webkit2gtk 2.52.6 / tauri 2',
	'[ OK ] system monitor / hwmon',
	'[ OK ] sshd + tmux + pi-agent runtime',
	'[ .. ] summoning cockpit interface',
];

function BootOverlay() {
	const [visible, setVisible] = createSignal(0);
	const [leaving, setLeaving] = createSignal(false);
	const [gone, setGone] = createSignal(false);

	let interval: number | undefined;
	let timeout: number | undefined;

	const finish = () => {
		if (leaving()) return;
		setVisible(LINES.length);
		setLeaving(true);
		window.clearInterval(interval);
		timeout = window.setTimeout(() => setGone(true), 360);
	};

	onMount(() => {
		interval = window.setInterval(() => {
			setVisible(v => {
				if (v >= LINES.length) {
					window.clearInterval(interval);
					timeout = window.setTimeout(finish, 220);
					return v;
				}
				return v + 1;
			});
		}, 150);

		const onKey = () => finish();
		window.addEventListener('keydown', onKey, { capture: true });

		onCleanup(() => {
			window.clearInterval(interval);
			window.clearTimeout(timeout);
			window.removeEventListener('keydown', onKey, { capture: true });
		});
	});

	return (
		<Show when={!gone()}>
			<div class={`boot-overlay ${leaving() ? 'boot-leaving' : ''}`}>
				<pre class="boot-logo">{LOGO}</pre>
				<div class="boot-sub">SUMMONABLE COCKPIT · BUILD 0.2.0</div>
				<div class="boot-lines">
					<For each={LINES}>
						{(line, i) => (
							<div class={`boot-line ${i() < visible() ? 'boot-line-on' : ''}`}>
								{line}
							</div>
						)}
					</For>
				</div>
				<div class="boot-progress">
					<div
						class="boot-progress-fill"
						style={{
							width: `${Math.min(100, (visible() / LINES.length) * 100)}%`,
						}}
					/>
				</div>
				<div class="boot-skip">PRESS ANY KEY TO SKIP</div>
			</div>
		</Show>
	);
}

export default BootOverlay;
