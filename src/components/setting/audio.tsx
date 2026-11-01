import { invoke } from '@tauri-apps/api/core';
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';

interface AudioState {
	volume: number;
	muted: boolean;
}

// Software amplification is allowed up to 150% (pactl cap).
const MAX_VOLUME = 150;

// Reflect volume changes made outside the UI (physical keys, pactl, etc.)
// without the user having to reopen settings.
const POLL_INTERVAL_MS = 4000;

function SpeakerIcon({ muted }: { muted: boolean }) {
	return (
		<svg
			viewBox="0 0 24 24"
			class="size-[1.6em] fill-current"
			aria-hidden
		>
			{muted ? (
				<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
			) : (
				<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
			)}
		</svg>
	);
}

function AudioControl() {
	const [volume, setVolume] = createSignal(50);
	const [muted, setMuted] = createSignal(false);
	const [available, setAvailable] = createSignal(true);

	let rangeEl!: HTMLInputElement;

	// Drive the fill gradient via CSS variables (set on the element, which keeps
	// the static <style> block free of Solid expressions).
	createEffect(() => {
		rangeEl.style.setProperty('--vol-pct', String(volume()));
		rangeEl.style.setProperty('--vol-max', String(MAX_VOLUME));
	});

	async function refresh() {
		try {
			const state = await invoke<AudioState>('audio_state');
			setVolume(state.volume);
			setMuted(state.muted);
			setAvailable(true);
		} catch (e) {
			// pulseaudio / pactl not available on this host.
			setAvailable(false);
		}
	}

	function onVolumeInput(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		setVolume(v);
		if (muted()) setMuted(false);
		void invoke('audio_set_volume', { volume: v });
	}

	function toggleMute() {
		const next = !muted();
		setMuted(next);
		if (next && volume() === 0) setVolume(50);
		void invoke('audio_set_mute', { muted: next });
	}

	onMount(() => {
		void refresh();
		const id = setInterval(refresh, POLL_INTERVAL_MS);
		onCleanup(() => clearInterval(id));
	});

	if (!available()) {
		return (
			<div class="flex flex-row flex-nowrap items-center justify-between py-1">
				<span class="text-main sm:text-base md:text-xl lg:text-3xl xl:text-5xl">
					Audio
				</span>
				<span class="text-xs opacity-40 sm:text-sm md:text-lg">
					No audio backend
				</span>
			</div>
		);
	}

	return (
		<div class="flex w-full flex-col gap-1 py-1">
			<style>{`
				.audio-range {
					-webkit-appearance: none;
					appearance: none;
					width: 100%;
					height: 1.5vh;
					background: transparent;
					cursor: pointer;
					margin: 0;
				}
				.audio-range::-webkit-slider-runnable-track {
					height: 2px;
					background: linear-gradient(
						to right,
						rgb(var(--text-main) / 0.9) 0%,
						rgb(var(--text-main) / 0.9) calc(
							(var(--vol-pct, 50) / var(--vol-max, 100)) * 100%
						),
						rgb(var(--bg-secondary)) calc(
							(var(--vol-pct, 50) / var(--vol-max, 100)) * 100%
						),
						rgb(var(--bg-secondary)) 100%
					);
					border: 1px solid rgb(var(--border-default) / 0.4);
				}
				.audio-range::-webkit-slider-thumb {
					-webkit-appearance: none;
					appearance: none;
					margin-top: -4px;
					width: 12px;
					height: 12px;
					background: rgb(var(--text-main));
					box-shadow: 0 0 6px rgb(var(--text-main) / 0.8);
				}
				.audio-range::-moz-range-track {
					height: 2px;
					background: rgb(var(--bg-secondary));
					border: 1px solid rgb(var(--border-default) / 0.4);
				}
				.audio-range::-moz-range-thumb {
					width: 12px;
					height: 12px;
					background: rgb(var(--text-main));
					border: none;
					box-shadow: 0 0 6px rgb(var(--text-main) / 0.8);
				}
			`}</style>
			<div class="flex flex-row flex-nowrap items-center justify-between">
				<span class="text-main sm:text-base md:text-xl lg:text-3xl xl:text-5xl">
					Audio
				</span>
				<button
					type="button"
					aria-label="mute"
					onClick={toggleMute}
					class="text-main transition-opacity hover:opacity-70"
				>
					<SpeakerIcon muted={muted()} />
				</button>
			</div>
			<div class="flex flex-row flex-nowrap items-center justify-between gap-2">
				<input
					type="range"
					min={0}
					max={MAX_VOLUME}
					value={volume()}
					onInput={onVolumeInput}
					ref={rangeEl}
					class="audio-range w-full"
				/>
				<span class="shrink-0 text-[clamp(9px,1vh,13px)] opacity-60">
					{Math.min(volume(), 100)}%
				</span>
			</div>
		</div>
	);
}

export default AudioControl;
