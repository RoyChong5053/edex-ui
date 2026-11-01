import Divider from '@/components/divider';
import HardwareInfo from '@/components/system/hardwareInfo';
import MemInfo from '@/components/system/meminfo';
import Process from '@/components/system/process';
import SysInfo from '@/components/system/sysinfo';
import Tmux from '@/components/system/tmux';

function MainContent() {
	return (
		<>
			<Divider />
			<SysInfo />
			<Divider />
			<HardwareInfo />
			<Divider />
			<MemInfo />
			<Divider />
			<Tmux />
			<Divider />
			<Process />
		</>
	);
}

export default MainContent;
