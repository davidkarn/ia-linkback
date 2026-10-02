import { createElement as __ } from 'react'
import './home.scss';
import { Header } from '../components/header';
import { Library } from '../components/library';

export default function App() {
  return (
    __('main', {className: 'home'},
      __(Header, {}),
      __(Library, {heading: 'Library', searchLabel: 'Search titles and authors'})
    )
  );
}
