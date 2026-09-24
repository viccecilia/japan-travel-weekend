import {useState} from 'react';

export function SpotVideoPlayer({url, posterUrl, title, compact = false, playLabel = '播放视频', unavailableLabel = '视频暂时无法播放，景点图文仍可正常查看。'}: Readonly<{url: string; posterUrl?: string; title: string; compact?: boolean; playLabel?: string; unavailableLabel?: string}>) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  if (failed) return <div className="spot-video-player spot-video-failed" role="status" style={{backgroundImage: posterUrl ? `linear-gradient(#0008,#0008),url(${posterUrl})` : undefined, backgroundPosition: 'center', backgroundSize: 'cover', display: 'grid', placeItems: 'center'}}><p className="spot-video-fallback">{unavailableLabel}</p></div>;
  return <div className={compact ? 'spot-video-player compact' : 'spot-video-player'}>
    {!playing ? <button type="button" className="spot-video-poster" style={posterUrl ? {backgroundImage: `url(${posterUrl})`} : undefined} onClick={() => setPlaying(true)} aria-label={`${playLabel}: ${title}`}><span>▶</span><b>{playLabel}</b></button> : <video controls controlsList="nodownload" preload="metadata" playsInline autoPlay poster={posterUrl} aria-label={`${title} ${playLabel}`} onError={() => setFailed(true)}><source src={url} type="video/mp4" /></video>}
  </div>;
}
