import { readonly, ref } from 'vue'

export type ToastVariant = 'default' | 'success' | 'destructive'

export type ToastItem = {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

const toasts = ref<ToastItem[]>([])
let toastId = 0

export function useToast() {
  function toast(input: {
    title: string
    description?: string
    variant?: ToastVariant
    duration?: number
  }) {
    const item: ToastItem = {
      id: ++toastId,
      title: input.title,
      description: input.description,
      variant: input.variant ?? 'default',
    }

    toasts.value = [item, ...toasts.value].slice(0, 4)

    window.setTimeout(() => {
      dismissToast(item.id)
    }, input.duration ?? 3600)
  }

  function dismissToast(id: number) {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  return {
    toasts: readonly(toasts),
    toast,
    dismissToast,
  }
}
