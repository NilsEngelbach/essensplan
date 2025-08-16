'use client'

import React, { useState, useEffect } from 'react'
import { Brain, ChefHat, Sparkles, Zap, Coffee, Lightbulb } from 'lucide-react'

const funnyMessages = [
  "🤖 Die KI riecht gerade an den Zutaten...",
  "🧠 Meine Neuronen kochen auf Hochtouren!",
  "👨‍🍳 Ich schlage gerade virtuelle Eier auf...",
  "🔍 Suche nach geheimen Zutaten...",
  "📚 Lese alle Kochbücher der Welt durch...",
  "🎯 Erkenne Geschmacksrichtungen mit Lichtgeschwindigkeit...",
  "🧪 Mische digitale Aromen zusammen...",
  "🔮 Schaue in die Kristallkugel der Kochkunst...",
  "⚡ Lade meine Kochkünste auf...",
  "🎨 Male ein Meisterwerk aus Zutaten...",
  "🚀 Reise durch das Universum der Rezepte...",
  "🧙‍♂️ Wirke einen Zauberspruch für perfekte Rezepte...",
  "🎪 Jongliere mit Gewürzen und Aromen...",
  "🏃‍♂️ Renne durch die Bibliothek des Geschmacks..."
]

const icons = [Brain, ChefHat, Sparkles, Zap, Coffee, Lightbulb]

export default function LoadingOverlay() {
  const [currentMessage, setCurrentMessage] = useState(0)
  const [currentIcon, setCurrentIcon] = useState(0)

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % funnyMessages.length)
    }, 2500)

    const iconInterval = setInterval(() => {
      setCurrentIcon((prev) => (prev + 1) % icons.length)
    }, 1000)

    return () => {
      clearInterval(messageInterval)
      clearInterval(iconInterval)
    }
  }, [])

  const CurrentIcon = icons[currentIcon]

  return (
    <div className="absolute inset-0 bg-white bg-opacity-95 flex items-center justify-center z-10 rounded-lg">
      <div className="text-center max-w-md mx-4">
        {/* Animated Icon */}
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <CurrentIcon className="h-16 w-16 text-primary-600 animate-bounce" />
            <div className="absolute -top-2 -right-2">
              <Sparkles className="h-6 w-6 text-yellow-500 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Loading Text */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            KI arbeitet fleißig...
          </h3>
          <p className="text-sm text-gray-600 min-h-[2.5rem] flex items-center justify-center transition-all duration-500">
            {funnyMessages[currentMessage]}
          </p>
        </div>

        {/* Loading Bar Animation */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div className="bg-primary-600 h-2 rounded-full animate-pulse" style={{
            width: '100%',
            animation: 'loading-pulse 2s ease-in-out infinite'
          }}></div>
        </div>

        {/* Floating Dots Animation */}
        <div className="flex justify-center space-x-1">
          <div className="h-2 w-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="h-2 w-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="h-2 w-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>

      <style jsx>{`
        @keyframes loading-pulse {
          0%, 100% { width: 20%; }
          50% { width: 100%; }
        }
      `}</style>
    </div>
  )
}