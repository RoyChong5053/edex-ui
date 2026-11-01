import type { Style } from '@/models';

const TRON: Style = {
	colors: {
		main: 'rgb(170, 207, 209)',
		black: '#000000',
		grey: '#262828',
	},
	terminal: {
		fontFamily: 'Fira Mono',
		cursorStyle: 'block',
		foreground: '#aacfd1',
		background: '#05080d',
		cursor: '#aacfd1',
		cursorAccent: '#aacfd1',
	},
};

const APOLLO: Style = {
	colors: {
		main: 'rgb(235, 235, 235)',
		black: '#000000',
		grey: '#262827',
	},
	terminal: {
		fontFamily: 'Fira Mono',
		cursorStyle: 'block',
		foreground: '#ebebeb',
		background: '#191919',
		cursor: '#ebebeb',
		cursorAccent: '#ebebeb',
	},
};

const BLADE: Style = {
	colors: {
		main: 'rgb(204, 94, 55)',
		black: '#000000',
		grey: '#262827',
	},
	terminal: {
		fontFamily: 'Fira Mono',
		cursorStyle: 'underline',
		foreground: '#cc5e37',
		background: '#090B0A',
		cursor: '#cc5e37',
		cursorAccent: '#cc5e37',
	},
};

const CYBORG: Style = {
	colors: {
		main: 'rgb(95, 215, 215)',
		black: '#011f1f',
		grey: '#034747',
		red: '#ad3e5a',
		green: '#3cd66f',
		yellow: '#c5d63c',
		blue: '#3c4dd6',
		magenta: '#ad31ad',
		cyan: '#31adad',
		white: '#a3c2c2',
		brightBlack: '#454585',
		brightRed: '#eb0954',
		brightGreen: '#85ff5c',
		brightYellow: '#ffff5c',
		brightBlue: '#5c5cff',
		brightMagenta: '#ff47d6',
		brightCyan: '#5cffff',
		brightWhite: '#e6fafa',
	},
	terminal: {
		fontFamily: 'Fira Code',
		cursorStyle: 'block',
		foreground: '#a3c2c2',
		background: '#0a3333',
		cursor: '#5cffff',
		cursorAccent: '#85ff5c',
	},
};

const INTERSTELLAR: Style = {
	colors: {
		main: 'rgb(3, 169, 244)',
		black: '#f3f3f3',
		grey: '#bfbfbf',
	},
	terminal: {
		fontFamily: 'Fira Mono',
		cursorStyle: 'bar',
		foreground: '#03A9F4',
		background: '#dedede',
		cursor: '#03A9F4',
		cursorAccent: '#03A9F4',
	},
};

const NORD: Style = {
	colors: {
		main: 'rgb(129, 161, 193)',
		black: '#2e3440',
		grey: '#3b4252',
		red: '#bf616a',
		green: '#a3be8c',
		yellow: '#ebcb8b',
		blue: '#81a1c1',
		magenta: '#b48ead',
		cyan: '#88c0d0',
		white: '#eceff4',
		brightBlack: '#4c566a',
		brightRed: '#eb989a',
		brightGreen: '#a3be8c',
		brightYellow: '#ebcb8b',
		brightBlue: '#81a1c1',
		brightMagenta: '#b48ead',
		brightCyan: '#94e1d5',
		brightWhite: '#eceff4',
	},
	terminal: {
		fontFamily: 'Fira Mono',
		cursorStyle: 'block',
		foreground: '#d8dee9',
		background: '#2e3440',
		cursor: '#88c0d0',
		cursorAccent: '#2e3440',
	},
};

const GRUVBOX: Style = {
	colors: {
		main: 'rgb(243, 156, 18)',
		black: '#1d2021',
		grey: '#3c3836',
		red: '#fb4934',
		green: '#b8bb26',
		yellow: '#fabd2f',
		blue: '#83a598',
		magenta: '#d3869b',
		cyan: '#8ec07c',
		white: '#ebdbb2',
		brightBlack: '#928374',
		brightRed: '#fb4934',
		brightGreen: '#b8bb26',
		brightYellow: '#fabd2f',
		brightBlue: '#83a598',
		brightMagenta: '#d3869b',
		brightCyan: '#8ec07c',
		brightWhite: '#ebdbb2',
	},
	terminal: {
		fontFamily: 'Fira Mono',
		cursorStyle: 'block',
		foreground: '#ebdbb2',
		background: '#1d2021',
		cursor: '#fabd2f',
		cursorAccent: '#1d2021',
	},
};

const KANAGAWA: Style = {
	colors: {
		main: 'rgb(123, 167, 155)',
		black: '#0d0c0d',
		grey: '#16141f',
		red: '#e46876',
		green: '#9ecb6e',
		yellow: '#e5c07b',
		blue: '#79bfff',
		magenta: '#ff9e64',
		cyan: '#24bfa1',
		white: '#c0caf5',
		brightBlack: '#304a5e',
		brightRed: '#ff7b9d',
		brightGreen: '#9ecb6e',
		brightYellow: '#f7d34b',
		brightBlue: '#79bfff',
		brightMagenta: '#ff9e64',
		brightCyan: '#2bbfc9',
		brightWhite: '#c0caf5',
	},
	terminal: {
		fontFamily: 'Fira Mono',
		cursorStyle: 'block',
		foreground: '#c0caf5',
		background: '#16141f',
		cursor: '#9ecb6e',
		cursorAccent: '#16141f',
	},
};

const CATPPUCCIN: Style = {
	colors: {
		main: 'rgb(137, 183, 255)',
		black: '#1e1e2e',
		grey: '#313244',
		red: '#f38ba8',
		green: '#a6e3a1',
		yellow: '#f9e2af',
		blue: '#89bffa',
		magenta: '#cba6f7',
		cyan: '#94e2d5',
		white: '#cdd6f4',
		brightBlack: '#45475a',
		brightRed: '#f38ba8',
		brightGreen: '#a6e3a1',
		brightYellow: '#f9e2af',
		brightBlue: '#89bffa',
		brightMagenta: '#cba6f7',
		brightCyan: '#94e2d5',
		brightWhite: '#cdd6f4',
	},
	terminal: {
		fontFamily: 'Fira Mono',
		cursorStyle: 'block',
		foreground: '#cdd6f4',
		background: '#1e1e2e',
		cursor: '#89bffa',
		cursorAccent: '#1e1e2e',
	},
};

const MONO: Style = {
	colors: {
		main: 'rgb(57, 255, 20)',
		black: '#000000',
		grey: '#0a120a',
		green: '#39ff14',
		white: '#aaffaa',
		brightGreen: '#39ff14',
		brightWhite: '#e7ffee',
	},
	terminal: {
		fontFamily: 'Fira Mono',
		cursorStyle: 'block',
		foreground: '#39ff14',
		background: '#050705',
		cursor: '#39ff14',
		cursorAccent: '#050705',
	},
};

export function selectStyle(theme: Theme) {
	switch (theme) {
		case Theme.TRON:
			return TRON;
		case Theme.APOLLO:
			return APOLLO;
		case Theme.CYBORG:
			return CYBORG;
		case Theme.BLADE:
			return BLADE;
		case Theme.INTERSTELLAR:
			return INTERSTELLAR;
		case Theme.NORD:
			return NORD;
		case Theme.GRUVBOX:
			return GRUVBOX;
		case Theme.KANAGAWA:
			return KANAGAWA;
		case Theme.CATPPUCCIN:
			return CATPPUCCIN;
		case Theme.MONO:
			return MONO;
	}
}

export enum Theme {
	TRON = 'TRON',
	APOLLO = 'APOLLO',
	BLADE = 'BLADE',
	CYBORG = 'CYBORG',
	INTERSTELLAR = 'INTERSTELLAR',
	NORD = 'NORD',
	GRUVBOX = 'GRUVBOX',
	KANAGAWA = 'KANAGAWA',
	CATPPUCCIN = 'CATPPUCCIN',
	MONO = 'MONO',
}
