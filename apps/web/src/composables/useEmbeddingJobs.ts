import { computed, ref } from 'vue'
import { LumiApiError } from '@lumi/api-client'
import type {
  DocumentEmbeddingChunkDto,
  DocumentEmbeddingJobChunksDto,
  DocumentEmbeddingJobDto,
  DocumentEmbeddingStatus,
} from '@lumi/shared'
import { useToast } from './useToast'
import { client } from '../lib/client'

const PAGE_SIZE = 20

/**
 * 索引任务列表的状态与操作：按状态 / 关键词筛选、分页、重试、查看分片内容。
 */
export function useEmbeddingJobs() {
  const { toast } = useToast()

  const jobs = ref<DocumentEmbeddingJobDto[]>([])
  const jobsTotal = ref(0)
  const jobsLoading = ref(false)
  const jobsStatus = ref('')
  const jobsKeyword = ref('')
  const jobsPage = ref(1)
  const chunkDialogOpen = ref(false)
  const selectedJob = ref<DocumentEmbeddingJobDto | null>(null)
  const jobChunks = ref<DocumentEmbeddingJobChunksDto | null>(null)
  const jobChunksLoading = ref(false)
  const actionLoading = ref('')

  const chunkDialogTitle = computed(() =>
    selectedJob.value ? `索引分片：${selectedJob.value.documentTitle}` : '索引分片',
  )

  const chunkDialogDescription = computed(() => {
    if (!selectedJob.value) return undefined
    const parts = [
      selectedJob.value.model || '未记录模型',
      `${selectedJob.value.chunkCount} 个片段`,
      selectedJob.value.finishedAt ? `完成于 ${formatDate(selectedJob.value.finishedAt)}` : null,
    ].filter(Boolean)
    return parts.join(' · ')
  })

  async function loadJobs() {
    jobsLoading.value = true
    try {
      const result = await client.embeddingJobs.list({
        status: (jobsStatus.value || undefined) as DocumentEmbeddingStatus | undefined,
        keyword: jobsKeyword.value || undefined,
        page: jobsPage.value,
        pageSize: PAGE_SIZE,
      })
      jobs.value = result.items
      jobsTotal.value = result.total
    } catch (error) {
      notifyError(error, '索引任务加载失败')
    } finally {
      jobsLoading.value = false
    }
  }

  async function retryJob(job: DocumentEmbeddingJobDto) {
    actionLoading.value = `retry-${job.id}`
    try {
      await client.embeddingJobs.retry(job.id)
      toast({ title: '已重新加入索引队列', variant: 'success' })
      await loadJobs()
    } catch (error) {
      notifyError(error, '索引任务重试失败')
    } finally {
      actionLoading.value = ''
    }
  }

  async function openJobChunks(job: DocumentEmbeddingJobDto) {
    if (job.status !== 'succeeded') return
    if (jobChunksLoading.value && selectedJob.value?.id === job.id) return
    selectedJob.value = job
    jobChunks.value = null
    chunkDialogOpen.value = true
    jobChunksLoading.value = true
    try {
      jobChunks.value = await client.embeddingJobs.chunks(job.id)
    } catch (error) {
      notifyError(error, '索引分片加载失败')
    } finally {
      jobChunksLoading.value = false
    }
  }

  function updateChunkDialogOpen(value: boolean) {
    chunkDialogOpen.value = value
    if (!value) {
      selectedJob.value = null
      jobChunks.value = null
    }
  }

  function handleJobRowKeydown(event: KeyboardEvent, job: DocumentEmbeddingJobDto) {
    if (job.status !== 'succeeded') return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openJobChunks(job)
  }

  async function applyJobFilters() {
    jobsPage.value = 1
    await loadJobs()
  }

  function notifyError(error: unknown, fallback: string) {
    const message = error instanceof LumiApiError ? error.message : fallback
    toast({ title: fallback, description: message, variant: 'destructive' })
  }

  return {
    jobs,
    jobsTotal,
    jobsLoading,
    jobsStatus,
    jobsKeyword,
    jobsPage,
    pageSize: PAGE_SIZE,
    chunkDialogOpen,
    selectedJob,
    jobChunks,
    jobChunksLoading,
    actionLoading,
    chunkDialogTitle,
    chunkDialogDescription,
    loadJobs,
    retryJob,
    openJobChunks,
    updateChunkDialogOpen,
    handleJobRowKeydown,
    applyJobFilters,
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function statusLabel(status: DocumentEmbeddingStatus) {
  if (status === 'pending') return '待处理'
  if (status === 'processing') return '处理中'
  if (status === 'succeeded') return '成功'
  return '失败'
}

export function statusVariant(status: DocumentEmbeddingStatus) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed') return 'destructive'
  return 'neutral'
}

export function formatChunkMeta(chunk: DocumentEmbeddingChunkDto) {
  return `${chunk.content.length} 字符 · ${chunk.startOffset}-${chunk.endOffset}`
}
