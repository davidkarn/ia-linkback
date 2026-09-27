import { StrictMode, createElement as __ } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import App from './pages/home.ts'
import BookView from './pages/book_view.ts'

createRoot(document.getElementById('root')!).render(
  __(StrictMode, {},
    __(BrowserRouter, {},
      __(Routes, {},
        __(Route, {path: '/', element: __(App)}),
        // one or more open books: /books/<id>[/pages/<n>]/books/<id>[/pages/<n>]... (see core/open_books.ts)
        __(Route, {path: '/books/*', element: __(BookView)}),
      )
    )
  ),
)
