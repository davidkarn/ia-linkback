// A spinner in the center of the screen while content loads, fading in after a moment (a quick load
// shows nothing). Several at once sit on top of each other, so they look like one.
import { createElement as __ } from 'react'
import './loading_spinner.scss'

export const LoadingSpinner = () => (
  __('div', {className: 'loading-spinner', role: 'status', 'aria-label': 'Loading'},
    __('div', {className: 'loading-spinner-ring', 'aria-hidden': true})
  )
);
