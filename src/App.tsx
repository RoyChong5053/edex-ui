import BootOverlay from '@/components/boot';
import Network from '@/components/network';
import Setting from '@/components/setting';
import System from '@/components/system';
import Terminal from '@/components/terminal';
import TopBar from '@/components/topbar';
import { usePower } from '@/lib/power';
import { cn } from '@/lib/utils';

function App() {
	const { state, showcase } = usePower();

	return (
		<div class={cn('app-shell', `power-${state()}`, showcase() && 'showcase')}>
			<BootOverlay />
			<TopBar />
			<div class="main-row">
				<System />
				<Terminal />
				<Network />
			</div>
			<Setting />
		</div>
	);
}

export default App;
