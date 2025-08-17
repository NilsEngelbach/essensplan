'use client'

import React, { useState, useRef } from 'react'
import { X, Upload } from 'lucide-react'
import { supabase, supabaseService } from '../lib/supabase'
import ImportTypeSelector from './ai-import/ImportTypeSelector'
import ImportPreview from './ai-import/ImportPreview'
import URLImportInput from './ai-import/URLImportInput'
import ScreenshotImportInput from './ai-import/ScreenshotImportInput'
import LoadingOverlay from './ai-import/LoadingOverlay'

interface AIImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (recipe: any) => void
}

export default function AIImportModal({ isOpen, onClose, onImport }: AIImportModalProps) {
  const [importType, setImportType] = useState<'url' | 'screenshot'>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // Helper function to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }


  // Handle file selection
  const handleFileSelect = async (file: File) => {
    setSelectedFile(file)
    
    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreviewImage(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleImport = async () => {
    setIsLoading(true)
    try {
      let content: string = ''
      
      if (importType === 'url') {
        content = url
        if (!content.trim()) {
          alert('Bitte geben Sie eine URL ein.')
          return
        }
      } else if (importType === 'screenshot') {
        if (!selectedFile) {
          alert('Bitte wählen Sie ein Bild aus.')
          return
        }
        // Convert file to base64 for AI processing
        content = await fileToBase64(selectedFile)
      }

      // Get the current session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        throw new Error('Sie müssen angemeldet sein, um KI-Import zu verwenden.')
      }

      // Call the Supabase edge function
      const { data, error } = await supabase.functions.invoke('ai-import', {
        body: {
          type: importType,
          content: content
        },
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (error) {
        throw new Error(error.message || 'Fehler beim KI-Import')
      }

      if (!data) {
        throw new Error('Keine Daten vom KI-Service erhalten')
      }

      let recipe = { ...data.recipe }
      let image = data.image

      delete recipe.imageUrl

      // Store base64 image data for preview, don't upload yet
      if (image) {
        recipe.previewImageData = image
        recipe.originalFileName = selectedFile?.name || 'imported-recipe-image.jpg'
        recipe.originalFileType = selectedFile?.type || 'image/jpeg'
      }

      setPreview(recipe)
    } catch (error) {
      console.error('Import failed:', error)
      if (error instanceof Error) {
        alert(`Import fehlgeschlagen: ${error.message}`)
      } else {
        alert('Import fehlgeschlagen. Bitte versuchen Sie es erneut.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (preview) {
      let finalRecipe = { ...preview }
      
      // Upload image only when user confirms the import
      if (preview.previewImageData) {
        try {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (sessionError || !session) {
            console.warn('No session for image upload')
          } else {
            // Convert base64 back to file for upload
            const response = await fetch(preview.previewImageData)
            const blob = await response.blob()
            
            const fileName = preview.originalFileName || 'imported-recipe-image.jpg'
            const fileType = preview.originalFileType || blob.type || 'image/jpeg'
            
            const file = new File([blob], fileName, { type: fileType })
            
            const uploadedImageUrl = await supabaseService.uploadImage(file, session.user.id)
            finalRecipe.imageUrl = uploadedImageUrl
          }
        } catch (error) {
          console.warn('Failed to upload image:', error)
        }
        
        // Clean up preview data
        delete finalRecipe.previewImageData
        delete finalRecipe.originalFileName
        delete finalRecipe.originalFileType
      }
      
      onImport(finalRecipe)
      onClose()
      setPreview(null)
      setUrl('')
      setText('')
      setSelectedFile(null)
      setPreviewImage(null)
    }
  }

  const resetForm = () => {
    setPreview(null)
    setUrl('')
    setText('')
    setSelectedFile(null)
    setPreviewImage(null)
    setImportType('url')
  }


  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto relative">
        {isLoading && <LoadingOverlay />}
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Rezept mit KI importieren</h2>
            <button
              onClick={() => {
                resetForm()
                onClose()
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {!preview ? (
            <div className="space-y-6">
              <ImportTypeSelector importType={importType} setImportType={setImportType} />

              {/* Input Fields */}
              {importType === 'url' && (
                <URLImportInput url={url} setUrl={setUrl} />
              )}

              {importType === 'screenshot' && (
                <ScreenshotImportInput
                  selectedFile={selectedFile}
                  previewImage={previewImage}
                  handleFileSelect={handleFileSelect}
                  setSelectedFile={setSelectedFile}
                  setPreviewImage={setPreviewImage}
                />
              )}

              {/* Import Button */}
              <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    resetForm()
                    onClose()
                  }}
                  className="btn-secondary"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isLoading || (importType === 'url' && !url.trim()) || (importType === 'screenshot' && !selectedFile)}
                  className="btn-primary flex items-center justify-center"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importieren
                </button>
              </div>
            </div>
          ) : (
            <ImportPreview 
              preview={preview}
              onBack={() => setPreview(null)}
              onConfirm={handleConfirm}
            />
          )}
        </div>
      </div>
    </div>
  )
} 