import { load } from '@tauri-apps/plugin-store';
import { Theme } from '@/lib/themes/styles';

const store = await load('.settings.dat', {
	defaults: { theme: Theme.TRON },
	autoSave: true,
});

export async function getTheme(): Promise<Theme> {
	return (await store.get('theme')) || Theme.TRON;
}

export async function setTheme(theme: Theme) {
	await store.set('theme', theme);
}
