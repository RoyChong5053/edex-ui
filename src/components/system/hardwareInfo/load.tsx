import { For } from 'solid-js';
import { useSystemData } from '@/lib/system';

function Load() {
	const systemData = useSystemData();

	const cpu = () => systemData()?.cpu;

	const temp = (value?: number) =>
		value && value > 0 ? `${value.toFixed(1)}°C` : '--';

	const usage = (value: number) =>
		Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

	return (
		<div class="font-united_sans_light w-full tracking-[0.092vh] sm:px-0.5 md:px-1.5 lg:px-2.5 xl:px-3.5">
			<div class="flex w-full flex-row flex-nowrap items-center justify-between">
				<span class="sm:text-xs md:text-base lg:text-2xl xl:text-4xl">
					USAGE
				</span>
				<span class="sm:text-xxxs md:text-xxs truncate opacity-50 lg:text-sm xl:text-lg">
					{cpu()?.name}
				</span>
			</div>
			<div class="flex w-full flex-row flex-nowrap items-center justify-between pb-[0.5vh]">
				<span class="font-united_sans_medium sm:text-xxxs md:text-xxs font-semibold not-italic lg:text-sm xl:text-lg">
					CPU - {temp(cpu()?.temperature)}
				</span>
				<span class="sm:text-xxxs opacity-50 md:text-xs lg:text-base xl:text-lg">
					Avg. {cpu()?.load.toFixed(1) || '--'}%
				</span>
			</div>
			<For each={cpu()?.usage ?? []}>
				{(value, index) => (
					<div class="cpu-core-row">
						<span class="cpu-core-label">C{index()}</span>
						<div class="cpu-core-track">
							<div
								class="cpu-core-fill"
								style={{ width: `${usage(value)}%` }}
							/>
						</div>
						<span class="cpu-core-value">{usage(value).toFixed(0)}%</span>
					</div>
				)}
			</For>
		</div>
	);
}

export default Load;
