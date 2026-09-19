import type { VideoSummaryMode } from '@lumi/shared';
import type { ChatMessage } from '../ai-provider.service';
import { truncate } from '../../common/text.utils';
import { formatTimestamp } from '../../video/transcript.utils';
import { EDITORIAL_FIDELITY_RULES } from './editorial-rules';

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
  mode: VideoSummaryMode;
  chunkSummaries: VideoChunkSummary[];
  existingTags?: string[];
  /** 重新生成：只产出正文 markdown，不生成阅读卡字段与标签 */
  bodyOnly?: boolean;
};

export type VideoSinglePassPromptInput = {
  title: string;
  uploader?: string | null;
  durationSeconds?: number | null;
  mode: VideoSummaryMode;
  transcriptText: string;
  existingTags?: string[];
  /** 重新生成：只产出正文 markdown，不生成阅读卡字段与标签 */
  bodyOnly?: boolean;
};

/** Map 阶段单块小结的篇幅与保留要求：细节保全，而不是压缩。 */
const MAP_SUMMARY_REQUIREMENTS = [
  '请输出这段内容的详细小结（400-600 字）：',
  '- 完整保留所有具体数字（含单位与基准）、结论、步骤和条件，不要抽象化概括；',
  '- 工具名、人名、产品名、术语照原文写；',
  '- 按字幕原有的叙述顺序组织，不要重新归纳或合并主题；',
  '- 重要的结论、数据、转折在句末用 [mm:ss] 标注，时间必须来自上面字幕中出现的时间。',
].join('\n');

/**
 * 按 mode 和视频时长决定正文篇幅与章节数；时长未知时取中间档。
 */
function resolveLengthRule(mode: VideoSummaryMode, durationSeconds?: number | null): string {
  const seconds = durationSeconds ?? null;
  if (mode === 'standard') {
    if (seconds === null) return '1800-2800 字，划分 5-8 个章节';
    if (seconds <= 600) return '1000-1500 字，划分 3-5 个章节';
    if (seconds <= 1800) return '1800-2800 字，划分 5-8 个章节';
    return '2500-3500 字，划分 6-9 个章节';
  }
  if (seconds === null) return '800-1200 字，划分 3-5 个章节';
  if (seconds <= 600) return '500-800 字，划分 2-3 个章节';
  if (seconds <= 1800) return '800-1200 字，划分 3-6 个章节';
  return '1000-1400 字，划分 4-6 个章节';
}

/**
 * 正文（markdown 字段）的结构要求，Reduce 与单次总结共用。
 * 锚点来源不同：Reduce 只能引用分块小结中的时间，单次总结直接取自字幕行。
 */
function buildMarkdownRequirements(
  mode: VideoSummaryMode,
  durationSeconds: number | null | undefined,
  anchorSource: '分块小结' | '字幕',
): string[] {
  const length = resolveLengthRule(mode, durationSeconds);
  const anchorRule = `所有 [mm:ss] 必须直接取自${anchorSource}中出现的时间点，严禁编造或推算；`;
  if (mode === 'standard') {
    return [
      `markdown 字段是总结正文（Markdown 字符串），供阅读页直接渲染，篇幅控制在${length}。结构要求：`,
      '1. 以一段 2-4 句的总述开头，不带任何标题；',
      '2. 先判断内容主线属于哪一类：机制原理、操作教程、证据论证、观点讨论、事件叙事；章节随主线组织——教程按操作阶段与分支条件，机制按组成要素与相互关系，论证按论点与其证据，观点按议题与分歧，叙事按时间线与因果；',
      '3. 用 `## [mm:ss] 章节标题` 划分章节，mm:ss 是该章节在视频中开始的时间；',
      '4. 每个章节的要点写成 1-3 句的完整表述，保留具体数字、条件与步骤；对比性内容（两种方案、前后变化、多个选项）用 Markdown 表格呈现，连续步骤用有序列表；',
      `5. ${anchorRule}`,
      '写作规则：',
      EDITORIAL_FIDELITY_RULES,
    ];
  }
  return [
    `markdown 字段是总结正文（Markdown 字符串），供阅读页直接渲染，篇幅控制在${length}。结构要求：`,
    '1. 以一段 2-4 句的总述开头，不带任何标题；',
    '2. 之后用 `## [mm:ss] 章节标题` 划分章节，mm:ss 是该章节在视频中开始的时间；',
    '3. 每个章节用无序列表写 2-5 条要点，关键结论末尾附 `[mm:ss]`；',
    `4. ${anchorRule}`,
    '写作规则：',
    EDITORIAL_FIDELITY_RULES,
  ];
}

function buildCardRequirements(mode: VideoSummaryMode): string {
  const keyPoints = mode === 'standard' ? '5-10 条' : '3-8 条';
  const pointLength = mode === 'standard' ? '1-2 句话' : '一句话';
  return `其余字段要求：oneSentenceSummary 为 60 字以内的一句话总结；keyPoints 为 ${keyPoints}关键要点，每条${pointLength}、末尾必须附 \`[mm:ss]\`（时间取自字幕，作为视频速览跳转点）；concepts 为 0-8 个视频中提到的工具、人物或概念名词；tags 为 1-3 个 2-6 字的中文标签。全部使用中文。`;
}

function buildExistingTagsLine(existingTags?: string[]): string {
  return existingTags?.length
    ? `知识库已有标签（按使用频率排序）：${existingTags.join('、')}。tags 必须优先从这些已有标签中选择，确实没有语义合适的才新建。`
    : '';
}

/** 字段契约：重新生成只要正文，首次生成连带阅读卡字段与标签 */
function buildFieldContract(bodyOnly?: boolean): string {
  return bodyOnly
    ? '只输出 JSON，字段：markdown。'
    : '只输出 JSON，字段：markdown, oneSentenceSummary, keyPoints, concepts, tags。';
}

/** 阅读卡字段要求块；重新生成（bodyOnly）时整块省略 */
function buildCardBlock(mode: VideoSummaryMode, existingTags: string[] | undefined, bodyOnly?: boolean): string[] {
  if (bodyOnly) return [];
  return ['', buildCardRequirements(mode), buildExistingTagsLine(existingTags)];
}

/**
 * Map 阶段：对单个字幕分块做细节保全式小结。约束 LLM 只能引用本块时间范围内的
 * 时间点，为 Reduce 阶段的锚点校验提供可信输入。
 */
export function buildVideoMapMessages(input: VideoMapPromptInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的中文视频笔记助手。请只基于提供的字幕内容小结，不要编造。直接输出小结文本，不要输出 JSON 或标题。',
    },
    {
      role: 'user',
      content: [
        `视频标题：${input.title}`,
        `下面是视频 [${formatTimestamp(input.startTime)} - ${formatTimestamp(input.endTime)}] 的字幕内容：`,
        truncate(input.chunkText, 8_000),
        MAP_SUMMARY_REQUIREMENTS,
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
        `请把下面视频的分块小结整理成一份${input.mode === 'standard' ? '精读' : '速览'}总结，${buildFieldContract(input.bodyOnly)}`,
        '',
        ...buildMarkdownRequirements(input.mode, input.durationSeconds, '分块小结'),
        ...buildCardBlock(input.mode, input.existingTags, input.bodyOnly),
        '',
        `视频标题：${input.title}`,
        `UP 主：${input.uploader || '未知'}`,
        `总时长：${input.durationSeconds ? formatTimestamp(input.durationSeconds) : '未知'}`,
        '',
        '分块小结：',
        truncate(chunkSection, 24_000),
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

/**
 * 单次总结：转写全文一次性进上下文，避免 Map-Reduce 分块时的信息损耗。
 * 结构要求与 Reduce 复用同一套规则，锚点直接取自带时间头的字幕行。
 */
export function buildVideoSinglePassMessages(input: VideoSinglePassPromptInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的中文视频阅读助手。请只基于提供的字幕全文整理总结，不要编造。必须只输出 JSON，不要输出 Markdown 代码块。',
    },
    {
      role: 'user',
      content: [
        `请把下面视频的完整字幕整理成一份${input.mode === 'standard' ? '精读' : '速览'}总结，${buildFieldContract(input.bodyOnly)}`,
        '',
        ...buildMarkdownRequirements(input.mode, input.durationSeconds, '字幕'),
        ...buildCardBlock(input.mode, input.existingTags, input.bodyOnly),
        '',
        '你拿到的是完整字幕：章节按内容本身的结构划分，不要按字幕顺序逐段复述；前后呼应的结论可以直接归纳。',
        '',
        `视频标题：${input.title}`,
        `UP 主：${input.uploader || '未知'}`,
        `总时长：${input.durationSeconds ? formatTimestamp(input.durationSeconds) : '未知'}`,
        '',
        '完整字幕（每行开头的 [mm:ss] 是该句在视频中的时间）：',
        truncate(input.transcriptText, 24_000),
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}
