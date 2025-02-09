export type Role = 'user' | 'assistant'

export interface Message {
  id: string
  role: Role
  content: string
  timestamp: number
}

export interface Chat {
  id: string
  title: string
  messages: Message[]
} 