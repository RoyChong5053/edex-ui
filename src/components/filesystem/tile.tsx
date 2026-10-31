import Icon from '@/components/filesystem/icon';
import type { FileType } from '@/models';

interface FileTileProps {
	name: string;
	t: FileType;
	hidden: boolean;
	onClick: VoidFunction;
}

function FileTile(props: FileTileProps) {
	return (
		<div
			class="flex size-full cursor-pointer flex-col items-center justify-center gap-[0.2vh] overflow-hidden rounded-sm text-center hover:opacity-70"
			onMouseDown={() => props.onClick()}
			title={props.name}
		>
			<Icon {...props} />
			<span class="w-full truncate text-[clamp(9px,1.05vh,12px)] leading-tight">
				{props.name}
			</span>
		</div>
	);
}

export default FileTile;
