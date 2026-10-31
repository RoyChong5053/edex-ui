import BootOverlay from '@/components/boot';
import FileSystem from '@/components/filesystem';
import KeyboardHud from '@/components/keyboard';
import Network from '@/components/network';
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
			<div class="bottom-row">
				<FileSystem />
				<KeyboardHud />
			</div>
		</div>
	);
}

export default App;
