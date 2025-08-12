'use client'

import React from 'react'
import { GripVertical, X } from 'lucide-react'

interface Ingredient {
  id: string
  name: string
  amount: string
  unit: string
  notes: string
  component?: string
}

interface IngredientItemProps {
  ingredient: Ingredient
  index: number
  updateIngredient: (id: string, field: keyof Ingredient, value: any) => void
  removeIngredient: (id: string) => void
  handleIngredientKeyDown: (e: React.KeyboardEvent, id: string) => void
  handleIngredientBlur: (id: string) => void
  draggedIngredient: string | null
  dropTarget: string | null
  isTouchDragging: boolean
  handleIngredientDragStart: (e: React.DragEvent, id: string) => void
  handleIngredientDragEnd: (e: React.DragEvent) => void
  handleIngredientDragOver: (e: React.DragEvent, id: string) => void
  handleIngredientDragLeave: (e: React.DragEvent) => void
  handleIngredientDrop: (e: React.DragEvent, id: string) => void
  handleTouchStart: (e: React.TouchEvent, id: string) => void
  handleTouchMove: (e: React.TouchEvent) => void
  handleTouchEnd: (e: React.TouchEvent) => void
}

export default function IngredientItem({
  ingredient,
  index,
  updateIngredient,
  removeIngredient,
  handleIngredientKeyDown,
  handleIngredientBlur,
  draggedIngredient,
  dropTarget,
  isTouchDragging,
  handleIngredientDragStart,
  handleIngredientDragEnd,
  handleIngredientDragOver,
  handleIngredientDragLeave,
  handleIngredientDrop,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd
}: IngredientItemProps) {
  return (
    <div 
      key={ingredient.id} 
      className="space-y-3 md:space-y-0"
      data-ingredient-id={ingredient.id}
      draggable
      onDragStart={(e) => handleIngredientDragStart(e, ingredient.id)}
      onDragEnd={handleIngredientDragEnd}
      onDragOver={(e) => handleIngredientDragOver(e, ingredient.id)}
      onDragLeave={handleIngredientDragLeave}
      onDrop={(e) => handleIngredientDrop(e, ingredient.id)}
      onTouchStart={(e) => handleTouchStart(e, ingredient.id)}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile Layout */}
      <div className={`grid grid-cols-1 gap-3 md:hidden border rounded-lg p-3 transition-all ${
        dropTarget === ingredient.id 
          ? 'border-primary-300 bg-primary-50' 
          : draggedIngredient === ingredient.id
          ? 'border-gray-300 bg-gray-50 opacity-75'
          : 'border-gray-200'
      } ${isTouchDragging && draggedIngredient === ingredient.id ? 'shadow-lg scale-105 z-10' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <GripVertical className="h-4 w-4 text-gray-400 cursor-grab active:cursor-grabbing" />
            <span className="text-sm font-medium text-gray-700">Zutat {index + 1}</span>
          </div>
          <button
            type="button"
            onClick={() => removeIngredient(ingredient.id)}
            className="text-red-500 hover:text-red-700 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          type="text"
          value={ingredient.name}
          onChange={(e) => updateIngredient(ingredient.id, 'name', e.target.value)}
          onKeyDown={(e) => handleIngredientKeyDown(e, ingredient.id)}
          onBlur={() => handleIngredientBlur(ingredient.id)}
          className="input-field"
          placeholder="Zutat"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            value={ingredient.amount}
            onChange={(e) => updateIngredient(ingredient.id, 'amount', e.target.value)}
            className="input-field"
            placeholder="Menge"
          />
          <input
            type="text"
            value={ingredient.unit}
            onChange={(e) => updateIngredient(ingredient.id, 'unit', e.target.value)}
            className="input-field"
            placeholder="Einheit"
          />
        </div>
        <input
          type="text"
          value={ingredient.component || ''}
          onChange={(e) => updateIngredient(ingredient.id, 'component', e.target.value)}
          className="input-field"
          placeholder="Komponente (z.B. Teig)"
        />
        <input
          type="text"
          value={ingredient.notes}
          onChange={(e) => updateIngredient(ingredient.id, 'notes', e.target.value)}
          className="input-field"
          placeholder="Notizen (optional)"
        />
      </div>
      
      {/* Desktop Layout */}
      <div className={`hidden md:grid md:grid-cols-12 gap-3 items-center border rounded-lg p-3 transition-all ${
        dropTarget === ingredient.id 
          ? 'border-primary-300 bg-primary-50' 
          : draggedIngredient === ingredient.id
          ? 'border-gray-300 bg-gray-50 opacity-75'
          : 'border-gray-200'
      } ${isTouchDragging && draggedIngredient === ingredient.id ? 'shadow-lg scale-105 z-10' : ''}`}>
        <div className="col-span-1 flex justify-center">
          <GripVertical className="h-4 w-4 text-gray-400 cursor-grab active:cursor-grabbing" />
        </div>
        <div className="col-span-2">
          <input
            type="text"
            value={ingredient.name}
            onChange={(e) => updateIngredient(ingredient.id, 'name', e.target.value)}
            onKeyDown={(e) => handleIngredientKeyDown(e, ingredient.id)}
            onBlur={() => handleIngredientBlur(ingredient.id)}
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
    </div>
  )
}