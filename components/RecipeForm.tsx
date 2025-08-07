'use client'

import React, { useState } from 'react'
import { Plus, X, Upload, Camera, ImageIcon } from 'lucide-react'
import { useRecipes } from './RecipeProvider'

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
  onSubmit: (recipe: any) => void
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
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '')
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialData?.ingredients || [])
  const [instructions, setInstructions] = useState<Instruction[]>(initialData?.instructions || [])
  const { uploadImage, isUploading } = useRecipes()

  const categories = ['Hauptspeise', 'Salat', 'Dessert', 'Suppe', 'Beilage', 'Frühstück', 'Snack']
  const difficulties = ['Einfach', 'Mittel', 'Schwer']
  const commonTags = ['Vegetarisch', 'Vegan', 'Glutenfrei', 'Laktosefrei', 'Schnell', 'Gesund', 'Würzig', 'Süß']

  const addIngredient = () => {
    const newIngredient: Ingredient = {
      id: Date.now().toString(),
      name: '',
      amount: '',
      unit: '',
      notes: '',
      component: ''
    }
    setIngredients([...ingredients, newIngredient])
  }

  const updateIngredient = (id: string, field: keyof Ingredient, value: any) => {
    setIngredients(ingredients.map(ing => 
      ing.id === id ? { ...ing, [field]: value } : ing
    ))
  }

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter(ing => ing.id !== id))
  }

  const addInstruction = () => {
    const newInstruction: Instruction = {
      id: Date.now().toString(),
      stepNumber: instructions.length + 1,
      description: ''
    }
    setInstructions([...instructions, newInstruction])
  }

  const updateInstruction = (id: string, field: keyof Instruction, value: any) => {
    setInstructions(instructions.map(inst => 
      inst.id === id ? { ...inst, [field]: value } : inst
    ))
  }

  const removeInstruction = (id: string) => {
    setInstructions(instructions.filter(inst => inst.id !== id))
  }

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter(t => t !== tag))
    } else {
      setTags([...tags, tag])
    }
  }

  const handleImageUpload = async (file: File) => {
    if (!file) return

    try {
      const publicUrl = await uploadImage(file)
      setImageUrl(publicUrl)
      console.log('Image uploaded successfully:', publicUrl)
    } catch (error) {
      console.error('Upload error:', error)
      if (error instanceof Error) {
        alert(`Upload failed: ${error.message}`)
      } else {
        alert('Upload failed. Please check your connection and try again.')
      }
    }
  }

  const handleInstructionImageUpload = async (file: File, instructionId: string) => {
    if (!file) return

    try {
      const publicUrl = await uploadImage(file)
      updateInstruction(instructionId, 'imageUrl', publicUrl)
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleImageUpload(file)
    }
  }

  const handleCameraCapture = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        handleImageUpload(file)
      }
    }
    input.click()
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
      imageUrl,
      ingredients: ingredients.filter(ing => ing.name.trim() !== '').map(ing => ({
        ...ing,
        amount: ing.amount === '' ? null : parseFloat(ing.amount) || null
      })),
      instructions: instructions.filter(inst => inst.description.trim() !== '')
    }
    onSubmit(recipe)
  }

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
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Titel *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field"
                placeholder="z.B. Pasta Carbonara"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kategorie
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-field"
              >
                <option value="">Kategorie wählen</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              rows={3}
              placeholder="Kurze Beschreibung des Rezepts..."
            />
          </div>

          {/* Tags */}
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
                    tags.includes(tag)
                      ? 'bg-primary-100 text-primary-800'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kochzeit (Minuten)
              </label>
              <input
                type="number"
                value={cookingTime}
                onChange={(e) => setCookingTime(e.target.value)}
                className="input-field"
                placeholder="30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Portionen
              </label>
              <input
                type="number"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="input-field"
                placeholder="4"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Schwierigkeit
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="input-field"
              >
                <option value="">Schwierigkeit wählen</option>
                {difficulties.map(diff => (
                  <option key={diff} value={diff}>{diff}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Titelbild
            </label>
            
            {/* Versteckter Datei-Input */}
            <input
              type="file"
              id="image-upload"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <div className="space-y-4">
              {/* Aktuelles Bild anzeigen */}
              {imageUrl && (
                <div className="relative">
                  <img
                    src={imageUrl}
                    alt="Rezept Bild"
                    className="w-32 h-32 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              
              {/* Upload Buttons */}
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={() => document.getElementById('image-upload')?.click()}
                  disabled={isUploading}
                  className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isUploading ? 'Wird hochgeladen...' : 'Bild hochladen'}
                </button>
                <button
                  type="button"
                  onClick={handleCameraCapture}
                  disabled={isUploading}
                  className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {isUploading ? 'Wird hochgeladen...' : 'Foto machen'}
                </button>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block text-sm font-medium text-gray-700">
                Zutaten
              </label>
              <button
                type="button"
                onClick={addIngredient}
                className="flex items-center text-sm text-primary-600 hover:text-primary-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Zutat hinzufügen
              </button>
            </div>
            <div className="space-y-3">
              {ingredients.map((ingredient, index) => (
                <div key={ingredient.id} className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={ingredient.name}
                      onChange={(e) => updateIngredient(ingredient.id, 'name', e.target.value)}
                      className="input-field"
                      placeholder="Zutat"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={ingredient.amount}
                      onChange={(e) => updateIngredient(ingredient.id, 'amount', e.target.value)}
                      className="input-field"
                      placeholder="Menge"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={ingredient.unit}
                      onChange={(e) => updateIngredient(ingredient.id, 'unit', e.target.value)}
                      className="input-field"
                      placeholder="Einheit"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={ingredient.component || ''}
                      onChange={(e) => updateIngredient(ingredient.id, 'component', e.target.value)}
                      className="input-field"
                      placeholder="Komponente (z.B. Teig)"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={ingredient.notes}
                      onChange={(e) => updateIngredient(ingredient.id, 'notes', e.target.value)}
                      className="input-field"
                      placeholder="Notizen (optional)"
                    />
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      onClick={() => removeIngredient(ingredient.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block text-sm font-medium text-gray-700">
                Zubereitung
              </label>
              <button
                type="button"
                onClick={addInstruction}
                className="flex items-center text-sm text-primary-600 hover:text-primary-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Schritt hinzufügen
              </button>
            </div>
            <div className="space-y-6">
              {instructions.map((instruction) => (
                <div key={instruction.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex space-x-3 mb-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium">
                      {instruction.stepNumber}
                    </div>
                    <div className="flex-1">
                      <textarea
                        value={instruction.description}
                        onChange={(e) => updateInstruction(instruction.id, 'description', e.target.value)}
                        className="input-field"
                        rows={2}
                        placeholder="Beschreiben Sie diesen Schritt..."
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeInstruction(instruction.id)}
                      className="flex-shrink-0 text-red-500 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {/* Step Image */}
                  <div className="ml-11">
                    <input
                      type="file"
                      id={`instruction-image-${instruction.id}`}
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleInstructionImageUpload(file, instruction.id)
                        }
                      }}
                      className="hidden"
                    />
                    
                    {instruction.imageUrl ? (
                      <div className="relative inline-block">
                        <img
                          src={instruction.imageUrl}
                          alt={`Schritt ${instruction.stepNumber}`}
                          className="w-32 h-32 object-cover rounded-lg border"
                        />
                        <button
                          type="button"
                          onClick={() => updateInstruction(instruction.id, 'imageUrl', '')}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => document.getElementById(`instruction-image-${instruction.id}`)?.click()}
                        disabled={isUploading}
                        className="flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        {isUploading ? 'Wird hochgeladen...' : 'Bild hinzufügen'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-4 pt-6 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="btn-primary"
            >
              {initialData ? 'Rezept aktualisieren' : 'Rezept speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
} 