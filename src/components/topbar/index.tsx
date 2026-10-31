import { createDateNow } from '@solid-primitives/date';
import { createShortcut } from '@solid-primitives/keyboard';
import { type Event, listen } from '@tauri-apps/api/event';
import prettyBytes from 'pretty-bytes';
import { createSignal, onCleanup } from 'solid-js';
import { errorLog } from '@/lib/log';
import { usePower } from '@/lib/power';
import { useSystemData } from '@/lib/system';
import { Theme, useTheme } from '@/lib/themes';
import { formatTime } from '@/lib/utils';
import type { NetworkTrafficStatus } from '@/models';

const THEMES = Object.values(Theme);

function TopBar() {
	const systemData = useSystemData();
	const { state, showcase, setShowcase } = usePower();
	const { theme, updateTheme } = useTheme();
	const [date] = createDateNow(1000);
	const [network, setNetwork] = createSignal<NetworkTrafficStatus>();

	const unListenNetwork = listen(
		'network',
		(event: Event<NetworkTrafficStatus>) => setNetwork(event.payload),
	);
	const unListenTheme = listen<string>('theme', event => {
		if (THEMES.includes(event.payload as Theme)) {
			updateTheme(event.payload as Theme).catch(errorLog);
		}
	});

	onCleanup(() => {
		unListenNetwork.then(f => f()).catch(errorLog);
		unListenTheme.then(f => f()).catch(errorLog);
	});

	const clock = () => {
		const d = date();
		return `${formatTime(d.getHours())}:${formatTime(d.getMinutes())}:${formatTime(d.getSeconds())}`;
	};

	const day = () => {
		const d = date();
		return `${d.getFullYear()}.${formatTime(d.getMonth() + 1)}.${formatTime(d.getDate())}`;
	};

	const cpu = () => systemData()?.cpu;
	const gpu = () => systemData()?.gpu;
	const memory = () => systemData()?.memory;
	const temp = (value?: number) =>
		value && value > 0 ? `${value.toFixed(0)}°C` : '--';

	const cycleTheme = () => {
		const current = THEMES.indexOf(theme());
		updateTheme(THEMES[(current + 1) % THEMES.length]).catch(errorLog);
	};

	createShortcut(['Control', 'Shift', 'KeyT'], cycleTheme, {
		preventDefault: true,
	});
	createShortcut(['Control', 'Shift', 'KeyS'], () => setShowcase(!showcase()), {
		preventDefault: true,
	});

	return (
		<header class="topbar">
			<div class="topbar-brand">
				<span class="topbar-logo">eDEX-UI</span>
				<span class="topbar-sub">D3180 · KALI · 2C</span>
			</div>

			<div class="topbar-clock">
				<span class="topbar-time">{clock()}</span>
				<span class="topbar-date">{day()}</span>
			</div>

			<div class="topbar-stats">
				<span class="topbar-stat">
					<b>CPU</b> {temp(cpu()?.temperature)} {cpu()?.load.toFixed(0) ?? '--'}
					%
				</span>
				<span class="topbar-stat">
					<b>GPU</b> {temp(gpu()?.temperature)}
				</span>
				<span class="topbar-stat">
					<b>MEM</b> {prettyBytes(memory()?.used ?? 0)}
				</span>
				<span class="topbar-stat">
					<b>NET</b> ↑{prettyBytes(network()?.transmitted ?? 0)}/s ↓
					{prettyBytes(network()?.received ?? 0)}/s
				</span>
			</div>

			<div class="topbar-badges">
				<span class={`topbar-badge state-${state()}`}>{state()}</span>
				<span class="topbar-badge">{theme()}</span>
				<span class={`topbar-badge ${showcase() ? 'showcase-on' : ''}`}>
					{showcase() ? 'SHOWCASE' : 'STEALTH'}
				</span>
			</div>
		</header>
	);
}

export default TopBar;
