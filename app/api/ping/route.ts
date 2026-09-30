import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic' // Ensure this isn't cached

export async function GET() {
  try {
    const supabase = await createClient()

    // Perform a lightweight query to wake up the database and prevent pausing.
    // Even if it returns 0 rows due to RLS, it registers as database activity.
    const { error } = await supabase.from('user_profiles').select('user_id').limit(1)

    if (error) {
      console.error('Ping error:', error)
      return NextResponse.json({ status: 'error', message: 'Failed to ping database' }, { status: 500 })
    }

    return NextResponse.json({ status: 'success', message: 'Database pinged successfully', time: new Date().toISOString() })
  } catch (error) {
    console.error('Ping exception:', error)
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 })
  }
}
