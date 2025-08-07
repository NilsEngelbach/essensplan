'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Clock, 
  Users, 
  Star, 
  Calendar,
  ChefHat,
  TrendingUp,
  CalendarPlus
} from 'lucide-react'
import { useAuth } from '../../../components/AuthProvider'
import Navigation from '../../../components/Navigation'
import DatePickerModal from '../../../components/DatePickerModal'
import toast from 'react-hot-toast'
import { useRecipes } from '../../../components/RecipeProvider'
import { useMealPlans } from '../../../components/MealPlanProvider'

export default function RecipeDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { recipes, removeRecipe } = useRecipes()
  const { addOrUpdateMealPlan, getMealPlanForDate, mealPlans } = useMealPlans()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  
  const recipe = recipes.find(r => r.id === params.id)

  // Redirect if recipe not found and not loading
  useEffect(() => {
    if (!authLoading && user && !recipe && recipes.length > 0) {
      toast.error('Rezept nicht gefunden')
      router.push('/recipes')
    }
  }, [authLoading, user, recipe, recipes.length, router])

  const handleEdit = () => {
    router.push(`/recipes/${params.id}/edit`)
  }

  const handleDelete = async () => {
    try {
      await removeRecipe(params.id, recipe?.imageUrl)
      toast.success('Rezept erfolgreich gelöscht')
      router.push('/recipes')
    } catch (error) {
      console.error('Error deleting recipe:', error)
      toast.error('Fehler beim Löschen des Rezepts')
    }
  }

  const addToMealPlan = async (date: string) => {
    if (!user) return

    try {
      await addOrUpdateMealPlan(date, params.id)
      toast.success('Rezept zum Essensplan hinzugefügt')
    } catch (error) {
      console.error('Error adding to meal plan:', error)
      toast.error('Fehler beim Hinzufügen zum Essensplan')
    }
  }

  const getTags = useCallback(() => {
    if (!recipe?.tags) return []
    try {
      return JSON.parse(recipe.tags)
    } catch {
      return []
    }
  }, [recipe?.tags])

  // Check if recipe is planned for a specific date
  const isRecipePlannedForDate = useCallback((dateString: string) => {
    const mealPlan = getMealPlanForDate(dateString)
    return mealPlan?.recipeId === params.id
  }, [getMealPlanForDate, params.id])

  // Check if recipe is planned for any future date (after tomorrow)
  const isRecipePlannedForFuture = useCallback(() => {
    const today = new Date()
    const dayAfterTomorrow = new Date(today)
    dayAfterTomorrow.setDate(today.getDate() + 2)
    
    return mealPlans.some(mealPlan => {
      if (mealPlan.recipeId !== params.id) return false
      
      const mealPlanDate = new Date(mealPlan.date)
      return mealPlanDate > dayAfterTomorrow
    })
  }, [mealPlans, params.id])

  // Get the specific dates for today, tomorrow, and day after tomorrow
  const todayDate = new Date().toISOString().split('T')[0]
  const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const dayAfterTomorrowDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Show loading state while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Laden...</p>
        </div>
      </div>
    )
  }

  // Show message if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Bitte melden Sie sich an
          </h3>
          <p className="text-gray-600 mb-6">
            Sie müssen angemeldet sein, um Rezepte zu sehen.
          </p>
        </div>
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Rezept nicht gefunden
          </h3>
          <p className="text-gray-600 mb-6">
            Das angeforderte Rezept existiert nicht oder Sie haben keine Berechtigung.
          </p>
          <button
            onClick={() => router.push('/recipes')}
            className="btn-primary"
          >
            Zurück zu Rezepten
          </button>
        </div>
      </div>
    )
  }

  const tags = getTags()

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      {/* Recipe Actions */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => {
                  const returnUrl = searchParams.get('returnUrl')
                  if (returnUrl) {
                    router.push(decodeURIComponent(returnUrl))
                  } else {
                    router.push('/recipes')
                  }
                }}
                className="flex items-center text-gray-600 hover:text-gray-800 mr-4"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Zurück
              </button>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleEdit}
                className="flex items-center text-sm text-gray-600 hover:text-gray-800"
              >
                <Edit className="h-4 w-4 mr-1" />
                Bearbeiten
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center text-sm text-red-600 hover:text-red-800"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Löschen
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Recipe Header */}
        <div className="card mb-8">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Recipe Image */}
            <div className="md:w-1/3">
              <div className="relative w-full h-64 rounded-lg overflow-hidden bg-gradient-to-br from-orange-400 to-red-500">
                {recipe.imageUrl ? (
                  <Image 
                    src={recipe.imageUrl} 
                    alt={recipe.title}
                    width={400}
                    height={256}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-white text-lg font-semibold">{recipe.title}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Recipe Info */}
            <div className="md:w-2/3">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{recipe.title}</h1>
              
              {recipe.description && (
                <p className="text-gray-600 mb-6">{recipe.description}</p>
              )}

              {/* Recipe Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-3">
                  {recipe.cookingTime && (
                    <div className="flex items-center">
                      <Clock className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-gray-700">{recipe.cookingTime} Min</span>
                    </div>
                  )}
                  {recipe.servings && (
                    <div className="flex items-center">
                      <Users className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-gray-700">{recipe.servings} Personen</span>
                    </div>
                  )}
                  {recipe.difficulty && (
                    <div className="flex items-center">
                      <Star className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-gray-700">{recipe.difficulty}</span>
                    </div>
                  )}
                  {recipe.rating && (
                    <div className="flex items-center">
                      <div className="flex mr-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= recipe.rating
                                ? 'text-yellow-400 fill-current'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-gray-700">{recipe.rating}/5 Bewertung</span>
                    </div>
                  )}
                </div>
                
                {/* Cooking Statistics */}
                {recipe.cookingStats && (
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <TrendingUp className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-gray-700">
                        {recipe.cookingStats.timesCooked}x gekocht
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="text-gray-700">
                        {recipe.cookingStats.lastCooked 
                          ? `Zuletzt: ${new Date(recipe.cookingStats.lastCooked).toLocaleDateString('de-DE')}`
                          : 'Noch nie gekocht'
                        }
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Category and Tags */}
              {(recipe.category || tags.length > 0) && (
                <div className="mb-6">
                  <div className="flex flex-wrap gap-2">
                    {recipe.category && (
                      <span className="px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full">
                        {recipe.category}
                      </span>
                    )}
                    {tags.length > 0 && tags.map((tag: string, index: number) => (
                      <span 
                        key={index}
                        className={`px-3 py-1 text-sm rounded-full ${
                          tag === 'Cookidoo'
                            ? 'bg-orange-100 text-orange-800 font-medium'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {tag}
                        {tag === 'Cookidoo' && recipe.sourceUrl && (
                          <a 
                            href={recipe.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 hover:underline"
                            title="Cookidoo-Rezept öffnen"
                          >
                            ↗
                          </a>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Add to Meal Plan */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Zum Essensplan hinzufügen:</span>
                  <button
                    onClick={() => router.push('/meal-plan')}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Essensplan öffnen →
                  </button>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => addToMealPlan(todayDate)}
                    className={`flex items-center text-sm px-3 py-2 ${
                      isRecipePlannedForDate(todayDate) 
                        ? 'btn-primary' 
                        : 'btn-secondary'
                    }`}
                  >
                    <Calendar className="h-4 w-4 mr-1" />
                    Heute
                  </button>
                  <button
                    onClick={() => addToMealPlan(tomorrowDate)}
                    className={`flex items-center text-sm px-3 py-2 ${
                      isRecipePlannedForDate(tomorrowDate) 
                        ? 'btn-primary' 
                        : 'btn-secondary'
                    }`}
                  >
                    <Calendar className="h-4 w-4 mr-1" />
                    Morgen
                  </button>
                  <button
                    onClick={() => addToMealPlan(dayAfterTomorrowDate)}
                    className={`hidden sm:flex items-center text-sm px-3 py-2 ${
                      isRecipePlannedForDate(dayAfterTomorrowDate) 
                        ? 'btn-primary' 
                        : 'btn-secondary'
                    }`}
                  >
                    <Calendar className="h-4 w-4 mr-1" />
                    Übermorgen
                  </button>
                  <button
                    onClick={() => setShowDatePicker(true)}
                    className={`flex items-center text-sm px-3 py-2 ${
                      isRecipePlannedForFuture() 
                        ? 'btn-primary' 
                        : 'btn-secondary'
                    }`}
                    title="Anderes Datum wählen"
                  >
                    <CalendarPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ingredients */}
        <div className="card mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Zutaten</h2>
          {(() => {
            // Group ingredients by component
            const groupedIngredients = recipe.ingredients.reduce((groups: any, ingredient) => {
              const component = ingredient.component || 'Allgemein'
              if (!groups[component]) {
                groups[component] = []
              }
              groups[component].push(ingredient)
              return groups
            }, {})

            const components = Object.keys(groupedIngredients)
            const hasComponents = components.length > 1 || !groupedIngredients['Allgemein']

            if (!hasComponents) {
              // Display ingredients normally if no components are defined
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recipe.ingredients.map((ingredient) => (
                    <div key={ingredient.id} className="flex items-center p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <span className="font-medium text-gray-900">{ingredient.name}</span>
                        {ingredient.notes && (
                          <span className="text-sm text-gray-500 ml-2">({ingredient.notes})</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {ingredient.amount} {ingredient.unit}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }

            // Display ingredients grouped by components
            return (
              <div className="space-y-8">
                {components.map((component) => (
                  <div key={component}>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">
                      {component}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedIngredients[component].map((ingredient: any) => (
                        <div key={ingredient.id} className="flex items-center p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <span className="font-medium text-gray-900">{ingredient.name}</span>
                            {ingredient.notes && (
                              <span className="text-sm text-gray-500 ml-2">({ingredient.notes})</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            {ingredient.amount} {ingredient.unit}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Instructions */}
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Zubereitung</h2>
          <div className="space-y-6">
            {recipe.instructions.map((instruction) => (
              <div key={instruction.id} className="flex space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium">
                  {instruction.stepNumber}
                </div>
                <div className="flex-1">
                  <p className="text-gray-700">{instruction.description}</p>
                  {instruction.imageUrl && (
                    <div className="mt-3 max-w-xs">
                      <Image 
                        src={instruction.imageUrl} 
                        alt={`Schritt ${instruction.stepNumber}`}
                        width={300}
                        height={200}
                        className="object-cover rounded-lg w-full h-48"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Rezept löschen</h3>
            <p className="text-gray-600 mb-6">
              Sind Sie sicher, dass Sie &ldquo;{recipe.title}&rdquo; löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Picker Modal */}
      <DatePickerModal
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onDateSelect={addToMealPlan}
        title="Zum Essensplan hinzufügen"
      />
    </div>
  )
} 