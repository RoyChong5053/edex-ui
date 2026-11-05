import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import AudioControl from '@/components/setting/audio';
import BluetoothControl from '@/components/setting/bluetooth';
import PowerControl from '@/components/setting/power';
import ChangeThemeSelection from '@/components/setting/theme';
import {
	closeModal,
	MODAL_EVENT,
	type ModalEventDetail,
} from '@/lib/utils';

const MODAL_ID = 'setting-modal';

export default function Setting() {
	// The dialog element itself stays mounted so `openModal('setting-modal')`
	// always has a target. Its *contents* are mounted only while open, which
	// is what keeps Audio/Bluetooth from polling the system in the background
	// for the entire lifetime of the cockpit.
	const [open, setOpen] = createSignal(false);

	onMount(() => {
		const onModal = (event: Event) => {
			const detail = (event as CustomEvent<ModalEventDetail>).detail;
			if (detail?.id === MODAL_ID) {
				setOpen(detail.open);
			}
		};
		window.addEventListener(MODAL_EVENT, onModal);
		onCleanup(() => window.removeEventListener(MODAL_EVENT, onModal));
	});

	return (
		<dialog
			id={MODAL_ID}
			class="relative z-10 backdrop:bg-black/25"
			aria-labelledby="modal-title"
			onCancel={() => closeModal(MODAL_ID)}
			onClose={() => setOpen(false)}
		>
			<div class="fixed left-1 top-1 z-50 bg-red-600 px-1 text-xs text-white">PROBE-V2</div>
			<div
				class="fixed inset-0 z-20 m-auto h-fit max-h-[62vh] min-h-[62vh] w-[38vw] overflow-y-auto"
				onMouseDown={(e) => {
					// Clicking the dimmed area outside the panel closes the dialog.
					// This handler has to live on the fixed layer: it covers the
					// viewport, so the dialog itself never sees those clicks.
					if (e.target === e.currentTarget) {
						closeModal(MODAL_ID);
					}
				}}
			>
				<div
					class="panel augment-border animate-fade font-united_sans_light relative flex size-full items-center justify-center overflow-hidden text-center shadow-xl transition-all duration-300 ease-in"
					data-augmented-ui="tr-clip bl-clip both"
				>
					<button
						type="button"
						aria-label="Close settings"
						class="text-main absolute top-1 right-2 z-30 rounded px-2 py-0.5 text-lg leading-none opacity-50 transition-opacity hover:opacity-100 sm:text-xl md:text-2xl"
						onClick={() => closeModal(MODAL_ID)}
					>
						×
					</button>
					<div class="bg-main size-full overflow-hidden text-left transition-all sm:p-1 md:p-3 lg:p-5 xl:p-7">
						<Show when={open()}>
							<h3 class="text-main font-semibold uppercase sm:text-3xl md:text-5xl lg:text-7xl xl:text-9xl">
								Settings
							</h3>
							<div class="my-2 flex flex-col">
								<ChangeThemeSelection />
							</div>
							<div class="my-1 flex flex-col gap-2">
								<AudioControl />
							</div>
							<div class="my-1 flex flex-col gap-2">
								<BluetoothControl />
							</div>
							<h3 class="text-main font-semibold uppercase sm:text-3xl md:text-5xl lg:text-7xl xl:text-9xl">
								Shortcuts
							</h3>
							<div class="mb-2 flex flex-col gap-2 sm:text-base md:text-xl lg:text-3xl xl:text-5xl">
								<div class="text-main flex flex-row flex-nowrap items-center justify-between">
									<span>Switch Terminal</span>
									<span class="capitalize">Ctrl + tab</span>
								</div>
								<div class="text-main flex flex-row flex-nowrap justify-between">
									<span>Create New Terminal</span>
									<span class="capitalize">Ctrl + t</span>
								</div>
								<div class="text-main flex flex-row flex-nowrap justify-between">
									<span>Close current Terminal</span>
									<span class="capitalize">Ctrl + w</span>
								</div>
								<div class="text-main flex flex-row flex-nowrap justify-between">
									<span>Open Yazi</span>
									<span class="capitalize">Ctrl + Shift + y</span>
								</div>
								<div class="text-main flex flex-row flex-nowrap justify-between">
									<span>Attach Tmux Session</span>
									<span class="capitalize">Alt + 1..9</span>
								</div>
								<div class="text-main flex flex-row flex-nowrap justify-between">
									<span>Cycle Theme</span>
									<span class="capitalize">Ctrl + Shift + t</span>
								</div>
								<div class="text-main flex flex-row flex-nowrap justify-between">
									<span>Showcase Mode</span>
									<span class="capitalize">Ctrl + Shift + s</span>
								</div>
								<div class="text-main flex flex-row flex-nowrap justify-between">
									<span>Freeze / Wake</span>
									<span class="capitalize">Ctrl + Shift + f</span>
								</div>
								<div class="text-main flex flex-row flex-nowrap justify-between">
									<span>Close Settings</span>
									<span class="capitalize">Esc</span>
								</div>
							</div>
							<div class="my-2 flex flex-col gap-2">
								<PowerControl />
							</div>
						</Show>
					</div>
				</div>
			</div>
		</dialog>
	);
}
