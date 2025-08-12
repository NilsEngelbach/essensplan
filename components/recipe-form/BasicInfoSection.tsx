'use client'

import React from 'react'

interface BasicInfoSectionProps {
  title: string
  setTitle: (value: string) => void
  description: string
  setDescription: (value: string) => void
  category: string
  setCategory: (value: string) => void
  cookingTime: string
  setCookingTime: (value: string) => void
  servings: string
  setServings: (value: string) => void
  difficulty: string
  setDifficulty: (value: string) => void
}

const categories = ['Hauptspeise', 'Salat', 'Dessert', 'Suppe', 'Beilage', 'Frühstück', 'Snack']
const difficulties = ['Einfach', 'Mittel', 'Schwer']

export default function BasicInfoSection({
  title,
  setTitle,
  description,
  setDescription,
  category,
  setCategory,
  cookingTime,
  setCookingTime,
  servings,
  setServings,
  difficulty,
  setDifficulty
}: BasicInfoSectionProps) {
  return (
    <>
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
    </>
  )
}