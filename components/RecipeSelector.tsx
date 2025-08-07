'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Search, Clock, Users, ChefHat, X } from 'lucide-react'
import type { RecipeWithRelations } from '../lib/supabase'

interface RecipeSelectorProps {
  recipes: RecipeWithRelations[]
  onRecipeSelect: (recipeId: string) => void
  selectedRecipeId?: string
  placeholder?: string
  autoFocus?: boolean
}

export default function RecipeSelector({
  recipes,
  onRecipeSelect,
  selectedRecipeId,
  placeholder = "Rezept suchen...",
  autoFocus = false
}: RecipeSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter recipes based on search term
  const filteredRecipes = useMemo(() => {
    if (!searchTerm.trim()) return recipes

    const term = searchTerm.toLowerCase()
    return recipes.filter(recipe => 
      recipe.title.toLowerCase().includes(term) ||
      recipe.category?.toLowerCase().includes(term) ||
      recipe.description?.toLowerCase().includes(term) ||
      (recipe.tags && JSON.parse(recipe.tags).some((tag: string) => 
        tag.toLowerCase().includes(term)
      ))
    )
  }, [recipes, searchTerm])

  const selectedRecipe = recipes.find(r => r.id === selectedRecipeId)

  const getTags = (recipe: RecipeWithRelations) => {
    if (!recipe.tags) return []
    try {
      return JSON.parse(recipe.tags)
    } catch {
      return []
    }
  }

  const handleRecipeClick = (recipeId: string) => {
    onRecipeSelect(recipeId)
    setShowDropdown(false)
    setSearchTerm('')
  }

  const clearSelection = () => {
    onRecipeSelect('')
    setSearchTerm('')
  }

  // Auto-focus effect
  useEffect(() => {
    if (autoFocus && inputRef.current && !selectedRecipeId) {
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        setShowDropdown(true)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [autoFocus, selectedRecipeId])

  return (
    <div className="relative">
      {/* Search Input or Selected Recipe Display */}
      {selectedRecipeId && selectedRecipe ? (
        <div className="border border-gray-300 rounded-md p-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-orange-400 to-red-500 flex-shrink-0">
                {selectedRecipe.imageUrl ? (
                  <Image 
                    src={selectedRecipe.imageUrl} 
                    alt={selectedRecipe.title}
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ChefHat className="h-6 w-6 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {selectedRecipe.title}
                </p>
                <div className="flex items-center space-x-3 mt-1">
                  {selectedRecipe.cookingTime && (
                    <div className="flex items-center text-xs text-gray-500">
                      <Clock className="h-3 w-3 mr-1" />
                      {selectedRecipe.cookingTime} Min
                    </div>
                  )}
                  {selectedRecipe.servings && (
                    <div className="flex items-center text-xs text-gray-500">
                      <Users className="h-3 w-3 mr-1" />
                      {selectedRecipe.servings}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={clearSelection}
              className="text-gray-400 hover:text-gray-600 ml-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder={placeholder}
              className="input-field pl-10"
            />
          </div>
          
          {/* Recipe Dropdown */}
          {showDropdown && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-80 overflow-y-auto">
              {filteredRecipes.length > 0 ? (
                <div className="py-1">
                  {filteredRecipes.map((recipe) => {
                    const tags = getTags(recipe)
                    return (
                      <div
                        key={recipe.id}
                        onClick={() => handleRecipeClick(recipe.id)}
                        className="px-3 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-center space-x-3">
                          {/* Recipe Image */}
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-orange-400 to-red-500 flex-shrink-0">
                            {recipe.imageUrl ? (
                              <Image 
                                src={recipe.imageUrl} 
                                alt={recipe.title}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ChefHat className="h-6 w-6 text-white" />
                              </div>
                            )}
                          </div>
                          
                          {/* Recipe Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {recipe.title}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {recipe.category}
                            </p>
                            
                            {/* Recipe Stats */}
                            <div className="flex items-center space-x-3 mt-1">
                              {recipe.cookingTime && (
                                <div className="flex items-center text-xs text-gray-500">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {recipe.cookingTime} Min
                                </div>
                              )}
                              {recipe.servings && (
                                <div className="flex items-center text-xs text-gray-500">
                                  <Users className="h-3 w-3 mr-1" />
                                  {recipe.servings}
                                </div>
                              )}
                              {recipe.difficulty && (
                                <span className="text-xs text-gray-500">
                                  {recipe.difficulty}
                                </span>
                              )}
                            </div>
                            
                            {/* Tags */}
                            {tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {tags.slice(0, 3).map((tag: string, index: number) => (
                                  <span 
                                    key={index}
                                    className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {tags.length > 3 && (
                                  <span className="text-xs text-gray-500">
                                    +{tags.length - 3} mehr
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  {searchTerm ? 'Keine Rezepte gefunden' : 'Keine Rezepte verfügbar'}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Backdrop to close dropdown */}
      {showDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  )
}