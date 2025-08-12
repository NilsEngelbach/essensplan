'use client'

import React from 'react'
import { Plus } from 'lucide-react'
import InstructionItem from './InstructionItem'

interface Instruction {
  id: string
  stepNumber: number
  description: string
  imageUrl?: string
}

interface InstructionsSectionProps {
  instructions: Instruction[]
  setInstructions: (instructions: Instruction[]) => void
  handleInstructionImageUpload: (file: File, instructionId: string) => Promise<void>
  isUploading: boolean
}

export default function InstructionsSection({
  instructions,
  setInstructions,
  handleInstructionImageUpload,
  isUploading
}: InstructionsSectionProps) {
  const addInstruction = () => {
    const newInstruction: Instruction = {
      id: Date.now().toString(),
      stepNumber: instructions.length + 1,
      description: ''
    }
    setInstructions([...instructions, newInstruction])
  }

  const updateInstruction = (id: string, field: keyof Instruction, value: any) => {
    const updatedInstructions = instructions.map(inst => 
      inst.id === id ? { ...inst, [field]: value } : inst
    )
    setInstructions(updatedInstructions)
  }

  const handleInstructionKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      const currentInstruction = instructions.find(inst => inst.id === id)
      const currentIndex = instructions.findIndex(inst => inst.id === id)
      const isLastInstruction = currentIndex === instructions.length - 1
      const hasContent = currentInstruction?.description.trim() !== ''
      
      if (isLastInstruction && hasContent) {
        e.preventDefault()
        addInstruction()
      }
    }
  }

  const handleInstructionBlur = (id: string) => {
    const currentInstruction = instructions.find(inst => inst.id === id)
    const currentIndex = instructions.findIndex(inst => inst.id === id)
    const isLastInstruction = currentIndex === instructions.length - 1
    const hasContent = currentInstruction?.description.trim() !== ''
    
    if (isLastInstruction && hasContent) {
      setTimeout(() => {
        addInstruction()
      }, 100)
    }
  }

  const removeInstruction = (id: string) => {
    setInstructions(instructions.filter(inst => inst.id !== id))
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <label className="block text-sm font-medium text-gray-700">
          Zubereitung
        </label>
        <button
          type="button"
          onClick={addInstruction}
          className="flex items-center text-sm text-primary-600 hover:text-primary-700"
        >
          <Plus className="h-4 w-4 mr-1" />
          Schritt hinzufügen
        </button>
      </div>
      <div className="space-y-6">
        {instructions.map((instruction) => (
          <InstructionItem
            key={instruction.id}
            instruction={instruction}
            updateInstruction={updateInstruction}
            removeInstruction={removeInstruction}
            handleInstructionKeyDown={handleInstructionKeyDown}
            handleInstructionBlur={handleInstructionBlur}
            handleInstructionImageUpload={handleInstructionImageUpload}
            isUploading={isUploading}
          />
        ))}
      </div>
    </div>
  )
}