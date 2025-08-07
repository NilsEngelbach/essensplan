'use client'

import React, { useState, useMemo } from 'react'
import { Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerModalProps {
  isOpen: boolean
  onClose: () => void
  onDateSelect: (date: string) => void
  title?: string
  minDate?: Date
  preselectedDate?: string // YYYY-MM-DD format
}

export default function DatePickerModal({ 
  isOpen, 
  onClose, 
  onDateSelect, 
  title = "Datum auswählen",
  minDate,
  preselectedDate
}: DatePickerModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Initialize with preselected date when modal opens
  React.useEffect(() => {
    if (isOpen && preselectedDate) {
      // Parse date string manually to avoid timezone issues
      const [year, month, day] = preselectedDate.split('-').map(Number)
      const preselected = new Date(year, month - 1, day)
      setSelectedDate(preselected)
      setCurrentMonth(preselected)
    } else if (isOpen && !preselectedDate) {
      // Reset when opening without preselection
      setSelectedDate(null)
      setCurrentMonth(new Date())
    }
  }, [isOpen, preselectedDate])

  // Get today's date
  const today = new Date()
  const defaultMinDate = minDate || today

  // Helper functions
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date: Date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay()
    return firstDay === 0 ? 6 : firstDay - 1 // Convert Sunday (0) to be last (6)
  }

  const isDateDisabled = (date: Date) => {
    // Create a date object for comparison without time component
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const minDateOnly = new Date(defaultMinDate.getFullYear(), defaultMinDate.getMonth(), defaultMinDate.getDate())
    return dateOnly < minDateOnly
  }

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.toDateString() === date2.toDateString()
  }

  const formatMonth = (date: Date) => {
    return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  }

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentMonth)
    const firstDay = getFirstDayOfMonth(currentMonth)
    const days = []

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))
    }

    return days
  }, [currentMonth])

  const handleDateClick = (date: Date) => {
    if (!isDateDisabled(date)) {
      setSelectedDate(date)
    }
  }

  const handleSubmit = () => {
    if (selectedDate) {
      // Convert to YYYY-MM-DD format without timezone issues
      const year = selectedDate.getFullYear()
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
      const day = String(selectedDate.getDate()).padStart(2, '0')
      const dateString = `${year}-${month}-${day}`
      onDateSelect(dateString)
      onClose()
      setSelectedDate(null)
    }
  }

  const handleCancel = () => {
    onClose()
    setSelectedDate(null)
    setCurrentMonth(new Date())
  }

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const goToToday = () => {
    const now = new Date()
    setCurrentMonth(now)
    setSelectedDate(now)
  }

  if (!isOpen) return null

  const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Calendar */}
        <div className="mb-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goToPreviousMonth}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            <h4 className="text-lg font-semibold text-gray-900 capitalize">
              {formatMonth(currentMonth)}
            </h4>
            
            <button
              onClick={goToNextMonth}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Today Button */}
          <div className="flex justify-center mb-4">
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-md transition-colors"
            >
              Heute
            </button>
          </div>

          {/* Week Days Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              if (!date) {
                return <div key={index} className="p-2"></div>
              }

              const isDisabled = isDateDisabled(date)
              const isSelected = selectedDate && isSameDay(date, selectedDate)
              const isToday = isSameDay(date, today)
              
              return (
                <button
                  key={index}
                  onClick={() => handleDateClick(date)}
                  disabled={isDisabled}
                  className={`
                    p-2 text-sm rounded-lg transition-all duration-200 
                    ${isSelected 
                      ? 'bg-primary-600 text-white shadow-md' 
                      : isToday 
                        ? 'bg-primary-100 text-primary-800 font-semibold ring-2 ring-primary-200' 
                        : isDisabled 
                          ? 'text-gray-300 cursor-not-allowed' 
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }
                    ${!isDisabled && !isSelected ? 'hover:scale-105' : ''}
                  `}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected Date Display */}
        {selectedDate && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Ausgewähltes Datum:</div>
            <div className="font-semibold text-gray-900">
              {selectedDate.toLocaleDateString('de-DE', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleCancel}
            className="btn-secondary"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedDate}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  )
}