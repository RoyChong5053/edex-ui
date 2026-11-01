import { invoke } from '@tauri-apps/api/core';
import { type Event, listen } from '@tauri-apps/api/event';
import {
	createContext,
	createSignal,
	onCleanup,
	onMount,
	type ParentComponent,
	useContext,
} from 'solid-js';
import { getIdleTimeoutSecs } from '@/lib/setting';
import { errorLog } from '@/lib/log';

export type PowerState = 'active' | 'yield' | 'sleep';

type PowerPayload = {
	state: PowerState;
};

function useProviderValue() {
	const [state, setState] = createSignal<PowerState>('active');
	const [showcase, setShowcase] = createSignal(false);

	const unListenPower = listen('power', (event: Event<PowerPayload>) => {
		setState(event.payload.state);
	});

	const unListenShowcase = listen('showcase', (event: Event<boolean>) => {
		setShowcase(event.payload);
	});

	onMount(() => {
		// Apply the user's auto-freeze timeout to the backend once at startup so
		// the biggest CPU lever honours their settings from the first tick.
		void getIdleTimeoutSecs().then(secs => {
			void invoke('power_set_idle_timeout', { idleTimeoutSecs: secs }).catch(
				errorLog,
			);
		});
	});

	onCleanup(() => {
		unListenPower.then(f => f()).catch(errorLog);
		unListenShowcase.then(f => f()).catch(errorLog);
	});

	const active = () => state() === 'active';

	return { state, active, showcase, setShowcase };
}

type ContextType = ReturnType<typeof useProviderValue>;

const PowerContext = createContext<ContextType | undefined>(undefined);

export const PowerProvider: ParentComponent = props => {
	const value = useProviderValue();
	return (
		<PowerContext.Provider value={value}>
			{props.children}
		</PowerContext.Provider>
	);
};

export function usePower() {
	const context = useContext(PowerContext);
	if (context === undefined) {
		throw new Error('usePower must be used within a PowerProvider');
	}
	return context;
}
