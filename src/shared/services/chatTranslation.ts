export const chatLanguages = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "ne", label: "नेपाली" },
  { code: "ko", label: "한국어" },
] as const;

export type ChatLanguage = (typeof chatLanguages)[number]["code"];

const normalizeLanguage = (value: string): ChatLanguage | null => {
  const code = value.trim().toLowerCase();
  if (code.startsWith("zh-tw")||code.startsWith("zh-hk")||code.startsWith("zh-hant")) return "zh-TW";
  if (code.startsWith("zh")) return "zh-CN";
  if (code.startsWith("ja")) return "ja";
  if (code.startsWith("en")) return "en";
  if (code.startsWith("vi")) return "vi";
  if (code.startsWith("ne")) return "ne";
  if (code.startsWith("ko")) return "ko";
  return null;
};

export function preferredChatLanguage(languages: readonly string[]): ChatLanguage {
  for (const language of languages) {
    const supported = normalizeLanguage(language);
    if (supported) return supported;
  }
  return "en";
}

export const staffTemplateTranslations: Record<string, Record<ChatLanguage, string>> = {
  introduce: {
    "zh-CN": "大家好，我是本车工作人员。明天我会在群内协助大家集合与乘车。",
    "zh-TW": "大家好，我是本車工作人員。明天我會在群內協助大家集合與乘車。",
    ja: "皆さま、こんにちは。本車両のスタッフです。明日の集合と乗車をこのグループでサポートします。",
    en: "Hello, I am the staff member for this vehicle. I will assist with tomorrow's meeting and boarding in this group.",
    vi: "Xin chào, tôi là nhân viên phụ trách xe này. Tôi sẽ hỗ trợ việc tập trung và lên xe ngày mai trong nhóm này.",
    ne: "नमस्कार, म यस गाडीको कर्मचारी हुँ। भोलिको भेटघाट र गाडी चढ्ने प्रक्रियामा म यस समूहमा सहयोग गर्नेछु।",
    ko: "안녕하세요. 이 차량 담당 스태프입니다. 내일 집합과 승차를 이 그룹에서 안내해 드리겠습니다.",
  },
  confirm_meeting: {
    "zh-CN": "请确认明天的集合时间与置顶集合地点，并提前到达。",
    "zh-TW": "請確認明天的集合時間與置頂集合地點，並提前到達。",
    ja: "明日の集合時刻と固定表示された集合場所をご確認のうえ、早めにお越しください。",
    en: "Please confirm tomorrow's meeting time and the pinned meeting point, and arrive early.",
    vi: "Vui lòng xác nhận giờ và địa điểm tập trung được ghim cho ngày mai, đồng thời đến sớm.",
    ne: "कृपया भोलिको भेट्ने समय र माथि राखिएको भेट्ने स्थान पुष्टि गरी चाँडै आइपुग्नुहोस्।",
    ko: "내일 집합 시간과 상단에 고정된 집합 장소를 확인하고 일찍 도착해 주세요.",
  },
  vehicle_arrived: {
    "zh-CN": "车辆已经到达集合点，请按置顶车辆信息寻找本车。",
    "zh-TW": "車輛已經到達集合點，請按置頂車輛資訊尋找本車。",
    ja: "車両は集合場所に到着しました。固定表示された車両情報を確認してお探しください。",
    en: "The vehicle has arrived at the meeting point. Please use the pinned vehicle information to find it.",
    vi: "Xe đã đến điểm tập trung. Vui lòng dựa vào thông tin xe được ghim để tìm đúng xe.",
    ne: "गाडी भेट्ने स्थानमा आइपुगेको छ। कृपया माथि राखिएको गाडीको विवरण हेरेर गाडी खोज्नुहोस्।",
    ko: "차량이 집합 장소에 도착했습니다. 상단에 고정된 차량 정보를 확인해 찾아 주세요.",
  },
  departing_10: {
    "zh-CN": "车辆将在 10 分钟后出发，请尽快返回。",
    "zh-TW": "車輛將在 10 分鐘後出發，請儘快返回。",
    ja: "車両は10分後に出発します。お早めにお戻りください。",
    en: "The vehicle will depart in 10 minutes. Please return as soon as possible.",
    vi: "Xe sẽ khởi hành sau 10 phút. Vui lòng quay lại sớm nhất có thể.",
    ne: "गाडी १० मिनेटमा छुट्नेछ। कृपया सकेसम्म चाँडो फर्कनुहोस्।",
    ko: "차량은 10분 후 출발합니다. 가능한 한 빨리 돌아와 주세요.",
  },
  departing_5: {
    "zh-CN": "车辆将在 5 分钟后出发，请立即返回。",
    "zh-TW": "車輛將在 5 分鐘後出發，請立即返回。",
    ja: "車両は5分後に出発します。すぐにお戻りください。",
    en: "The vehicle will depart in 5 minutes. Please return immediately.",
    vi: "Xe sẽ khởi hành sau 5 phút. Vui lòng quay lại ngay.",
    ne: "गाडी ५ मिनेटमा छुट्नेछ। कृपया तुरुन्त फर्कनुहोस्।",
    ko: "차량은 5분 후 출발합니다. 즉시 돌아와 주세요.",
  },
  return_vehicle: {
    "zh-CN": "请返回车辆；如已走散，可主动临时共享位置。",
    "zh-TW": "請返回車輛；如已走散，可主動暫時共享位置。",
    ja: "車両へお戻りください。はぐれた場合は、一時的に位置情報を共有できます。",
    en: "Please return to the vehicle. If you are separated, you can temporarily share your location.",
    vi: "Vui lòng quay lại xe. Nếu bị lạc nhóm, bạn có thể tạm thời chia sẻ vị trí.",
    ne: "कृपया गाडीमा फर्कनुहोस्। समूहबाट छुट्टिनुभएको छ भने अस्थायी रूपमा आफ्नो स्थान साझा गर्न सक्नुहुन्छ।",
    ko: "차량으로 돌아와 주세요. 일행과 떨어진 경우 위치를 일시적으로 공유할 수 있습니다.",
  },
  traffic_delay: {
    "zh-CN": "因交通情况行程有所延误，请关注置顶信息。",
    "zh-TW": "因交通情況行程有所延誤，請關注置頂資訊。",
    ja: "交通事情により行程が遅れています。固定表示された最新情報をご確認ください。",
    en: "The trip is delayed due to traffic. Please check the pinned information for updates.",
    vi: "Lịch trình đang bị chậm do giao thông. Vui lòng theo dõi thông tin được ghim.",
    ne: "ट्राफिकका कारण यात्रा ढिलो भएको छ। कृपया माथि राखिएको जानकारी हेर्नुहोस्।",
    ko: "교통 상황으로 일정이 지연되고 있습니다. 상단의 최신 안내를 확인해 주세요.",
  },
  meeting_changed: {
    "zh-CN": "集合地点已经变更，请以最新置顶集合信息为准。",
    "zh-TW": "集合地點已經變更，請以最新置頂集合資訊為準。",
    ja: "集合場所が変更されました。最新の固定表示された集合情報をご確認ください。",
    en: "The meeting point has changed. Please follow the latest pinned meeting information.",
    vi: "Địa điểm tập trung đã thay đổi. Vui lòng làm theo thông tin tập trung mới nhất được ghim.",
    ne: "भेट्ने स्थान परिवर्तन भएको छ। कृपया माथि राखिएको पछिल्लो भेट्ने जानकारी पालना गर्नुहोस्।",
    ko: "집합 장소가 변경되었습니다. 상단에 고정된 최신 집합 안내를 확인해 주세요.",
  },
};

export function templateTranslation(templateKey: string | null | undefined, target: ChatLanguage) {
  if (!templateKey || target === "zh-CN") return null;
  return staffTemplateTranslations[templateKey]?.[target] ?? null;
}
