function ClusterRadar() {
	return (
		<section class="radar-panel">
			<div class="radar-head">
				<span>CLUSTER MESH</span>
				<span class="opacity-50">LAN / 4 NODES</span>
			</div>
			<div class="radar">
				<svg viewBox="0 0 200 120" class="radar-svg" aria-hidden="true">
					<circle cx="100" cy="60" r="18" class="radar-ring" />
					<circle cx="100" cy="60" r="32" class="radar-ring" />
					<circle cx="100" cy="60" r="46" class="radar-ring" />
					<path d="M100 14 V106 M54 60 H146" class="radar-axis" />
					<path d="M100 60 L100 14" class="radar-sweep" />
					<path d="M100 60 L28 42" class="radar-link" />
					<path d="M100 60 L172 42" class="radar-link" />
					<path d="M100 60 L100 108" class="radar-link" />
					<circle cx="100" cy="60" r="3" class="radar-node radar-node-me" />
					<circle cx="28" cy="42" r="2.5" class="radar-node" />
					<circle cx="172" cy="42" r="2.5" class="radar-node" />
					<circle cx="100" cy="108" r="2.5" class="radar-node" />
					<text x="100" y="54" class="radar-label radar-label-me">
						D3180
					</text>
					<text x="28" y="34" class="radar-label">
						M64
					</text>
					<text x="172" y="34" class="radar-label">
						GT20
					</text>
					<text x="100" y="118" class="radar-label">
						LG35
					</text>
				</svg>
			</div>
		</section>
	);
}

export default ClusterRadar;
