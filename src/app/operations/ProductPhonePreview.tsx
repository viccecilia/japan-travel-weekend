import {localizedDraft, type ProductDraft} from './productDraft';
import {SpotVideoPlayer} from '../../shared/components/SpotVideoPlayer';

export type PreviewMode = 'detail' | 'card';

type PreviewCopy = {
  route: string; price: string; today: string; fees: string; notes: string; included: string; excluded: string; preparation: string;
  booking: string; cancellation: string; participants: string; weather: string; baggage: string; safety: string; minutes: string;
  missingRegion: string; missingDuration: string; missingTitle: string; missingSummary: string; noStops: string; draft: string; saved: string; previewOnly: string; chooseDate: string; unchanged: string;
};

const previewCopy: Record<string, PreviewCopy> = {
  'zh-CN': {route:'路线介绍', price:'价格以可售班次为准', today:'这一天，去这些地方', fees:'费用与准备', notes:'出行须知', included:'已包含', excluded:'未包含', preparation:'出发准备', booking:'预订须知', cancellation:'取消与退款', participants:'参加规则', weather:'天气提醒', baggage:'行李说明', safety:'安全提示', minutes:'分钟', missingRegion:'地区未设置', missingDuration:'时长未设置', missingTitle:'未命名路线', missingSummary:'尚未填写路线简介', noStops:'尚未添加景点', draft:'草稿效果 · 仅预览', saved:'已保存', previewOnly:'草稿预览', chooseDate:'选择日期', unchanged:'修改即时可见，不影响已发布内容'},
  'zh-TW': {route:'路線介紹', price:'價格以可售班次為準', today:'這一天，去這些地方', fees:'費用與準備', notes:'出行須知', included:'已包含', excluded:'未包含', preparation:'出發準備', booking:'預訂須知', cancellation:'取消與退款', participants:'參加規則', weather:'天氣提醒', baggage:'行李說明', safety:'安全提示', minutes:'分鐘', missingRegion:'未設定地區', missingDuration:'未設定時長', missingTitle:'未命名路線', missingSummary:'尚未填寫路線簡介', noStops:'尚未新增景點', draft:'草稿效果 · 僅預覽', saved:'已儲存', previewOnly:'草稿預覽', chooseDate:'選擇日期', unchanged:'修改即時可見，不影響已發布內容'},
  ja: {route:'ルート紹介', price:'料金は販売中の出発便により異なります', today:'今日の行き先', fees:'料金と準備', notes:'旅行時のご案内', included:'含まれるもの', excluded:'含まれないもの', preparation:'出発前の準備', booking:'予約に関するご案内', cancellation:'キャンセル・返金', participants:'参加ルール', weather:'天候に関するご案内', baggage:'手荷物について', safety:'安全に関するご案内', minutes:'分', missingRegion:'地域未設定', missingDuration:'所要時間未設定', missingTitle:'無題のルート', missingSummary:'ルート紹介は未入力です', noStops:'スポットは未追加です', draft:'下書き表示 · プレビューのみ', saved:'保存済み', previewOnly:'下書きプレビュー', chooseDate:'日付を選ぶ', unchanged:'編集内容はすぐに表示され、公開中の内容には影響しません'},
  en: {route:'Route details', price:'Price follows the available departure', today:'Today’s route', fees:'What is included', notes:'Travel notes', included:'Included', excluded:'Not included', preparation:'Prepare', booking:'Booking', cancellation:'Cancellation and refunds', participants:'Participant rules', weather:'Weather', baggage:'Baggage', safety:'Safety', minutes:'min', missingRegion:'Region not set', missingDuration:'Duration not set', missingTitle:'Untitled route', missingSummary:'Route summary not yet written', noStops:'No stops added yet', draft:'Draft effect · Preview only', saved:'Saved', previewOnly:'Draft preview', chooseDate:'Choose date', unchanged:'Changes appear immediately and do not affect the published route'},
  ko: {route:'노선 소개', price:'가격은 판매 중인 출발편 기준입니다', today:'오늘의 일정', fees:'포함 사항과 준비물', notes:'여행 안내', included:'포함 사항', excluded:'불포함 사항', preparation:'출발 전 준비', booking:'예약 안내', cancellation:'취소 및 환불', participants:'참가 규칙', weather:'날씨 안내', baggage:'수하물 안내', safety:'안전 안내', minutes:'분', missingRegion:'지역 미설정', missingDuration:'소요 시간 미설정', missingTitle:'제목 없는 노선', missingSummary:'노선 소개가 아직 없습니다', noStops:'추가된 장소가 없습니다', draft:'초안 효과 · 미리보기 전용', saved:'저장됨', previewOnly:'초안 미리보기', chooseDate:'날짜 선택', unchanged:'수정 사항은 즉시 표시되며 공개 내용에는 영향을 주지 않습니다'},
  es: {route:'Detalles de la ruta', price:'El precio depende de la salida disponible', today:'La ruta de hoy', fees:'Incluye y preparación', notes:'Notas de viaje', included:'Incluido', excluded:'No incluido', preparation:'Preparación', booking:'Reserva', cancellation:'Cancelación y reembolsos', participants:'Normas de participación', weather:'Clima', baggage:'Equipaje', safety:'Seguridad', minutes:'min', missingRegion:'Región sin configurar', missingDuration:'Duración sin configurar', missingTitle:'Ruta sin título', missingSummary:'Aún no hay resumen de la ruta', noStops:'Aún no se añadieron paradas', draft:'Efecto de borrador · Solo vista previa', saved:'Guardado', previewOnly:'Vista previa del borrador', chooseDate:'Elegir fecha', unchanged:'Los cambios se ven al instante y no afectan la ruta publicada'},
  vi: {route:'Giới thiệu tuyến', price:'Giá theo chuyến khởi hành còn bán', today:'Lịch trình hôm nay', fees:'Chi phí và chuẩn bị', notes:'Lưu ý chuyến đi', included:'Đã bao gồm', excluded:'Không bao gồm', preparation:'Chuẩn bị trước chuyến đi', booking:'Lưu ý đặt chỗ', cancellation:'Hủy và hoàn tiền', participants:'Quy định tham gia', weather:'Thời tiết', baggage:'Hành lý', safety:'An toàn', minutes:'phút', missingRegion:'Chưa đặt khu vực', missingDuration:'Chưa đặt thời lượng', missingTitle:'Tuyến chưa có tên', missingSummary:'Chưa có giới thiệu tuyến', noStops:'Chưa thêm điểm đến', draft:'Hiệu ứng bản nháp · Chỉ xem trước', saved:'Đã lưu', previewOnly:'Xem trước bản nháp', chooseDate:'Chọn ngày', unchanged:'Thay đổi hiển thị ngay và không ảnh hưởng nội dung đã xuất bản'},
  ne: {route:'रुट विवरण', price:'मूल्य उपलब्ध प्रस्थानअनुसार हुन्छ', today:'आजको यात्रा', fees:'समावेश र तयारी', notes:'यात्रा सूचना', included:'समावेश', excluded:'समावेश छैन', preparation:'तयारी', booking:'बुकिङ सूचना', cancellation:'रद्द र फिर्ता', participants:'सहभागी नियम', weather:'मौसम', baggage:'सामान', safety:'सुरक्षा', minutes:'मिनेट', missingRegion:'क्षेत्र सेट गरिएको छैन', missingDuration:'अवधि सेट गरिएको छैन', missingTitle:'शीर्षक नभएको रुट', missingSummary:'रुटको परिचय अझै छैन', noStops:'स्थान थपिएको छैन', draft:'ड्राफ्ट प्रभाव · पूर्वावलोकन मात्र', saved:'सुरक्षित भयो', previewOnly:'ड्राफ्ट पूर्वावलोकन', chooseDate:'मिति छान्नुहोस्', unchanged:'परिवर्तन तुरुन्त देखिन्छ र प्रकाशित सामग्रीमा असर पर्दैन'}
};

export function ProductPhonePreview({draft, locale, mode, dirty}: {draft: ProductDraft; locale: string; mode: PreviewMode; dirty: boolean}) {
  const view = localizedDraft(draft, locale);
  const copy = previewCopy[locale] ?? previewCopy['zh-CN'];
  const hero = view.heroImageUrl || view.gallery[0] || '/placeholder-route.png';
  return (
    <aside className="product-phone-preview" aria-label="游客手机草稿预览">
      <header>
        <div><b>游客手机预览</b><small>{dirty ? '未保存修改' : copy.previewOnly}</small></div>
        <span aria-live="polite">{dirty ? '未保存' : copy.saved}</span>
      </header>
      <div className="product-preview-phone">
        <div className="product-preview-status"><span>9:41</span><span>▮▮ ▰</span></div>
        {mode === 'card' ? (
          <article className="product-preview-card">
            <img src={hero} alt="路线封面预览" />
            <div><small>{view.region || copy.missingRegion} · {view.duration || copy.missingDuration}</small><h2>{view.title || copy.missingTitle}</h2><p>{view.summary || copy.missingSummary}</p><b>{copy.price}</b></div>
          </article>
        ) : (
          <div className="product-preview-detail">
            <div className="product-preview-appbar">‹ {copy.route} <b>Japan Travel Weekend</b></div>
            <img className="product-preview-hero" src={hero} alt="路线封面预览" />
            <div className="product-preview-copy">
              <small>{view.region || copy.missingRegion} · {view.duration || copy.missingDuration}</small>
              <h2>{view.heroTitle || view.title || copy.missingTitle}</h2>
              <p>{view.heroSubtitle || view.summary || copy.missingSummary}</p>
              {view.description && <p className="product-preview-description">{view.description}</p>}
              <b className="product-preview-price">{copy.price}</b>
              <h3>{copy.today}</h3>
              {view.itinerary.length ? view.itinerary.map((item, index) => (
                <article key={item.editorId} id={`preview-${item.editorId}`}>
                  {item.imageUrl && <img src={String(item.imageUrl)} alt="" />}
                  {item.video?.url && <SpotVideoPlayer compact url={item.video.url} posterUrl={item.video.posterUrl || String(item.imageUrl ?? '') || undefined} title={String(item.title ?? item.name ?? '景点')} />}
                  <div><b>{index + 1}. {String(item.title ?? item.name ?? copy.missingTitle)}</b>{Number(item.stayMinutes) > 0 && <small>{Number(item.stayMinutes)} {copy.minutes}</small>}</div>
                  {item.description && <p>{String(item.description)}</p>}
                  {Boolean(item.longDescription) && <p className="product-preview-description">{String(item.longDescription)}</p>}
                </article>
              )) : <p className="product-preview-empty">{copy.noStops}</p>}
              <h3>{copy.fees}</h3>
              <p>{view.included.length ? `${copy.included}: ${view.included.join('、')}` : ''}</p>
              {view.excluded.length > 0 && <p>{copy.excluded}: {view.excluded.join('、')}</p>}
              {view.preparation.length > 0 && <p>{copy.preparation}: {view.preparation.join('、')}</p>}
              <h3>{copy.notes}</h3>
              {[[copy.booking, view.bookingNotice], [copy.cancellation, view.cancellationPolicy], [copy.participants, view.participantRules], [copy.weather, view.weatherNotice], [copy.baggage, view.baggageNotice], [copy.safety, view.safetyNotice]].filter(([, value]) => Boolean(value)).map(([label, value]) => <p key={label}><b>{label}</b>：{value}</p>)}
            </div>
          </div>
        )}
        <footer><span>{copy.draft}</span><button type="button" disabled>{copy.chooseDate}</button></footer>
      </div>
      <p>{copy.unchanged}</p>
    </aside>
  );
}
