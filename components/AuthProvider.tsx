'use client'

import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabaseService } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>
  signUp: (email: string, password: string, name?: string) => Promise<{ data: any; error: any }>
  signOut: () => Promise<{ error: any }>
  resetPassword: (email: string) => Promise<{ data: any; error: any }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Get the Supabase client from the service
const supabaseClient = supabaseService.getClient()

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)
  const lastEventRef = useRef<string>('')

  useEffect(() => {
    mountedRef.current = true

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession()
        if (mountedRef.current) {
          setSession(session)
          setUser(session?.user ?? null)
          setLoading(false)
        }
      } catch (error) {
        console.error('Error getting initial session:', error)
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        // Prevent duplicate events
        if (lastEventRef.current === event) return
        lastEventRef.current = event

        if (mountedRef.current) {
          // Only update if the session actually changed
          setSession(prevSession => {
            if (prevSession?.access_token === session?.access_token) {
              return prevSession
            }
            return session
          })
          
          setUser(prevUser => {
            const newUser = session?.user ?? null
            if (prevUser?.id === newUser?.id) {
              return prevUser
            }
            return newUser
          })
          
          setLoading(false)
        }
      }
    )

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    return await supabaseService.signIn(email, password)
  }

  const signUp = async (email: string, password: string, name?: string) => {
    return await supabaseService.signUp(email, password, name)
  }

  const signOut = async () => {
    return await supabaseService.signOut()
  }

  const resetPassword = async (email: string) => {
    return await supabaseService.resetPassword(email)
  }

  const value = useMemo(() => ({
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword
  }), [user, session, loading])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 