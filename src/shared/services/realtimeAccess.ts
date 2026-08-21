export function remoteChatAvailability(
  roomStatus: "frozen" | "open" | "closed",
  connection: "connecting" | "connected" | "disconnected",
) {
  if (roomStatus !== "open")
    return {
      enabled: false,
      reason: roomStatus === "frozen" ? "群组尚未开放" : "群组已关闭",
    };
  if (connection !== "connected")
    return {
      enabled: false,
      reason: connection === "connecting" ? "实时连接中" : "实时连接中断",
    };
  return { enabled: true, reason: "可以发送" };
}
