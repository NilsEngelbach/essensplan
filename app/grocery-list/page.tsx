'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { 
  ShoppingCart, 
  Calendar, 
  Check, 
  ChefHat,
  Plus,
  Minus,
  Clock,
  Users,
  ArrowRight,
  ArrowLeft,
  Edit
} from 'lucide-react'
import { useAuth } from '../../components/AuthProvider'
import Navigation from '../../components/Navigation'
import { supabaseService } from '../../lib/supabase'
import type { MealPlanWithRecipe } from '../../lib/supabase'
import toast from 'react-hot-toast'

interface RecipeSelection {
  mealPlanId: string
  recipeId: string
  recipeTitle: string
  date: string
  selected: boolean
  recipe: any
}

export default function GroceryListPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [upcomingMealPlans, setUpcomingMealPlans] = useState<MealPlanWithRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRecipes, setSelectedRecipes] = useState<Set<string>>(new Set())
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())
  const [currentStep, setCurrentStep] = useState<'select' | 'shop'>('select')

  // Fetch all upcoming meal plans
  useEffect(() => {
    const fetchUpcomingMealPlans = async () => {
      if (!user?.id) return
      
      setLoading(true)
      try {
        const today = new Date()
        const endDate = new Date(today)
        endDate.setDate(today.getDate() + 30) // Get next 30 days
        
        const data = await supabaseService.getMealPlans(user.id, {
          startDate: today.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        })
        
        // Filter out meal plans without recipes
        const mealPlansWithRecipes = data.filter(mp => mp.recipe)
        setUpcomingMealPlans(mealPlansWithRecipes)
        
        // Select all recipes by default
        const allRecipeIds = new Set(mealPlansWithRecipes.map(mp => mp.id))
        setSelectedRecipes(allRecipeIds)
      } catch (error) {
        console.error('Failed to fetch upcoming meal plans:', error)
        toast.error('Fehler beim Laden der geplanten Rezepte')
      } finally {
        setLoading(false)
      }
    }

    fetchUpcomingMealPlans()
  }, [user])

  // Get recipe selections for display
  const recipeSelections = useMemo(() => {
    return upcomingMealPlans.map(mp => ({
      mealPlanId: mp.id,
      recipeId: mp.recipe.id,
      recipeTitle: mp.recipe.title,
      date: typeof mp.date === 'string' ? mp.date.split('T')[0] : new Date(mp.date).toISOString().split('T')[0],
      selected: selectedRecipes.has(mp.id),
      recipe: mp.recipe
    }))
  }, [upcomingMealPlans, selectedRecipes])

  // Get ingredients from selected recipes, grouped by recipe
  const recipeIngredients = useMemo(() => {
    const selectedMealPlans = upcomingMealPlans.filter(mp => selectedRecipes.has(mp.id))
    
    return selectedMealPlans.map(mp => {
      const date = typeof mp.date === 'string' ? mp.date.split('T')[0] : new Date(mp.date).toISOString().split('T')[0]
      return {
        mealPlanId: mp.id,
        recipeTitle: mp.recipe.title,
        date,
        ingredients: mp.recipe.ingredients || []
      }
    })
  }, [upcomingMealPlans, selectedRecipes])

  const toggleRecipeSelection = useCallback((mealPlanId: string) => {
    setSelectedRecipes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(mealPlanId)) {
        newSet.delete(mealPlanId)
      } else {
        newSet.add(mealPlanId)
      }
      return newSet
    })
  }, [])

  const toggleIngredient = useCallback((ingredientKey: string) => {
    setCheckedIngredients(prev => {
      const newSet = new Set(prev)
      if (newSet.has(ingredientKey)) {
        newSet.delete(ingredientKey)
      } else {
        newSet.add(ingredientKey)
      }
      return newSet
    })
  }, [])

  const selectAllRecipes = () => {
    setSelectedRecipes(new Set(upcomingMealPlans.map(mp => mp.id)))
  }

  const deselectAllRecipes = () => {
    setSelectedRecipes(new Set())
  }

  const goToShoppingList = () => {
    if (selectedRecipes.size === 0) {
      toast.error('Bitte wählen Sie mindestens ein Rezept aus')
      return
    }
    setCurrentStep('shop')
  }

  const goBackToSelection = () => {
    setCurrentStep('select')
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('de-DE', { 
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })
  }

  const selectedCount = selectedRecipes.size
  const totalIngredients = recipeIngredients.reduce((total, recipe) => total + recipe.ingredients.length, 0)
  const checkedCount = Array.from(checkedIngredients).length

  // Show loading state while auth is loading or data is loading
  if (authLoading || loading) {
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
          <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Bitte melden Sie sich an
          </h3>
          <p className="text-gray-600 mb-6">
            Sie müssen angemeldet sein, um Ihre Einkaufsliste zu sehen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4 mb-6">
            <div className={`flex items-center ${
              currentStep === 'select' ? 'text-primary-600' : 'text-green-600'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                currentStep === 'select' ? 'bg-primary-600' : 'bg-green-600'
              }`}>
                1
              </div>
              <span className="ml-2 font-medium">Rezepte auswählen</span>
            </div>
            
            <ArrowRight className={`h-5 w-5 ${
              currentStep === 'shop' ? 'text-gray-800' : 'text-gray-300'
            }`} />
            
            <div className={`flex items-center ${
              currentStep === 'shop' ? 'text-primary-600' : 'text-gray-400'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                currentStep === 'shop' ? 'bg-primary-600' : 'bg-gray-300'
              }`}>
                2
              </div>
              <span className="ml-2 font-medium">Einkaufen</span>
            </div>
          </div>

          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center justify-center mb-2">
              <ShoppingCart className="h-8 w-8 mr-3 text-primary-600" />
              {currentStep === 'select' ? 'Rezepte auswählen' : 'Einkaufsliste'}
            </h1>
            <p className="text-gray-600">
              {currentStep === 'select' 
                ? 'Wählen Sie die Rezepte aus, für die Sie einkaufen möchten'
                : `Einkaufsliste für ${selectedCount} ausgewählte Rezepte`
              }
            </p>
          </div>
        </div>

        {upcomingMealPlans.length === 0 ? (
          <div className="text-center py-12">
            <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Keine geplanten Rezepte gefunden
            </h3>
            <p className="text-gray-600 mb-6">
              Planen Sie Rezepte in Ihrem Essensplan, um Ihre Einkaufsliste zu erstellen.
            </p>
            <button
              onClick={() => router.push('/meal-plan')}
              className="btn-primary"
            >
              Essensplan verwalten
            </button>
          </div>
        ) : currentStep === 'select' ? (
          /* STEP 1: Recipe Selection */
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Geplante Rezepte ({selectedCount} von {upcomingMealPlans.length} ausgewählt)
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={selectAllRecipes}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  Alle
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={deselectAllRecipes}
                  className="text-sm text-gray-600 hover:text-gray-700"
                >
                  Keine
                </button>
              </div>
            </div>

            <div className="space-y-3 mb-8">
              {recipeSelections.map((recipe) => (
                <div
                  key={recipe.mealPlanId}
                  className={`card cursor-pointer transition-all duration-200 ${
                    recipe.selected ? 'ring-2 ring-primary-200 bg-primary-50' : 'hover:shadow-md'
                  }`}
                  onClick={() => toggleRecipeSelection(recipe.mealPlanId)}
                >
                  <div className="flex items-center space-x-3">
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded border-2 transition-colors flex items-center justify-center ${
                      recipe.selected
                        ? 'bg-primary-600 border-primary-600'
                        : 'border-gray-300'
                    }`}>
                      {recipe.selected && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </div>

                    {/* Recipe Image */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                      {recipe.recipe.imageUrl ? (
                        <Image 
                          src={recipe.recipe.imageUrl} 
                          alt={recipe.recipeTitle}
                          width={64}
                          height={64}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ChefHat className="h-8 w-8 text-white" />
                      )}
                    </div>

                    {/* Recipe Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {recipe.recipeTitle}
                      </h3>
                      <div className="flex flex-wrap items-center text-sm text-gray-600 gap-3">
                        <span className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          {formatDate(recipe.date)}
                        </span>
                        {recipe.recipe.cookingTime && Number(recipe.recipe.cookingTime) > 0 ? (
                          <span className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            {recipe.recipe.cookingTime} Min
                          </span>
                        ): (<></>)}
                        {recipe.recipe.servings && Number(recipe.recipe.servings) > 0 ? (
                          <span className="flex items-center">
                            <Users className="h-4 w-4 mr-1" />
                            {recipe.recipe.servings} Personen
                          </span>
                        ): (<></>)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Next Button */}
            <div className="text-center">
              <button
                onClick={goToShoppingList}
                disabled={selectedCount === 0}
                className="btn-primary flex items-center justify-center mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Zur Einkaufsliste
                <ArrowRight className="h-4 w-4 ml-2" />
              </button>
            </div>
          </div>
        ) : (
          /* STEP 2: Shopping List */
          <div>
            {/* Selected Recipes Summary */}
            <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900">Ausgewählte Rezepte</h3>
                <button
                  onClick={goBackToSelection}
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Ändern
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recipeIngredients.map((recipe, index) => (
                  <span 
                    key={recipe.mealPlanId}
                    className="inline-flex items-center px-2 py-1 bg-primary-100 text-primary-800 text-xs rounded-full"
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    {formatDate(recipe.date)} • {recipe.recipeTitle}
                  </span>
                ))}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Fortschritt</span>
                <span className="text-sm text-gray-500">
                  {checkedCount} von {totalIngredients} erledigt
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${totalIngredients > 0 ? (checkedCount / totalIngredients) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {/* Ingredients by Recipe */}
            <div className="space-y-6">
              {recipeIngredients.map((recipe) => (
                <div key={recipe.mealPlanId} className="bg-white rounded-lg p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-primary-600" />
                    {formatDate(recipe.date)} • {recipe.recipeTitle}
                  </h3>
                  
                  <div className="space-y-2">
                    {recipe.ingredients.map((ingredient, index) => {
                      const ingredientKey = `${recipe.mealPlanId}_${index}`
                      const isChecked = checkedIngredients.has(ingredientKey)
                      
                      return (
                        <div
                          key={index}
                          className={`flex items-center space-x-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                            isChecked ? 'bg-gray-50 opacity-70' : ''
                          }`}
                          onClick={() => toggleIngredient(ingredientKey)}
                        >
                          <div className={`w-5 h-5 rounded border-2 transition-colors flex items-center justify-center ${
                            isChecked
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-300 hover:border-green-400'
                          }`}>
                            {isChecked && (
                              <Check className="h-3 w-3 text-white" />
                            )}
                          </div>
                          
                          <span className={`flex-1 ${
                            isChecked ? 'line-through text-gray-500' : 'text-gray-700'
                          }`}>
                            <span className="font-medium">
                              {ingredient.amount && ingredient.amount > 0 ? `${ingredient.amount} ` : ''}
                              {ingredient.unit ? `${ingredient.unit} ` : ''}
                            </span>
                            {ingredient.name}
                            {ingredient.notes && (
                              <span className="text-gray-500 text-sm"> ({ingredient.notes})</span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Back Button */}
            <div className="text-center mt-8">
              <button
                onClick={goBackToSelection}
                className="btn-secondary flex items-center justify-center mx-auto"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück zur Auswahl
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}