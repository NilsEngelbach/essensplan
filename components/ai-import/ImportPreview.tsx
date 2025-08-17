'use client'

import React from 'react'

interface ImportPreviewProps {
  preview: any
  onBack: () => void
  onConfirm: () => void
}

export default function ImportPreview({ preview, onBack, onConfirm }: ImportPreviewProps) {
  return (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
              <div className="h-4 w-4 bg-green-600 rounded-full"></div>
            </div>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-green-800">
              Rezept erfolgreich erkannt!
            </h3>
            <p className="text-sm text-green-700 mt-1">
              Überprüfen Sie die Details und bestätigen Sie den Import.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        {(preview.previewImageData) && (
          <div className="mb-6">
            <img
              src={preview.previewImageData}
              alt={preview.title}
              className="w-full h-64 object-cover rounded-lg"
            />
          </div>
        )}
        <h3 className="text-xl font-bold text-gray-900 mb-4">{preview.title}</h3>
        <p className="text-gray-600 mb-4">{preview.description}</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <span className="text-sm font-medium text-gray-500">Kategorie</span>
            <p className="text-gray-900">{preview.category}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500">Kochzeit</span>
            <p className="text-gray-900">{preview.cookingTime} Min</p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500">Portionen</span>
            <p className="text-gray-900">{preview.servings}</p>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="font-medium text-gray-900 mb-2">Zutaten</h4>
          <ul className="space-y-1">
            {preview.ingredients.map((ingredient: any, index: number) => (
              <li key={index} className="text-sm text-gray-600">
                {ingredient.amount} {ingredient.unit} {ingredient.name}
                {ingredient.notes && ` (${ingredient.notes})`}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-medium text-gray-900 mb-2">Zubereitung</h4>
          <ol className="space-y-2">
            {preview.instructions.map((instruction: any) => (
              <li key={instruction.stepNumber} className="text-sm text-gray-600">
                <span className="font-medium">{instruction.stepNumber}.</span> {instruction.description}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4">
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
        >
          Zurück
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="btn-primary"
        >
          Rezept speichern
        </button>
      </div>
    </div>
  )
}