'use client'

import React from 'react'
import Image from 'next/image'
import { X, Check, ArrowLeft } from 'lucide-react'

interface ImageEnhancementModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  originalImageUrl: string
  enhancedImageData: string
  isUploading?: boolean
}

export default function ImageEnhancementModal({
  isOpen,
  onClose,
  onConfirm,
  originalImageUrl,
  enhancedImageData,
  isUploading = false
}: ImageEnhancementModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Bildverbesserung mit KI</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isUploading}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <div className="h-4 w-4 bg-blue-600 rounded-full"></div>
                  </div>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Ihr Bild wurde verbessert!
                  </h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Vergleichen Sie das Original mit der verbesserten Version und wählen Sie, welches Sie verwenden möchten.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Original Image */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-900 text-center">Original</h3>
              <div className="relative bg-gray-100 rounded-lg overflow-hidden">
                <Image
                  src={originalImageUrl}
                  alt="Original Bild"
                  width={600}
                  height={256}
                  className="w-full h-64 object-cover"
                />
                <div className="absolute top-2 left-2 bg-gray-800 bg-opacity-75 text-white px-2 py-1 rounded text-xs">
                  Original
                </div>
              </div>
            </div>

            {/* Enhanced Image */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-900 text-center">KI-Verbessert</h3>
              <div className="relative bg-gray-100 rounded-lg overflow-hidden">
                <Image
                  src={enhancedImageData}
                  alt="KI-verbessertes Bild"
                  width={600}
                  height={256}
                  className="w-full h-64 object-cover"
                />
                <div className="absolute top-2 left-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-1 rounded text-xs">
                  KI-Verbessert
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="btn-secondary flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Original behalten
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isUploading}
              className="btn-primary flex items-center justify-center"
            >
              <Check className="h-4 w-4 mr-2" />
              {isUploading ? 'Wird ersetzt...' : 'Verbessertes Bild verwenden'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}