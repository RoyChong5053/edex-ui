import { invoke } from '@tauri-apps/api/core';
import { createSignal, onMount } from 'solid-js';
import { errorLog } from '@/lib/log';
import {
	IDLE_TIMEOUT_OPTIONS,
	getIdleTimeoutSecs,
	setIdleTimeoutSecs,
} from '@/lib/setting';

// The idle-freeze timeout is the single biggest CPU lever on this Atom: the
// always-animating webview burns ~20% of a core while active and idles at ~0%
// once parked. This control lets the user pick how soon it parks.

function secsLabel(secs: number): string {
	if (secs <= 0) {
		return 'Never';
	}
	if (secs < 60) {
		return `${secs}s`;
	}
	const m = Math.floor(secs / 60);
	return m % 60 === 0 ? `${m} min` : `${m} m ${secs % 60}s`;
}

function PowerControl() {
	const [secs, setSecs] = createSignal<number>(0);

	async function apply(next: number) {
		// Persist to the store first (so this survives the next startup, whose
		// startup loader would otherwise overwrite the backend with a default),
		// then apply to the backend so it takes effect immediately.
		await setIdleTimeoutSecs(next);
		setSecs(next);
		await invoke('power_set_idle_timeout', {
			idleTimeoutSecs: next,
		}).catch(errorLog);
	}

	onMount(() => {
		void getIdleTimeoutSecs().then(setSecs).catch(errorLog);
	});

	return (
		<div class="flex w-full flex-col gap-1 py-1">
			<div class="flex flex-row flex-nowrap items-center justify-between gap-2">
				<span class="text-main sm:text-base md:text-xl lg:text-3xl xl:text-5xl">
					Power Save
				</span>
				<span class="text-xs opacity-50 sm:text-sm md:text-base">
					Freeze after {secsLabel(secs())} idle
				</span>
			</div>
			<ul class="flex flex-row flex-nowrap gap-1">
				{IDLE_TIMEOUT_OPTIONS.map(option => (
					<li class="flex-1">
						<button
							type="button"
							onClick={() => void apply(option.value)}
							aria-pressed={secs() === option.value}
							class={`rounded px-2 py-0.5 text-xs transition-opacity hover:opacity-70 ${
								secs() === option.value
									? 'bg-active text-text-active'
									: 'border-default border-1 opacity-60'
							}`}
						>
							{option.label}
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

export default PowerControl;
