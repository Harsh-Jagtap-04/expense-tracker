'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) { console.error('getProfile error:', error); return null }

  return {
    ...data,
    email: user.email || '',
    created_at_auth: user.created_at,
  }
}

export async function updateProfile(updates: {
  first_name?: string
  last_name?: string
  phone?: string
  date_of_birth?: string | null
  bio?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('user_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const file = formData.get('avatar') as File
  if (!file || file.size === 0) return { error: 'No file provided' }

  const fileExt = file.name.split('.').pop()
  const filePath = `${user.id}/avatar.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath)

  // Add cache-busting timestamp
  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`

  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (updateError) return { error: updateError.message }
  revalidatePath('/dashboard')
  return { success: true, url: avatarUrl }
}

export async function deleteAvatar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // List files in user's folder
  const { data: files } = await supabase.storage
    .from('avatars')
    .list(user.id)

  if (files && files.length > 0) {
    const filePaths = files.map(f => `${user.id}/${f.name}`)
    await supabase.storage.from('avatars').remove(filePaths)
  }

  const { error } = await supabase
    .from('user_profiles')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function changePassword(newPassword: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Delete all user data (cascade will handle most, but clear transactions explicitly)
  await supabase.from('transactions').delete().eq('user_id', user.id)
  await supabase.from('categories').delete().eq('user_id', user.id)
  await supabase.from('transaction_types').delete().eq('user_id', user.id)
  await supabase.from('person_tags').delete().eq('user_id', user.id)
  await supabase.from('investment_kinds').delete().eq('user_id', user.id)
  await supabase.from('user_settings').delete().eq('user_id', user.id)
  await supabase.from('user_profiles').delete().eq('user_id', user.id)

  // Sign out
  await supabase.auth.signOut()
  redirect('/login')
}
