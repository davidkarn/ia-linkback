import { createElement as __ } from 'react'
import './home.scss';
import { Header } from '../components/header';
import { Library } from '../components/library';
import { useDocumentTitle } from '../lib';

export default function App() {
  useDocumentTitle('Tela Lucis - Library');

  return (
    __('main', {className: 'home'},
      __(Header, {}),
      __(Library, {heading: 'Library', searchLabel: 'Search titles and authors'})
    )
  );
}
