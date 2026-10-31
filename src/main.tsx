import { QueryClientProvider } from '@tanstack/solid-query';
import { PowerProvider } from '@/lib/power';
import { QUERY_CLIENT } from '@/lib/queries';
import { SystemDataProvider } from '@/lib/system';
import { TerminalProvider } from '@/lib/terminal';
import { ThemeProvider } from '@/lib/themes';
import 'augmented-ui/augmented-ui.min.css';
import { render } from 'solid-js/web';

import App from './App';
import './index.css';

render(
	() => (
		<ThemeProvider>
			<PowerProvider>
				<SystemDataProvider>
					<TerminalProvider>
						<QueryClientProvider client={QUERY_CLIENT}>
							<App />
						</QueryClientProvider>
					</TerminalProvider>
				</SystemDataProvider>
			</PowerProvider>
		</ThemeProvider>
	),
	document.getElementById('root') as HTMLElement,
);
