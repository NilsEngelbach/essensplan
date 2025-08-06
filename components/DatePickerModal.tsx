'use client'

import React, { useState } from 'react'
import { Calendar, X } from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

interface DatePickerModalProps {
  isOpen: boolean
  onClose: () => void
  onDateSelect: (date: string) => void
  title?: string
  minDate?: Date
}

export default function DatePickerModal({ 
  isOpen, 
  onClose, 
  onDateSelect, 
  title = "Datum auswählen",
  minDate 
}: DatePickerModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // Get today's date
  const today = new Date()
  const defaultMinDate = minDate || today

  const handleSubmit = () => {
    if (selectedDate) {
      // Convert to YYYY-MM-DD format
      const dateString = selectedDate.toISOString().split('T')[0]
      onDateSelect(dateString)
      onClose()
      setSelectedDate(null)
    }
  }

  const handleCancel = () => {
    onClose()
    setSelectedDate(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Datum auswählen
          </label>
          <div className="w-full">
            <DatePicker
              selected={selectedDate}
              onChange={(date: Date | null) => setSelectedDate(date)}
              minDate={defaultMinDate}
              dateFormat="dd.MM.yyyy"
              placeholderText="Klicken Sie hier, um ein Datum auszuwählen"
              className="input-field w-full"
              calendarClassName="shadow-lg border border-gray-200 rounded-lg"
              dayClassName={(date) => 
                date.getTime() === today.getTime() 
                  ? "bg-primary-100 text-primary-800 font-medium"
                  : "hover:bg-gray-100"
              }
              locale="de"
              inline
            />
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            onClick={handleCancel}
            className="btn-secondary"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedDate}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  )
}