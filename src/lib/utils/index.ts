import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Dispatched on `window` whenever a modal opens or closes. */
export const MODAL_EVENT = 'edex:modal';

export type ModalEventDetail = {
	id: string;
	open: boolean;
};

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatTime(num: number): string {
	return num.toString().padStart(2, '0');
}

function notifyModal(id: string, open: boolean) {
	window.dispatchEvent(
		new CustomEvent<ModalEventDetail>(MODAL_EVENT, {
			detail: { id, open },
		}),
	);
}

export function openModal(id: string) {
	const dialog = document.getElementById(id) as HTMLDialogElement | null;
	dialog?.showModal();
	notifyModal(id, true);
}

export function closeModal(id: string) {
	const dialog = document.getElementById(id) as HTMLDialogElement | null;
	dialog?.close();
	notifyModal(id, false);
}

export function isModalOpen() {
	return document.querySelector('dialog[open]') !== null;
}
