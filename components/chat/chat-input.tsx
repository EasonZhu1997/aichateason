import { Button } from "../ui/button"
import { Input } from '@/components/ui/input'
import { Search, Lightbulb } from 'lucide-react'

interface ChatInputProps {
  onSubmit: (content: string) => void
  disabled?: boolean
}

export function ChatInput({ onSubmit, disabled }: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const content = (e.target as HTMLTextAreaElement).value.trim()
      if (content) {
        onSubmit(content)
        ;(e.target as HTMLTextAreaElement).value = ''
      }
    }
  }

  return (
    <div className="border-t p-4">
      <div className="max-w-screen-md mx-auto flex gap-2">
        <textarea
          className="w-full p-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="输入消息，按回车发送..."
          rows={3}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <Button variant="ghost" size="icon">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon">
          <Lightbulb className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
} 