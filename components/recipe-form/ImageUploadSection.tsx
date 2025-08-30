'use client'

import React from 'react'
import Image from 'next/image'
import { Upload, Camera, X, Sparkles } from 'lucide-react'
import { supabaseService } from '../../lib/supabase'
import ImageEnhancementModal from '../ImageEnhancementModal'

interface ImageUploadSectionProps {
  imageUrl: string
  setImageUrl: (url: string) => void
  isUploading: boolean
  uploadImage: (file: File) => Promise<string>
  title: string
  ingredients: any[]
}

export default function ImageUploadSection({
  imageUrl,
  setImageUrl,
  isUploading,
  uploadImage,
  title,
  ingredients
}: ImageUploadSectionProps) {
  const [isEnhancing, setIsEnhancing] = React.useState(false)
  const [enhancementModal, setEnhancementModal] = React.useState<{
    isOpen: boolean
    originalImageUrl: string
    enhancedImageData: string
  }>({
    isOpen: false,
    originalImageUrl: '',
    enhancedImageData: ''
  })
  const [isUploadingEnhanced, setIsUploadingEnhanced] = React.useState(false)

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

  const handleImageEnhancement = async () => {
    if (!imageUrl) return

    setIsEnhancing(true)
    try {
      const ingredientsList = ingredients
        .filter(ing => ing.name.trim() !== '')
        .map(ing => ing.name.trim())

      const enhancementResult = await supabaseService.enhanceRecipeImage(
        imageUrl,
        title.trim() || undefined,
        ingredientsList.length > 0 ? ingredientsList : undefined
      )

      // Show enhancement modal with both images
      setEnhancementModal({
        isOpen: true,
        originalImageUrl: imageUrl,
        enhancedImageData: enhancementResult
      })
    } catch (error) {
      console.error('Enhancement error:', error)
      if (error instanceof Error) {
        alert(`Bildverbesserung fehlgeschlagen: ${error.message}`)
      } else {
        alert('Bildverbesserung fehlgeschlagen. Bitte versuchen Sie es erneut.')
      }
    } finally {
      setIsEnhancing(false)
    }
  }

  const handleEnhancementConfirm = async () => {
    setIsUploadingEnhanced(true)
    try {
      // Convert base64 back to file for upload
      const response = await fetch(enhancementModal.enhancedImageData)
      const blob = await response.blob()
      
      const fileName = 'enhanced-recipe-image.jpg'
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
      
      // Upload the enhanced image
      const newImageUrl = await uploadImage(file)
      
      // Delete the old image if it exists
      if (enhancementModal.originalImageUrl) {
        try {
          await supabaseService.deleteImage(enhancementModal.originalImageUrl)
        } catch (deleteError) {
          console.warn('Failed to delete old image:', deleteError)
        }
      }
      
      // Update the image URL
      setImageUrl(newImageUrl)
      
      // Close the modal
      setEnhancementModal({
        isOpen: false,
        originalImageUrl: '',
        enhancedImageData: ''
      })
    } catch (error) {
      console.error('Enhancement upload error:', error)
      if (error instanceof Error) {
        alert(`Fehler beim Speichern des verbesserten Bildes: ${error.message}`)
      } else {
        alert('Fehler beim Speichern des verbesserten Bildes. Bitte versuchen Sie es erneut.')
      }
    } finally {
      setIsUploadingEnhanced(false)
    }
  }

  const handleEnhancementCancel = () => {
    setEnhancementModal({
      isOpen: false,
      originalImageUrl: '',
      enhancedImageData: ''
    })
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Titelbild
      </label>
      
      <input
        type="file"
        id="image-upload"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <div className="space-y-4">
        {imageUrl && (
          <div className="space-y-3">
            <div className="relative inline-block">
              <Image
                src={imageUrl}
                alt="Rezept Bild"
                width={128}
                height={128}
                className="w-32 h-32 object-cover rounded-lg border"
              />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 z-10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleImageEnhancement}
              disabled={isEnhancing || isUploading}
              className="flex items-center justify-center w-full md:w-auto px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md shadow-sm text-sm font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isEnhancing ? 'Wird verbessert...' : 'Mit KI verbessern'}
            </button>
          </div>
        )}
        
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
          <button
            type="button"
            onClick={() => document.getElementById('image-upload')?.click()}
            disabled={isUploading}
            className="flex items-center justify-center w-full md:w-auto px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="h-4 w-4 mr-2" />
            {isUploading ? 'Wird hochgeladen...' : 'Bild hochladen'}
          </button>
          <button
            type="button"
            onClick={handleCameraCapture}
            disabled={isUploading}
            className="flex items-center justify-center w-full md:w-auto px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Camera className="h-4 w-4 mr-2" />
            {isUploading ? 'Wird hochgeladen...' : 'Foto machen'}
          </button>
        </div>
      </div>

      {/* Image Enhancement Modal */}
      <ImageEnhancementModal
        isOpen={enhancementModal.isOpen}
        onClose={handleEnhancementCancel}
        onConfirm={handleEnhancementConfirm}
        originalImageUrl={enhancementModal.originalImageUrl}
        enhancedImageData={enhancementModal.enhancedImageData}
        isUploading={isUploadingEnhanced}
      />
    </div>
  )
}