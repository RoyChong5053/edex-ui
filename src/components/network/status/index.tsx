import { useQuery } from '@tanstack/solid-query';
import type { Accessor, JSX } from 'solid-js';
import { ipInformationQueryOptions, latencyQueryOptions } from '@/lib/queries';
import { type NETWORK_STATUS, OFFLINE, ONLINE } from '@/models';

interface BaseInformationProps {
	header: string;
	value: Accessor<string>;
	center?: boolean;
}

function BaseInformation(props: BaseInformationProps) {
	return (
		<div
			class={`box-border flex min-w-0 flex-col justify-around nth-2:pl-1.5 ${
				props.center ? 'items-center text-center' : 'items-start'
			}`}
		>
			<span class="m-0 text-[clamp(8px,1vh,11px)] opacity-50">
				{props.header}
			</span>
			<span class="m-0 w-full truncate text-[clamp(9px,1.15vh,14px)]">
				{props.value()}
			</span>
		</div>
	);
}

type ConnectionStatusProps = {
	connected: Accessor<boolean>;
};

function ConnectionStatus(props: ConnectionStatusProps): JSX.Element {
	const ipInformationQuery = useQuery(() =>
		ipInformationQueryOptions(props.connected()),
	);

	const latencyQuery = useQuery(() => latencyQueryOptions(props.connected()));

	const status = (): NETWORK_STATUS => (props.connected() ? ONLINE : OFFLINE);

	const location = () => {
		if (!props.connected()) {
			return 'DISCONNECTED';
		}
		return ipInformationQuery.data?.location || 'UNKNOWN';
	};

	const query = () => {
		if (!props.connected()) {
			return '--.--.--.--';
		}
		return ipInformationQuery.data?.query || '--.--.--.--';
	};

	const latency = () => {
		if (!props.connected()) {
			return '--';
		}
		return latencyQuery.data || '--';
	};

	return (
		<div class="font-united_sans_light flex w-full flex-col items-start justify-around gap-[0.35vh] pb-[0.35vh] tracking-[0.092vh] sm:px-0.5 md:px-1.5 lg:px-2.5 xl:px-3.5">
			<div class="flex w-full flex-row flex-nowrap items-baseline justify-between gap-2">
				<span class="truncate text-[clamp(11px,1.55vh,20px)]">
					NETWORK STATUS
				</span>
				<span class="max-w-[45%] truncate text-[clamp(8px,1vh,12px)] opacity-50">
					{location()}
				</span>
			</div>
			<div class="grid w-full grid-cols-[26%_46%_28%]">
				<BaseInformation header={'STATE'} value={status} />
				<BaseInformation header={'IPv4'} value={query} />
				<BaseInformation header={'PING'} value={latency} center />
			</div>
		</div>
	);
}

export default ConnectionStatus;
