import { StrictMode, createElement as __ } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queries.ts'
import './index.css'
import App from './pages/home.ts'
import BookView from './pages/book_view.ts'
import AdminPage from './pages/admin.ts'

createRoot(document.getElementById('root')!).render(
  __(StrictMode, {},
    __(QueryClientProvider, {client: queryClient},
      __(BrowserRouter, {},
        __(Routes, {},
          __(Route, {path: '/', element: __(App)}),
          // one or more open books: /books/<id>[/pages/<n>]/books/<id>[/pages/<n>]... (see core/open_books.ts)
          __(Route, {path: '/books/*', element: __(BookView)}),
          __(Route, {path: '/tl-admin', element: __(AdminPage)}),
        )
      )
    )
  ),
)
