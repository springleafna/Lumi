import {
  canonicalBilibiliVideoUrl,
  detectBilibiliVideo,
  isBilibiliShortLink,
} from './bilibili.utils';

describe('bilibili.utils', () => {
  describe('detectBilibiliVideo', () => {
    it('识别桌面端 BV 链接', () => {
      expect(detectBilibiliVideo('https://www.bilibili.com/video/BV1hM8X6kEso')).toEqual({
        videoId: 'BV1hM8X6kEso',
        page: 1,
      });
    });

    it('识别移动端链接', () => {
      expect(detectBilibiliVideo('https://m.bilibili.com/video/BV1hM8X6kEso')).toEqual({
        videoId: 'BV1hM8X6kEso',
        page: 1,
      });
    });

    it('识别 av 号链接', () => {
      expect(detectBilibiliVideo('https://www.bilibili.com/video/av170001')).toEqual({
        videoId: 'av170001',
        page: 1,
      });
    });

    it('解析分 P 参数', () => {
      expect(
        detectBilibiliVideo('https://www.bilibili.com/video/BV1hM8X6kEso?p=3'),
      ).toEqual({ videoId: 'BV1hM8X6kEso', page: 3 });
    });

    it('无效分 P 参数回退到 1', () => {
      expect(
        detectBilibiliVideo('https://www.bilibili.com/video/BV1hM8X6kEso?p=0'),
      ).toEqual({ videoId: 'BV1hM8X6kEso', page: 1 });
      expect(
        detectBilibiliVideo('https://www.bilibili.com/video/BV1hM8X6kEso?p=abc'),
      ).toEqual({ videoId: 'BV1hM8X6kEso', page: 1 });
    });

    it('非视频路径返回 null', () => {
      expect(detectBilibiliVideo('https://www.bilibili.com/read/cv123456')).toBeNull();
      expect(detectBilibiliVideo('https://www.bilibili.com/')).toBeNull();
    });

    it('非 B 站域名返回 null', () => {
      expect(detectBilibiliVideo('https://example.com/video/BV1hM8X6kEso')).toBeNull();
    });

    it('短链域名不作为视频入口（需先展开）', () => {
      expect(detectBilibiliVideo('https://b23.tv/1AbCdEf')).toBeNull();
    });

    it('非法 URL 返回 null', () => {
      expect(detectBilibiliVideo('not-a-url')).toBeNull();
    });
  });

  describe('canonicalBilibiliVideoUrl', () => {
    it('第一分 P 不带参数', () => {
      expect(canonicalBilibiliVideoUrl({ videoId: 'BV1hM8X6kEso', page: 1 })).toBe(
        'https://www.bilibili.com/video/BV1hM8X6kEso',
      );
    });

    it('多分 P 保留 p 参数', () => {
      expect(canonicalBilibiliVideoUrl({ videoId: 'BV1hM8X6kEso', page: 3 })).toBe(
        'https://www.bilibili.com/video/BV1hM8X6kEso?p=3',
      );
    });
  });

  describe('isBilibiliShortLink', () => {
    it('识别 b23.tv 短链', () => {
      expect(isBilibiliShortLink('https://b23.tv/1AbCdEf')).toBe(true);
    });

    it('主站链接不是短链', () => {
      expect(isBilibiliShortLink('https://www.bilibili.com/video/BV1hM8X6kEso')).toBe(false);
    });
  });
});
