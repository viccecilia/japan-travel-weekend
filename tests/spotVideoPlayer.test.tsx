import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {SpotVideoPlayer} from '../src/shared/components/SpotVideoPlayer';

describe('SpotVideoPlayer', () => {
  it('keeps the supplied poster in the 16:9 player frame after playback fails', () => {
    const {container} = render(<SpotVideoPlayer url="/missing.mp4" posterUrl="/spot-poster.jpg" title="Test spot" unavailableLabel="Video is temporarily unavailable" />);
    fireEvent.click(screen.getByRole('button', {name: /播放视频|play/i}));
    fireEvent.error(container.querySelector('video')!);
    const fallback = screen.getByRole('status');
    expect(fallback).toHaveTextContent('Video is temporarily unavailable');
    expect(fallback.getAttribute('style')).toContain('/spot-poster.jpg');
    expect(fallback.className).toContain('spot-video-failed');
  });
});
