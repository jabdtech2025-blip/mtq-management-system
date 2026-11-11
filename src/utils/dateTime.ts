/**
 * Helper pemformatan tanggal dan waktu standar Indonesia (WIB - Waktu Indonesia Barat).
 * Standar format: "10 Nov 2026, 20.14 WIB"
 */
export function formatDateTimeWIB(input: string | Date | null | undefined): string {
  if (!input) return '-';
  const date = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(date.getTime())) return '-';

  try {
    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    let day = '';
    let month = '';
    let year = '';
    let hour = '';
    let minute = '';

    for (const part of parts) {
      if (part.type === 'day') day = part.value;
      else if (part.type === 'month') month = part.value;
      else if (part.type === 'year') year = part.value;
      else if (part.type === 'hour') hour = part.value;
      else if (part.type === 'minute') minute = part.value;
    }

    if (!day || !month || !year) {
      return date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
    }

    return `${day} ${month} ${year}, ${hour}.${minute} WIB`;
  } catch {
    return date.toLocaleString('id-ID') + ' WIB';
  }
}

/**
 * Menampilkan stempel waktu apa pun secara aman: string ISO dari database diformat ke WIB,
 * sedangkan teks yang sudah terformat (mis. hasil getWibTime) ditampilkan apa adanya.
 */
export function formatTimestampDisplay(value: string | null | undefined): string {
  if (!value) return '-';
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value.trim()) ? formatDateTimeWIB(value.trim().replace(' ', 'T')) : value;
}
