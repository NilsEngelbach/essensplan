'use client'

import React from 'react'
import { Plus } from 'lucide-react'
import IngredientItem from './IngredientItem'

interface Ingredient {
  id: string
  name: string
  amount: string
  unit: string
  notes: string
  component?: string
}

interface IngredientsSectionProps {
  ingredients: Ingredient[]
  setIngredients: (ingredients: Ingredient[]) => void
  draggedIngredient: string | null
  setDraggedIngredient: (id: string | null) => void
  dropTarget: string | null
  setDropTarget: (id: string | null) => void
  touchStartY: number | null
  setTouchStartY: (y: number | null) => void
  isTouchDragging: boolean
  setIsTouchDragging: (dragging: boolean) => void
}

export default function IngredientsSection({
  ingredients,
  setIngredients,
  draggedIngredient,
  setDraggedIngredient,
  dropTarget,
  setDropTarget,
  touchStartY,
  setTouchStartY,
  isTouchDragging,
  setIsTouchDragging
}: IngredientsSectionProps) {
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
    const updatedIngredients = ingredients.map(ing => 
      ing.id === id ? { ...ing, [field]: value } : ing
    )
    setIngredients(updatedIngredients)
  }

  const handleIngredientKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const currentIngredient = ingredients.find(ing => ing.id === id)
      const currentIndex = ingredients.findIndex(ing => ing.id === id)
      const isLastIngredient = currentIndex === ingredients.length - 1
      const hasContent = currentIngredient?.name.trim() !== ''
      
      if (isLastIngredient && hasContent) {
        e.preventDefault()
        addIngredient()
      }
    }
  }

  const handleIngredientBlur = (id: string) => {
    const currentIngredient = ingredients.find(ing => ing.id === id)
    const currentIndex = ingredients.findIndex(ing => ing.id === id)
    const isLastIngredient = currentIndex === ingredients.length - 1
    const hasContent = currentIngredient?.name.trim() !== ''
    
    if (isLastIngredient && hasContent) {
      setTimeout(() => {
        addIngredient()
      }, 100)
    }
  }

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter(ing => ing.id !== id))
  }

  const handleIngredientDragStart = (e: React.DragEvent, ingredientId: string) => {
    setDraggedIngredient(ingredientId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ingredientId)
    
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }

  const handleIngredientDragEnd = (e: React.DragEvent) => {
    setDraggedIngredient(null)
    setDropTarget(null)
    
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }

  const handleIngredientDragOver = (e: React.DragEvent, ingredientId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    
    if (draggedIngredient && draggedIngredient !== ingredientId) {
      setDropTarget(ingredientId)
    }
  }

  const handleIngredientDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) {
      setDropTarget(null)
    }
  }

  const handleIngredientDrop = (e: React.DragEvent, targetIngredientId: string) => {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('text/plain')
    
    if (draggedId === targetIngredientId) return
    
    const draggedIndex = ingredients.findIndex(ing => ing.id === draggedId)
    const targetIndex = ingredients.findIndex(ing => ing.id === targetIngredientId)
    
    if (draggedIndex === -1 || targetIndex === -1) return
    
    const newIngredients = [...ingredients]
    const draggedIngredient = newIngredients[draggedIndex]
    
    newIngredients.splice(draggedIndex, 1)
    const adjustedTargetIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex
    newIngredients.splice(adjustedTargetIndex, 0, draggedIngredient)
    
    setIngredients(newIngredients)
    setDraggedIngredient(null)
    setDropTarget(null)
  }

  const handleTouchStart = (e: React.TouchEvent, ingredientId: string) => {
    const touch = e.touches[0]
    setTouchStartY(touch.clientY)
    setDraggedIngredient(ingredientId)
    setIsTouchDragging(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartY || !draggedIngredient) return
    
    const touch = e.touches[0]
    const deltaY = Math.abs(touch.clientY - touchStartY)
    
    if (deltaY > 10 && !isTouchDragging) {
      setIsTouchDragging(true)
      e.preventDefault()
    }

    if (isTouchDragging) {
      e.preventDefault()
      
      const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY)
      const ingredientElement = elementBelow?.closest('[data-ingredient-id]')
      const targetId = ingredientElement?.getAttribute('data-ingredient-id')
      
      if (targetId && targetId !== draggedIngredient) {
        setDropTarget(targetId)
      } else {
        setDropTarget(null)
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isTouchDragging && draggedIngredient && dropTarget) {
      const draggedIndex = ingredients.findIndex(ing => ing.id === draggedIngredient)
      const targetIndex = ingredients.findIndex(ing => ing.id === dropTarget)
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newIngredients = [...ingredients]
        const draggedIngredientItem = newIngredients[draggedIndex]
        
        newIngredients.splice(draggedIndex, 1)
        const adjustedTargetIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex
        newIngredients.splice(adjustedTargetIndex, 0, draggedIngredientItem)
        
        setIngredients(newIngredients)
      }
    }
    
    setTouchStartY(null)
    setDraggedIngredient(null)
    setDropTarget(null)
    setIsTouchDragging(false)
  }

  return (
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
          <IngredientItem
            key={ingredient.id}
            ingredient={ingredient}
            index={index}
            updateIngredient={updateIngredient}
            removeIngredient={removeIngredient}
            handleIngredientKeyDown={handleIngredientKeyDown}
            handleIngredientBlur={handleIngredientBlur}
            draggedIngredient={draggedIngredient}
            dropTarget={dropTarget}
            isTouchDragging={isTouchDragging}
            handleIngredientDragStart={handleIngredientDragStart}
            handleIngredientDragEnd={handleIngredientDragEnd}
            handleIngredientDragOver={handleIngredientDragOver}
            handleIngredientDragLeave={handleIngredientDragLeave}
            handleIngredientDrop={handleIngredientDrop}
            handleTouchStart={handleTouchStart}
            handleTouchMove={handleTouchMove}
            handleTouchEnd={handleTouchEnd}
          />
        ))}
      </div>
    </div>
  )
}