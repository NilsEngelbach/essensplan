'use client'

import React from 'react'
import { Link, Camera, FileText } from 'lucide-react'

interface ImportTypeSelectorProps {
  importType: 'url' | 'screenshot'
  setImportType: (type: 'url' | 'screenshot') => void
}

export default function ImportTypeSelector({ importType, setImportType }: ImportTypeSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        Import-Quelle wählen
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>
    </div>
  )
}