import { StrictMode, createElement as __ } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import App from './App.tsx'
import BookView from './BookView.tsx'

createRoot(document.getElementById('root')!).render(
  __(StrictMode, {},
    __(BrowserRouter, {},
      __(Routes, {},
        __(Route, {path: '/', element: __(App)}),
        __(Route, {path: '/books/:bookId', element: __(BookView)}),
        __(Route, {path: '/books/:bookId/pages/:pageId', element: __(BookView)}),
      )
    )
  ),
)
