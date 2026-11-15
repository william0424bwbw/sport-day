// 讓瀏覽器下載一段文字（CSV、JSON）。手機 Safari / Chrome 都會存到「下載」或開啟分享選單
export function downloadText(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 部分手機瀏覽器在 click 之後才開始讀取，延遲釋放
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
