'use client'

import React, { useRef } from 'react'
import Image from 'next/image'
import { Upload, X } from 'lucide-react'

interface ScreenshotImportInputProps {
  selectedFile: File | null
  previewImage: string | null
  handleFileSelect: (file: File) => void
  setSelectedFile: (file: File | null) => void
  setPreviewImage: (image: string | null) => void
}

export default function ScreenshotImportInput({
  selectedFile,
  previewImage,
  handleFileSelect,
  setSelectedFile,
  setPreviewImage
}: ScreenshotImportInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileInputClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Foto hochladen
      </label>
      {!selectedFile ? (
        <div 
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 cursor-pointer transition-colors"
          onClick={handleFileInputClick}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file && file.type.startsWith('image/')) {
              handleFileSelect(file)
            }
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2">
            Ziehen Sie ein Foto hierher oder klicken Sie zum Auswählen
          </p>
          <p className="text-sm text-gray-500">
            Unterstützte Formate: JPG, PNG, WebP (max. 5MB)
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start space-x-4">
            {previewImage && (
              <Image 
                src={previewImage} 
                alt="Preview" 
                width={80}
                height={80}
                className="w-20 h-20 object-cover rounded-lg"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {selectedFile.name}
              </p>
              <p className="text-sm text-gray-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null)
                setPreviewImage(null)
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleFileInputClick}
            className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Anderes Bild wählen
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  )
}