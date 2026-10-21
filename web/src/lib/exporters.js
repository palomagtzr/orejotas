
export const SECTIONS = [
  ['overview', 'Overview'],
  ['description', 'Descripción'],
  ['key_points', 'Puntos clave'],
  ['decisions', 'Decisiones'],
  ['action_items', 'Action items'],
  ['todos', 'To-do'],
  ['open_questions', 'Dudas sin resolver'],
  ['pending', 'Pendientes'],
  ['next_steps', 'Siguientes pasos'],
  ['other_notes', 'Otras notas'],
];

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function speakerName(meeting, label) {
  return meeting.speakers?.[label] || `Hablante ${label}`;
}

function actionLine(a) {
  const extra = [a.owner && `responsable: ${a.owner}`, a.due && `fecha: ${a.due}`].filter(Boolean).join(', ');
  return extra ? `${a.task} (${extra})` : a.task;
}

export function summaryToMarkdown(meeting) {
  const s = meeting.summary;
  const out = [`# ${s?.title || meeting.title}`, '', `_${fmtDate(meeting.createdAt)} · ${fmtTime(meeting.durationSec)} · ${Object.keys(meeting.speakers || {}).length} hablantes_`, ''];
  if (!s) return out.join('\n');
  for (const [key, label] of SECTIONS) {
    const v = s[key];
    if (!v || (Array.isArray(v) && v.length === 0)) continue;
    out.push(`## ${label}`, '');
    if (typeof v === 'string') out.push(v, '');
    else if (key === 'action_items') out.push(...v.map((a) => `- [ ] ${actionLine(a)}`), '');
    else if (key === 'todos') out.push(...v.map((t) => `- [ ] ${t}`), '');
    else out.push(...v.map((t) => `- ${t}`), '');
  }
  return out.join('\n');
}

export function transcriptToText(meeting) {
  return meeting.utterances.map((u) => `[${fmtTime(u.start)}] ${speakerName(meeting, u.speaker)}: ${u.text}`).join('\n');
}

export function fullMarkdown(meeting) {
  return `${summaryToMarkdown(meeting)}\n\n## Transcripción\n\n${meeting.utterances
    .map((u) => `**${speakerName(meeting, u.speaker)}** _(${fmtTime(u.start)})_: ${u.text}`)
    .join('\n\n')}\n`;
}

export async function toDocx(meeting, { includeTranscript = true } = {}) {
  // Carga perezosa: la librería pesa ~400 KB y solo se necesita al exportar.
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
  const s = meeting.summary || {};
  const children = [
    new Paragraph({ text: s.title || meeting.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `${fmtDate(meeting.createdAt)} · ${fmtTime(meeting.durationSec)} · ${Object.keys(meeting.speakers || {}).length} hablantes`, italics: true })],
    }),
  ];
  for (const [key, label] of SECTIONS) {
    const v = s[key];
    if (!v || (Array.isArray(v) && v.length === 0)) continue;
    children.push(new Paragraph({ text: label, heading: HeadingLevel.HEADING_1 }));
    if (typeof v === 'string') {
      v.split(/\n+/).forEach((p) => children.push(new Paragraph({ text: p })));
    } else {
      v.forEach((item) =>
        children.push(new Paragraph({ text: key === 'action_items' ? actionLine(item) : item, bullet: { level: 0 } })),
      );
    }
  }
  if (includeTranscript) {
    children.push(new Paragraph({ text: 'Transcripción', heading: HeadingLevel.HEADING_1 }));
    meeting.utterances.forEach((u) =>
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${speakerName(meeting, u.speaker)} `, bold: true }),
            new TextRun({ text: `(${fmtTime(u.start)}) `, italics: true, color: '888888' }),
            new TextRun({ text: u.text }),
          ],
        }),
      ),
    );
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(text) {
  return (text || 'junta')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60);
}
