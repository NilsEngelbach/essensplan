'use client'

import React from 'react'
import Image from 'next/image'
import { X, ImageIcon } from 'lucide-react'

interface Instruction {
  id: string
  stepNumber: number
  description: string
  imageUrl?: string
}

interface InstructionItemProps {
  instruction: Instruction
  updateInstruction: (id: string, field: keyof Instruction, value: any) => void
  removeInstruction: (id: string) => void
  handleInstructionKeyDown: (e: React.KeyboardEvent, id: string) => void
  handleInstructionBlur: (id: string) => void
  handleInstructionImageUpload: (file: File, instructionId: string) => Promise<void>
  isUploading: boolean
}

export default function InstructionItem({
  instruction,
  updateInstruction,
  removeInstruction,
  handleInstructionKeyDown,
  handleInstructionBlur,
  handleInstructionImageUpload,
  isUploading
}: InstructionItemProps) {
  return (
    <div key={instruction.id} className="border border-gray-200 rounded-lg p-4">
      {/* Mobile Layout */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-xs font-medium">
              {instruction.stepNumber}
            </div>
            <span className="text-sm font-medium text-gray-700">Schritt {instruction.stepNumber}</span>
          </div>
          <button
            type="button"
            onClick={() => removeInstruction(instruction.id)}
            className="text-red-500 hover:text-red-700 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={instruction.description}
          onChange={(e) => updateInstruction(instruction.id, 'description', e.target.value)}
          onKeyDown={(e) => handleInstructionKeyDown(e, instruction.id)}
          onBlur={() => handleInstructionBlur(instruction.id)}
          className="input-field w-full"
          rows={3}
          placeholder="Beschreiben Sie diesen Schritt... (Ctrl+Enter für neuen Schritt)"
        />
      </div>
      
      {/* Desktop Layout */}
      <div className="hidden md:flex space-x-3 mb-4">
        <div className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium">
          {instruction.stepNumber}
        </div>
        <div className="flex-1">
          <textarea
            value={instruction.description}
            onChange={(e) => updateInstruction(instruction.id, 'description', e.target.value)}
            onKeyDown={(e) => handleInstructionKeyDown(e, instruction.id)}
            onBlur={() => handleInstructionBlur(instruction.id)}
            className="input-field"
            rows={2}
            placeholder="Beschreiben Sie diesen Schritt... (Ctrl+Enter für neuen Schritt)"
          />
        </div>
        <button
          type="button"
          onClick={() => removeInstruction(instruction.id)}
          className="flex-shrink-0 text-red-500 hover:text-red-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      {/* Step Image */}
      <div className="md:ml-11">
        <input
          type="file"
          id={`instruction-image-${instruction.id}`}
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              handleInstructionImageUpload(file, instruction.id)
            }
          }}
          className="hidden"
        />
        
        {instruction.imageUrl ? (
          <div className="relative inline-block">
            <Image
              src={instruction.imageUrl}
              alt={`Schritt ${instruction.stepNumber}`}
              width={128}
              height={128}
              className="w-32 h-32 object-cover rounded-lg border"
            />
            <button
              type="button"
              onClick={() => updateInstruction(instruction.id, 'imageUrl', '')}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => document.getElementById(`instruction-image-${instruction.id}`)?.click()}
            disabled={isUploading}
            className="flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            {isUploading ? 'Wird hochgeladen...' : 'Bild hinzufügen'}
          </button>
        )}
      </div>
    </div>
  )
}