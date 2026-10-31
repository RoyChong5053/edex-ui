import { createSignal, For, onCleanup, onMount } from 'solid-js';

const LABELS: Record<string, string> = {
	Escape: 'ESC',
	F1: 'F1',
	F2: 'F2',
	F3: 'F3',
	F4: 'F4',
	F5: 'F5',
	F6: 'F6',
	F7: 'F7',
	F8: 'F8',
	F9: 'F9',
	F10: 'F10',
	F11: 'F11',
	F12: 'F12',
	Backquote: '`',
	Digit1: '1',
	Digit2: '2',
	Digit3: '3',
	Digit4: '4',
	Digit5: '5',
	Digit6: '6',
	Digit7: '7',
	Digit8: '8',
	Digit9: '9',
	Digit0: '0',
	Minus: '-',
	Equal: '=',
	Backspace: '⌫',
	Tab: 'TAB',
	KeyQ: 'Q',
	KeyW: 'W',
	KeyE: 'E',
	KeyR: 'R',
	KeyT: 'T',
	KeyY: 'Y',
	KeyU: 'U',
	KeyI: 'I',
	KeyO: 'O',
	KeyP: 'P',
	BracketLeft: '[',
	BracketRight: ']',
	Backslash: '\\',
	CapsLock: 'CAPS',
	KeyA: 'A',
	KeyS: 'S',
	KeyD: 'D',
	KeyF: 'F',
	KeyG: 'G',
	KeyH: 'H',
	KeyJ: 'J',
	KeyK: 'K',
	KeyL: 'L',
	Semicolon: ';',
	Quote: "'",
	Enter: 'ENTER',
	ShiftLeft: 'SHIFT',
	KeyZ: 'Z',
	KeyX: 'X',
	KeyC: 'C',
	KeyV: 'V',
	KeyB: 'B',
	KeyN: 'N',
	KeyM: 'M',
	Comma: ',',
	Period: '.',
	Slash: '/',
	ShiftRight: 'SHIFT',
	ControlLeft: 'CTRL',
	MetaLeft: 'SUPER',
	AltLeft: 'ALT',
	Space: 'SPACE',
	AltRight: 'ALT',
	ControlRight: 'CTRL',
	ArrowLeft: '←',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowRight: '→',
};

type KeyDef = { code: string; span?: number };

const ROWS: KeyDef[][] = [
	[
		{ code: 'Escape' },
		{ code: 'F1' },
		{ code: 'F2' },
		{ code: 'F3' },
		{ code: 'F4' },
		{ code: 'F5' },
		{ code: 'F6' },
		{ code: 'F7' },
		{ code: 'F8' },
		{ code: 'F9' },
		{ code: 'F10' },
		{ code: 'F11' },
		{ code: 'F12' },
	],
	[
		{ code: 'Backquote' },
		{ code: 'Digit1' },
		{ code: 'Digit2' },
		{ code: 'Digit3' },
		{ code: 'Digit4' },
		{ code: 'Digit5' },
		{ code: 'Digit6' },
		{ code: 'Digit7' },
		{ code: 'Digit8' },
		{ code: 'Digit9' },
		{ code: 'Digit0' },
		{ code: 'Minus' },
		{ code: 'Equal' },
		{ code: 'Backspace', span: 2 },
	],
	[
		{ code: 'Tab', span: 1.5 },
		{ code: 'KeyQ' },
		{ code: 'KeyW' },
		{ code: 'KeyE' },
		{ code: 'KeyR' },
		{ code: 'KeyT' },
		{ code: 'KeyY' },
		{ code: 'KeyU' },
		{ code: 'KeyI' },
		{ code: 'KeyO' },
		{ code: 'KeyP' },
		{ code: 'BracketLeft' },
		{ code: 'BracketRight' },
		{ code: 'Backslash', span: 1.5 },
	],
	[
		{ code: 'CapsLock', span: 1.8 },
		{ code: 'KeyA' },
		{ code: 'KeyS' },
		{ code: 'KeyD' },
		{ code: 'KeyF' },
		{ code: 'KeyG' },
		{ code: 'KeyH' },
		{ code: 'KeyJ' },
		{ code: 'KeyK' },
		{ code: 'KeyL' },
		{ code: 'Semicolon' },
		{ code: 'Quote' },
		{ code: 'Enter', span: 2.2 },
	],
	[
		{ code: 'ShiftLeft', span: 2.3 },
		{ code: 'KeyZ' },
		{ code: 'KeyX' },
		{ code: 'KeyC' },
		{ code: 'KeyV' },
		{ code: 'KeyB' },
		{ code: 'KeyN' },
		{ code: 'KeyM' },
		{ code: 'Comma' },
		{ code: 'Period' },
		{ code: 'Slash' },
		{ code: 'ShiftRight', span: 2.7 },
	],
	[
		{ code: 'ControlLeft', span: 1.4 },
		{ code: 'MetaLeft', span: 1.2 },
		{ code: 'AltLeft', span: 1.2 },
		{ code: 'Space', span: 5 },
		{ code: 'AltRight', span: 1.2 },
		{ code: 'ControlRight', span: 1.4 },
		{ code: 'ArrowLeft' },
		{ code: 'ArrowDown' },
		{ code: 'ArrowUp' },
		{ code: 'ArrowRight' },
	],
];

function KeyboardHud() {
	const [pressed, setPressed] = createSignal<Set<string>>(new Set());
	const [last, setLast] = createSignal('--');

	const onKeyDown = (event: KeyboardEvent) => {
		setPressed(prev => {
			const next = new Set(prev);
			next.add(event.code);
			return next;
		});
		setLast(LABELS[event.code] ?? event.key.toUpperCase());
	};

	const onKeyUp = (event: KeyboardEvent) => {
		setPressed(prev => {
			const next = new Set(prev);
			next.delete(event.code);
			return next;
		});
	};

	const clear = () => setPressed(new Set<string>());

	onMount(() => {
		window.addEventListener('keydown', onKeyDown, { capture: true });
		window.addEventListener('keyup', onKeyUp, { capture: true });
		window.addEventListener('blur', clear);
	});

	onCleanup(() => {
		window.removeEventListener('keydown', onKeyDown, { capture: true });
		window.removeEventListener('keyup', onKeyUp, { capture: true });
		window.removeEventListener('blur', clear);
	});

	const mod = (code: string) => pressed().has(code);

	return (
		<section class="keyboard-panel">
			<div class="keyboard-head">
				<span>INPUT MATRIX</span>
				<span class="keyboard-last">{last()}</span>
			</div>
			<div class="keyboard-mods">
				<span class={mod('ControlLeft') || mod('ControlRight') ? 'on' : ''}>
					CTRL
				</span>
				<span class={mod('AltLeft') || mod('AltRight') ? 'on' : ''}>ALT</span>
				<span class={mod('ShiftLeft') || mod('ShiftRight') ? 'on' : ''}>
					SHIFT
				</span>
				<span class={mod('MetaLeft') ? 'on' : ''}>SUPER</span>
			</div>
			<div class="keyboard">
				<For each={ROWS}>
					{row => (
						<div class="kbd-row">
							<For each={row}>
								{key => (
									<div
										class={`kbd-key ${pressed().has(key.code) ? 'kbd-down' : ''}`}
										style={{ 'flex-grow': key.span ?? 1 }}
									>
										{LABELS[key.code] ?? key.code}
									</div>
								)}
							</For>
						</div>
					)}
				</For>
			</div>
			<div class="keyboard-foot">
				<span>CTRL+T NEW</span>
				<span>CTRL+W CLOSE</span>
				<span>CTRL+TAB SWITCH</span>
				<span>CTRL+SHIFT+T THEME</span>
			</div>
		</section>
	);
}

export default KeyboardHud;
