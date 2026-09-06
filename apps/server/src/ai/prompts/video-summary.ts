import type { ChatMessage } from '../ai-provider.service';
import { truncate } from '../../common/text.utils';
import { formatTimestamp } from '../../video/transcript.utils';

export type VideoChunkSummary = {
  startTime: number;
  endTime: number;
  summary: string;
};

export type VideoMapPromptInput = {
  title: string;
  chunkText: string;
  startTime: number;
  endTime: number;
};

export type VideoReducePromptInput = {
  title: string;
  uploader?: string | null;
  durationSeconds?: number | null;
  chunkSummaries: VideoChunkSummary[];
};

/**
 * Map 阶段：对单个字幕分块做小结。约束 LLM 只能引用本块时间范围内的
 * 时间点，为 Reduce 阶段的锚点校验提供可信输入。
 */
export function buildVideoMapMessages(input: VideoMapPromptInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的中文视频笔记助手。请只基于提供的字幕内容总结，不要编造。直接输出小结文本，不要输出 JSON 或标题。',
    },
    {
      role: 'user',
      content: [
        `视频标题：${input.title}`,
        `下面是视频 [${formatTimestamp(input.startTime)} - ${formatTimestamp(input.endTime)}] 的字幕内容：`,
        truncate(input.chunkText, 8_000),
        '请输出这段内容中文小结（150 字以内），概括关键信息与结论；重要的结论、数据、时间点在句末用 [mm:ss] 标注，时间必须来自上面字幕中出现的时间。',
      ].join('\n\n'),
    },
  ];
}

/**
 * Reduce 阶段：汇总各分块小结，产出结构化总结（正文 Markdown + 阅读卡字段）。
 * 正文以 `## [mm:ss] 章节标题` 划分章节，阅读端据此生成章节目录与播放跳转。
 */
export function buildVideoReduceMessages(input: VideoReducePromptInput): ChatMessage[] {
  const chunkSection = input.chunkSummaries
    .map(
      (chunk) =>
        `[${formatTimestamp(chunk.startTime)} - ${formatTimestamp(chunk.endTime)}] ${chunk.summary}`,
    )
    .join('\n\n');

  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的中文视频阅读助手。请只基于提供的分块小结整理总结，不要编造。必须只输出 JSON，不要输出 Markdown 代码块。',
    },
    {
      role: 'user',
      content: [
        `请把下面视频的分块小结整理成一份结构化总结，只输出 JSON，字段：markdown, oneSentenceSummary, keyPoints, concepts, actions, tags。`,
        '',
        'markdown 字段是总结正文（Markdown 字符串），结构要求：',
        '1. 以一段 2-4 句的总述开头，不带任何标题；',
        '2. 之后用 `## [mm:ss] 章节标题` 划分 3-8 个章节（短视频可 2-3 个），mm:ss 是该章节在视频中开始的时间；',
        '3. 每个章节用无序列表写 2-5 条要点，关键结论末尾附 `[mm:ss]`；',
        '4. 所有 [mm:ss] 必须直接取自分块小结中出现的时间点，严禁编造或推算；',
        '5. 全文控制在 1200 字以内，使用中文。',
        '',
        '其余字段要求：oneSentenceSummary 为 60 字以内的一句话总结；keyPoints 为 3-8 条关键要点；concepts 为 0-8 个概念名词；actions 为 0-6 条可执行建议；tags 为 1-3 个 2-6 字的中文标签。全部使用中文。',
        '',
        `视频标题：${input.title}`,
        `UP 主：${input.uploader || '未知'}`,
        `总时长：${input.durationSeconds ? formatTimestamp(input.durationSeconds) : '未知'}`,
        '',
        '分块小结：',
        truncate(chunkSection, 24_000),
      ].join('\n'),
    },
  ];
}
