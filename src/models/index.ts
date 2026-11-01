import type { Terminal as TerminalType } from '@xterm/xterm';
import type { JSXElement } from 'solid-js';
import type { Addons } from '@/lib/terminal';

export interface SystemData {
	uptime: number;
	memory: MemoryInformation;
	cpu: CPUData;
	gpu: GPUData;
	processes: ProcessInformation[];
}

export interface CPUData {
	name: string;
	core: number;
	load: number;
	usage: number[];
	temperature: number;
}

export interface GPUData {
	name: string;
	load: number;
	usedMemory: number;
	totalMemory: number;
	memoryUsage: number;
	temperature: number;
}

export interface MemoryInformation {
	active: number;
	available: number;
	total: number;
	used: number;
	swap: number;
	ratio: number;
}

export interface ProcessInformation {
	pid: number;
	name: string;
	cpu_usage: number;
	memory_usage: number;
	state: string;
	start_time: string;
	run_time: number;
}

export interface IPInformation {
	query: string;
	status: string;
	countryCode: string;
	region: string;
	city: string;
}

export interface IPAddressInformation {
	query: string;
	location: string;
}

export const OFFLINE = 'OFFLINE';
export const ONLINE = 'ONLINE';

export type NETWORK_STATUS = typeof OFFLINE | typeof ONLINE;

export interface NetworkTrafficStatus {
	received: number;
	transmitted: number;
	totalReceive: number;
	totalTransmitted: number;
}

export interface DiskUsageStatus {
	name: string;
	internal: boolean;
	total: number;
	available: number;
	usage: number;
}

export interface ClusterNode {
	name: string;
	host: string;
	online: boolean;
	latency: number | null;
	history: (number | null)[];
	wan: boolean;
	local: boolean;
}

export interface ClusterStatus {
	nodes: ClusterNode[];
	updated: number;
}

export interface TmuxSession {
	name: string;
	windows: number;
	attached: boolean;
	activity: number;
}

export interface TmuxStatus {
	available: boolean;
	sessions: TmuxSession[];
}

export type Style = {
	colors: {
		main: string;
		black: string;
		grey: string;
		red?: string;
		green?: string;
		yellow?: string;
		blue?: string;
		magenta?: string;
		cyan?: string;
		white?: string;
		brightBlack?: string;
		brightRed?: string;
		brightGreen?: string;
		brightYellow?: string;
		brightBlue?: string;
		brightMagenta?: string;
		brightCyan?: string;
		brightWhite?: string;
	};
	terminal: {
		fontFamily: string;
		cursorStyle: 'block' | 'underline' | 'bar';
		foreground: string;
		background: string;
		cursor: string;
		cursorAccent: string;
	};
};

export interface TerminalProps {
	term: TerminalType;
	addons: Addons;
}

export interface TerminalContainer {
	id: string;
	preset?: string;
	terminal: () => JSXElement;
}
