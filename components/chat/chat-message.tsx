import { Message } from '@/types/chat'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <div className={cn(
      "flex gap-3 max-w-screen-md mx-auto",
      message.role === 'assistant' ? "items-start" : "items-start flex-row-reverse"
    )}>
      <Avatar className="h-8 w-8">
        <AvatarFallback>
          {message.role === 'assistant' ? 'AI' : 'U'}
        </AvatarFallback>
      </Avatar>
      <Card className={cn(
        "max-w-[80%]",
        message.role === 'user' && "bg-primary text-primary-foreground"
      )}>
        <CardContent className="p-3 text-sm">
          {message.content}
        </CardContent>
      </Card>
    </div>
  )
} 