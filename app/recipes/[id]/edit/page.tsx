'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../components/AuthProvider'
import { useRecipes } from '../../../../components/RecipeProvider'
import RecipeForm from '../../../../components/RecipeForm'
import toast from 'react-hot-toast'

export default function EditRecipePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { user } = useAuth()
  const { recipes, editRecipe } = useRecipes()
  const recipe = recipes.find(r => r.id === params.id)

  useEffect(() => {
    if (user && !recipe && recipes.length > 0) {
      toast.error('Rezept nicht gefunden')
      router.push('/recipes')
    }
  }, [user, recipe, recipes.length, router])

  const handleSubmit = async (updatedRecipe: any) => {
    try {
      const { ingredients, instructions, ...recipeData } = updatedRecipe
      await editRecipe(
        params.id,
        recipeData,
        ingredients,
        instructions,
        recipe?.imageUrl // pass old image url for deletion if changed
      )
      toast.success('Rezept erfolgreich aktualisiert')
      router.push(`/recipes/${params.id}`)
    } catch (error) {
      console.error('Error updating recipe:', error)
      toast.error('Fehler beim Aktualisieren des Rezepts')
    }
  }

  const handleCancel = () => {
    router.push(`/recipes/${params.id}`)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Bitte melden Sie sich an</p>
        </div>
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Rezept nicht gefunden</p>
        </div>
      </div>
    )
  }

  // Convert recipe data to form format
  const getTags = () => {
    if (!recipe.tags) return []
    try {
      return JSON.parse(recipe.tags)
    } catch {
      return []
    }
  }

  const formData = {
    title: recipe.title,
    description: recipe.description || '',
    category: recipe.category,
    tags: getTags(),
    cookingTime: recipe.cookingTime?.toString() || '',
    servings: recipe.servings?.toString() || '',
    difficulty: recipe.difficulty || '',
    rating: recipe.rating?.toString() || '',
    sourceUrl: recipe.sourceUrl || '',
    imageUrl: recipe.imageUrl || '',
    ingredients: recipe.ingredients.map(ing => ({
      id: ing.id,
      name: ing.name,
      amount: ing.amount?.toString() || '',
      unit: ing.unit || '',
      notes: ing.notes || '',
      component: ing.component || ''
    })),
    instructions: recipe.instructions.map(inst => ({
      id: inst.id,
      stepNumber: inst.stepNumber,
      description: inst.description,
      imageUrl: inst.imageUrl || ''
    }))
  }

  return (
    <RecipeForm
      initialData={formData}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
} 