import { load } from '@tauri-apps/plugin-store';
import { Theme } from '@/lib/themes/styles';

// How long (seconds) the webview stays rendered after the last input before
// the idle-freeze parks it (0 = never). Seeds the store below so a fresh
// install engages auto-freeze by default instead of never freezing.
export const DEFAULT_IDLE_TIMEOUT_SECS = 300;

// Presets offered in the settings page. `0` disables auto-freeze.
export const IDLE_TIMEOUT_OPTIONS: Array<{ label: string; value: number }> = [
	{ label: 'Never', value: 0 },
	{ label: '1 min', value: 60 },
	{ label: '3 min', value: 180 },
	{ label: '5 min', value: 300 },
	{ label: '10 min', value: 600 },
];

const store = await load('.settings.dat', {
	defaults: {
		theme: Theme.TRON,
		// Engage auto-freeze by default (5 min idle) rather than never. The
		// settings UI can still write 0 (Never) if the user chooses it.
		idle_timeout_secs: DEFAULT_IDLE_TIMEOUT_SECS,
	},
	autoSave: true,
});

export async function getTheme(): Promise<Theme> {
	return (await store.get('theme')) || Theme.TRON;
}

export async function setTheme(theme: Theme) {
	await store.set('theme', theme);
}

export async function getIdleTimeoutSecs(): Promise<number> {
	const secs = (await store.get('idle_timeout_secs')) as number | undefined;
	return typeof secs === 'number' && secs >= 0 ? secs : DEFAULT_IDLE_TIMEOUT_SECS;
}

export async function setIdleTimeoutSecs(secs: number): Promise<void> {
	await store.set('idle_timeout_secs', Math.max(0, Math.round(secs)));
}
