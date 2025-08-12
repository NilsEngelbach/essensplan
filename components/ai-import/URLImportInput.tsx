'use client'

import React from 'react'

interface URLImportInputProps {
  url: string
  setUrl: (url: string) => void
}

export default function URLImportInput({ url, setUrl }: URLImportInputProps) {
  return (
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
  )
}