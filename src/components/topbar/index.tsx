import { createDateNow } from '@solid-primitives/date';
import { createShortcut } from '@solid-primitives/keyboard';
import { type Event, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import prettyBytes from 'pretty-bytes';
import { createSignal, onCleanup } from 'solid-js';
import { errorLog } from '@/lib/log';
import { usePower } from '@/lib/power';
import { useSystemData } from '@/lib/system';
import { useTerminal } from '@/lib/terminal';
import { Theme, useTheme } from '@/lib/themes';
import { formatTime, openModal } from '@/lib/utils';
import type { NetworkTrafficStatus } from '@/models';

const THEMES = Object.values(Theme);

function TopBar() {
	const systemData = useSystemData();
	const { state, showcase, setShowcase } = usePower();
	const { theme, updateTheme } = useTheme();
	const { launch } = useTerminal();
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

	const uptime = () => {
		const u = systemData()?.uptime ?? 0;
		const days = Math.floor(u / 86400);
		const hours = Math.floor((u % 86400) / 3600);
		const minutes = Math.floor((u % 3600) / 60);
		const parts: string[] = [];
		if (days) parts.push(`${days}d`);
		parts.push(`${hours}h`);
		parts.push(`${minutes}m`);
		return parts.join(' ');
	};

	const day = () => {
		const d = date();
		return `${d.getFullYear()}.${formatTime(d.getMonth() + 1)}.${formatTime(d.getDate())}`;
	};

	const cpu = () => systemData()?.cpu;
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
	createShortcut(['Control', 'Shift', 'KeyY'], () => launch('yazi'), {
		preventDefault: true,
	});
	// Freeze / Wake: instantly park the always-animating webview (the biggest
	// CPU lever on this Atom) and wake it back up. Backed by the power toggle.
	createShortcut(['Control', 'Shift', 'KeyF'], () => {
		void invoke('power_toggle').catch(errorLog);
	}, {
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
				<span class="topbar-uptime">UPTIME {uptime()}</span>
			</div>

			<div class="topbar-stats">
				<span class="topbar-stat">
					<b>CPU</b> {temp(cpu()?.temperature)} {cpu()?.load.toFixed(0) ?? '--'}
					%
				</span>
				<span class="topbar-stat">
					<b>MEM</b> {prettyBytes(memory()?.used ?? 0)}
				</span>
				<span class="topbar-stat">
					<b>NET</b> ↑{prettyBytes(network()?.transmitted ?? 0)}/s ↓
					{prettyBytes(network()?.received ?? 0)}/s
				</span>
			</div>

			<div class="topbar-actions">
				<button
					type="button"
					class="topbar-action"
					onMouseDown={() => launch('yazi')}
				>
					FILES
				</button>
				<button
					type="button"
					class="topbar-action"
					onMouseDown={() => openModal('setting-modal')}
				>
					SETTINGS
				</button>
			</div>

			<div class="topbar-badges">
				<span class={`topbar-badge state-${state()}`}>{state()}</span>
			</div>
		</header>
	);
}

export default TopBar;
