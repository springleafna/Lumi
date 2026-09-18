import { translateProviderError } from './ai-provider.service';

describe('translateProviderError', () => {
  it('402 或 Insufficient Balance 翻译为余额不足提示', () => {
    const body =
      '{"error":{"message":"Insufficient Balance","type":"unknown_error","param":null,"code":"invalid_request_error"}}';
    expect(translateProviderError('AI 调用失败', 402, body)).toBe(
      'AI 调用失败：AI 服务商账户余额不足，请前往服务商控制台充值或更换 API Key 后重试',
    );
    // 部分供应商用 400 承载余额错误，靠文案识别
    expect(translateProviderError('Embedding 调用失败', 400, 'Insufficient Balance')).toBe(
      'Embedding 调用失败：AI 服务商账户余额不足，请前往服务商控制台充值或更换 API Key 后重试',
    );
  });

  it('401 / 429 / 404 给出对应中文提示', () => {
    expect(translateProviderError('AI 调用失败', 401, '{"error":"Invalid API key"}')).toContain(
      'API Key 无效或已失效',
    );
    expect(translateProviderError('AI 调用失败', 429, 'rate limit exceeded')).toContain('限流');
    expect(translateProviderError('AI 调用失败', 404, 'model not found')).toContain(
      '接口地址或模型不存在',
    );
  });

  it('无法识别的错误原样透传，空响应体回退状态码文案', () => {
    const raw = '{"error":{"message":"something else"}}';
    expect(translateProviderError('AI 调用失败', 500, raw)).toBe(`AI 调用失败：${raw}`);
    expect(translateProviderError('AI 调用失败', 503, '')).toBe(
      'AI 调用失败：503 服务商暂时不可用',
    );
  });
});
