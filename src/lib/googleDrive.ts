import type { DriveDocxFile } from '../types/eduverse.ts';

export const DRIVE_DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DRIVE_GDOC_MIME = 'application/vnd.google-apps.document';

export class GoogleDriveAuthError extends Error {
  constructor(message = 'Sesi akses Google Drive telah berakhir. Hubungkan ulang akun Google Drive.') {
    super(message);
    this.name = 'GoogleDriveAuthError';
  }
}

function escapeDriveQueryLiteral(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function buildDriveDocxQuery(searchQuery?: string): string {
  const clauses = [
    'trashed = false',
    `(mimeType = '${DRIVE_DOCX_MIME}' or mimeType = '${DRIVE_GDOC_MIME}' or name contains '.docx')`,
  ];
  const trimmed = String(searchQuery || '').trim();
  if (trimmed) {
    clauses.push(`name contains '${escapeDriveQueryLiteral(trimmed)}'`);
  }
  return clauses.join(' and ');
}

export function isDriveUpdateAvailable(
  linkedModifiedTime?: string,
  remoteModifiedTime?: string
): boolean {
  if (!remoteModifiedTime) return false;
  if (!linkedModifiedTime) return true;
  const localMs = Date.parse(linkedModifiedTime);
  const remoteMs = Date.parse(remoteModifiedTime);
  if (Number.isFinite(localMs) && Number.isFinite(remoteMs)) {
    return remoteMs > localMs;
  }
  return remoteModifiedTime !== linkedModifiedTime;
}

export function formatDriveFileSize(sizeStr?: string): string {
  const bytes = Number(sizeStr);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Google Docs';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listDriveDocxFiles(
  accessToken: string,
  searchQuery?: string
): Promise<DriveDocxFile[]> {
  const params = new URLSearchParams({
    q: buildDriveDocxQuery(searchQuery),
    fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize: '30',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new GoogleDriveAuthError();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gagal memuat daftar file Google Drive (HTTP ${res.status}): ${body.slice(0, 140)}`);
  }

  const json = (await res.json()) as { files?: DriveDocxFile[] };
  return Array.isArray(json.files) ? json.files : [];
}

export async function getDriveFileMetadata(
  accessToken: string,
  fileId: string
): Promise<DriveDocxFile> {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,modifiedTime,size,webViewLink',
    supportsAllDrives: 'true',
  });
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (res.status === 401 || res.status === 403) {
    throw new GoogleDriveAuthError();
  }
  if (!res.ok) {
    throw new Error(`File Google Drive tidak ditemukan atau tidak dapat diakses (HTTP ${res.status}).`);
  }
  return (await res.json()) as DriveDocxFile;
}

export async function downloadDriveDocxArrayBuffer(
  accessToken: string,
  file: Pick<DriveDocxFile, 'id' | 'mimeType' | 'name'>
): Promise<ArrayBuffer> {
  const url =
    file.mimeType === DRIVE_GDOC_MIME
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(DRIVE_DOCX_MIME)}`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new GoogleDriveAuthError();
  }
  if (!res.ok) {
    throw new Error(`Gagal mengunduh "${file.name}" dari Google Drive (HTTP ${res.status}).`);
  }

  return res.arrayBuffer();
}
