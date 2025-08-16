'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Home, LogIn, UserPlus } from 'lucide-react'
import LoginModal from './LoginModal'
import SignUpModal from './SignUpModal'

interface PageStateHandlerProps {
  loading: boolean
  user: any
  children: React.ReactNode
  loadingText?: string
  icon?: React.ReactNode
  title?: string
  subtitle?: string
}

export default function PageStateHandler({
  loading,
  user,
  children,
  loadingText = "Laden...",
  icon,
  title = "Bitte melden Sie sich an",
  subtitle = "Sie müssen angemeldet sein, um diese Seite zu sehen."
}: PageStateHandlerProps) {
  const router = useRouter()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showSignUpModal, setShowSignUpModal] = useState(false)

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{loadingText}</p>
        </div>
      </div>
    )
  }

  // Show authentication required state
  if (!user) {
    return (
      <>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center max-w-md mx-4">
            {icon || <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />}
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {title}
            </h3>
            <p className="text-gray-600 mb-8">
              {subtitle}
            </p>
            
            <div className="space-y-4">
              <div className="flex justify-center dasflex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="btn-primary flex items-center justify-center"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Anmelden
                </button>
                <button
                  onClick={() => setShowSignUpModal(true)}
                  className="btn-secondary flex items-center justify-center"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Registrieren
                </button>
              </div>
              
              <button
                onClick={() => router.push('/')}
                className="w-full text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center mt-4"
              >
                <Home className="h-4 w-4 mr-2" />
                Zurück zur Startseite
              </button>
            </div>
          </div>
        </div>

        {/* Authentication Modals */}
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSwitchToSignUp={() => {
            setShowLoginModal(false)
            setShowSignUpModal(true)
          }}
        />
        
        <SignUpModal
          isOpen={showSignUpModal}
          onClose={() => setShowSignUpModal(false)}
          onSwitchToLogin={() => {
            setShowSignUpModal(false)
            setShowLoginModal(true)
          }}
        />
      </>
    )
  }

  // User is authenticated, render children
  return <>{children}</>
}