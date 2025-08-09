'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  Plus, 
  Search, 
  ChefHat,
  Wand2,
  Star,
  X,
  RefreshCw
} from 'lucide-react'
import { useAuth } from '../../components/AuthProvider'
import { useRecipes } from '../../components/RecipeProvider'
import { useMealPlans } from '../../components/MealPlanProvider'
import Navigation from '../../components/Navigation'
import AIImportModal from '../../components/AIImportModal'
import DatePickerModal from '../../components/DatePickerModal'
import RecipeCard from '../../components/RecipeCard'
import toast from 'react-hot-toast'
import type { RecipeWithRelations } from '../../lib/supabase'

export default function RecipesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { recipes, loading, removeRecipe, refreshRecipes, addRecipe } = useRecipes()
  const { addOrUpdateMealPlan, mealPlans } = useMealPlans()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [minRating, setMinRating] = useState<number>(0)
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'lastCooked' | 'created' | 'rating'>('created')
  const [showAIImportModal, setShowAIImportModal] = useState(false)
  const [showDatePickerModal, setShowDatePickerModal] = useState(false)
  const [selectedRecipeForPlanning, setSelectedRecipeForPlanning] = useState<string | null>(null)
  const [isStateInitialized, setIsStateInitialized] = useState(false)

  const categories = ['Hauptspeise', 'Salat', 'Dessert', 'Suppe', 'Beilage', 'Frühstück', 'Snack']
  const commonTags = ['Vegetarisch', 'Vegan', 'Glutenfrei', 'Laktosefrei', 'Schnell', 'Gesund', 'Würzig', 'Süß']

  // Initialize state from URL parameters and localStorage
  useEffect(() => {
    const initializeState = () => {
      // Get state from URL parameters first (priority)
      const urlSearch = searchParams.get('search') || ''
      const urlCategory = searchParams.get('category') || ''
      const urlTags = searchParams.get('tags') ? searchParams.get('tags')!.split(',') : []
      const urlSort = searchParams.get('sort') as typeof sortBy || null

      // Get state from localStorage as fallback
      const savedState = localStorage.getItem('recipesPageState')
      const parsedState = savedState ? JSON.parse(savedState) : {}

      // Set states with URL priority, then localStorage fallback
      setSearchTerm(urlSearch || parsedState.searchTerm || '')
      setSelectedCategory(urlCategory || parsedState.selectedCategory || '')
      setSelectedTags(urlTags.length > 0 ? urlTags : parsedState.selectedTags || [])
      setMinRating(parsedState.minRating || 0)
      setSortBy(urlSort || parsedState.sortBy || 'created')

      setIsStateInitialized(true)

      // Clean URL parameters after restoring state
      if (urlSearch || urlCategory || urlTags.length > 0 || urlSort) {
        const url = new URL(window.location.href)
        url.searchParams.delete('search')
        url.searchParams.delete('category')
        url.searchParams.delete('tags')
        url.searchParams.delete('sort')
        router.replace(url.pathname, { scroll: false })
      }
    }

    if (!isStateInitialized) {
      initializeState()
    }
  }, [searchParams, router, isStateInitialized])

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (isStateInitialized) {
      const stateToSave = {
        searchTerm,
        selectedCategory,
        selectedTags,
        minRating,
        sortBy
      }
      localStorage.setItem('recipesPageState', JSON.stringify(stateToSave))
    }
  }, [searchTerm, selectedCategory, selectedTags, minRating, sortBy, isStateInitialized])

  const handleCreateRecipe = () => {
    router.push('/recipes/new')
  }

  const handleAIImport = async (recipe: any) => {
    try {
      const { ingredients, instructions, ...recipeData } = recipe
      await addRecipe(
        {
          ...recipeData,
          userId: user!.id,
          tags: JSON.stringify(recipe.tags)
        },
        ingredients.map((ing: any) => ({ ...ing, id: undefined })),
        instructions.map((inst: any) => ({ ...inst, id: undefined }))
      )
      toast.success('Rezept erfolgreich importiert')
    } catch (error) {
      console.error('Error importing recipe:', error)
      toast.error('Fehler beim Importieren des Rezepts')
    }
  }

  const formatLastCooked = useCallback((lastCooked: string | null) => {
    if (!lastCooked) return 'Noch nie gekocht'
    
    const date = new Date(lastCooked)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return 'Gestern'
    if (diffDays <= 7) return `Vor ${diffDays} Tagen`
    if (diffDays <= 14) return 'Letzte Woche'
    if (diffDays <= 30) return `Vor ${Math.ceil(diffDays / 7)} Wochen`
    if (diffDays <= 365) return `Vor ${Math.ceil(diffDays / 30)} Monaten`
    return `Vor ${Math.ceil(diffDays / 365)} Jahren`
  }, [])

  const handleViewRecipe = (recipeId: string) => {
    // Build URL with current state parameters to restore when navigating back
    const params = new URLSearchParams()
    if (searchTerm) params.set('search', searchTerm)
    if (selectedCategory) params.set('category', selectedCategory)
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','))
    if (sortBy !== 'created') params.set('sort', sortBy)
    
    const returnUrl = params.toString() ? `/recipes?${params.toString()}` : '/recipes'
    router.push(`/recipes/${recipeId}?returnUrl=${encodeURIComponent(returnUrl)}`)
  }

  const handleEditRecipe = (recipeId: string) => {
    router.push(`/recipes/${recipeId}/edit`)
  }

  const handleDeleteRecipe = async (recipeId: string, recipeTitle: string, imageUrl?: string) => {
    if (!confirm(`Sind Sie sicher, dass Sie "${recipeTitle}" löschen möchten?`)) {
      return
    }
    try {
      await removeRecipe(recipeId, imageUrl)
      toast.success('Rezept erfolgreich gelöscht')
    } catch (error) {
      console.error('Error deleting recipe:', error)
      toast.error('Fehler beim Löschen des Rezepts')
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

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }, [])

  const resetFilters = useCallback(() => {
    setSearchTerm('')
    setSelectedCategory('')
    setSelectedTags([])
    setMinRating(0)
    setSortBy('created')
    refreshRecipes('created')
  }, [refreshRecipes])

  const getTags = useCallback((recipe: RecipeWithRelations) => {
    if (!recipe.tags) return []
    try {
      return JSON.parse(recipe.tags)
    } catch {
      return []
    }
  }, [])

  const filteredRecipes = useMemo(() => {
    return recipes.filter(recipe => {
      const matchesCategory = !selectedCategory || recipe.category === selectedCategory
      const matchesSearch = recipe.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (recipe.description && recipe.description.toLowerCase().includes(searchTerm.toLowerCase()))
      const recipeTags = getTags(recipe)
      const matchesTags = selectedTags.length === 0 || 
                         selectedTags.some(tag => recipeTags.includes(tag))
      const matchesRating = minRating === 0 || (recipe.rating && recipe.rating >= minRating)
      return matchesCategory && matchesSearch && matchesTags && matchesRating
    })
  }, [recipes, searchTerm, selectedCategory, selectedTags, minRating, getTags])

  // Show loading state while auth is loading or recipes are loading
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
          <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Bitte melden Sie sich an
          </h3>
          <p className="text-gray-600 mb-6">
            Sie müssen angemeldet sein, um Ihre Rezepte zu sehen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Rezepte</h1>
            <p className="text-gray-600 mt-1 sm:mt-2">Verwalten Sie Ihre Rezeptsammlung</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <button
              onClick={() => setShowAIImportModal(true)}
              className="btn-secondary flex items-center justify-center"
            >
              <Wand2 className="h-4 w-4 mr-2" />
              KI Import
            </button>
            <button
              onClick={handleCreateRecipe}
              className="btn-primary flex items-center justify-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Neues Rezept
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="card mb-8">
          <div className="space-y-6">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Suche
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field pl-10"
                  placeholder="Rezepte durchsuchen..."
                />
              </div>
            </div>

            {/* Filter Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kategorie
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="input-field"
                >
                  <option value="">Alle Kategorien</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* Rating Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mindestbewertung
                </label>
                <div className="flex items-center space-x-2">
                  {[0, 1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setMinRating(rating)}
                      className={`p-1 transition-colors ${
                        minRating >= rating && rating > 0
                          ? 'text-yellow-400'
                          : rating === 0 && minRating === 0
                          ? 'text-primary-600'
                          : 'text-gray-300 hover:text-yellow-300'
                      }`}
                      title={rating === 0 ? 'Alle anzeigen' : `Mindestens ${rating} Sterne`}
                    >
                      {rating === 0 ? (
                        <span className="text-sm font-medium px-2">Alle</span>
                      ) : (
                        <Star className={`h-5 w-5 ${
                          minRating >= rating ? 'fill-current' : ''
                        }`} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sortieren nach
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const newSortBy = e.target.value as 'recent' | 'popular' | 'lastCooked' | 'created' | 'rating'
                    setSortBy(newSortBy)
                    refreshRecipes(newSortBy)
                  }}
                  className="input-field"
                >
                  <option value="created">Erstellungsdatum</option>
                  <option value="recent">Zuletzt erstellt</option>
                  <option value="popular">Beliebtheit</option>
                  <option value="lastCooked">Zuletzt gekocht</option>
                  <option value="rating">Bewertung</option>
                </select>
              </div>
            </div>

            {/* Tags Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags
              </label>
              <div className="flex flex-wrap gap-2">
                {commonTags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-primary-100 text-primary-800'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Apply Filters Button */}
            <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
              <button
                onClick={resetFilters}
                className="btn-secondary flex items-center justify-center"
              >
                <X className="h-4 w-4 mr-2" />
                Filter zurücksetzen
              </button>
              <button
                onClick={() => refreshRecipes(sortBy)}
                className="btn-primary flex items-center justify-center"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Rezepte neu laden
              </button>
            </div>
          </div>
        </div>

        {/* Recipe Grid */}
        {filteredRecipes.length === 0 ? (
          <div className="text-center py-12">
            <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {recipes.length === 0 ? 'Keine Rezepte gefunden' : 'Keine Rezepte entsprechen den Filtern'}
            </h3>
            <p className="text-gray-600 mb-6">
              {recipes.length === 0 
                ? 'Erstellen Sie Ihr erstes Rezept, um loszulegen.'
                : 'Versuchen Sie andere Suchbegriffe oder Filter.'
              }
            </p>
            {recipes.length === 0 && (
              <button
                onClick={handleCreateRecipe}
                className="btn-primary"
              >
                Erstes Rezept erstellen
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((recipe) => {
              // Build return URL with current state parameters
              const params = new URLSearchParams()
              if (searchTerm) params.set('search', searchTerm)
              if (selectedCategory) params.set('category', selectedCategory)
              if (selectedTags.length > 0) params.set('tags', selectedTags.join(','))
              if (sortBy !== 'created') params.set('sort', sortBy)
              const returnUrl = params.toString() ? `/recipes?${params.toString()}` : '/recipes'

              return (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  showActions={true}
                  onPlanRecipe={handlePlanRecipe}
                  onEditRecipe={handleEditRecipe}
                  onDeleteRecipe={handleDeleteRecipe}
                  formatLastCooked={formatLastCooked}
                  returnUrl={returnUrl}
                  mealPlans={mealPlans.map(mp => ({ date: typeof mp.date === 'string' ? mp.date.split('T')[0] : mp.date, recipeId: mp.recipeId || '' })).filter(mp => mp.recipeId)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* AI Import Modal */}
      <AIImportModal
        isOpen={showAIImportModal}
        onClose={() => setShowAIImportModal(false)}
        onImport={handleAIImport}
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