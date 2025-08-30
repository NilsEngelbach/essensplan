"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { supabaseService } from '../lib/supabase';
import type { MealPlanWithRecipe } from '../lib/supabase';

interface MealPlanContextType {
  mealPlans: MealPlanWithRecipe[];
  loading: boolean;
  refreshMealPlans: (startDate?: string, endDate?: string) => Promise<void>;
  addOrUpdateMealPlan: (date: string, recipeId?: string) => Promise<void>;
  removeMealPlan: (id: string) => Promise<void>;
  rescheduleMealPlan: (mealPlanId: string, newDate: string) => Promise<void>;
  getMealPlanForDate: (date: string) => MealPlanWithRecipe | undefined;
}

const MealPlanContext = createContext<MealPlanContextType | undefined>(undefined);

export const MealPlanProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [mealPlans, setMealPlans] = useState<MealPlanWithRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetchedUserId, setLastFetchedUserId] = useState<string | null>(null);
  const fetchMealPlansRef = useRef<(startDate?: string, endDate?: string) => Promise<void>>();

  // Get current week's start and end dates (7 days ahead from today)
  const getCurrentWeekRange = () => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 6); // 7 days ahead (including today)
    
    return {
      startDate: today.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  };

  // Fetch meal plans for a date range
  const fetchMealPlans = useCallback(async (startDate?: string, endDate?: string) => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const { startDate: defaultStart, endDate: defaultEnd } = getCurrentWeekRange();
      const data = await supabaseService.getMealPlans(user.id, {
        startDate: startDate || defaultStart,
        endDate: endDate || defaultEnd
      });
      setMealPlans(data);
    } catch (error) {
      console.error('Failed to fetch meal plans:', error);
      setMealPlans([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  fetchMealPlansRef.current = fetchMealPlans;

  // Load meal plans on user change
  useEffect(() => {
    if (user && user.id !== lastFetchedUserId) {
      setLastFetchedUserId(user.id);
      fetchMealPlansRef.current?.();
    } else if (!user) {
      setMealPlans([]);
      setLastFetchedUserId(null);
      setLoading(false);
    }
  }, [user, lastFetchedUserId]);

  // Add or update meal plan
  const addOrUpdateMealPlan = useCallback(async (date: string, recipeId?: string) => {
    if (!user?.id) return;
    
    try {
      const updatedMealPlan = await supabaseService.createOrUpdateMealPlan({
        date,
        recipeId,
        userId: user.id
      });
      
      // Update local state directly instead of refetching
      setMealPlans(prevMealPlans => {
        const existingIndex = prevMealPlans.findIndex(mp => 
          (typeof mp.date === 'string' ? mp.date.split('T')[0] : mp.date) === date.split('T')[0]
        );
        
        if (existingIndex >= 0) {
          // Update existing meal plan
          const updated = [...prevMealPlans];
          updated[existingIndex] = updatedMealPlan;
          return updated;
        } else {
          // Add new meal plan
          return [...prevMealPlans, updatedMealPlan].sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );
        }
      });
    } catch (error) {
      console.error('Failed to add/update meal plan:', error);
      throw error;
    }
  }, [user?.id]);

  // Remove meal plan
  const removeMealPlan = useCallback(async (id: string) => {
    try {
      await supabaseService.deleteMealPlan(id);
      // Update local state directly instead of refetching
      setMealPlans(prevMealPlans => prevMealPlans.filter(mp => mp.id !== id));
    } catch (error) {
      console.error('Failed to remove meal plan:', error);
      throw error;
    }
  }, []);

  // Reschedule meal plan
  const rescheduleMealPlan = useCallback(async (mealPlanId: string, newDate: string) => {
    if (!user?.id) return;
    
    const mealPlan = mealPlans.find(mp => mp.id === mealPlanId);
    if (!mealPlan) return;
    
    try {
      // Remove the old meal plan
      await supabaseService.deleteMealPlan(mealPlanId);
      // Create a new meal plan with the same recipe on the new date
      const newMealPlan = await supabaseService.createOrUpdateMealPlan({
        date: newDate,
        recipeId: mealPlan.recipe?.id,
        userId: user.id
      });
      
      // Update local state directly instead of refetching
      setMealPlans(prevMealPlans => {
        const filtered = prevMealPlans.filter(mp => mp.id !== mealPlanId);
        return [...filtered, newMealPlan].sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
      });
    } catch (error) {
      console.error('Failed to reschedule meal plan:', error);
      throw error;
    }
  }, [user?.id, mealPlans]);

  // Get meal plan for specific date
  const getMealPlanForDate = useCallback((date: string) => {
    return mealPlans.find(mp => {
      // Handle both date string formats
      const mealPlanDate = typeof mp.date === 'string' ? mp.date.split('T')[0] : mp.date;
      const searchDate = date.split('T')[0];
      return mealPlanDate === searchDate;
    });
  }, [mealPlans]);

  const value: MealPlanContextType = {
    mealPlans,
    loading,
    refreshMealPlans: fetchMealPlans,
    addOrUpdateMealPlan,
    removeMealPlan,
    rescheduleMealPlan,
    getMealPlanForDate,
  };

  return (
    <MealPlanContext.Provider value={value}>
      {children}
    </MealPlanContext.Provider>
  );
};

export function useMealPlans() {
  const context = useContext(MealPlanContext);
  if (context === undefined) {
    throw new Error('useMealPlans must be used within a MealPlanProvider');
  }
  return context;
}