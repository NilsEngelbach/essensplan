'use client'

import React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { 
  Home, 
  ChefHat, 
  Calendar, 
  Plus,
  User,
  LogOut
} from 'lucide-react'
import { useAuth } from './AuthProvider'

export default function Navigation() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/',
      icon: Home,
      current: pathname === '/'
    },
    {
      name: 'Rezepte',
      href: '/recipes',
      icon: ChefHat,
      current: pathname.startsWith('/recipes')
    },
    {
      name: 'Essensplan',
      href: '/meal-plan',
      icon: Calendar,
      current: pathname === '/meal-plan'
    }
  ]

  if (!user) return null

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            {/* Logo */}
            <div className="flex items-center">
              <ChefHat className="h-8 w-8 text-primary-600" />
              <h1 className="ml-2 text-xl font-bold text-gray-900">Essensplan</h1>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-1">
              {navigationItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.name}
                    onClick={() => router.push(item.href)}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      item.current
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-gray-600" />
              <span className="text-sm text-gray-700">
                {user.user_metadata?.name || user.email}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center text-sm text-gray-600 hover:text-gray-800"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Abmelden
            </button>
            <button 
              onClick={() => router.push('/recipes/new')}
              className="btn-primary flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Neues Rezept
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden">
        <div className="px-2 pt-2 pb-3 space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.name}
                onClick={() => router.push(item.href)}
                className={`flex items-center w-full px-3 py-2 rounded-md text-base font-medium transition-colors ${
                  item.current
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4 mr-3" />
                {item.name}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
} 