'use client'

import React, { useState, useCallback } from 'react'
import { X, Calendar } from 'lucide-react'
import { useRecipes } from './RecipeProvider'
import { useMealPlans } from './MealPlanProvider'
import BasicInfoSection from './recipe-form/BasicInfoSection'
import TagsSection from './recipe-form/TagsSection'
import StarRating from './recipe-form/StarRating'
import ImageUploadSection from './recipe-form/ImageUploadSection'
import IngredientsSection from './recipe-form/IngredientsSection'
import InstructionsSection from './recipe-form/InstructionsSection'
import DatePickerModal from './DatePickerModal'

interface Ingredient {
  id: string
  name: string
  amount: string
  unit: string
  notes: string
  component?: string
}

interface Instruction {
  id: string
  stepNumber: number
  description: string
  imageUrl?: string
}

interface RecipeFormProps {
  onSubmit: (recipe: any) => Promise<any>
  onCancel: () => void
  initialData?: any
}

export default function RecipeForm({ onSubmit, onCancel, initialData }: RecipeFormProps) {
  const [title, setTitle] = useState(initialData?.title || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [category, setCategory] = useState(initialData?.category || '')
  const [tags, setTags] = useState<string[]>(initialData?.tags || [])
  const [cookingTime, setCookingTime] = useState(initialData?.cookingTime || '')
  const [servings, setServings] = useState(initialData?.servings || '')
  const [difficulty, setDifficulty] = useState(initialData?.difficulty || '')
  const [rating, setRating] = useState(initialData?.rating?.toString() || '')
  const [sourceUrl, setSourceUrl] = useState(initialData?.sourceUrl || '')
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '')
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialData?.ingredients || [])
  const [instructions, setInstructions] = useState<Instruction[]>(initialData?.instructions || [])
  const [draggedIngredient, setDraggedIngredient] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [touchStartY, setTouchStartY] = useState<number | null>(null)
  const [isTouchDragging, setIsTouchDragging] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [selectedMealPlanDate, setSelectedMealPlanDate] = useState('')
  const { uploadImage, isUploading } = useRecipes()
  const { addOrUpdateMealPlan, mealPlans } = useMealPlans()



  const toggleTag = useCallback((tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter(t => t !== tag))
    } else {
      setTags([...tags, tag])
    }
  }, [tags])

  const handleInstructionImageUpload = async (file: File, instructionId: string) => {
    if (!file) return

    try {
      const publicUrl = await uploadImage(file)
      const updatedInstructions = instructions.map(inst => 
        inst.id === instructionId ? { ...inst, imageUrl: publicUrl } : inst
      )
      setInstructions(updatedInstructions)
      console.log('Instruction image uploaded successfully:', publicUrl)
    } catch (error) {
      console.error('Upload error:', error)
      if (error instanceof Error) {
        alert(`Upload failed: ${error.message}`)
      } else {
        alert('Upload failed. Please check your connection and try again.')
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const recipe = {
      title,
      description,
      category,
      tags,
      cookingTime: parseInt(cookingTime) || 0,
      servings: parseInt(servings) || 0,
      difficulty,
      rating: rating ? parseInt(rating) : null,
      sourceUrl: sourceUrl.trim() || null,
      imageUrl,
      ingredients: ingredients.filter(ing => ing.name.trim() !== '').map(ing => ({
        ...ing,
        amount: ing.amount === '' ? null : parseFloat(ing.amount) || null
      })),
      instructions: instructions.filter(inst => inst.description.trim() !== '')
    }
    onSubmit(recipe)
  }

  const handleSaveAndPlan = (e: React.FormEvent) => {
    e.preventDefault()
    setShowDatePicker(true)
  }

  const handleDateSelect = async (dateString: string) => {
    const recipe = {
      title,
      description,
      category,
      tags,
      cookingTime: parseInt(cookingTime) || 0,
      servings: parseInt(servings) || 0,
      difficulty,
      rating: rating ? parseInt(rating) : null,
      sourceUrl: sourceUrl.trim() || null,
      imageUrl,
      ingredients: ingredients.filter(ing => ing.name.trim() !== '').map(ing => ({
        ...ing,
        amount: ing.amount === '' ? null : parseFloat(ing.amount) || null
      })),
      instructions: instructions.filter(inst => inst.description.trim() !== '')
    }
    
    try {
      // Save recipe first and get the created recipe with ID
      const createdRecipe = await onSubmit(recipe)
      
      // Add to meal plan using the created recipe ID
      if (createdRecipe && createdRecipe.id) {
        await addOrUpdateMealPlan(dateString, createdRecipe.id)
        import('react-hot-toast').then(({ default: toast }) => {
          toast.success('Rezept erstellt und zum Essensplan hinzugefügt')
        })
      }
      
      setShowDatePicker(false)
    } catch (error) {
      console.error('Error in save and plan:', error)
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error('Fehler beim Speichern und Planen des Rezepts')
      })
    }
  }

  // Get planned dates for calendar indicators
  const plannedDates = mealPlans.map(mp => {
    const mealPlanDate = typeof mp.date === 'string' ? mp.date.split('T')[0] : mp.date
    return mealPlanDate
  })

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {initialData ? 'Rezept bearbeiten' : 'Neues Rezept erstellen'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <BasicInfoSection
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            category={category}
            setCategory={setCategory}
            cookingTime={cookingTime}
            setCookingTime={setCookingTime}
            servings={servings}
            setServings={setServings}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
          />

          <TagsSection tags={tags} toggleTag={toggleTag} />

          {/* Rating and Source URL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StarRating rating={rating} setRating={setRating} />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quell-URL (optional)
              </label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="input-field"
                placeholder="https://cookidoo.de/recipes/..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Link zu Cookidoo oder anderen Rezeptquellen
              </p>
            </div>
          </div>

          <ImageUploadSection
            imageUrl={imageUrl}
            setImageUrl={setImageUrl}
            isUploading={isUploading}
            uploadImage={uploadImage}
            title={title}
            ingredients={ingredients}
          />

          <IngredientsSection
            ingredients={ingredients}
            setIngredients={setIngredients}
            draggedIngredient={draggedIngredient}
            setDraggedIngredient={setDraggedIngredient}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            touchStartY={touchStartY}
            setTouchStartY={setTouchStartY}
            isTouchDragging={isTouchDragging}
            setIsTouchDragging={setIsTouchDragging}
          />

          <InstructionsSection
            instructions={instructions}
            setInstructions={setInstructions}
            handleInstructionImageUpload={handleInstructionImageUpload}
            isUploading={isUploading}
          />

          {/* Submit Buttons */}
          <div className="flex flex-col md:flex-row justify-end md:space-x-4 md:space-y-0 space-y-2 pt-6 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary"
            >
              Abbrechen
            </button>
            {!initialData && (
              <button
                type="button"
                onClick={handleSaveAndPlan}
                className="btn-secondary flex items-center justify-center text-center"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Speichern und Planen
              </button>
            )}
            <button
              type="submit"
              className="btn-primary"
            >
              {initialData ? 'Rezept aktualisieren' : 'Rezept speichern'}
            </button>
          </div>
        </form>

        {/* Date Picker Modal */}
        <DatePickerModal
          isOpen={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onDateSelect={handleDateSelect}
          title="Datum für Essensplan auswählen"
          plannedDates={plannedDates}
        />
      </div>
    </div>
  )
} 