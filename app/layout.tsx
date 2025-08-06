import React from 'react'
import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '../components/AuthProvider'
import { RecipeProvider } from '../components/RecipeProvider'
import { MealPlanProvider } from '../components/MealPlanProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Essensplan - Familien Essensplaner',
  description: 'Organisieren Sie Ihre Familienmahlzeiten mit unserem intelligenten Essensplaner',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className={inter.className}>
        <AuthProvider>
          <RecipeProvider>
            <MealPlanProvider>
              {children}
              <Toaster position="top-right" />
            </MealPlanProvider>
          </RecipeProvider>
        </AuthProvider>
      </body>
    </html>
  )
} 