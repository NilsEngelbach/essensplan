'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { CalendarDays, ChefHat, Plus, Search, LogIn, ShoppingCart } from 'lucide-react'
import { useAuth } from '../components/AuthProvider'
import { useRecipes } from '../components/RecipeProvider'
import { useMealPlans } from '../components/MealPlanProvider'
import LoginModal from '../components/LoginModal'
import SignUpModal from '../components/SignUpModal'
import DatePickerModal from '../components/DatePickerModal'
import Navigation from '../components/Navigation'
import RecipeCard from '../components/RecipeCard'
import toast from 'react-hot-toast'

export default function HomePage() {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()
  const { recipes } = useRecipes()
  const { getMealPlanForDate, addOrUpdateMealPlan, mealPlans } = useMealPlans()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showSignUpModal, setShowSignUpModal] = useState(false)
  const [showDatePickerModal, setShowDatePickerModal] = useState(false)
  const [selectedRecipeForPlanning, setSelectedRecipeForPlanning] = useState<string | null>(null)
  
  // Get up to 3 random recipes
  const randomRecipes = useMemo(() => {
    if (!recipes.length) return [];
    const shuffled = [...recipes].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }, [recipes]);

  // Get next 7 days for meal plan preview
  const weekDates = useMemo(() => {
    const today = new Date()
    const dates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      dates.push(date.toISOString().split('T')[0])
    }
    return dates
  }, [])

  const getShortDayName = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('de-DE', { weekday: 'short' })
  }

  const getDayNumber = (dateString: string) => {
    const date = new Date(dateString)
    return date.getDate()
  }

  const formatLastCooked = (lastCooked: string | null) => {
    if (!lastCooked) return 'Noch nie'
    
    const date = new Date(lastCooked)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return 'Gestern'
    if (diffDays <= 7) return `${diffDays}d`
    if (diffDays <= 14) return '1w'
    if (diffDays <= 30) return `${Math.ceil(diffDays / 7)}w`
    return `${Math.ceil(diffDays / 30)}m`
  }

  const handleSignOut = async () => {
    try {
      const { error } = await signOut()
      if (error) {
        toast.error('Fehler beim Abmelden')
      } else {
        toast.success('Erfolgreich abgemeldet')
      }
    } catch (error) {
      toast.error('Ein Fehler ist aufgetreten')
    }
  }

  const handlePlanRecipe = (recipeId: string) => {
    setSelectedRecipeForPlanning(recipeId)
    setShowDatePickerModal(true)
  }

  const handleDateSelect = async (date: string) => {
    if (selectedRecipeForPlanning) {
      try {
        await addOrUpdateMealPlan(date, selectedRecipeForPlanning)
        toast.success('Rezept erfolgreich geplant')
      } catch (error) {
        console.error('Error planning recipe:', error)
        toast.error('Fehler beim Planen des Rezepts')
      }
    }
    setShowDatePickerModal(false)
    setSelectedRecipeForPlanning(null)
  }

  const handleCloseDatePicker = () => {
    setShowDatePickerModal(false)
    setSelectedRecipeForPlanning(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Laden...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      {user ? (
        <Navigation />
      ) : (
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <ChefHat className="h-8 w-8 text-primary-600" />
                <h1 className="ml-2 text-xl font-bold text-gray-900">Essensplan</h1>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="btn-primary flex items-center"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Anmelden
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {user ? (
          <>
            {/* Hero Section for logged in users */}
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Willkommen zurück, {user.user_metadata?.name || user.email?.split('@')[0]}!
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Organisieren Sie Ihre Familienmahlzeiten, entdecken Sie neue Rezepte und 
                behalten Sie den Überblick über Ihre Kochhistorie.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              <div 
                onClick={() => router.push('/recipes/new')}
                className="card hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="flex items-center mb-4">
                  <div className="bg-primary-100 p-3 rounded-lg">
                    <Plus className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="ml-3 text-lg font-semibold">Rezept erstellen</h3>
                </div>
                <p className="text-gray-600">Erstellen Sie ein neues Rezept manuell oder importieren Sie es mit KI.</p>
              </div>

              <div 
                onClick={() => router.push('/recipes')}
                className="card hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="flex items-center mb-4">
                  <div className="bg-green-100 p-3 rounded-lg">
                    <Search className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="ml-3 text-lg font-semibold">Rezepte durchsuchen</h3>
                </div>
                <p className="text-gray-600">Durchsuchen und verwalten Sie Ihre gespeicherten Rezepte.</p>
              </div>

              <div 
                onClick={() => router.push('/meal-plan')}
                className="card hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="flex items-center mb-4">
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <CalendarDays className="h-6 w-6 text-purple-600" />
                  </div>
                  <h3 className="ml-3 text-lg font-semibold">Essensplan</h3>
                </div>
                <p className="text-gray-600">Planen Sie Ihre Mahlzeiten für die Woche und verfolgen Sie Ihre Kochhistorie.</p>
              </div>

              <div 
                onClick={() => router.push('/grocery-list')}
                className="card hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="flex items-center mb-4">
                  <div className="bg-orange-100 p-3 rounded-lg">
                    <ShoppingCart className="h-6 w-6 text-orange-600" />
                  </div>
                  <h3 className="ml-3 text-lg font-semibold">Einkaufsliste</h3>
                </div>
                <p className="text-gray-600">Automatisch generierte Einkaufsliste basierend auf Ihren geplanten Rezepten.</p>
              </div>
            </div>

            {/* Recent Recipes Section */}
            <div className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Ihre Rezepte</h3>
                <button
                  onClick={() => router.push('/recipes')}
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  Alle anzeigen →
                </button>
              </div>
              {randomRecipes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {randomRecipes.map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      onPlanRecipe={handlePlanRecipe}
                      formatLastCooked={formatLastCooked}
                      onClick={(recipeId) => router.push(`/recipes/${recipeId}`)}
                      mealPlans={mealPlans.map(mp => ({ date: typeof mp.date === 'string' ? mp.date.split('T')[0] : mp.date, recipeId: mp.recipeId || '' })).filter(mp => mp.recipeId)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Noch keine Rezepte</h3>
                  <p className="text-gray-600 mb-6">
                    Erstellen Sie Ihr erstes Rezept, um loszulegen.
                  </p>
                  <button
                    onClick={() => router.push('/recipes/new')}
                    className="btn-primary"
                  >
                    Erstes Rezept erstellen
                  </button>
                </div>
              )}
            </div>

            {/* Weekly Meal Plan Preview */}
            <div className="card">
              <div className="flex flex-col gap-2 md:flex-row items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Nächste 7 Tage</h3>
                <button
                  onClick={() => router.push('/meal-plan')}
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  Essensplan verwalten →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {weekDates.map((date) => {
                  const mealPlan = getMealPlanForDate(date)
                  const isToday = date === new Date().toISOString().split('T')[0]
                  
                  return (
                    <div key={date} className="text-center flex flex-col">
                      <div className="flex flex-row md:flex-col items-center justify-center gap-2 md:gap-0">
                        <div className={`text-sm font-medium mb-2 ${
                          isToday ? 'text-primary-600' : 'text-gray-500'
                        }`}>
                          {getShortDayName(date)}
                        </div>
                        <div className={`text-lg font-bold mb-2 ${
                          isToday ? 'text-primary-800' : 'text-gray-900'
                        }`}>
                          {getDayNumber(date)}
                        </div>
                      </div>
                      <div 
                        className={`rounded-lg p-3 min-h-[100px] flex grow items-center justify-center cursor-pointer transition-all duration-200 ${
                          mealPlan?.recipe 
                            ? isToday 
                              ? 'bg-primary-50 border-2 border-primary-200 hover:shadow-md hover:scale-105' 
                              : 'bg-white border border-gray-200 shadow-sm hover:shadow-md hover:scale-105'
                            : isToday 
                              ? 'bg-primary-50 border border-primary-200 hover:bg-primary-100 border-dashed' 
                              : 'bg-gray-50 border border-gray-300 hover:bg-gray-100 border-dashed'
                        }`}
                        onClick={() => {
                          if (mealPlan?.recipe) {
                            // If there's a recipe planned, go to recipe details
                            router.push(`/recipes/${mealPlan.recipe.id}`)
                          } else {
                            // If no recipe, go to meal plan to add one
                            router.push(`/meal-plan?date=${date}&openModal=true`)
                          }
                        }}
                      >
                        {mealPlan?.recipe ? (
                          <div className="text-center">
                            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-full mx-auto mb-2 flex items-center justify-center shadow-sm relative overflow-hidden">
                              {mealPlan.recipe.imageUrl ? (
                                <Image 
                                  src={mealPlan.recipe.imageUrl} 
                                  alt={mealPlan.recipe.title}
                                  width={40}
                                  height={40}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                                <ChefHat className="h-5 w-5 text-white" />
                              )}
                            </div>
                            <div className="text-xs font-semibold text-gray-900 line-clamp-2 mb-1">
                              {mealPlan.recipe.title}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-center text-gray-400">
                            <Plus className="h-5 w-5 mx-auto mb-2 text-gray-300" />
                            <div className="font-medium text-gray-500 mb-1">Rezept hinzufügen</div>
                            <div className="text-gray-400">Klicken zum Planen</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Hero Section for non-logged in users */}
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Willkommen bei Ihrem Familien-Essensplaner
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
                Organisieren Sie Ihre Familienmahlzeiten, entdecken Sie neue Rezepte und 
                behalten Sie den Überblick über Ihre Kochhistorie.
              </p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setShowSignUpModal(true)}
                  className="btn-primary"
                >
                  Jetzt registrieren
                </button>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="btn-secondary"
                >
                  Anmelden
                </button>
              </div>
            </div>

            {/* Features for non-logged in users */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="card text-center">
                <div className="bg-primary-100 p-3 rounded-lg w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <ChefHat className="h-8 w-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Rezepte verwalten</h3>
                <p className="text-gray-600">Erstellen und organisieren Sie Ihre Lieblingsrezepte mit Bildern und detaillierten Anweisungen.</p>
              </div>

              <div className="card text-center">
                <div className="bg-green-100 p-3 rounded-lg w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <Search className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">KI-gestützter Import</h3>
                <p className="text-gray-600">Importieren Sie Rezepte automatisch von Websites oder Screenshots.</p>
              </div>

              <div className="card text-center">
                <div className="bg-purple-100 p-3 rounded-lg w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <CalendarDays className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Essensplanung</h3>
                <p className="text-gray-600">Planen Sie Ihre Mahlzeiten für die Woche und verfolgen Sie Ihre Kochhistorie.</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Auth Modals */}
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

      {/* Date Picker Modal */}
      <DatePickerModal
        isOpen={showDatePickerModal}
        onClose={handleCloseDatePicker}
        onDateSelect={handleDateSelect}
        title="Rezept planen"
        plannedDates={mealPlans.map(mp => typeof mp.date === 'string' ? mp.date.split('T')[0] : mp.date)}
      />
    </div>
  )
} 