import { type Event, listen } from '@tauri-apps/api/event';
import { createSignal, For, onCleanup } from 'solid-js';
import { errorLog } from '@/lib/log';
import type { ClusterNode, ClusterStatus } from '@/models';

const SPARK_CHARS = ' ▁▂▃▄▅▆▇█';

function sparkLevel(value: number, min: number, max: number) {
	if (max <= min) return SPARK_CHARS.length - 1;
	return Math.round(((value - min) / (max - min)) * (SPARK_CHARS.length - 1));
}

function sparkline(node: ClusterNode) {
	const values = node.history.filter((v): v is number => v !== null);
	const min = values.length ? Math.min(...values) : 0;
	const max = values.length ? Math.max(...values) : 0;

	return node.history.map(value => {
		if (value === null) {
			return { char: '!', level: 0, online: false };
		}
		return {
			char: SPARK_CHARS[sparkLevel(value, min, max)],
			level: value,
			online: true,
		};
	});
}

function latencyClass(value: number | null) {
	if (value === null) return 'cluster-ms offline';
	if (value < 50) return 'cluster-ms good';
	if (value < 100) return 'cluster-ms warn';
	return 'cluster-ms bad';
}

function ClusterMonitor() {
	const [cluster, setCluster] = createSignal<ClusterStatus>();

	const unListen = listen('cluster', (event: Event<ClusterStatus>) =>
		setCluster(event.payload),
	);

	onCleanup(() => {
		unListen.then(f => f()).catch(errorLog);
	});

	const nodes = () => cluster()?.nodes ?? [];
	const online = () => nodes().filter(node => node.online).length;
	const wanAverage = () => {
		const values = nodes()
			.filter(node => node.wan && node.online && node.latency !== null)
			.map(node => node.latency as number);
		if (!values.length) return null;
		return values.reduce((sum, value) => sum + value, 0) / values.length;
	};

	return (
		<section class="cluster-panel">
			<div class="cluster-head">
				<span>CLUSTER PING</span>
				<span class="opacity-50">
					{wanAverage() === null
						? 'WAN --'
						: `WAN ${wanAverage()?.toFixed(0)}ms`}{' '}
					· {online()}/{nodes().length} UP
				</span>
			</div>
			<div class="cluster-list">
				<For each={nodes()}>
					{node => (
						<div
							class={`cluster-row ${node.online ? '' : 'offline'}`}
							title={node.host}
						>
							<span
								class={`cluster-dot ${node.online ? 'online' : 'offline'}`}
							/>
							<span class="cluster-name">
								{node.local ? `${node.name} *` : node.name}
							</span>
							<span class={latencyClass(node.latency)}>
								{node.online && node.latency !== null
									? `${node.latency.toFixed(1)}ms`
									: 'TIMEOUT'}
							</span>
							<span class="cluster-spark">
								<For each={sparkline(node)}>
									{item => (
										<span
											class={
												item.online
													? item.level < 50
														? 'spark-good'
														: item.level < 100
															? 'spark-warn'
															: 'spark-bad'
													: 'spark-offline'
											}
										>
											{item.char}
										</span>
									)}
								</For>
							</span>
						</div>
					)}
				</For>
			</div>
		</section>
	);
}

export default ClusterMonitor;
