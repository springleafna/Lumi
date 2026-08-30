/** 阅读器即时问答的交换状态（与 web 端抽屉同构，仅保留当前一轮）。 */
export type ReaderAiExchange = {
  question: string
  answer: string
  streaming: boolean
  failed: boolean
}
