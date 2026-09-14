import {useState} from 'react';

export function SpotVideoPlayer({url, posterUrl, title, compact = false}: Readonly<{url: string; posterUrl?: string; title: string; compact?: boolean}>) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="spot-video-fallback" role="status">视频暂时无法播放，景点图文仍可正常查看。</p>;
  return <div className={compact ? 'spot-video-player compact' : 'spot-video-player'}>
    <video
      controls
      controlsList="nodownload"
      preload="none"
      playsInline
      poster={posterUrl}
      aria-label={`${title}景点视频`}
      onError={() => setFailed(true)}
    >
      <source src={url} type="video/mp4" />
      您的浏览器暂不支持 MP4 视频播放。
    </video>
  </div>;
}
