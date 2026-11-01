import { type Event, listen } from '@tauri-apps/api/event';
import prettyBytes from 'pretty-bytes';
import {
	createEffect,
	createSignal,
	type JSX,
	on,
	onCleanup,
	onMount,
} from 'solid-js';
import { errorLog } from '@/lib/log';
import { usePower } from '@/lib/power';
import { selectStyle, useTheme } from '@/lib/themes';
import { cn } from '@/lib/utils';
import type { NetworkTrafficStatus } from '@/models';

type NetworkTrafficProps = {
	connected: () => boolean;
};

// Rolling window of samples and throttled redraw rate. We draw manually to a
// canvas only when new traffic arrives (capped ~4fps), instead of Smoothie's
// continuous requestAnimationFrame loop — the big CPU win on this Atom.
const HISTORY_LEN = 120;
const REDRAW_MS = 250;

function NetworkTraffic(props: NetworkTrafficProps): JSX.Element {
	const { theme } = useTheme();
	const { active } = usePower();
	const style = () => selectStyle(theme());

	let uploadCanvas!: HTMLCanvasElement;
	let downloadCanvas!: HTMLCanvasElement;

	const [traffic, setTraffic] = createSignal<NetworkTrafficStatus>();

	const unListen = listen('network', (e: Event<NetworkTrafficStatus>) =>
		setTraffic(e.payload),
	);

	// Rolling buffers of recent samples (KB/s).
	const upBuf: number[] = Array(HISTORY_LEN).fill(0);
	const downBuf: number[] = Array(HISTORY_LEN).fill(0);

	let rafId = 0;
	let lastDraw = 0;
	let drawing = false;

	const sizeCanvas = (canvas: HTMLCanvasElement) => {
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
			canvas.width = w;
			canvas.height = h;
		}
	};

	const drawLine = (
		canvas: HTMLCanvasElement,
		buf: number[],
		positive: boolean,
	) => {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const w = canvas.width;
		const h = canvas.height;
		ctx.clearRect(0, 0, w, h);
		if (w === 0 || h === 0) return;

		const color = style().colors.main;
		ctx.strokeStyle = color;
		ctx.lineWidth = 1;

		const max = Math.max(1, ...buf);
		const step = w / (HISTORY_LEN - 1);
		const mid = h / 2;
		const amp = h * 0.45;

		ctx.beginPath();
		for (let i = 0; i < buf.length; i++) {
			const v = buf[i] / max; // 0..1
			const x = i * step;
			const y = positive ? mid - amp * v : mid + amp * v;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	};

	const draw = () => {
		rafId = 0;
		drawing = false;
		lastDraw = performance.now();
		if (active() && props.connected() && uploadCanvas && downloadCanvas) {
			sizeCanvas(uploadCanvas);
			sizeCanvas(downloadCanvas);
			drawLine(uploadCanvas, upBuf, true);
			drawLine(downloadCanvas, downBuf, false);
		}
	};

	const scheduleDraw = () => {
		if (drawing) {
			return;
		}
		const now = performance.now();
		if (now - lastDraw < REDRAW_MS) {
			return;
		}
		drawing = true;
		rafId = requestAnimationFrame(draw);
	};

	onMount(() => {
		const sync = () => {
			sizeCanvas(uploadCanvas);
			sizeCanvas(downloadCanvas);
		};
		sync();
		const ro = new ResizeObserver(sync);
		if (uploadCanvas) ro.observe(uploadCanvas);
		if (downloadCanvas) ro.observe(downloadCanvas);
	});

	// Re-draw when the panel activates or connectivity changes.
	createEffect(
		on([active, () => props.connected()], ([a, c]) => {
			if (a && c && uploadCanvas && downloadCanvas) {
				lastDraw = 0;
				scheduleDraw();
			}
		}),
	);

	createEffect(
		on(traffic, t => {
			if (!t) return;
			upBuf.shift();
			upBuf.push(t.transmitted / 1024);
			downBuf.shift();
			downBuf.push(t.received / 1024);
			scheduleDraw();
		}),
	);

	createEffect(
		on(theme, () => {
			if (active() && props.connected() && uploadCanvas && downloadCanvas) {
				lastDraw = 0;
				scheduleDraw();
			}
		}),
	);

	onCleanup(() => {
		unListen.then(f => f()).catch(errorLog);
		if (rafId) cancelAnimationFrame(rafId);
	});

	return (
		<div class="font-united_sans_light flex w-full flex-col items-start justify-around pb-1 text-[clamp(11px,1.2vh,16px)] tracking-[0.092vh] sm:px-0.5 md:px-1.5 lg:px-2.5 xl:px-3.5">
			<div class="flex w-full flex-row flex-nowrap items-baseline justify-between gap-2">
				<span class="truncate text-[clamp(10px,1.35vh,17px)]">
					NETWORK TRAFFIC
				</span>
				<span class="shrink-0 text-[clamp(8px,1vh,12px)] opacity-50">
					{`UP ${prettyBytes(traffic()?.transmitted || 0)} / DOWN ${prettyBytes(
						traffic()?.received || 0,
					)}`}
				</span>
			</div>
			<div class="flex w-full flex-row flex-nowrap items-baseline justify-between opacity-30">
				<span class="text-[clamp(11px,1.5vh,20px)]">TOTAL</span>
				<span class="text-[clamp(9px,1.1vh,14px)]">
					{`${prettyBytes(traffic()?.totalTransmitted || 0)} OUT, ${prettyBytes(
						traffic()?.totalReceive || 0,
					)} IN`}
				</span>
			</div>
			<div class="flex w-full flex-col items-center justify-center">
				<canvas
					ref={uploadCanvas}
					class={cn(
						'border-default/30 z-10 mx-0 my-[0.46vh] max-h-[7vh] min-h-[5.5vh] w-full border-t-[0.092vh] border-dashed',
						props.connected() ? 'opacity-100' : 'opacity-30',
					)}
				/>
				<canvas
					ref={downloadCanvas}
					class={cn(
						'border-t-default/40 border-b-default/30 z-10 mx-0 max-h-[7vh] min-h-[5.5vh] w-full border-t-[0.139vh] border-b-[0.092vh] border-solid',
						props.connected() ? 'opacity-100' : 'opacity-30',
					)}
				/>
				<span
					class={cn(
						'absolute z-20 m-auto font-semibold sm:text-lg md:text-xl lg:text-2xl xl:text-3xl',
						props.connected() && 'hidden',
					)}
				>
					OFFLINE
				</span>
			</div>
		</div>
	);
}

export default NetworkTraffic;
