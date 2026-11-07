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
import { RequireAuth } from './app/RequireAuth'
import { AuthLayout } from './features/login/AuthLayout'
import { LoginPage } from './features/login/LoginPage'
import { ForgotPage } from './features/login/ForgotPage'
import { ResetPage } from './features/login/ResetPage'
import { PairPage } from './features/login/PairPage'
import { bootstrapAuth } from './lib/auth'

// Apply the stored theme before first paint.
try {
  const t = localStorage.getItem('essensplan.theme')
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
} catch {
  /* storage unavailable */
}

const router = createBrowserRouter([
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
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
  { path: '/rezepte/neu', element: <RequireAuth><CapturePage /></RequireAuth> },
  { path: '/rezepte/neu/pruefen', element: <RequireAuth><RecipeEditPage /></RequireAuth> },
  { path: '/rezepte/:id/bearbeiten', element: <RequireAuth><RecipeEditPage /></RequireAuth> },
  { path: '/rezepte/:id/kochen', element: <RequireAuth><CookPage /></RequireAuth> },
  // Logged out: the appliance on standby.
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/passwort-vergessen', element: <ForgotPage /> },
      { path: '/passwort-zuruecksetzen', element: <ResetPage /> },
      { path: '/koppeln/:token', element: <PairPage /> },
    ],
  },
])

const root = ReactDOM.createRoot(document.getElementById('root')!)

// Ask the server who this device is before the first route decides between app and login.
bootstrapAuth()
  .catch(() => {
    /* offline or server down: the login screen says so on the next try */
  })
  .finally(() =>
    root.render(
      <React.StrictMode>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </React.StrictMode>,
    ),
  )
