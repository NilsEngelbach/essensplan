'use client'

import React from 'react'
import Image from 'next/image'
import { Upload, Camera, X, Sparkles } from 'lucide-react'
import { supabaseService } from '../../lib/supabase'

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

      const enhancedImageUrl = await supabaseService.enhanceRecipeImage(
        imageUrl,
        title.trim() || undefined,
        ingredientsList.length > 0 ? ingredientsList : undefined
      )

      setImageUrl(enhancedImageUrl)
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
              className="flex items-center px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md shadow-sm text-sm font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isEnhancing ? 'Wird verbessert...' : 'Mit KI verbessern'}
            </button>
          </div>
        )}
        
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
  )
}