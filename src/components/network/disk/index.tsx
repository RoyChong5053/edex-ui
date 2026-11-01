import { type Event, listen } from '@tauri-apps/api/event';
import prettyBytes from 'pretty-bytes';
import { createSignal, For, onCleanup } from 'solid-js';
import { errorLog } from '@/lib/log';
import type { DiskUsageStatus } from '@/models';

function DiskUsage() {
	const [disks, setDisks] = createSignal<DiskUsageStatus[]>();

	const unListen = listen('disk', (e: Event<DiskUsageStatus[]>) =>
		setDisks(e.payload),
	);

	onCleanup(() => {
		unListen.then(f => f()).catch(errorLog);
	});

	return (
		<div class="font-united_sans_light flex max-h-[14vh] min-h-[9vh] w-full flex-col flex-nowrap tracking-[0.092vh] sm:px-0.5 md:px-1.5 lg:px-2.5 xl:px-3.5">
			<div class="flex flex-row flex-nowrap items-center justify-start">
				<span class="text-[clamp(11px,1.55vh,20px)]">DISK USAGE</span>
			</div>
			<div class="mb-1 min-h-0 size-full overflow-auto">
				<For each={disks()}>
					{disk => (
						<div
							class="flex flex-col"
							style={{
								background: `linear-gradient(to right, var(--color-shade) ${disk.usage}%, transparent 80%)`,
							}}
						>
							<div class="flex flex-row items-center justify-between">
								<span class="truncate text-[clamp(10px,1.3vh,16px)]">
									{disk.name}
								</span>
								<span class="shrink-0 pl-2 text-[clamp(8px,1vh,12px)] opacity-60">
									{disk.internal ? 'Internal' : 'External'}
								</span>
							</div>
							<div class="flex flex-row items-center justify-between">
								<span class="text-[clamp(8px,1vh,12px)] opacity-60">
									{prettyBytes(disk.total)}
								</span>
								<span class="text-[clamp(8px,1vh,12px)] opacity-60">
									{prettyBytes(disk.available)} Free
								</span>
							</div>
						</div>
					)}
				</For>
			</div>
		</div>
	);
}

export default DiskUsage;
