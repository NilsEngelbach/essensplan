'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { 
  Calendar, 
  Plus, 
  Trash2, 
  Clock, 
  Users, 
  Star,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  CalendarDays
} from 'lucide-react'
import { useAuth } from '../../components/AuthProvider'
import { useRecipes } from '../../components/RecipeProvider'
import { useMealPlans } from '../../components/MealPlanProvider'
import Navigation from '../../components/Navigation'
import RecipeSelector from '../../components/RecipeSelector'
import DatePickerModal from '../../components/DatePickerModal'
import PageStateHandler from '../../components/PageStateHandler'
import toast from 'react-hot-toast'

export default function MealPlanPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { recipes } = useRecipes()
  const { mealPlans, loading, addOrUpdateMealPlan, removeMealPlan, rescheduleMealPlan, getMealPlanForDate } = useMealPlans()
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0)
  const [mealPlanToReschedule, setMealPlanToReschedule] = useState<string | null>(null)

  // Get 7 days starting from today + offset
  const weekDates = useMemo(() => {
    const today = new Date()
    const dates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i + (currentWeekOffset * 7))
      dates.push(date.toISOString().split('T')[0])
    }
    return dates
  }, [currentWeekOffset])

  // Refresh meal plans when week dates change
  const { refreshMealPlans } = useMealPlans()
  useEffect(() => {
    if (user && weekDates.length > 0) {
      refreshMealPlans(weekDates[0], weekDates[6])
    }
  }, [user, weekDates, refreshMealPlans])

  // Get planned dates for calendar indicators
  const plannedDates = useMemo(() => {
    return mealPlans.map(mp => {
      // Handle both date string formats
      const mealPlanDate = typeof mp.date === 'string' ? mp.date.split('T')[0] : mp.date
      return mealPlanDate
    })
  }, [mealPlans])

  // Handle URL parameters for auto-opening modal with specific date
  useEffect(() => {
    const dateParam = searchParams.get('date')
    const openModalParam = searchParams.get('openModal')
    
    if (dateParam && openModalParam === 'true') {
      // Calculate the week offset needed to show the selected date
      const selectedDate = new Date(dateParam)
      const today = new Date()
      const diffTime = selectedDate.getTime() - today.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      const weekOffset = Math.floor(diffDays / 7)
      
      // Set the week offset to show the selected date
      if (weekOffset !== currentWeekOffset) {
        setCurrentWeekOffset(weekOffset)
      }
      
      setSelectedDate(dateParam)
      setShowAddModal(true)
      
      // Clean up URL parameters after handling them
      const url = new URL(window.location.href)
      url.searchParams.delete('date')
      url.searchParams.delete('openModal')
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }, [searchParams, router, currentWeekOffset])

  const handleAddToMealPlan = async () => {
    if (!selectedDate || !selectedRecipe) {
      toast.error('Bitte wählen Sie ein Datum und ein Rezept aus')
      return
    }
    try {
      await addOrUpdateMealPlan(selectedDate, selectedRecipe)
      toast.success('Rezept zum Essensplan hinzugefügt')
      setShowAddModal(false)
      setShowDatePicker(false)
      setSelectedDate('')
      setSelectedRecipe('')
    } catch (error) {
      console.error('Error adding to meal plan:', error)
      toast.error('Fehler beim Hinzufügen zum Essensplan')
    }
  }

  const handleDateSelect = async (dateString: string) => {
    if (mealPlanToReschedule) {
      // Handle rescheduling
      try {
        // Check if target date already has a meal plan
        const existingPlan = getMealPlanForDate(dateString)
        if (existingPlan) {
          toast.error('Dieser Tag hat bereits ein Rezept geplant')
          return
        }
        
        await rescheduleMealPlan(mealPlanToReschedule, dateString)
        toast.success('Rezept erfolgreich umgeplant')
        setMealPlanToReschedule(null)
        setShowDatePicker(false)
      } catch (error) {
        console.error('Error rescheduling meal plan:', error)
        toast.error('Fehler beim Umplanen des Rezepts')
      }
    } else {
      // Handle normal date selection for adding new meal plan
      setSelectedDate(dateString)
      setShowDatePicker(false)
    }
  }

  const handleCloseModal = () => {
    setShowAddModal(false)
    setShowDatePicker(false)
    setSelectedDate('')
    setSelectedRecipe('')
    setMealPlanToReschedule(null)
  }

  const handleRemoveFromMealPlan = async (mealPlanId: string) => {
    try {
      await removeMealPlan(mealPlanId)
      toast.success('Rezept aus Essensplan entfernt')
    } catch (error) {
      console.error('Error removing from meal plan:', error)
      toast.error('Fehler beim Entfernen aus dem Essensplan')
    }
  }

  // Handle reschedule button click
  const handleRescheduleClick = (mealPlanId: string) => {
    setMealPlanToReschedule(mealPlanId)
    setSelectedDate('') // Reset selected date
    setShowDatePicker(true)
  }

  const getDayName = useCallback((dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('de-DE', { weekday: 'long' })
  }, [])

  const getShortDayName = useCallback((dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('de-DE', { weekday: 'short' })
  }, [])

  const getDayNumber = useCallback((dateString: string) => {
    const date = new Date(dateString)
    return date.getDate()
  }, [])

  const getMonthName = useCallback((dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('de-DE', { month: 'short' })
  }, [])


  const getTags = useCallback((recipe: any) => {
    if (!recipe?.tags) return []
    try {
      return JSON.parse(recipe.tags)
    } catch {
      return []
    }
  }, [])

  return (
    <PageStateHandler
      loading={authLoading || loading}
      user={user}
      loadingText="Essensplan wird geladen..."
      icon={<CalendarDays className="h-12 w-12 text-gray-400 mx-auto mb-4" />}
      title="Bitte melden Sie sich an"
      subtitle="Sie müssen angemeldet sein, um Ihren Essensplan zu sehen."
    >
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Essensplan</h1>
            <p className="text-gray-600 mt-1 sm:mt-2">
              {currentWeekOffset === 0 ? 'Diese Woche' : 
               currentWeekOffset === 1 ? 'Nächste Woche' : 
               `${Math.abs(currentWeekOffset)} Wochen ${currentWeekOffset > 0 ? 'voraus' : 'zurück'}`}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="flex items-center justify-center space-x-2">
              <button
                onClick={() => setCurrentWeekOffset(prev => prev - 1)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setCurrentWeekOffset(0)}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Heute
              </button>
              <button
                onClick={() => setCurrentWeekOffset(prev => prev + 1)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center justify-center"
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Rezepte planen
            </button>
          </div>
        </div>

        {/* Meal Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {weekDates.map((date) => {
            const mealPlan = getMealPlanForDate(date)
            const isToday = date === new Date().toISOString().split('T')[0]
            
            return (
              <div 
                key={date} 
                className={`card min-h-[300px] ${
                  isToday ? 'ring-2 ring-primary-200' : ''
                }`}
              >
                {/* Date Header */}
                <div className={`text-center mb-4 p-2 rounded-lg ${
                  isToday ? 'bg-primary-100 text-primary-800' : 'bg-gray-50 text-gray-700'
                }`}>
                  <div className="text-sm font-medium">
                    {getShortDayName(date)}
                  </div>
                  <div className="text-2xl font-bold">
                    {getDayNumber(date)}
                  </div>
                  <div className="text-xs">
                    {getMonthName(date)}
                  </div>
                </div>
                
                {/* Meal Plan Content */}
                <div>
                  {mealPlan?.recipe ? (
                    <div className="space-y-3">
                      {/* Recipe Image */}
                      <div 
                        className="relative w-full h-32 rounded-lg overflow-hidden bg-gradient-to-br from-orange-400 to-red-500 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => router.push(`/recipes/${mealPlan.recipe.id}`)}
                      >
                        {mealPlan.recipe.imageUrl ? (
                          <Image 
                            src={mealPlan.recipe.imageUrl} 
                            alt={mealPlan.recipe.title}
                            width={300}
                            height={128}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ChefHat className="h-8 w-8 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Recipe Info */}
                      <div>
                        <h3 
                          className="font-semibold text-gray-900 text-sm line-clamp-2 cursor-pointer hover:text-primary-600 transition-colors"
                          onClick={() => router.push(`/recipes/${mealPlan.recipe.id}`)}
                        >
                          {mealPlan.recipe.title}
                        </h3>
                        
                        {/* Recipe Stats */}
                        <div className="flex items-center text-xs text-gray-600 mt-2 space-x-2">
                          {mealPlan.recipe.cookingTime && Number(mealPlan.recipe.cookingTime) > 0 ? (
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              <span>{mealPlan.recipe.cookingTime}</span>
                            </div>
                          ) : (<></>)}
                          {mealPlan.recipe.servings && Number(mealPlan.recipe.servings) > 0 ? (
                            <div className="flex items-center">
                              <Users className="h-3 w-3 mr-1" />
                              <span>{mealPlan.recipe.servings}</span>
                            </div>
                          ): (<></>)}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col space-y-1">
                        <button
                          onClick={() => handleRescheduleClick(mealPlan.id)}
                          className="w-full text-xs text-primary-600 hover:text-primary-800 flex items-center justify-center py-1"
                        >
                          <Calendar className="h-3 w-3 mr-1" />
                          Umplanen
                        </button>
                        
                        <button
                          onClick={() => handleRemoveFromMealPlan(mealPlan.id)}
                          className="w-full text-xs text-red-600 hover:text-red-800 flex items-center justify-center"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Entfernen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="text-center py-8 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => {
                        setSelectedDate(date)
                        setShowAddModal(true)
                      }}
                    >
                      <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Kein Rezept geplant</p>
                      <p className="text-xs text-gray-400 mt-1">Klicken zum Hinzufügen</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Add Recipe Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Rezept zum Essensplan hinzufügen</h3>
            
            <div className="space-y-4">
              {/* Date Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Datum
                </label>
                <button
                  onClick={() => setShowDatePicker(true)}
                  className="input-field text-left w-full flex items-center justify-between"
                >
                  <span className={selectedDate ? 'text-gray-900' : 'text-gray-500'}>
                    {selectedDate 
                      ? new Date(selectedDate).toLocaleDateString('de-DE', { 
                          weekday: 'long', 
                          day: 'numeric', 
                          month: 'long', 
                          year: 'numeric' 
                        })
                      : 'Datum auswählen'
                    }
                  </span>
                  <Calendar className="h-4 w-4 text-gray-400" />
                </button>
              </div>

              {/* Recipe Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rezept
                </label>
                <RecipeSelector
                  recipes={recipes}
                  onRecipeSelect={setSelectedRecipe}
                  selectedRecipeId={selectedRecipe}
                  placeholder="Rezept suchen oder auswählen..."
                  autoFocus={showAddModal && !showDatePicker}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={handleCloseModal}
                className="btn-secondary"
              >
                Abbrechen
              </button>
              <button
                onClick={handleAddToMealPlan}
                className="btn-primary"
                disabled={!selectedDate || !selectedRecipe}
              >
                Hinzufügen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Picker Modal */}
      <DatePickerModal
        isOpen={showDatePicker}
        onClose={() => {
          setShowDatePicker(false)
          setMealPlanToReschedule(null)
        }}
        onDateSelect={handleDateSelect}
        title={mealPlanToReschedule ? "Neues Datum für Rezept auswählen" : "Datum für Essensplan auswählen"}
        preselectedDate={selectedDate}
        plannedDates={plannedDates}
      />

    </div>
    </PageStateHandler>
  )
} 