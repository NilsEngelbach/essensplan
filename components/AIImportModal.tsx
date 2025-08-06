'use client'

import React, { useState } from 'react'
import { X, Upload, Link, Camera, FileText, Loader2 } from 'lucide-react'

interface AIImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (recipe: any) => void
}

export default function AIImportModal({ isOpen, onClose, onImport }: AIImportModalProps) {
  const [importType, setImportType] = useState<'url' | 'screenshot' | 'text'>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [preview, setPreview] = useState<any>(null)

  const handleImport = async () => {
    setIsLoading(true)
    try {
      // Simulate AI processing
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Mock AI response
      const mockRecipe = {
        title: 'Pasta Carbonara',
        description: 'Klassische italienische Pasta mit Eiern, Käse und Speck',
        category: 'Hauptspeise',
        tags: ['Italienisch', 'Schnell', 'Hauptspeise'],
        cookingTime: 25,
        servings: 4,
        difficulty: 'Einfach',
        ingredients: [
          { name: 'Spaghetti', amount: 400, unit: 'g', notes: '' },
          { name: 'Eier', amount: 4, unit: 'Stück', notes: '' },
          { name: 'Parmesan', amount: 100, unit: 'g', notes: 'gerieben' },
          { name: 'Pancetta', amount: 150, unit: 'g', notes: 'in Würfel geschnitten' },
          { name: 'Schwarzer Pfeffer', amount: 1, unit: 'TL', notes: 'frisch gemahlen' },
          { name: 'Salz', amount: 1, unit: 'Prise', notes: '' }
        ],
        instructions: [
          { stepNumber: 1, description: 'Spaghetti in reichlich Salzwasser al dente kochen.' },
          { stepNumber: 2, description: 'Pancetta in einer großen Pfanne knusprig braten.' },
          { stepNumber: 3, description: 'Eier und geriebenen Parmesan in einer Schüssel verquirlen.' },
          { stepNumber: 4, description: 'Nudeln abgießen und sofort mit der Eier-Käse-Mischung vermengen.' },
          { stepNumber: 5, description: 'Pancetta und reichlich Pfeffer unterheben und sofort servieren.' }
        ]
      }
      
      setPreview(mockRecipe)
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirm = () => {
    if (preview) {
      onImport(preview)
      onClose()
      setPreview(null)
      setUrl('')
      setText('')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Rezept mit KI importieren</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {!preview ? (
            <div className="space-y-6">
              {/* Import Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Import-Quelle wählen
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => setImportType('url')}
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      importType === 'url'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Link className="h-8 w-8 mx-auto mb-2" />
                    <div className="font-medium">URL</div>
                    <div className="text-sm text-gray-500">Von einer Website</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportType('screenshot')}
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      importType === 'screenshot'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Camera className="h-8 w-8 mx-auto mb-2" />
                    <div className="font-medium">Screenshot</div>
                    <div className="text-sm text-gray-500">Foto eines Rezepts</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportType('text')}
                    className={`p-4 border-2 rounded-lg text-center transition-colors ${
                      importType === 'text'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <FileText className="h-8 w-8 mx-auto mb-2" />
                    <div className="font-medium">Text</div>
                    <div className="text-sm text-gray-500">Rezepttext eingeben</div>
                  </button>
                </div>
              </div>

              {/* Input Fields */}
              {importType === 'url' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Website-URL
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="input-field"
                    placeholder="https://example.com/rezept"
                  />
                </div>
              )}

              {importType === 'screenshot' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Foto hochladen
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-2">
                      Ziehen Sie ein Foto hierher oder klicken Sie zum Auswählen
                    </p>
                    <button className="btn-primary">
                      Foto auswählen
                    </button>
                  </div>
                </div>
              )}

              {importType === 'text' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rezepttext
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="input-field"
                    rows={8}
                    placeholder="Fügen Sie hier den Rezepttext ein..."
                  />
                </div>
              )}

              {/* Import Button */}
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isLoading || (!url && !text)}
                  className="btn-primary flex items-center"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verarbeite...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Importieren
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Preview Section */
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

              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="btn-secondary"
                >
                  Zurück
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="btn-primary"
                >
                  Rezept speichern
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 