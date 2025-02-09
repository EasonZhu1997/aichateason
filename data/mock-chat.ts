import { Chat } from '@/types/chat'

export const mockChat: Chat = {
  id: '1',
  title: '那为什么刚刚算了11667元',
  messages: [
    {
      id: '1',
      role: 'user',
      content: '为什么计算结果是11667元?',
      timestamp: 1710000000000
    },
    {
      id: '2', 
      role: 'assistant',
      content: `刚刚算出11667元的原因在于计算逻辑中误将报销金额直接加到了小明的应得部分，而不是将它从总收入中扣除后再平分。具体来说，之前的错误逻辑是：

1. 错误地将报销金额2723元直接视为小明的额外收入
2. 这样就多算了小明应得的一部分，实际上报销是从总收入中扣除的公共成本

正确的计算方式应该是先从总收入中扣除报销金额，然后再平分剩余金额。`,
      timestamp: 1710000001000
    }
  ]
} 