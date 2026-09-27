import { createElement as __ } from 'react'
import './header.scss';

export const Header = () => {
  return (
    __('header', {className: 'site-header'},
      __('a', {href: '/'},
        __('div', {className: 'site-name'},
          __('img', {src: '/logo-small.png', id: 'site-logo'}),
          __('div', {}, "Tela Lucis"),
        )
      ),
      __('div', {className: 'separator'}),
      __('nav', {className: 'navbar'},
        __('a', {className: 'navbar-link', href: '/'}, "Library")
      )
    )
  )
};
