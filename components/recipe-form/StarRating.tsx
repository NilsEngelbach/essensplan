'use client'

import React from 'react'
import { Star, X } from 'lucide-react'

interface StarRatingProps {
  rating: string
  setRating: (rating: string) => void
}

export default function StarRating({ rating, setRating }: StarRatingProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Bewertung (1-5 Sterne)
      </label>
      <div className="flex items-center space-x-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star.toString())}
            className={`p-1 transition-colors ${
              rating && parseInt(rating) >= star
                ? 'text-yellow-400'
                : 'text-gray-300 hover:text-yellow-300'
            }`}
          >
            <Star className={`h-6 w-6 ${
              rating && parseInt(rating) >= star ? 'fill-current' : ''
            }`} />
          </button>
        ))}
        {rating && (
          <button
            type="button"
            onClick={() => setRating('')}
            className="text-gray-400 hover:text-gray-600 ml-2"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}