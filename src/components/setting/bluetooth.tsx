import { invoke } from '@tauri-apps/api/core';
import { createSignal, onCleanup, onMount } from 'solid-js';

type Availability = 'available' | 'no-daemon' | 'no-hardware';

interface BluetoothDevice {
	address: string;
	name: string;
	connected: boolean;
	paired: boolean;
}

interface BluetoothState {
	available: Availability;
	powered: boolean;
	discoverable: boolean;
	devices: BluetoothDevice[];
}

// Reflect power/discoverability changes made outside the UI (other clients,
// the phone, a hardware key) without the user having to reopen settings.
const POLL_INTERVAL_MS = 6000;

function BluetoothIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			class="size-[1.6em] fill-current"
			aria-hidden
		>
			<path d="M7 22a1.99 1.99 0 0 1-1.63-.82L2.18 16.8a2 2 0 0 1 0-2.46L11.7 4.9a1.85 1.85 0 0 1 3.2.64v12.2a1.85 1.85 0 0 1-3.2.64L9.1 15.64a1 1 0 0 0-1.26 0l-2.65 2.66A1.99 1.99 0 0 1 7 22Zm5-17.5 7.5 7.5-2 2L10 7zm0 14l7.5-7.5L17 7l-5 5v5Z" />
		</svg>
	);
}

function BluetoothControl() {
	const [state, setState] = createSignal<BluetoothState>({
		available: 'available',
		powered: false,
		discoverable: false,
		devices: [],
	});

	let timer: ReturnType<typeof setInterval> | undefined;

	async function refresh() {
		try {
			const s = await invoke<BluetoothState>('bluetooth_state');
			setState(s);
		} catch (_e) {
			// fall back to a single error line if the command itself throws
			setState((prev) => ({ ...prev, available: 'no-hardware' }));
		}
	}

	async function togglePowered(next: boolean) {
		void invoke('bluetooth_set_powered', { power_on: next });
		await refresh();
	}

	async function toggleDiscoverable(next: boolean) {
		void invoke('bluetooth_set_discoverable', { on: next });
		await refresh();
	}

	async function handleDevice(dev: BluetoothDevice) {
		if (dev.connected) {
			void invoke('bluetooth_disconnect', { address: dev.address });
		} else {
			void invoke('bluetooth_connect', { address: dev.address });
		}
		await refresh();
	}

	onMount(() => {
		void refresh();
		timer = setInterval(refresh, POLL_INTERVAL_MS);
		onCleanup(() => timer && clearInterval(timer));
	});

	const a = () => state().available;

	// No Bluetooth stack at all — the "minimal KDE" panel simply isn't shown.
	if (a() === 'no-hardware') {
		return (
			<div class="flex flex-row flex-nowrap items-center justify-between py-1">
				<span class="text-main sm:text-base md:text-xl lg:text-3xl xl:text-5xl">
					Bluetooth
				</span>
				<span class="text-xs opacity-40 sm:text-sm md:text-lg">
					No Bluetooth hardware
				</span>
			</div>
		);
	}

	const powered = () => state().powered;

	return (
		<div class="flex w-full flex-col gap-1 py-1">
			<div class="flex flex-row flex-nowrap items-center justify-between gap-2">
				<span class="flex flex-row items-center gap-2 text-main sm:text-base md:text-xl lg:text-3xl xl:text-5xl">
					<BluetoothIcon />
					Bluetooth
				</span>
				<label class="flex flex-row items-center gap-2 text-xs opacity-60 sm:text-sm">
					<input
						type="checkbox"
						checked={state().discoverable}
						onChange={() => toggleDiscoverable(!state().discoverable)}
					/>
					Visible
				</label>
			</div>

			<div class="flex flex-row flex-nowrap items-center justify-between opacity-50 sm:text-xs md:text-sm">
				<span>Power</span>
				<button
					type="button"
					onClick={() => togglePowered(!powered())}
					class={`rounded px-2 py-0.5 transition-opacity hover:opacity-70 ${
						powered()
							? 'bg-active text-text-active'
							: 'border-default border-1'
					}`}
				>
					{powered() ? 'On' : 'Off'}
				</button>
			</div>

			{state().devices.length === 0 ? (
				<span class="text-xs opacity-40 sm:text-sm md:text-base">
					No devices
				</span>
			) : (
				<ul class="mt-1 flex flex-col gap-1">
					{state().devices.map((dev) => (
						<li
							class="flex flex-row flex-nowrap items-center justify-between gap-2"
							aria-label={dev.name}
						>
							<span class="truncate text-main sm:text-sm md:text-base">
								{dev.name}
								<span class="opacity-40">· {dev.address}</span>
							</span>
							<button
								type="button"
								onClick={() => handleDevice(dev)}
								class={`rounded px-2 py-0.5 text-xs transition-opacity hover:opacity-70 ${
									dev.connected
										? 'bg-active text-text-active'
										: 'border-default border-1'
								}`}
							>
								{dev.connected ? 'Connected' : 'Connect'}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default BluetoothControl;
