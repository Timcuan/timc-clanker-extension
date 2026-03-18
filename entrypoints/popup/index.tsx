import { render } from 'preact';
import { App } from '../../src/popup/App.js';
import '../../src/popup/popup.css';

render(<App />, document.getElementById('app')!);
