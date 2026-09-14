export const locationState = (value: string | null, now = Date.now()) => {
  if (!value) return "暂无真实定位";
  const age = now - new Date(value).getTime();
  const time = new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Tokyo",
  });
  return age <= 2 * 60_000
    ? `实时 · 最后定位 ${time}`
    : `已过期 · 最后定位 ${time}`;
};
