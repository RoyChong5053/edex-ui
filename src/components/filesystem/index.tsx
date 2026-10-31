import { type Event, listen } from '@tauri-apps/api/event';
import { createResource, createSignal, lazy, onCleanup } from 'solid-js';
import Banner from '@/components/banner';
import { errorLog } from '@/lib/log';
import {
	getShowHiddenFileStatus,
	setShowHiddenFileStatus,
} from '@/lib/setting';
import type { FileSystemStatus } from '@/models';

const FileSection = lazy(() => import('@/components/filesystem/file'));

const Setting = lazy(() => import('@/components/setting'));

function FileSystem() {
	const [showHidden, { mutate }] = createResource(getShowHiddenFileStatus);

	async function change() {
		const v = !showHidden();
		await setShowHiddenFileStatus(v);
		mutate(v);
	}

	const [fileSystem, setFileSystem] = createSignal<FileSystemStatus>();

	const unListen = listen('files', (e: Event<FileSystemStatus>) =>
		setFileSystem(e.payload),
	);

	onCleanup(() => {
		unListen.then(f => f()).catch(errorLog);
	});

	return (
		<>
			<div class="relative flex h-full w-[65%] flex-col justify-between sm:p-1 md:p-2 lg:p-3">
				<Banner
					title={/*@once*/ 'FILESYSTEM'}
					name={fileSystem()?.path || ''}
				/>
				<div class="no-scrollbar animate-fade-delay-200 relative box-border grid h-full max-h-[29vh] min-h-[22vh] appearance-none auto-rows-[6.6vh] grid-cols-[repeat(auto-fill,minmax(6.6vh,1fr))] gap-[0.8vh] overflow-auto">
					<FileSection showHidden={showHidden} fileSystem={fileSystem} />
				</div>
			</div>
			<Setting showHidden={showHidden} changeHidden={change} />
		</>
	);
}

export default FileSystem;
