'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../components/AuthProvider'
import { useRecipes } from '../../../components/RecipeProvider'
import RecipeForm from '../../../components/RecipeForm'
import toast from 'react-hot-toast'

export default function NewRecipePage() {
  const router = useRouter()
  const { user } = useAuth()
  const { addRecipe } = useRecipes()

  const handleSubmit = async (recipe: any) => {
    try {
      const { ingredients, instructions, ...recipeData } = recipe
      await addRecipe(
        {
          ...recipeData,
          userId: user!.id
        },
        ingredients,
        instructions
      )
      toast.success('Rezept erfolgreich erstellt')
      router.push('/recipes')
    } catch (error) {
      console.error('Error creating recipe:', error)
      toast.error('Fehler beim Erstellen des Rezepts')
    }
  }

  const handleCancel = () => {
    router.push('/recipes')
  }

  return (
    <RecipeForm
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
} 