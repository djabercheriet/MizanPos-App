import { registerRootComponent } from 'expo';

import App from './src/App';

// The MIZANE POS desktop application is never bundled here: this entry point
// boots the standalone companion scanner only.
registerRootComponent(App);
