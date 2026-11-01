import { lazy } from 'solid-js';
import Banner from '@/components/banner';

const Content = lazy(() => import('@/components/system/content'));

function System() {
	return (
		<div class="relative box-border flex h-full w-[22vw] flex-col items-end sm:px-1 md:px-2 lg:px-3">
			<Banner title={/*@once*/ 'PANEL'} name={/*@once*/ 'SYSTEM'} />
			<div class="animate-fade-delay-100 flex size-full min-h-0 flex-col">
				<Content />
			</div>
		</div>
	);
}

export default System;
