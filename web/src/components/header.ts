import { createElement as __, useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react';
import './header.scss';

type NavLink = { href: string, label: string };

// The site's sections, on the left of the navbar
const SECTIONS: NavLink[] = [
  { href: '/', label: 'Library' },
  { href: '/authors', label: 'By author' },
];

// Works and authors to go straight to, on the right. The ids are the authors table's rows for
// Aristotle and Thomas Aquinas (migrations/0020_create_authors.ts).
const FEATURED: NavLink[] = [
  { href: '/authors/56', label: 'Aristotle' },
  { href: '/authors/119', label: 'Aquinas' },
  { href: '/books/douay-rheims', label: 'Douay-Rheims' },
];

const navLinks = (links: NavLink[]) => links.map((link) => (
  __('a', {key: link.href, className: 'navbar-link', href: link.href}, link.label)
));

// The site's name and its navbar; on a narrow screen, the links are in a menu opened by a
// button, closed by a press outside it
export const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menu                    = useRef<HTMLDivElement>(null);
  const menuLabel               = menuOpen ? 'Close menu' : 'Open menu';

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    else {
      const closeOutside = (e: PointerEvent) => {
        if (menu.current !== null && !menu.current.contains(e.target as Node)) {
          setMenuOpen(false);
        }
      };
      document.addEventListener('pointerdown', closeOutside);
      return () => document.removeEventListener('pointerdown', closeOutside);
    }
  }, [menuOpen]);

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
        navLinks(SECTIONS),
        __('div', {className: 'spacer'}),
        navLinks(FEATURED),
      ),
      __('div', {className: 'navbar-menu', ref: menu},
        __('button', {
          type:            'button',
          className:       'navbar-menu-button',
          title:           menuLabel,
          'aria-label':    menuLabel,
          'aria-expanded': menuOpen,
          onClick:         () => setMenuOpen(!menuOpen),
        }, menuOpen ? __(X, {}) : __(Menu, {})),
        menuOpen && __('nav', {className: 'navbar-dropdown'},
          navLinks(SECTIONS),
          __('hr', {}),
          navLinks(FEATURED),
        )
      )
    )
  )
};
