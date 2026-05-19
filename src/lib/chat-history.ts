import { supabase } from './supabase'

export type ConversationRow = {
  id: string
  user_id: string
  title: string
  model_id: string | null
  pinned: boolean
  archived: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type MessageRow = {
  id: string
  conversation_id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  model_id: string | null
  created_at: string
}

export async function listConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .is('deleted_at', null)
    .eq('archived', false)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ConversationRow[]
}

export async function listMessages(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as MessageRow[]
}

export async function createConversation(args: {
  userId: string
  title: string
  modelId: string
}) {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: args.userId,
      title: args.title.slice(0, 80),
      model_id: args.modelId,
    })
    .select()
    .single()
  if (error) throw error
  return data as ConversationRow
}

export async function insertMessage(args: {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  modelId?: string
}) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: args.conversationId,
      role: args.role,
      content: args.content,
      model_id: args.modelId ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as MessageRow
}

export async function renameConversation(id: string, title: string) {
  const { error } = await supabase
    .from('conversations')
    .update({ title: title.slice(0, 120) })
    .eq('id', id)
  if (error) throw error
}

export async function togglePinConversation(id: string, pinned: boolean) {
  const { error } = await supabase
    .from('conversations')
    .update({ pinned })
    .eq('id', id)
  if (error) throw error
}

export async function softDeleteConversation(id: string) {
  const { error } = await supabase
    .from('conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function updateConversationModel(id: string, modelId: string) {
  const { error } = await supabase
    .from('conversations')
    .update({ model_id: modelId })
    .eq('id', id)
  if (error) throw error
}
