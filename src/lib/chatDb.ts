import { supabase } from './supabase';

export type Conversation = {
  id: string;
  title: string;
  model_id: string;
  created_at: string;
  updated_at: string;
};

export async function fetchConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, model_id, created_at, updated_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) { console.error('fetchConversations', error); return []; }
  return data ?? [];
}

export async function createConversation(userId: string, title: string, modelId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title, model_id: modelId })
    .select('id')
    .single();
  if (error) { console.error('createConversation', error); return null; }
  return data?.id ?? null;
}

export async function updateConversationTitle(convId: string, title: string) {
  await supabase
    .from('conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', convId);
}

export async function touchConversation(convId: string) {
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', convId);
}

export async function saveMessage(convId: string, role: 'user' | 'assistant', content: string, modelId?: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: convId, role, content, model_id: modelId ?? null })
    .select('id')
    .single();
  if (error) { console.error('saveMessage', error); return null; }
  return data?.id ?? null;
}

export async function fetchMessages(convId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });
  if (error) { console.error('fetchMessages', error); return []; }
  return data ?? [];
}

export async function deleteConversation(convId: string) {
  const { error } = await supabase
    .from('conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', convId);
  if (error) { console.error('deleteConversation', error); }
}
