export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[\\/:*?"<>|]+/g, '_');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, fileName: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), fileName);
}

function svgText(id: string): { text: string; w: number; h: number } | null {
  const el = document.getElementById(id) as unknown as SVGSVGElement | null;
  if (!el) return null;
  const clone = el.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = el.viewBox.baseVal;
  clone.setAttribute('width', String(vb.width));
  clone.setAttribute('height', String(vb.height));
  return { text: new XMLSerializer().serializeToString(clone), w: vb.width, h: vb.height };
}

export function exportSvg(id: string, fileName: string) {
  const s = svgText(id);
  if (s) downloadText(s.text, fileName, 'image/svg+xml');
}

export function exportSvgAsPng(id: string, fileName: string, scale = 2) {
  const s = svgText(id);
  if (!s) return;
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = s.w * scale;
    cv.height = s.h * scale;
    const g = cv.getContext('2d')!;
    g.drawImage(img, 0, 0, cv.width, cv.height);
    cv.toBlob((b) => b && downloadBlob(b, fileName), 'image/png');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.text);
}
