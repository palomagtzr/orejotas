/** Duración de un Blob de audio en segundos (o null si el navegador no la sabe). */
export function audioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v) && v > 0 ? v : null);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      if (Number.isFinite(a.duration)) return finish(a.duration);
      // Truco para webm sin cabecera: saltar al "infinito" fuerza a calcular la duración.
      a.ondurationchange = () => { if (Number.isFinite(a.duration)) finish(a.duration); };
      a.currentTime = 1e101;
      setTimeout(() => finish(null), 4000);
    };
    a.onerror = () => finish(null);
    a.src = url;
  });
}
