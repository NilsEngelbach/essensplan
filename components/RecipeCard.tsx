'use client'

import React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { 
  Clock, 
  Users, 
  Star, 
  ChefHat,
  Edit,
  Trash2,
  Calendar,
  TrendingUp,
  CalendarCheck
} from 'lucide-react'
import type { RecipeWithRelations } from '../lib/supabase'

interface RecipeCardProps {
  recipe: RecipeWithRelations
  showActions?: boolean
  onPlanRecipe?: (recipeId: string) => void
  onEditRecipe?: (recipeId: string) => void
  onDeleteRecipe?: (recipeId: string, recipeTitle: string, imageUrl?: string) => void
  formatLastCooked?: (lastCooked: string | null) => string
  maxTags?: number
  onClick?: (recipeId: string) => void
  returnUrl?: string
  mealPlans?: Array<{ date: string; recipeId: string }>
}

export default function RecipeCard({
  recipe,
  showActions = false,
  onPlanRecipe,
  onEditRecipe,
  onDeleteRecipe,
  formatLastCooked,
  maxTags = 2,
  onClick,
  returnUrl,
  mealPlans = []
}: RecipeCardProps) {
  const router = useRouter()

  const getTags = (recipe: RecipeWithRelations) => {
    if (!recipe.tags) return []
    try {
      return JSON.parse(recipe.tags)
    } catch {
      return []
    }
  }

  const handleCardClick = () => {
    if (onClick) {
      onClick(recipe.id)
    } else if (returnUrl) {
      router.push(`/recipes/${recipe.id}?returnUrl=${encodeURIComponent(returnUrl)}`)
    } else {
      router.push(`/recipes/${recipe.id}`)
    }
  }

  const handlePlanClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onPlanRecipe?.(recipe.id)
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEditRecipe?.(recipe.id)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDeleteRecipe?.(recipe.id, recipe.title, recipe.imageUrl)
  }

  const getRecipePlanningInfo = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Get all meal plans for this recipe
    const recipeMealPlans = mealPlans.filter(mp => mp.recipeId === recipe.id)
    
    // Separate past and future meal plans
    const pastPlans = recipeMealPlans.filter(mp => {
      const planDate = new Date(mp.date)
      planDate.setHours(0, 0, 0, 0)
      return planDate < today
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Most recent first
    
    const futurePlans = recipeMealPlans.filter(mp => {
      const planDate = new Date(mp.date)
      planDate.setHours(0, 0, 0, 0)
      return planDate >= today
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Earliest first
    
    return { pastPlans, futurePlans }
  }

  const defaultFormatLastCooked = (lastCooked: string | null) => {
    if (!lastCooked) return 'Noch nie gekocht'
    
    const date = new Date(lastCooked)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    date.setHours(0, 0, 0, 0)
    
    const diffTime = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Heute gekocht'
    if (diffDays === 1) return 'Gestern'
    if (diffDays <= 7) return `Vor ${diffDays} Tagen`
    if (diffDays <= 14) return 'Letzte Woche'
    if (diffDays <= 30) return `Vor ${Math.ceil(diffDays / 7)} Wochen`
    if (diffDays <= 365) return `Vor ${Math.ceil(diffDays / 30)} Monaten`
    return `Vor ${Math.ceil(diffDays / 365)} Jahren`
  }

  const formatPlannedDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    date.setHours(0, 0, 0, 0)
    
    const diffTime = date.getTime() - today.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Heute geplant'
    if (diffDays === 1) return 'Morgen geplant'
    if (diffDays <= 7) return `In ${diffDays} Tagen`
    return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
  }

  const tags = getTags(recipe)
  const formatFunction = formatLastCooked || defaultFormatLastCooked
  const { pastPlans, futurePlans } = getRecipePlanningInfo()

  // Calculate actual cooking stats (only from past meal plans or cooking stats)
  const actualCookingStats = {
    timesCooked: pastPlans.length || recipe.cookingStats?.timesCooked || 0,
    lastCooked: pastPlans.length > 0 ? pastPlans[0].date : recipe.cookingStats?.lastCooked || null
  }

  return (
    <div className="card hover:shadow-lg transition-shadow flex flex-col h-full">
      {/* Recipe Image */}
      <div className="mb-4">
        <div 
          className="bg-gradient-to-br from-orange-400 to-red-500 rounded-lg h-48 flex items-center justify-center cursor-pointer relative overflow-hidden"
          onClick={handleCardClick}
        >
          {recipe.imageUrl ? (
            <Image 
              src={recipe.imageUrl} 
              alt={recipe.title}
              width={400}
              height={192}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white text-center text-lg font-semibold">{recipe.title}</span>
          )}
          {/* Rating Overlay */}
          {recipe.rating && (
            <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 rounded-md px-2 py-1 flex items-center space-x-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-3 w-3 ${
                    star <= recipe.rating
                      ? 'text-yellow-400 fill-current'
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recipe Info */}
      <div className="space-y-3 flex-1 flex flex-col">
        <div className="flex items-center justify-between">
          <h3 
            className="font-semibold text-gray-900 cursor-pointer hover:text-primary-600"
            onClick={handleCardClick}
          >
            {recipe.title}
          </h3>
          {showActions && (
            <div className="flex items-center space-x-2">
              {onPlanRecipe && (
                <button
                  onClick={handlePlanClick}
                  className="text-gray-400 hover:text-green-600"
                  title="Rezept planen"
                >
                  <Calendar className="h-4 w-4" />
                </button>
              )}
              {onEditRecipe && (
                <button
                  onClick={handleEditClick}
                  className="text-gray-400 hover:text-gray-600"
                  title="Rezept bearbeiten"
                >
                  <Edit className="h-4 w-4" />
                </button>
              )}
              {onDeleteRecipe && (
                <button
                  onClick={handleDeleteClick}
                  className="text-gray-400 hover:text-red-600"
                  title="Rezept löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="h-5 flex-shrink-0">
          {recipe.description && (
            <p className="text-sm text-gray-600 line-clamp-1">
              {recipe.description}
            </p>
          )}
        </div>

        {/* Bottom Content - pushed to bottom */}
        <div className="mt-auto space-y-3">
          {/* Recipe Stats */}
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-600 space-x-4">
              {recipe.cookingTime && Number(recipe.cookingTime) > 0 ? (
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  <span>{recipe.cookingTime} Min</span>
                </div>
              ): (<></>)}
              {recipe.servings && Number(recipe.servings) > 0 ? (
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  <span>{recipe.servings} Personen</span>
                </div>
              ): (<></>)}
              {recipe.difficulty && (
                <div className="flex items-center">
                  <ChefHat className="h-4 w-4 mr-1" />
                  <span>{recipe.difficulty}</span>
                </div>
              )}
            </div>
            
            {/* Cooking Stats */}
            <div className="flex items-center text-xs text-gray-500 space-x-4">
              <div className="flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" />
                <span>{actualCookingStats.timesCooked}x gekocht</span>
              </div>
              {/* Show either last cooked or next planned */}
              {futurePlans.length > 0 ? (
                <div className="flex items-center">
                  <CalendarCheck className="h-3 w-3 mr-1 text-green-500" />
                  <span className="text-green-600">{formatPlannedDate(futurePlans[0].date)}</span>
                </div>
              ) : (
                <div className="flex items-center">
                  <Calendar className="h-3 w-3 mr-1" />
                  <span>{formatFunction(actualCookingStats.lastCooked)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Category and Tags */}
          <div className="flex flex-wrap gap-1">
            {recipe.category && (
              <span className="px-2 py-1 bg-primary-100 text-primary-800 text-xs rounded-full">
                {recipe.category}
              </span>
            )}
            {tags.length > 0 && (
              <>
                {tags.slice(0, maxTags).map((tag: string, index: number) => (
                  tag === 'Cookidoo' && recipe.sourceUrl ? (
                    <a
                      key={index}
                      href={recipe.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full font-medium hover:bg-orange-200 transition-colors flex items-center"
                      onClick={(e) => e.stopPropagation()}
                      title="Cookidoo-Rezept öffnen"
                    >
                      {tag} ↗
                    </a>
                  ) : (
                    <span 
                      key={index}
                      className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800"
                    >
                      {tag}
                    </span>
                  )
                ))}
                {tags.length > maxTags && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                    +{tags.length - maxTags}
                  </span>
                )}
              </>
            )}
            {recipe.sourceUrl && !tags.includes('Cookidoo') && (
              <a 
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full hover:bg-blue-200 transition-colors font-medium flex items-center"
                onClick={(e) => e.stopPropagation()}
                title="Externes Rezept öffnen"
              >
                Quelle ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}