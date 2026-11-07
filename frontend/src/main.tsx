import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import '@fontsource-variable/archivo/wdth.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import { AppShell } from './app/AppShell'
import { ToastProvider } from './components/toast'
import { RecipeListPage } from './features/rezepte/RecipeListPage'
import { RecipePage } from './features/rezepte/RecipePage'
import { CapturePage } from './features/rezepte/CapturePage'
import { RecipeEditPage } from './features/rezepte/RecipeEditPage'
import { WeekPage } from './features/woche/WeekPage'
import { AccountPage } from './features/konto/AccountPage'
import { ApiPage } from './features/konto/ApiPage'
import { ActivityPage } from './features/konto/ActivityPage'
import { ShoppingPage } from './features/einkauf/ShoppingPage'
import { CookPage } from './features/kochen/CookPage'

// Apply the stored theme before first paint.
try {
  const t = localStorage.getItem('essensplan.theme')
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
} catch {
  /* storage unavailable */
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <WeekPage /> },
      { path: '/woche/:start', element: <WeekPage /> },
      { path: '/rezepte', element: <RecipeListPage /> },
      { path: '/rezepte/:id', element: <RecipePage /> },
      { path: '/einkauf', element: <ShoppingPage /> },
      { path: '/konto', element: <AccountPage /> },
      { path: '/konto/api', element: <ApiPage /> },
      { path: '/konto/aktivitaet', element: <ActivityPage /> },
    ],
  },
  // Focused tasks run full screen without the shell.
  { path: '/rezepte/neu', element: <CapturePage /> },
  { path: '/rezepte/neu/pruefen', element: <RecipeEditPage /> },
  { path: '/rezepte/:id/bearbeiten', element: <RecipeEditPage /> },
  { path: '/rezepte/:id/kochen', element: <CookPage /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </React.StrictMode>,
)
